import readlineSync from "readline-sync";
import logger from "../logger.js";
import dotenv from 'dotenv';
import { randomInt } from "crypto";
import { encryptDecrypt } from "../helpers/utils.js";
import { randomPhoneNumber, randomMyanmarPhoneNumber } from "../helpers/depositHelper.js";
import {
    BASE_URL, CALLBACK_URL, 
    SECRET_KEY_INR, SECRET_KEY_VND, SECRET_KEY_BDT, SECRET_KEY_MMK,
    DEPOSIT_METHOD_INR, DEPOSIT_METHOD_VND, DEPOSIT_METHOD_BDT, DEPOSIT_METHOD_MMK,
    MERCHANT_CODE_INR, MERCHANT_CODE_VND, MERCHANT_CODE_BDT, MERCHANT_CODE_MMK,
    MERCHANT_API_KEY_INR, MERCHANT_API_KEY_VND, MERCHANT_API_KEY_BDT, MERCHANT_API_KEY_MMK
} from "../Config/config.js";

dotenv.config();

async function depositV2() {
    const userID = randomInt(100, 999);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const currency = readlineSync.question("Masukkan Currency (INR/VND/BDT/MMK): ").toUpperCase();
    const amount = readlineSync.question("Masukkan Amount: ");
    logger.info(`Amount Input : ${amount}`);

    const supportedCurrencies = ["INR", "VND", "BDT", "MMK"];
    if (!supportedCurrencies.includes(currency)) {
        logger.error("❌ Invalid currency.");
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
            }
    };

    const config = currencyConfig[currency];
    let bankCode = "";
    let phone = "";

    if (config.requiresBankCode) {
        bankCode = readlineSync.question("Masukkan Bank Code: ").toLowerCase();
        if (!/^[a-z0-9]+$/.test(bankCode)) {
            logger.error("❌ Bank Code harus berupa huruf/angka.");
            return;
        }
    } else if (config.bankCodeOptions) {
        bankCode = config.bankCodeOptions[Math.floor(Math.random() * config.bankCodeOptions.length)];
    }

    if (currency === "MMK" && bankCode === "wavepay") {
        phone = randomMyanmarPhoneNumber();
        logger.info(`📱 Phone (auto-generated for WavePay): ${phone}`);
    }

    if (currency === "BDT") {
        phone = randomPhoneNumber();
    }

    let payload = `merchant_api_key=${config.merchantAPI}&merchant_code=${config.merchantCode}&transaction_code=${transactionCode}&transaction_timestamp=${timestamp}&transaction_amount=${amount}&user_id=${userID}&currency_code=${currency}&payment_code=${config.depositMethod}&callback_url=${CALLBACK_URL}`;

    if (bankCode) payload += `&bank_code=${bankCode}`;
    if (phone) payload += `&phone=${phone}`;

    const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);

    logger.info("======== Request ========");
    logger.info(`🔗 Request Payload : ${payload}\n`);
    // logger.info(`🔐 Encrypted : ${encrypted}`);
    logger.info(`🔗 PayURL : ${BASE_URL}/${config.merchantCode}/v2/dopayment?key=${encrypted}`);
    logger.info("================================\n\n");
}

depositV2();
