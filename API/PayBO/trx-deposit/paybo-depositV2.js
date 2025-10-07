import readline from 'readline';
import logger from "../../logger.js";
import dotenv from 'dotenv';
import { randomInt } from "crypto";
import { encryptDecrypt, getRandomIP } from "../../helpers/utils.js";
import { randomPhoneNumber, randomCardNumber } from "../../helpers/depositHelper.js";
import { getCurrencyConfig } from "../../helpers/depositConfigMap.js";
import { createKrwCustomer } from "../../helpers/krwHelper.js";

dotenv.config();
const SUPPORTED_CURRENCIES = ["INR", "VND", "BDT", "MMK", "PMI", "KRW", "THB", "IDR", "BRL", "MXN", "PHP", "HKD"];

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

    const envCurrency = process.env.CURRENCY;
        
    let currency;
    if (envCurrency && SUPPORTED_CURRENCIES.includes(envCurrency)) {
        currency = envCurrency;
    } else {
        const currencyInput = await this.ask("Masukkan Currency (INR/VND/BDT/MMK/THB/KRW/PMI): ");
        currency = this.validateCurrency(currencyInput.trim().toUpperCase());
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

    logger.info("======== DEPOSIT V2 REQUEST ========");
    logger.info(`Currency : ${currency}`);
    logger.info(`Amount : ${amount}`);
    logger.info(`Request Payload : ${payload}\n`);
    logger.info(`PayURL : ${config.BASE_URL}/${config.merchantCode}/v2/dopayment?key=${encrypted}`);
    logger.info("\n=============== CLICK LINK TO FINISHED THIS REQUEST ===============\n\n");
  } catch (err) {
    logger.error(`❌ Error: ${err.message}`);
  } finally {
    rl.close();
  }
}

depositV2();
