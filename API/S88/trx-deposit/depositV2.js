import readline from 'readline';
import logger from "../../logger.js";
import dotenv from 'dotenv';
import { randomInt } from "crypto";
import { encryptDecrypt, getRandomIP } from "../../helpers/utils.js";
import { randomPhoneNumber, randomMyanmarPhoneNumber } from "../../helpers/depositHelper.js";
import { getCurrencyConfig } from "../../helpers/depositConfigMap.js";

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise(resolve => rl.question(question, answer => resolve(answer)));
}

async function depositV2() {
  const userID = randomInt(100, 999);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const currencyInput = await ask("Masukkan Currency (INR/VND/BDT/MMK/KRW): ");
  const currency = currencyInput.toUpperCase();

  if (!["INR", "VND", "BDT", "MMK", "KRW"].includes(currency)) {
    console.error(`"${currency}" Not supported yet!`);
    rl.close();
    return;
  }
  const amount = await ask("Masukkan Amount: ");

  logger.info(`Currency : ${currency}`);
  logger.info(`Amount : ${amount}`);

  const transactionCode = `TEST-DP-${timestamp}`;
  const config = getCurrencyConfig(currency);
  let bankCode = "";
  let phone = "";
  const ip = getRandomIP();

  if (config.requiresBankCode) {
    bankCode = await ask("Masukkan Bank Code: ");
    if (!/^[a-z0-9]+$/.test(bankCode)) {
      console.error("❌ Bank Code harus berupa huruf/angka.");
      rl.close();
      return;
    }
  } else if (config.bankCodeOptions) {
    bankCode = config.bankCodeOptions[Math.floor(Math.random() * config.bankCodeOptions.length)];
  }

  if (currency === "MMK" && bankCode === "wavepay") {
    phone = randomMyanmarPhoneNumber();
    logger.info(`Phone Number WavePay): ${phone}`);
  }

  if (currency === "BDT") {
    phone = randomPhoneNumber("bdt");
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

  if (bankCode) payload += `&bank_code=${bankCode}`;
  if (phone) payload += `&phone=${phone}`;
  // if (currency === "VND") {
  //         payload += "&random_bank_code=OBT";
  // }

  const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);

  logger.info("======== DEPOSIT V2 REQUEST ========");
  logger.info(`Request Payload : ${payload}\n`);
  logger.info(`PayURL : ${config.BASE_URL}/${config.merchantCode}/v2/dopayment?key=${encrypted}`);
  logger.info("======== REQUEST DONE ========\n\n");

  rl.close();
}

depositV2();
