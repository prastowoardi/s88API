import fetch from "node-fetch";
import readlineSync from "readline-sync";
import logger from "../../logger.js";
import { faker } from "@faker-js/faker";
import { randomInt } from "crypto";
import { encryptDecrypt, getRandomIP, getRandomName, getAccountNumber,registerCustomerJPY, pollKYCStatus } from "../../helpers/utils.js";
import { generateUTR, randomPhoneNumber, randomMyanmarPhoneNumber, randomCardNumber } from "../../helpers/depositHelper.js";
import { getCurrencyConfig } from "../../helpers/depositConfigMap.js";

const SUPPORTED_CURRENCIES = ["INR", "VND", "BDT", "MMK", "PMI", "KRW", "THB", "IDR", "BRL", "MXN", "PHP", "HKD", "JPY", "USDT"];
const UTR_CURRENCIES = ["INR", "BDT"];
const PHONE_CURRENCIES = ["INR", "BDT"];

async function buildPayload(config, tx, userInfo = {}) {
    const payloadObj = {
        merchant_api_key: config.merchantAPI,
        merchant_code: config.merchantCode,
        transaction_code: tx.code,
        transaction_timestamp: tx.timestamp,
        transaction_amount: tx.amount,
        user_id: tx.userID,
        currency_code: tx.currency,
        payment_code: config.depositMethod,
        ip_address: tx.ip,
        ...(tx.bankCode && { bank_code: tx.bankCode }),
        ...(tx.phone && { phone: tx.phone }),
        ...(tx.cardNumber && { card_number: tx.cardNumber }),
        ...(tx.currency === "THB" && {
            cust_name: await getRandomName("th", true),
            depositor_bank: tx.bankCode,
            bank_account_number: tx.cardNumber,
            account_type: tx.accountType
        }),
        ...(tx.currency === "KRW" && {
            cust_name: userInfo.name,
            bank_account_number: await getAccountNumber(5),
            bank_name: tx.bankCode,
            card_holder_name: await getRandomName("kr", true),
        }),
        ...(tx.currency === "HKD" && {
            card_number: "3566111111111113",
            card_date: "06/25",
            card_cvv: "100",
            card_holder_name: "Bob Brown"
        }),
        ...(tx.currency === "JPY" && { cust_name: await getRandomName("jp", true) }),
        // Uncomment for Erfolgpay
        // ...(tx.currency === "INR" && {
        //     product_name:"pillow",
        //     cust_name:"Percival Parlay Peacock",
        //     cust_email:"percival_peacock@test.com",
        //     cust_phone:"9812763405",
        //     cust_city:"Mumbai",
        //     cust_country:"India",
        //     zip_code:"21323",
        //     cust_pan_number:"VIPPA1236A",
        //     cust_address:"The Stacks, Columbus, Ohio",
        //     cust_website_url:"https://api.mins31.com"
        // }),
        ...(tx.currency === "USDT" && {
            rate: readlineSync.question("Masukkan Rate: ").trim(),
            bank_code: tx.bankCode
        }),
        callback_url: config.callbackURL,
    };

    return Object.entries(payloadObj)
        .map(([k, v]) => `${k}=${v}`)
        .join("&");
}

function getBankCode(currency, config) {
    if (currency === "BRL") return "PIX";
    if (currency === "MXN") return "SPEI";
    if (config.requiresBankCode) {
        return readlineSync.question("Masukkan Bank Code: ").trim();
    }
    return config.bankCodeOptions?.[Math.floor(Math.random() * config.bankCodeOptions.length)] || "";
}

function getPhoneNumber(currency, bankCode) {
    if (currency === "BDT") return randomPhoneNumber("bdt");
    if (currency === "MMK" && bankCode === "WAVEPAY") return randomMyanmarPhoneNumber();
    if (currency === "IDR" && bankCode === "OVO") return randomPhoneNumber("idr");
    return "";
}

async function handleUTR(currency, transactionCode) {
    if (!UTR_CURRENCIES.includes(currency)) return;

    let utr = readlineSync.question("Input UTR (YES/NO): ").trim().toUpperCase();
    while (!["YES", "NO"].includes(utr)) {
        console.log("Invalid input! Please enter 'YES' or 'NO'.");
        utr = readlineSync.question("Input UTR (YES/NO): ").trim().toUpperCase();
    }

    if (utr === "YES") {
        const config = getCurrencyConfig(currency);
        const utrCode = generateUTR(currency);
        const payload = `transaction_code=${transactionCode}&utr=${utrCode}`;
        const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);
        try {
            const res = await fetch(`${config.BASE_URL}/api/${config.merchantCode}/v3/submit-utr`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: encrypted })
            });
            const result = await res.json();
            logger.info(`Submit UTR Response : ${JSON.stringify(result, null, 2)}`);
        } catch (err) {
            logger.error(`❌ Submit UTR Error : ${err.message}`);
        }
    } else {
        logger.info("Skip Submit UTR");
    }
}

async function sendDeposit() {
    logger.info("======== DEPOSIT V3 REQUEST ========");

    try {
        const envCurrency = process.env.CURRENCY?.trim().toUpperCase();
        let currency = SUPPORTED_CURRENCIES.includes(envCurrency)
            ? envCurrency
            : readlineSync.question("Masukkan Currency: ").trim().toUpperCase();

        if (!SUPPORTED_CURRENCIES.includes(currency)) {
            throw new Error(`Invalid currency. Supported: ${SUPPORTED_CURRENCIES.join(", ")}`);
        }

        const amountInput = readlineSync.question("Masukkan Amount: ");
        const amount = Number(amountInput);
        if (isNaN(amount) || amount <= 0) throw new Error("Amount harus berupa angka lebih dari 0.");

        let userID;
        if (currency === "JPY") {
            // userID = `CUST-JP-${faker.string.numeric(5)}`; 
            userID = "NASHEED" // Approved user from QFPay
        } else {
            userID = randomInt(100, 999).toString();
        }        
        
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const transactionCode = `TEST-DP-V3-${timestamp}`;
        const config = getCurrencyConfig(currency);

        let kycName = null;
        if (currency === "JPY") {
            logger.info(`🔹 Registering KYC JPY for User: ${userID}`);
            try {
                const kycRegResponse = await registerCustomerJPY(config, userID);
                // logger.info(`𝌮 KYC Registration Response: ${JSON.stringify(kycRegResponse, null, 2)}`);

                let isApproved = false;
                let attempts = 0;
                const maxAttempts = 3;

                while (!isApproved && attempts < maxAttempts) {
                    attempts++;
                    logger.info(`🔍 Checking KYC status ${userID} (Attempt ${attempts}/${maxAttempts})...`);
                    
                    const pollResult = await pollKYCStatus(userID, config);
                    
                    // Handle format data (Array vs Object)
                    const resData = pollResult?.data;
                    const status = Array.isArray(resData) ? resData[0]?.status : resData?.status;

                    if (status?.toUpperCase() === "APPROVED") {
                        isApproved = true;
                        // Ambil nama dari hasil registrasi/polling untuk payload deposit
                        kycName = kycRegResponse?.recipient_name || "SATO TARO"; 
                        logger.info("✅ KYC APPROVED!");
                    } else if (status?.toUpperCase() === "REJECTED") {
                        throw new Error("KYC REJECTED by server.");
                    } else {
                        logger.info(`⏳ Status: ${status || 'PENDING'}. Waiting 5s...`);
                        if (attempts < maxAttempts) await new Promise(r => setTimeout(r, 5000));
                    }
                }

                if (!isApproved) {
                    throw new Error(`KYC timeout after ${maxAttempts} attempts.`);
                }
            } catch (kycErr) {
                logger.error(`❌ KYC Process Failed: ${kycErr.message}`);
                return; // Stop proses deposit jika KYC gagal
            }
        }

        const cardNumber = randomCardNumber();
        const ip = getRandomIP();
        const bankCode = getBankCode(currency, config);
        const phone = getPhoneNumber(currency, bankCode);

        const tx = { code: transactionCode, timestamp, amount, userID, currency, ip, bankCode, phone, cardNumber };

        if (currency === "THB") {
            const accountType = readlineSync.question("Masukkan Account Type: ").trim();
            tx.accountType = accountType;
        }

        const userInfo = { name: await getRandomName(), accountNumber: cardNumber };
        const payload = await buildPayload(config, tx, userInfo);
        const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);

        logger.info(`URL : ${config.BASE_URL}/api/${config.merchantCode}/v3/dopayment`);
        logger.info(`Request Payload : ${payload}`);
        logger.info(`Encrypted : ${encrypted}`);

        const response = await fetch(`${config.BASE_URL}/api/${config.merchantCode}/v3/dopayment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: encrypted })
        });

        const responseBody = await response.json();
        logger.info("Deposit Response: " + JSON.stringify(responseBody, null, 2));
        logger.info(`Response Status: ${response.status}`);

        await handleUTR(currency, transactionCode);

    } catch (err) {
        logger.error(`❌ Deposit Error: ${err.message}`, err);
    }

    logger.info("======== REQUEST DONE ========\n\n");
}

sendDeposit();
