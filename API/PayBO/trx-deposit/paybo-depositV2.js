import readline from 'readline';
import logger from "../../logger.js";
import dotenv from 'dotenv';
import { randomInt } from "crypto";
import { encryptDecrypt, getRandomIP } from "../../helpers/utils.js";
import { randomPhoneNumber, randomCardNumber } from "../../helpers/depositHelper.js";
import { getCurrencyConfig } from "../../helpers/depositConfigMap.js";
import { createKrwCustomer } from "../../helpers/krwHelper.js";

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise(resolve => rl.question(question, answer => resolve(answer)));
}

async function depositV2() {
  try {
    let userID = randomInt(100, 999);
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const currencyInput = await ask("Masukkan Currency (INR/VND/BDT/MMK/BRL/THB/IDR/MXN/KRW): ");
    const currency = currencyInput.trim().toUpperCase();

    if (!["INR", "VND", "BDT", "MMK", "BRL", "IDR", "THB", "MXN", "KRW", "PHP"].includes(currency)) {
        logger.error("❌ Invalid currency. Masukkan INR, VND, BDT, MMK, BRL, THB, MXN, KRW, PHP atau IDR.");
        rl.close();
        return;
    }

    const amountInput = await ask("Masukkan Amount: ");
    const amount = amountInput.trim();

    if (isNaN(amount) || Number(amount) <= 0) {
        logger.error("❌ Amount harus berupa angka lebih dari 0.");
        rl.close();
        return;
    }

    const transactionCode = `TEST-DP-${timestamp}`;
    const config = getCurrencyConfig(currency);
    let bankCode = "";
    let phone = "";
    let cardNumber = "";
    const ip = getRandomIP();

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

    if (config.requiresBankCode) {
        if (currency === "BRL") {
        bankCode = "PIX";
        } else if (currency === "MXN") {
        bankCode = "SPEI";
        } else {
        const bankCodeInput = await ask("Masukkan Bank Code: ");
        bankCode = bankCodeInput.trim();
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
        `&callback_url=${config.callbackURL}` +
        `&ip_address=${ip}`;

    if (currency === "IDR" && bankCode === "OVO") {
        phone = randomPhoneNumber("idr");
        payload += `&bank_account_number=${phone}`;
        logger.info(`OVO Phone Number: ${phone}`);
    }

    if (bankCode) payload += `&bank_code=${bankCode}`;

    if (phone && !(currency === "IDR" && bankCode === "OVO")) {
        payload += `&phone=${phone}`;
    }

    if (cardNumber) payload += `&card_number=${cardNumber}`;

    const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);

    logger.info("======== DEPOSIT V2 REQUEST ========");
    logger.info(`Currency : ${currency}`);
    logger.info(`Amount : ${amount}`);
    logger.info(`Request Payload : ${payload}`);
    logger.info(`PayURL : ${config.BASE_URL}/${config.merchantCode}/v2/dopayment?key=${encrypted}`);
    logger.info("================================\n\n");
  } catch (err) {
    logger.error(`❌ Error: ${err.message}`);
  } finally {
    rl.close();
  }
}

depositV2();
