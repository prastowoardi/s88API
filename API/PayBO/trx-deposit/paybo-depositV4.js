import fetch from "node-fetch";
import readlineSync from "readline-sync";
import logger from "../../logger.js";
import { randomInt } from "crypto";
import { encryptDecrypt, getRandomIP, getRandomName } from "../../helpers/utils.js";
import { randomPhoneNumber, randomMyanmarPhoneNumber, randomCardNumber, generateUTR } from "../../helpers/depositHelper.js";
import { getCurrencyConfig } from "../../helpers/depositConfigMap.js";

const SUPPORTED_CURRENCIES = ["INR","VND","BDT","MMK","PMI","KRW","THB","IDR","BRL","MXN","PHP","HKD","JPY"];

async function submitUTR(currency, transactionCode) {
    if (!["INR", "BDT"].includes(currency)) {
        logger.error("❌ Submit UTR hanya tersedia untuk INR & BDT.");
        return;
    }

    const utr = generateUTR(currency);
    logger.info(`✅ UTR : ${utr}`);
    const config = getCurrencyConfig(currency);

    const encryptedPayload = encryptDecrypt(
        "encrypt",
        `transaction_code=${transactionCode}&utr=${utr}`,
        config.merchantAPI,
        config.secretKey
    );

    try {
        const res = await fetch(`${config.BASE_URL}/api/${config.merchantCode}/v3/submit-utr`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: encryptedPayload })
        });

        const text = await res.text();
        if (!res.ok) {
            logger.error(`❌ HTTP Error: ${res.status} Response: ${text}`);
            return;
        }

        const result = JSON.parse(text);
        logger.info(`Submit UTR Response: ${JSON.stringify(result, null, 2)}`);
    } catch (err) {
        logger.error(`❌ Submit UTR Error: ${err}`);
    }
}

async function askUTR() {
    let utr = readlineSync.question("Input UTR (YES/NO): ").toUpperCase();
    while (!["YES","NO"].includes(utr)) {
        console.log("Invalid input! Please enter 'YES' or 'NO'.");
        utr = readlineSync.question("Input UTR (YES/NO): ").toUpperCase();
    }
    return utr;
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

async function applyCurrencySpecifics(payload, currency, bankCode, cardNumber) {
    const name = await getRandomName();
    switch (currency) {
        // Uncomment for Erfolgpay
        // case "INR":
        //     payload.product_name="pillow"
        //     payload.cust_name=await getRandomName("in", true)
        //     payload.cust_email="pillow@mail.com"
        //     payload.cust_phone="9876371231"
        //     payload.cust_city="Mumbai"
        //     payload.cust_country="India"
        //     payload.zip_code="21323"
        //     break;
        case "KRW":
            payload.bank_code = bankCode;
            payload.card_holder_name = await getRandomName("kr", true);
            payload.card_number = cardNumber;
            payload.cust_name = await getRandomName("kr", true);
            break;
        case "THB":
            const account_type = readlineSync.question("Masukkan Account Type: ");
            if (!/^[a-zA-Z0-9]+$/.test(account_type)) throw new Error("Account Type must contain only letters");
            payload.account_type = account_type;
            payload.cust_name = await getRandomName("th", true);
            payload.depositor_bank = bankCode;
            payload.bank_account_number = cardNumber;
            break;
        case "JPY":
            payload.cust_name = await getRandomName("jp", true);
            break;
        case "HKD":
            payload.card_number = "3566111111111113";
            payload.card_date = "06/25";
            payload.card_cvv = "100";
            payload.card_holder_name = "bob Brown";
            break;
    }
    return payload;
}

async function sendDeposit() {
    logger.info("======== DEPOSIT V4 REQUEST ========");

    try {
        const envCurrency = process.env.CURRENCY;
        let currency = SUPPORTED_CURRENCIES.includes(envCurrency) ? envCurrency : readlineSync.question("Masukkan Currency: ").trim().toUpperCase();
        if (!SUPPORTED_CURRENCIES.includes(currency)) throw new Error(`Currency ${currency} tidak support`);

        const amountInput = readlineSync.question("Masukkan Amount: ").trim();
        const amount = Number(amountInput);
        if (isNaN(amount) || amount <= 0) throw new Error("Amount harus berupa angka lebih dari 0.");

        const timestamp = Math.floor(Date.now() / 1000).toString();
        const transactionCode = `TEST-DP-V4-${timestamp}`;
        const userID = randomInt(100, 999).toString();
        const config = getCurrencyConfig(currency);
        const ip = getRandomIP();
        const cardNumber = randomCardNumber();

        const bankCode = getBankCode(currency, config);
        const phone = getPhone(currency, bankCode);

        let payload = {
            transaction_amount: amount,
            payment_code: config.depositMethod,
            user_id: userID,
            currency_code: currency,
            callback_url: config.callbackURL,
            ip_address: ip
        };

        if (bankCode) payload.bank_code = bankCode;
        if (phone) payload.cust_phone = phone;
        if (config.cardNumber) payload.card_number = cardNumber;

        payload = await applyCurrencySpecifics(payload, currency, bankCode, cardNumber);

        const encryptedTransactionCode = encryptDecrypt("encrypt", transactionCode, config.merchantAPI, config.secretKey);

        logger.info(`URL : ${config.BASE_URL}/api/${config.merchantCode}/v4/generateDeposit`);
        logger.info(`Merchant Code : ${config.merchantCode}`);
        logger.info(`Transaction Code : ${transactionCode}`);
        logger.info(`Encrypted Transaction Code: ${encryptedTransactionCode}`);
        logger.info(`Request Payload: ${JSON.stringify(payload, null, 2)}`);

        const response = await fetch(`${config.BASE_URL}/api/${config.merchantCode}/v4/generateDeposit`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "X-Encrypted-Transaction": encryptedTransactionCode
            },
            body: JSON.stringify(payload)
        });

        const responseBody = await response.text();
        const contentType = response.headers.get("content-type");

        if (!contentType || !contentType.includes("application/json")) {
            logger.error(`❌ Response bukan JSON. Content-Type: ${contentType}`);
            logger.error(`Response Body: ${responseBody}`);
            return;
        }

        let result;
        try {
            result = JSON.parse(responseBody);
        } catch (err) {
            logger.error("❌ Gagal parse JSON:", err.message);
            logger.error("Raw response:", responseBody);
            return;
        }

        if (!response.ok) {
            logger.error(`❌ Deposit gagal:\n${JSON.stringify(result, null, 2)}`);
            return;
        }

        logger.info(`Deposit Response: ${JSON.stringify(result, null, 2)}`);
        logger.info(`Response Status: ${response.status}`);

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
