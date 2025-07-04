import readlineSync from "readline-sync";
import logger from "../../logger.js";
import dotenv from 'dotenv';
import { randomInt } from "crypto";
import { encryptDecrypt } from "../../helpers/utils.js";
import { randomPhoneNumber, randomCardNumber } from "../../helpers/depositHelper.js";
import { getCurrencyConfig } from "../../helpers/depositConfigMap.js";


dotenv.config();

async function depositV2() {
    const userID = randomInt(100, 999);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    
     const currency = readlineSync.question("Masukkan Currency (INR/VND/BDT/MMK/BRL/THB/IDR/MXN): ").toUpperCase();
    if (!["INR", "VND", "BDT", "MMK", "BRL", "IDR", "THB", "MXN"].includes(currency)) {
        logger.error("❌ Invalid currency. Masukkan INR, VND, BDT, MMK, BRL, THB, MXN atau IDR.");
        return;
    }

    const amount = readlineSync.question("Masukkan Amount: ");

    const transactionCode = `TEST-DP-${timestamp}`;
    const config = getCurrencyConfig(currency);
    let bankCode = "";
    let phone = "";
    let cardNumber = ""

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

    if (currency === "BDT") {
        phone = randomPhoneNumber("bdt");
    }

    if (config.cardNumber) {
        cardNumber = randomCardNumber();
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
        `&callback_url=${config.callbackURL}`;

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

    const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);

    logger.info("======== DEPOSIT V2 REQUEST ========");
    logger.info(`Request Payload : ${payload}\n`);
    logger.info(`PayURL : ${config.BASE_URL}/${config.merchantCode}/v2/dopayment?key=${encrypted}`);
    logger.info("================================\n\n");
}

depositV2();
