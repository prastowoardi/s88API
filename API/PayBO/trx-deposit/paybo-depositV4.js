import fetch from "node-fetch";
import readlineSync from "readline-sync";
import logger from "../../logger.js";
import { randomInt } from "crypto";
import { encryptDecrypt } from "../../helpers/utils.js";
import { randomPhoneNumber, randomMyanmarPhoneNumber, randomCardNumber } from "../../helpers/depositHelper.js";
import {
    BASE_URL, CALLBACK_URL, 
    SECRET_KEY_INR, SECRET_KEY_VND, SECRET_KEY_BDT, SECRET_KEY_MMK, SECRET_KEY_BRL, SECRET_KEY_IDR, SECRET_KEY_THB, SECRET_KEY_MXN,
    DEPOSIT_METHOD_INR, DEPOSIT_METHOD_VND, DEPOSIT_METHOD_BDT, DEPOSIT_METHOD_MMK, DEPOSIT_METHOD_BRL, DEPOSIT_METHOD_IDR, DEPOSIT_METHOD_THB, DEPOSIT_METHOD_MXN,
    MERCHANT_CODE_INR, MERCHANT_CODE_VND, MERCHANT_CODE_BDT, MERCHANT_CODE_MMK, MERCHANT_CODE_BRL, MERCHANT_CODE_IDR, MERCHANT_CODE_THB, MERCHANT_CODE_MXN,
    MERCHANT_API_KEY_INR, MERCHANT_API_KEY_VND, MERCHANT_API_KEY_BDT, MERCHANT_API_KEY_MMK, MERCHANT_API_KEY_BRL, MERCHANT_API_KEY_IDR, MERCHANT_API_KEY_THB, MERCHANT_API_KEY_MXN
} from "../../Config/config.js";

async function sendDeposit() { 
    logger.info("======== DEPOSIT V4 REQUEST ========");

    const userID = randomInt(100, 999);
    const timestamp = Math.floor(Date.now() / 1000).toString();

     const currency = readlineSync.question("Masukkan Currency (INR/VND/BDT/MMK/BRL/THB/IDR/MXN): ").toUpperCase();
    if (!["INR", "VND", "BDT", "MMK", "BRL", "IDR", "THB", "MXN"].includes(currency)) {
        logger.error("❌ Invalid currency. Masukkan INR, VND, BDT, MMK, BRL, THB, MXN atau IDR.");
        return;
    }
    
    const amount = readlineSync.question("Masukkan Amount: ");
    logger.info(`Amount Input : ${amount}`);
    
    if (isNaN(amount) || Number(amount) <= 0) {
        logger.error("❌ Amount harus berupa angka lebih dari 0.");
        return;
    }

    const transactionCode = `TEST-DP-${timestamp}`;

    const currencyConfig = {
        INR: {
            merchantCode: MERCHANT_CODE_INR,
            depositMethod: DEPOSIT_METHOD_INR,
            secretKey: SECRET_KEY_INR,
            merchantAPI: MERCHANT_API_KEY_INR
        },
        VND: {
            merchantCode: MERCHANT_CODE_VND,
            depositMethod: DEPOSIT_METHOD_VND,
            secretKey: SECRET_KEY_VND,
            merchantAPI: MERCHANT_API_KEY_VND,
            requiresBankCode: true
        },
        BDT: {
            merchantCode: MERCHANT_CODE_BDT,
            depositMethod: DEPOSIT_METHOD_BDT,
            secretKey: SECRET_KEY_BDT,
            merchantAPI: MERCHANT_API_KEY_BDT,
            bankCodeOptions: ["1002", "1001", "1004", "1003"]
        },
        MMK: {
            merchantCode: MERCHANT_CODE_MMK,
            depositMethod: DEPOSIT_METHOD_MMK,
            secretKey: SECRET_KEY_MMK,
            merchantAPI: MERCHANT_API_KEY_MMK,
            requiresBankCode: true
        },
        BRL: {
            merchantCode: MERCHANT_CODE_BRL,
            depositMethod: DEPOSIT_METHOD_BRL,
            secretKey: SECRET_KEY_BRL,
            merchantAPI: MERCHANT_API_KEY_BRL,
            requiresBankCode: true,
            callbackURL: CALLBACK_URL
        },
        IDR: {
            merchantCode: MERCHANT_CODE_IDR,
            depositMethod: DEPOSIT_METHOD_IDR,
            secretKey: SECRET_KEY_IDR,
            merchantAPI: MERCHANT_API_KEY_IDR,
            bankCodeOptions: ["BCA", "DANA", "OVO", "GOPAY", "MANDIRI", "BNI"],
            callbackURL: CALLBACK_URL
        },
        THB: {
            merchantCode: MERCHANT_CODE_THB,
            depositMethod: DEPOSIT_METHOD_THB,
            secretKey: SECRET_KEY_THB,
            merchantAPI: MERCHANT_API_KEY_THB,
            bankCodeOptions: ["BBL", "GSB", "KTB", "SCBEASY"],
            cardNumber: true,
            callbackURL: CALLBACK_URL
        },
        MXN: {
            merchantCode: MERCHANT_CODE_MXN,
            depositMethod: DEPOSIT_METHOD_MXN,
            secretKey: SECRET_KEY_MXN,
            merchantAPI: MERCHANT_API_KEY_MXN,
            requiresBankCode: true,
            callbackURL: CALLBACK_URL
        }
    };

    const config = currencyConfig[currency];
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
        logger.info(`📱 Phone (auto-generated for WavePay): ${phone}`);
    }

    if (currency === "BDT") {
        phone = randomPhoneNumber();
    }

    if (config.cardNumber) {
        cardNumber = randomCardNumber();
        logger.info(`Card Number: ${cardNumber}`);
    }

    if (currency === "IDR" && bankCode === "OVO") {
        phone = randomPhoneNumber("idr");
        logger.info(`OVO Phone Number: ${phone}`);
    }

    const payloadObject = {
        transaction_amount: parseInt(amount),
        payment_code: config.depositMethod,
        user_id: userID.toString(),
        currency_code: currency,
        callback_url: CALLBACK_URL,
        ip_address: "127.0.0.1"
    };

    if (bankCode) payloadObject.bank_code = bankCode;
    if (phone) payloadObject.cust_phone = phone;
    if (cardNumber) payloadObject.card_number = cardNumber;

    const payload = JSON.stringify(payloadObject);
    const encryptedTransactionCode = encryptDecrypt("encrypt", transactionCode, config.merchantAPI, config.secretKey);

    const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);

    logger.info(`URL : ${BASE_URL}/api/${config.merchantCode}/v3/dopayment`);
    logger.info(`Merchant Code : ${config.merchantCode}`)
    logger.info(`Request Payload : ${payload}`);
    logger.info(`Encrypted : ${encrypted}`);
    logger.debug(`Encrypted Transaction Code: ${encryptedTransactionCode}`);

    try {
        const response = await fetch(`${BASE_URL}/api/${config.merchantCode}/v4/generateDeposit`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "X-Encrypted-Transaction": encryptedTransactionCode
             },
            body: payload
        });

        const responseBody = await response.text();
        
        let resultDP = JSON.parse(responseBody);

        try {
            resultDP = JSON.parse(responseBody);
        } catch (parseError) {
            logger.error("❌ Gagal parse JSON:", parseError.message);
            return;
        }
        if (!response.ok) {
            logger.error("❌ Deposit gagal:", resultDP);
            return;
        }
        
        logger.info("Deposit Response: " + JSON.stringify(resultDP, null, 2));
        logger.info(`Response Status ${response.status}`);

    } catch (err) {
        logger.error(`❌ Deposit Error : ${err}`);
    }

    logger.info("======== REQUEST DONE ========\n\n");
}

sendDeposit();
