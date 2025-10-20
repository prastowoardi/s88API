import fetch from "node-fetch";
import readlineSync from "readline-sync";
import logger from "../../logger.js";
import { randomInt } from "crypto";
import { encryptDecrypt, getRandomIP, getRandomName } from "../../helpers/utils.js";
import { generateUTR, randomPhoneNumber, randomMyanmarPhoneNumber, randomCardNumber } from "../../helpers/depositHelper.js";
import { getCurrencyConfig } from "../../helpers/depositConfigMap.js";
import { createKrwCustomer } from "../../helpers/krwHelper.js";

const SUPPORTED_CURRENCIES = ["INR", "VND", "BDT", "MMK", "PMI", "KRW", "THB", "IDR", "BRL", "MXN", "PHP", "HKD", "JPY"];

async function submitUTR(currency, transactionCode) {
    if (!["INR", "BDT"].includes(currency)) {
        logger.error("❌ Submit UTR hanya tersedia untuk INR & BDT.");
        return;
    }

    const utr = generateUTR(currency);
    logger.info(`✅ UTR : ${utr}`);

    const config = getCurrencyConfig(currency);

    const payloadString = `transaction_code=${transactionCode}&utr=${utr}`;
    const encryptedPayload = encryptDecrypt("encrypt", payloadString, config.merchantAPI, config.secretKey);

    try {
        const response = await fetch(`${config.BASE_URL}/api/${config.merchantCode}/v3/submit-utr`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: encryptedPayload })
        });

        const responseText = await response.text();
        if (!response.ok) {
            logger.error("❌ HTTP Error:", response.status);
            logger.info(`Response : ${responseText}`);
            return;
        }

        const result = JSON.parse(responseText);
        logger.info(`Submit UTR Response : ${JSON.stringify(result, null, 2)}`);        
    } catch (err) {
        logger.error(`❌ Submit UTR Error : ${err}`);
    }
}

async function sendDeposit() { 
    logger.info("======== DEPOSIT V3 REQUEST ========");
    
    const envCurrency = process.env.CURRENCY;
        
    let currency;
    if (envCurrency && SUPPORTED_CURRENCIES.includes(envCurrency)) {
        currency = envCurrency;
    } else {
        currency = this.validateCurrency(currencyInput.trim().toUpperCase());
    }

    let userID = randomInt(100, 999);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const transactionCode = `TEST-DP-${timestamp}`;
    const config = getCurrencyConfig(currency);
    
    const amount = readlineSync.question("Masukkan Amount: ");
    
    if (isNaN(amount) || Number(amount) <= 0) {
        logger.error("❌ Amount harus berupa angka lebih dari 0.");
        return;
    }

    let bankCode = "";
    let phone = "";
    const cardNumber = randomCardNumber();
    const ip = getRandomIP();

    // if (currency === "KRW") {
    //     const result = await createKrwCustomer(config);

    //     if (!result || result.success !== true) {
    //         logger.error("❌ Gagal create customer KRW. API tidak success.");
    //         return;
    //     }

    //     const user_id = result.data?.user_id;
    //     if (!user_id) {
    //         logger.error("❌ Tidak ada user_id di response create-customer KRW.");
    //         return;
    //     }

    //     userID = user_id;
    //     logger.info(`user_id from API create-customer KRW: ${userID}`);
    // }

    if (config.requiresBankCode) {
        if (currency === "BRL") {
            bankCode = "PIX";
        } else if (currency === "MXN") {
            bankCode = "SPEI";
        } else {
            bankCode = readlineSync.question("Masukkan Bank Code: ");
        }
    } else if (config.bankCodeOptions) {
        bankCode = config.bankCodeOptions[Math.floor(Math.random() * config.bankCodeOptions.length)];
    }

    if (currency === "MMK" && bankCode === "WAVEPAY") {
        phone = randomMyanmarPhoneNumber();
        logger.info(`Phone Number for WavePay: ${phone}`);
    }

    if (currency === "BDT") {
        phone = randomPhoneNumber("bdt");
    }

    if (config.cardNumber) {
        logger.info(`Card Number: ${cardNumber}`);
    }

    let payload = 
        `merchant_api_key=${config.merchantAPI}` +
        `&merchant_code=${config.merchantCode}` +
        `&transaction_code=${transactionCode}` +
        `&transaction_timestamp=${timestamp}` +
        `&transaction_amount=${amount}` +
        `&user_id=${userID}` +
        `&currency_code=${currency}` +
        `&payment_code=${config.depositMethod}` +
        `&callback_url=${config.callbackURL}` +
        `&ip_address=${ip}`;
        
    if (currency === "IDR" && bankCode === "OVO") {
        phone = randomPhoneNumber("idr");
        payload += `&bank_account_number=${phone}`;
        logger.info(`OVO Phone Number: ${phone}`);
    }

    if (bankCode) payload += `&bank_code=${bankCode}`;
    
    if (phone && !(currency === "IDR" && bankCode === "OVO")) {
        payload += `&phone = ${phone}`;
    }

    if (cardNumber) payload += `&card_number=${cardNumber}`;
    
    if (currency === "JPY") {
        payload += `&cust_name=${await getRandomName()}`;
    }

    if (currency === "HKD") {
        payload +=
        `&card_number=3566111111111113` +
        `&card_date=06/25` +
        `&card_cvv=100` +
        `&card_holder_name=bob Brown`;
    }

    if (currency === "KRW") {
        payload += 
            `&bank_code=${bankCode}` +
            `&card_holder_name=중국공상은행` +
            `&card_number=${cardNumber}`;
    }

    if (currency === "THB") {
        const account_type = readlineSync.question("Masukkan Account Type : ");
        if (!/^[a-z0-9A-Z]+$/.test(account_type)) {
            throw new Error("Depositor Bank must contain only letters");
        }

        payload += `&account_type=${account_type}`;
        payload += `&depositor_name=${await getRandomName()}`;
        payload += `&depositor_bank=${bankCode}`;
        payload += `&bank_account_number=${cardNumber}`;
    }


    const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);
    const decrypted = encryptDecrypt("decrypt", encrypted, config.merchantAPI, config.secretKey);

    logger.info(`URL : ${config.BASE_URL}/api/${config.merchantCode}/v3/dopayment`);
    logger.info(`Merchant Code : ${config.merchantCode}`)
    logger.info(`Request Payload : ${payload}`);
    logger.info(`Encrypted : ${encrypted}`);
    // logger.info(`Decrypted : ${decrypted}`);

    try {
        const response = await fetch(`${config.BASE_URL}/api/${config.merchantCode}/v3/dopayment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: encrypted })
        });

        const contentType = response.headers.get("content-type");
        const responseBody = await response.text();

        if (!contentType || !contentType.includes("application/json")) {
            logger.error("❌ Response bukan JSON. Content-Type: " + contentType);
            logger.error(`Response body: ${responseBody}`);
            return;
        }

        let resultDP;
        try {
            resultDP = JSON.parse(responseBody);
        } catch (parseError) {
            logger.error("❌ Gagal parse JSON:", parseError.message);
            console.log("Raw response body:", responseBody);
            return;
        }

        if (!response.ok) {
            logger.error("❌ Deposit gagal:\n" + JSON.stringify(resultDP, null, 2));
            return;
        }

        logger.info("Deposit Response: " + JSON.stringify(resultDP, null, 2));
        logger.info(`Response Status: ${response.status}`);

        let utr = "NO";
        if (currency === "INR" || currency === "BDT") {
            utr = readlineSync.question("Input UTR (YES/NO): ");
            utr = utr.toUpperCase();

            while (utr !== "YES" && utr !== "NO") {
                console.log("Invalid input! Please enter 'YES' or 'NO'.");
                utr = readlineSync.question("Input UTR (YES/NO): ");
                utr = utr.toUpperCase();
            }

            console.log(`UTR : ${utr}`);
            
            if (utr === "YES" && ["INR", "BDT"].includes(currency)) {
                await submitUTR(currency, transactionCode);
            } else {
                logger.info("Skip Submit UTR");
                process.exit(0);
            }
        }

    } catch (err) {
        logger.error(`❌ Deposit Error : ${err}\n`);
    }

    logger.info("======== REQUEST DONE ========\n\n");
}

sendDeposit();
