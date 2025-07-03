import fetch from "node-fetch";
import readlineSync from "readline-sync";
import logger from "../../logger.js";
import { randomInt } from "crypto";
import { encryptDecrypt } from "../../helpers/utils.js";
import { generateUTR, randomPhoneNumber, randomMyanmarPhoneNumber } from "../../helpers/depositHelper.js";
import {
    BASE_URL, CALLBACK_URL, PMI_DP_URL, PMI_AUTHORIZATION, 
    SECRET_KEY_INR, SECRET_KEY_VND, SECRET_KEY_BDT, SECRET_KEY_MMK, SECRET_KEY_PMI,
    DEPOSIT_METHOD_INR, DEPOSIT_METHOD_VND, DEPOSIT_METHOD_BDT, DEPOSIT_METHOD_MMK, DEPOSIT_METHOD_PMI,
    MERCHANT_CODE_INR, MERCHANT_CODE_VND, MERCHANT_CODE_BDT, MERCHANT_CODE_MMK, MERCHANT_CODE_PMI,
    MERCHANT_API_KEY_INR, MERCHANT_API_KEY_VND, MERCHANT_API_KEY_BDT, MERCHANT_API_KEY_MMK, MERCHANT_API_KEY_PMI
} from "../../Config/config.js";

async function submitUTR(currency, transactionCode) {
    if (!["INR", "BDT"].includes(currency)) {
        logger.error("❌ Submit UTR hanya tersedia untuk INR & BDT.");
        return;
    }

    generateUTR(currency);
    const utr = generateUTR(currency);
    logger.info(`✅ UTR : ${utr}`);

    const config = currency === "INR"
        ? { merchantCode: MERCHANT_CODE_INR, secretKey: SECRET_KEY_INR, merchantAPI: MERCHANT_API_KEY_INR }
        : { merchantCode: MERCHANT_CODE_BDT, secretKey: SECRET_KEY_BDT, merchantAPI: MERCHANT_API_KEY_BDT };

    const payloadString = `transaction_code=${transactionCode}&utr=${utr}`;
    const encryptedPayload = encryptDecrypt("encrypt", payloadString, config.merchantAPI, config.secretKey);

    try {
        const response = await fetch(`${BASE_URL}/api/${config.merchantCode}/v3/submit-utr`, {
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
        logger.info(`📥 Submit UTR Response : ${JSON.stringify(result, null, 2)}`);        
    } catch (err) {
        logger.error(`❌ Submit UTR Error : ${err}`);
    }
}

async function sendDeposit() { 
    logger.info("======== DEPOSIT REQUEST ========");

    const userID = randomInt(100, 999);
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const currency = readlineSync.question("Masukkan Currency (INR/VND/BDT/MMK/PMI): ").toUpperCase();
    if (!["INR", "VND", "BDT", "MMK", "PMI"].includes(currency)) {
        logger.error("❌ Invalid currency. Masukkan INR, VND, BDT, MMK, atau PMI.");
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
        PMI: {
            merchantCode: MERCHANT_CODE_PMI,
            depositMethod: DEPOSIT_METHOD_PMI,
            secretKey: SECRET_KEY_PMI,
            merchantAPI: MERCHANT_API_KEY_PMI,
            callbackURL: CALLBACK_URL
        }
    };

    const config = currencyConfig[currency];
    let bankCode = "";
    let phone = "";

    if (config.requiresBankCode) {
        bankCode = readlineSync.question("Masukkan Bank Code: ");
        if (!/^[a-zA-Z0-9]+$/.test(bankCode)) {
            logger.error("❌ Bank Code harus berupa huruf/angka.");
            return;
        }

        if (currency === 'MMK') {
            bankCode = bankCode.toUpperCase();
        } else {
            bankCode = bankCode.toLowerCase();
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

    if (currency === "PMI") {
        const payload = {
            invoice_id: transactionCode,
            amount: amount,
            currency: "INR",
            payment_method: config.depositMethod,
            callback_url: config.callbackURL
        };

        const headers = {
            "Content-Type": "application/json",
            "Authorization": PMI_AUTHORIZATION,
        };

        try {
            const response = await fetch(PMI_DP_URL, {
                method: "POST",
                headers,
                body: JSON.stringify(payload)
            });

            const responseText = await response.text();
            const parsed = JSON.parse(responseText.replace(/\\"/g, '"'));

            logger.info(`Response Status: ${response.status}`);
            logger.info(`✅ PMI Deposit Response ${JSON.stringify(parsed, null, 2)}`);
        } catch (err) {
            logger.error(`❌ PMI Deposit Error : ${err}`);
        }
    } else {
        let payload = `callback_url=${CALLBACK_URL}&merchant_api_key=${config.merchantAPI}&merchant_code=${config.merchantCode}&transaction_code=${transactionCode}&transaction_timestamp=${timestamp}&transaction_amount=${amount}&user_id=${userID}&currency_code=${currency}&payment_code=${config.depositMethod}`;

        if (bankCode) payload += `&bank_code=${bankCode}`;
        if (phone) payload += `&phone=${phone}`;
        // if (currency === "VND") {
        //         payload += "&random_bank_code=OBT";
        // }
        const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);
        const decrypted = encryptDecrypt("decrypt", encrypted, config.merchantAPI, config.secretKey);

        logger.info(`🔗 URL : ${BASE_URL}/api/${config.merchantCode}/v3/dopayment`);
        logger.info(` Merchant Code : ${config.merchantCode}`)
        logger.info(`🔗 Request Payload : ${payload}`);
        logger.info(`🔐 Encrypted : ${encrypted}`);
        // logger.info(`🔓 Decrypted : ${decrypted}`);

        try {
            const response = await fetch(`${BASE_URL}/api/${config.merchantCode}/v3/dopayment`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: encrypted })
            });

            const responseBody = await response.text();
            // logger.info("📥 Raw Response Body : " + responseBody);
            
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

            // logger.info("📥 Deposit Response: " + JSON.stringify(resultDP, null, 2));
            logger.info(`⚡️Response Status ${response.status}`);

            if (["INR", "BDT"].includes(currency)) {
                await submitUTR(currency, transactionCode);
            }
        } catch (err) {
            logger.error(`❌ Deposit Error : ${err}`);
        }
    }

    logger.info("======== REQUEST DONE ========\n\n");
}

sendDeposit();
