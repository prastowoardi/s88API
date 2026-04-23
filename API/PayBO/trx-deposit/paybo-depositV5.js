import fetch from "node-fetch";
import readlineSync from "readline-sync";
import logger from "../../logger.js";
import open from "open";
import { faker } from '@faker-js/faker';
import { randomInt } from "crypto";
import { encryptDecrypt, signVerify, getRandomIP, getRandomName, getAccountNumber, registerCustomerJPY, pollKYCStatus } from "../../helpers/utils.js";
import { randomPhoneNumber, randomMyanmarPhoneNumber, randomCardNumber, generateUTR } from "../../helpers/depositHelper.js";
import { getCurrencyConfig } from "../../helpers/depositConfigMap.js";

const SUPPORTED_CURRENCIES = ["INR","VND","BDT","MMK","PMI","KRW","THB","IDR","BRL","MXN","PHP","HKD","JPY","USDT", "KHR"];

async function submitUTR(currency, transactionCode) {
    if (!["INR", "BDT"].includes(currency)) {
        logger.error("❌ Submit UTR hanya tersedia untuk INR & BDT.");
        return;
    }

    const reference = generateUTR(currency);
    const config = getCurrencyConfig(currency);
    const payloadObj = { transaction_code: transactionCode, reference };
    const payloadStr = JSON.stringify(payloadObj);
    const signature = signVerify("sign", payloadStr, config.secretKey);

    logger.info(`UTR: ${reference}`);
    logger.info(`Signature: ${signature}`);

    try {
        const res = await fetch(`${config.BASE_URL}/api/${config.merchantCode}/v5/submitReference`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json", 
                sign: signature 
            },
            body: payloadStr
        });

        const text = await res.text();
        if (!res.ok) {
            logger.error(`❌ HTTP Error: ${res.status} Response: ${text}`);
            return;
        }

        const result = JSON.parse(text);
        logger.info(`Submit UTR Response: ${JSON.stringify(result, null, 2)}`);
    } catch (err) {
        logger.error(`❌ Submit UTR Error: ${err}`, { stack: err.stack });
    }
}

function getBankCode(currency, config) {
    if (currency === "BRL") return "PIX";
    if (currency === "MXN") return "SPEI";
    if (config.requiresBankCode) return readlineSync.question("Masukkan Bank Code: ").trim();
    if (config.bankCodeOptions) return config.bankCodeOptions[Math.floor(Math.random() * config.bankCodeOptions.length)];
    return "";
}

function getPhone(currency, bankCode) {
    if (currency === "BDT") return randomPhoneNumber("bdt");
    if (currency === "MMK" && bankCode === "WAVEPAY") return randomMyanmarPhoneNumber();
    if (currency === "IDR" && bankCode === "OVO") return randomPhoneNumber("idr");
    return "";
}

async function applyCurrencySpecificPayload(payload, currency, bankCode, cardNumber) {
    const name = await getRandomName();
    switch(currency) {
        // Uncomment for Erfolgpay
        // case "INR":
            // payload.product_name="pillow"
            // payload.cust_name="Percival Parlay Peacock"
            // payload.cust_email="percival_peacock@test.com"
            // payload.cust_phone="9812763405"
            // payload.cust_city="Mumbai"
            // payload.cust_country="India"
            // payload.zip_code="21323",
            // payload.cust_pan_number="VIPPA1236A",
            // payload.cust_address="The Stacks, Columbus, Ohio",
            // payload.cust_website_url="https://api.mins31.com"
            // break;
        case "KRW":
            payload.cust_name = await getRandomName("kr", true);
            payload.bank_name = bankCode;
            payload.bank_code = bankCode;
            payload.bank_account_number = await getAccountNumber(5);
            payload.card_holder_name = await getRandomName("kr", true);
            // payload.card_number = cardNumber;
            break;
        case "JPY":
            if (!payload.cust_name) {
                payload.cust_name = await getRandomName("jp", true);
            }
            break;
        case "THB":
            const account_type = readlineSync.question("Masukkan Account Type: ").trim();
            if (!/^[a-zA-Z0-9]+$/.test(account_type)) throw new Error("Account Type must contain only letters");
            payload.account_type = account_type;
            payload.cust_name = await getRandomName("th", true);
            payload.depositor_bank = bankCode;
            payload.bank_account_number = cardNumber;
            break;
        case "HKD":
            payload.card_number = "3566111111111113";
            payload.card_date = "06/25";
            payload.card_cvv = "100";
            payload.card_holder_name = "bob Brown";
            break;
        case "USDT":
            payload.rate = readlineSync.question("Masukkan Rate: ").trim() || null;
            payload.bank_code = bankCode;
            payload.lang = readlineSync.question("Choose Language (en/id): ").trim() || null;
            break;
    }
    return payload;
}

async function askUTR() {
    let utr = readlineSync.question("Input UTR (YES/NO): ").toUpperCase();
    while (!["YES","NO"].includes(utr)) {
        console.log("Invalid input! Please enter 'YES' or 'NO'.");
        utr = readlineSync.question("Input UTR (YES/NO): ").toUpperCase();
    }
    return utr;
}

async function sendDeposit() {
    logger.info("======== DEPOSIT V5 REQUEST ========");

    try {
        const envCurrency = process.env.CURRENCY;
        let currency = SUPPORTED_CURRENCIES.includes(envCurrency) ? envCurrency : readlineSync.question("Masukkan Currency: ").trim().toUpperCase();
        if (!SUPPORTED_CURRENCIES.includes(currency)) throw new Error(`Currency ${currency} tidak support`);

        let userID;
        if (currency === "JPY") {
            userID = `CUST-JP-${faker.string.numeric(5)}`; 
            // userID = "NASHEED" // Approved user from QFPay
        } else {
            userID = randomInt(100, 999).toString();
        }

        const amountInput = readlineSync.question("Masukkan Amount: ").trim();
        const amount = Number(amountInput);
        if (isNaN(amount) || amount <= 0) throw new Error("Amount harus berupa angka lebih dari 0.");

        const timestamp = Math.floor(Date.now() / 1000).toString();
        const transactionCode = `TEST-DP-V5-${timestamp}`;
        const config = getCurrencyConfig(currency);
        const cardNumber = config.cardNumber ? randomCardNumber() : "";

        const bankCode = getBankCode(currency, config);
        const phone = getPhone(currency, bankCode);

        let payload = {
            transaction_code: transactionCode,
            transaction_amount: amount,
            payment_code: config.depositMethod,
            user_id: userID,
            currency_code: currency,
            callback_url: config.callbackURL,
            ip_address: getRandomIP(),
            redirect_url:"https://kaskus.id",
        };

        if (bankCode) payload.bank_code = bankCode;
        if (phone) payload.cust_phone = phone;
        if (cardNumber) payload.card_number = cardNumber;

        // if (currency === "JPY") {
        //     logger.info("🔹 Registering KYC JPY...");
            
        //     try {
        //         if (typeof faker === 'undefined') {
        //             throw new Error("Library 'faker' belum di-import di file ini!");
        //         }

        //         logger.info(`Generated ID: ${userID}`);

        //         const kycData = await registerCustomerJPY(config, userID);

        //         if (!kycData) {
        //             logger.error("❌ Registrasi gagal (Response Kosong)");
        //             return;
        //         }

        //         let isApproved = false;
        //         let attempts = 0;
        //         const maxAttempts = 3;

        //         while (!isApproved && attempts < maxAttempts) {
        //             attempts++;
        //             logger.info(`🔍 Checking status ${userID} (Attempt ${attempts}/${maxAttempts})...`);

        //             const pollResult = await pollKYCStatus(userID, config);
                    
        //             const status = pollResult?.data?.status || pollResult?.status;

        //             if (status === "APPROVED") {
        //                 isApproved = true;
        //                 payload.cust_name = kycData.recipient_name;
        //                 payload.user_id = userID; 
        //                 logger.info("✅ KYC APPROVED!");
        //             } else if (status === "REJECTED") {
        //                 logger.error("❌ KYC REJECTED oleh server.");
        //                 return;
        //             } else {
        //                 logger.info(`⏳ Status: ${status || 'PENDING'}. Waiting 5s...`);
        //                 await new Promise(r => setTimeout(r, 5000));
        //             }
        //         }

        //         if (!isApproved) {
        //             logger.error("❌ KYC Timeout (Status masih PENDING).");
        //             return;
        //         }

        //     } catch (innerError) {
        //         console.error(innerError); 
        //         return;
        //     }
        // }

        payload = await applyCurrencySpecificPayload(payload, currency, bankCode, cardNumber, config);

        const payloadStr = JSON.stringify(payload);
        const signature = signVerify("sign", payloadStr, config.secretKey);
        const encryptedTransactionCode = encryptDecrypt("encrypt", transactionCode, config.merchantAPI, config.secretKey);

        logger.info(`URL: ${config.BASE_URL}/api/${config.merchantCode}/v5/generateDeposit`);
        logger.info(`Merchant Code: ${config.merchantCode}`);
        logger.info(`Request Payload: ${JSON.stringify(payload, null, 2)}`);
        logger.debug(`Encrypted Transaction Code: ${encryptedTransactionCode}`);
        logger.info(`Signature: ${signature}`);

        const isValid = signVerify("verify", { payload: payloadStr, signature }, config.secretKey);
        logger.info(isValid ? "✅ VALID SIGN" : "❌ INVALID SIGN");

        const res = await fetch(`${config.BASE_URL}/api/${config.merchantCode}/v5/generateDeposit`, {
            method: "POST",
            headers: { "Content-Type": "application/json", sign: signature },
            body: payloadStr
        });

        const responseBody = await res.text();
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            logger.error(`❌ Response bukan JSON. Content-Type: ${contentType}`);
            logger.error(`Response Body: ${responseBody}`);
            return;
        }

        let resultDP;
        try {
            resultDP = JSON.parse(responseBody);
        } catch (err) {
            logger.error("❌ Gagal parse JSON:", err.message);
            logger.error("Raw response body:", responseBody);
            return;
        }

        if (!res.ok) {
            logger.error(`❌ Deposit gagal:\n${JSON.stringify(resultDP, null, 2)}`);
            return;
        }

        logger.info(`Response Status: ${res.status}`);
        logger.info(`Deposit Response: ${JSON.stringify(resultDP, null, 2)}`);

        const data = Array.isArray(resultDP) ? resultDP[0] : resultDP;
        const payUrl = resultDP?.data?.page_url;

        if (payUrl) {
            logger.info(`Opening Payment URL: ${payUrl}`);
            await open(payUrl);
        } else {
            logger.warn("Pay URL tetap tidak ditemukan dalam response.");
        }

        if (["INR","BDT"].includes(currency)) {
            const utr = await askUTR();
            if (utr === "YES") await submitUTR(currency, transactionCode);
            else logger.info("Skip Submit UTR");
        }

    } catch (err) {
        logger.error(`❌ Deposit Error: ${err}`);
    }

    logger.info("======== REQUEST DONE ========\n\n");
}

sendDeposit();
