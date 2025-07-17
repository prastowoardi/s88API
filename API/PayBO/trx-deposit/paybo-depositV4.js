import fetch from "node-fetch";
import readlineSync from "readline-sync";
import logger from "../../logger.js";
import { randomInt } from "crypto";
import { encryptDecrypt, getRandomIP } from "../../helpers/utils.js";
import { randomPhoneNumber, randomMyanmarPhoneNumber, randomCardNumber } from "../../helpers/depositHelper.js";
import { getCurrencyConfig } from "../../helpers/depositConfigMap.js";
import { createKrwCustomer } from "../../helpers/krwHelper.js";

async function sendDeposit() { 
    logger.info("======== DEPOSIT V4 REQUEST ========");

    let userID = randomInt(100, 999);
    const timestamp = Math.floor(Date.now() / 1000).toString();

     const currency = readlineSync.question("Masukkan Currency (INR/VND/BDT/MMK/BRL/THB/IDR/MXN/KRW): ").toUpperCase();
    if (!["INR", "VND", "BDT", "MMK", "BRL", "IDR", "THB", "MXN", "KRW", "PHP"].includes(currency)) {
        logger.error("❌ Invalid currency. Masukkan INR, VND, BDT, MMK, BRL, THB, MXN, KRW, PHP atau IDR.");
        return;
    }
    
    const amount = readlineSync.question("Masukkan Amount: ");
    
    if (isNaN(amount) || Number(amount) <= 0) {
        logger.error("❌ Amount harus berupa angka lebih dari 0.");
        return;
    }

    const transactionCode = `TEST-DP-${timestamp}`;
    const config = getCurrencyConfig(currency);
    const ip = getRandomIP();
    let bankCode = "";
    let phone = "";
    let cardNumber = "";

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
        logger.info(`Phone: ${phone}`);
    }

    if (currency === "BDT") {
        phone = randomPhoneNumber("bdt");
    }

    if (config.cardNumber) {
        cardNumber = randomCardNumber();
        logger.info(`Card Number: ${cardNumber}`);
    }

    if (currency === "KRW") {
        const result = await createKrwCustomer(config);

        if (!result || result.success !== true) {
            logger.error("❌ Gagal create customer KRW. API tidak success.");
            return;
        }

        const user_id = result.data?.user_id;
        if (!user_id) {
            logger.error("❌ Tidak ada user_id di response create-customer KRW.");
            return;
        }

        userID = user_id;
        logger.info(`user_id from API create-customer KRW: ${userID}`);
    }

    const payloadObject = {
        transaction_amount: parseInt(amount),
        payment_code: config.depositMethod,
        user_id: userID.toString(),
        currency_code: currency,
        callback_url: config.callbackURL,
        ip_address: ip
    };

    if (currency === "IDR" && bankCode === "OVO") {
        phone = randomPhoneNumber("idr");
        payloadObject.bank_account_number = phone;
        logger.info(`OVO Phone Number: ${phone}`);
    }

    if (bankCode) payloadObject.bank_code = bankCode;
    
    if (phone && !(currency === "IDR" && bankCode === "OVO")) {
        payloadObject.cust_phone = phone;
    }

    if (cardNumber) payloadObject.card_number = cardNumber;

    const payload = JSON.stringify(payloadObject);
    const encryptedTransactionCode = encryptDecrypt("encrypt", transactionCode, config.merchantAPI, config.secretKey);

    const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);

    logger.info(`URL : ${config.BASE_URL}/api/${config.merchantCode}/v3/dopayment`);
    logger.info(`Merchant Code : ${config.merchantCode}`)
    logger.info(`Request Payload : ${payload}`);
    logger.info(`Encrypted : ${encrypted}`);
    logger.debug(`Encrypted Transaction Code: ${encryptedTransactionCode}`);

    try {
        const response = await fetch(`${config.BASE_URL}/api/${config.merchantCode}/v4/generateDeposit`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "X-Encrypted-Transaction": encryptedTransactionCode
            },
            body: payload
        });

        const responseBody = await response.text();

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            logger.error("❌ Response bukan JSON. Content-Type:", contentType);
            logger.error("Response Body:", responseBody);
            return;
        }

        let resultDP;
        try {
            resultDP = JSON.parse(responseBody);
        } catch (parseError) {
            logger.error("❌ Gagal parse JSON:", parseError.message);
            logger.error("Raw response body:", responseBody);
            return;
        }

        if (!response.ok) {
            logger.error("❌ Deposit gagal:\n" + JSON.stringify(resultDP, null, 2));
            return;
        }

        logger.info("Deposit Response: " + JSON.stringify(resultDP, null, 2));
        logger.info(`Response Status: ${response.status}`);
    } catch (err) {
        logger.error(`❌ Deposit Error: ${err}`);
    }


    logger.info("======== REQUEST DONE ========\n\n");
}

sendDeposit();
