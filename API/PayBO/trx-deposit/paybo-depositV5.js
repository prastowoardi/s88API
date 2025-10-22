import fetch from "node-fetch";
import readlineSync from "readline-sync";
import logger from "../../logger.js";
import { randomInt } from "crypto";
import { encryptDecrypt, signVerify, getRandomIP, getRandomName } from "../../helpers/utils.js";
import { randomPhoneNumber, randomMyanmarPhoneNumber, randomCardNumber, generateUTR } from "../../helpers/depositHelper.js";
import { getCurrencyConfig } from "../../helpers/depositConfigMap.js";

const SUPPORTED_CURRENCIES = ["INR", "VND", "BDT", "MMK", "PMI", "KRW", "THB", "IDR", "BRL", "MXN", "PHP", "HKD", "JPY"];

async function submitUTR(currency, transactionCode) {
    if (!["INR", "BDT"].includes(currency)) {
        logger.error("❌ Submit UTR hanya tersedia untuk INR & BDT.");
        return;
    }

    const reference = generateUTR(currency);
    const config = getCurrencyConfig(currency);
    const payloadObj = {
        transaction_code: transactionCode,
        reference: reference
    };

    const payloadString = JSON.stringify(payloadObj);
    const signature = signVerify("sign", payloadString, config.secretKey); // opsional jika API butuh
    logger.info(`UTR : ${reference}`);
    logger.info(`Signature: ${signature}`)
    try {
        const response = await fetch(`${config.BASE_URL}/api/${config.merchantCode}/v5/submitReference`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                sign: signature
            },
            body: payloadString
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
    logger.info("======== DEPOSIT V5 REQUEST ========");

    let userID = randomInt(100, 999);
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const envCurrency = process.env.CURRENCY;
        
    let currency;
    if (envCurrency && SUPPORTED_CURRENCIES.includes(envCurrency)) {
        currency = envCurrency;
    }
    
    const amount = readlineSync.question("Masukkan Amount: ");
    
    if (isNaN(amount) || Number(amount) <= 0) {
        logger.error("❌ Amount harus berupa angka lebih dari 0.");
        return;
    }

    const transactionCode = `TEST-DP-${timestamp}`;
    const config = getCurrencyConfig(currency);
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

    const payloadObject = {
        transaction_code: transactionCode,
        transaction_amount: amount,
        payment_code: config.depositMethod,
        user_id: userID.toString(),
        currency_code: currency,
        callback_url: config.callbackURL,
        ip_address: getRandomIP()
    };
    
    if (currency === "KRW") {
        payloadObject.cust_name = await getRandomName(); 
    }

    if (currency === "IDR" && bankCode === "OVO") {
        phone = randomPhoneNumber("idr");
        payloadObject.bank_account_number = phone;
        logger.info(`OVO Phone Number: ${phone}`);
    }

    if (bankCode) payloadObject.bank_code = bankCode;
    
    if (phone && !(currency === "IDR" && bankCode === "OVO")) {
        payloadObject.cust_phone = phone;
    }
    
    if (currency === "JPY") {
        payloadObject.cust_name = await getRandomName();
    }

    if (config.cardNumber) {
        payloadObject.card_number = cardNumber;
    }

    if (currency === "HKD") {
        payloadObject.card_number = "3566111111111113";
        payloadObject.card_date = "06/25";
        payloadObject.card_cvv = "100";
        payloadObject.card_holder_name = "bob Brown";
    }

    if (currency === "THB") {
        const account_type = readlineSync.question("Masukkan Account Type: ");
        if (!/^[a-z0-9A-Z]+$/.test(account_type)) {
            throw new Error("Account Type must contain only letters");
        }
        
        payloadObject.bank_code = bankCode
        payloadObject.depositor_name = await getRandomName();
        payloadObject.account_type = account_type;
        payloadObject.bank_account_number = cardNumber;
    }

    // Uncomment for Erfolgpay
    // if (currency === "INR") {
    //         payloadObject.product_name="pillow"
    //         payloadObject.cust_name="pillow"
    //         payloadObject.cust_email="pillow@mail.com"
    //         payloadObject.cust_phone="9876371231"
    //         payloadObject.cust_city="Mumbai"
    //         payloadObject.cust_country="India"
    //         payloadObject.zip_code="21323"
    // }

    const payload = JSON.stringify(payloadObject);
    const encryptedTransactionCode = encryptDecrypt("encrypt", transactionCode, config.merchantAPI, config.secretKey);

    const signature = signVerify("sign", payload, config.secretKey);

    logger.info(`URL : ${config.BASE_URL}/api/${config.merchantCode}/v5/generateDeposit`);
    logger.info(`Merchant Code : ${config.merchantCode}`);
    logger.info(`Secret Key : ${config.secretKey}`)
    logger.info(`Request Payload : ${JSON.stringify(payloadObject, null, 2)}`);
    logger.debug(`Encrypted Transaction Code: ${encryptedTransactionCode}`);
    logger.info(`Signature: ${signature}`);

    const isValid = signVerify("verify", {
        payload: payload,
        signature: signature
    }, config.secretKey);

    if (isValid) {
        logger.info("✅ VALID SIGN");
    } else {
        logger.info("❌ INVALID SIGN !");
    }

    try {
        const response = await fetch(`${config.BASE_URL}/api/${config.merchantCode}/v5/generateDeposit`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "sign": signature
            },
            body: payload
        });

        const responseBody = await response.text();

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            logger.error(`❌ Response bukan JSON. Content-Type: ${contentType}`);
            logger.error(`Response Body: ${responseBody}`);
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

        logger.info(`Response Status: ${response.status}`);
        logger.info("Deposit Response: " + JSON.stringify(resultDP, null, 2));

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
        logger.error(`❌ Deposit Error: ${err}`);
    }


    logger.info("======== REQUEST DONE ========\n\n");
}

sendDeposit();