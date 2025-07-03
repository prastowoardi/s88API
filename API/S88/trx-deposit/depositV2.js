import readlineSync from "readline-sync";
import logger from "../../logger.js";
import dotenv from 'dotenv';
import { randomInt } from "crypto";
import { encryptDecrypt } from "../../helpers/utils.js";
import { randomPhoneNumber, randomMyanmarPhoneNumber } from "../../helpers/depositHelper.js";
import { getCurrencyConfig } from "../../helpers/currencyConfig.js";

dotenv.config();

async function depositV2() {
    const userID = randomInt(100, 999);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    
    const currency = readlineSync.question("Masukkan Currency (INR/VND/BDT/MMK): ").toUpperCase();
    if (!["INR", "VND", "BDT", "MMK"].includes(currency)) {
        logger.error(`"${currency}" Not supported yet!`);
        return;
    }

    const amount = readlineSync.question("Masukkan Amount: ");
    logger.info(`Amount Input : ${amount}`);

    const transactionCode = `TEST-DP-${timestamp}`;
    const config = getCurrencyConfig(currency);
    let bankCode = "";
    let phone = "";

    if (config.requiresBankCode) {
        bankCode = readlineSync.question("Masukkan Bank Code: ")
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
        phone = randomPhoneNumber("bdt");
    }

    let payload = `merchant_api_key=${config.merchantAPI}&merchant_code=${config.merchantCode}&transaction_code=${transactionCode}&transaction_timestamp=${timestamp}&transaction_amount=${amount}&user_id=${userID}&currency_code=${currency}&payment_code=${config.depositMethod}&callback_url=${config.CALLBACK_URL}`;

    if (bankCode) payload += `&bank_code=${bankCode}`;
    if (phone) payload += `&phone=${phone}`;

    // if (currency === "VND") {
    //     payload += "&random_bank_code=OBT";
    // }

    const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);

    logger.info("======== DEPOSIT V2 REQUEST ========");
    logger.info(`Request Payload : ${payload}\n`);
    logger.info(`PayURL : ${BASE_URL}/${config.merchantCode}/v2/dopayment?key=${encrypted}`);
    logger.info("================================\n\n");
}

depositV2();
