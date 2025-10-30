import readline from 'readline';
import logger from "../../logger.js";
import dotenv from 'dotenv';
import { randomInt } from "crypto";
import { encryptDecrypt, getRandomIP, getRandomName } from "../../helpers/utils.js";
import { randomPhoneNumber, randomCardNumber } from "../../helpers/depositHelper.js";
import { getCurrencyConfig } from "../../helpers/depositConfigMap.js";

dotenv.config();
const SUPPORTED_CURRENCIES = ["INR", "VND", "BDT", "MMK", "PMI", "KRW", "THB", "IDR", "BRL", "MXN", "PHP", "HKD", "JPY"];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function getBankCode(currency, config) {
  if (currency === "BRL") return "PIX";
  if (currency === "MXN") return "SPEI";
  if (config.requiresBankCode) {
    const input = await ask("Masukkan Bank Code: ");
    return input.trim();
  }
  return config.bankCodeOptions?.[Math.floor(Math.random() * config.bankCodeOptions.length)] || "";
}

function getPhone(currency, bankCode) {
  if (currency === "BDT") return randomPhoneNumber("bdt");
  if (currency === "IDR" && bankCode === "OVO") return randomPhoneNumber("idr");
  return "";
}

async function applyCurrencySpecifics(currency, payloadObj, bankCode, cardNumber) {
  const userName = await getRandomName();
  switch (currency) {
    case "KRW":
      payloadObj.bank_code = bankCode;
      payloadObj.card_holder_name = "중국공상은행";
      payloadObj.card_number = cardNumber;
      payloadObj.cust_name = userName;
      break;
    case "THB":
      const accountType = await ask("Masukkan Account Type: ");
      if (!/^[a-zA-Z0-9]+$/.test(accountType)) throw new Error("Depositor Bank must contain only letters");
      payloadObj.account_type = accountType;
      payloadObj.depositor_name = userName;
      payloadObj.depositor_bank = bankCode;
      payloadObj.bank_account_number = cardNumber;
      break;
    case "JPY":
      payloadObj.cust_name = userName;
      break;
    case "HKD":
      payloadObj.card_number = "3566111111111113";
      payloadObj.card_date = "06/25";
      payloadObj.card_cvv = "100";
      payloadObj.card_holder_name = "Bob Brown";
      break;
  }
  return payloadObj;
}

function buildPayload(payloadObj) {
  return Object.entries(payloadObj)
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

async function depositV2() {
  logger.info("======== DEPOSIT V2 REQUEST ========");

  try {
    const envCurrency = process.env.CURRENCY;
    let currency = SUPPORTED_CURRENCIES.includes(envCurrency) ? envCurrency : await ask("Masukkan Currency: ");
    currency = currency.trim().toUpperCase();
    if (!SUPPORTED_CURRENCIES.includes(currency)) throw new Error(`Currency ${currency} tidak support.`);

    const amountInput = await ask("Masukkan Amount: ");
    const amount = Number(amountInput.trim());
    if (isNaN(amount) || amount <= 0) throw new Error("Amount harus berupa angka lebih dari 0.");

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const transactionCode = `TEST-DP-V2-${timestamp}`;
    const userID = randomInt(100, 999);
    const cardNumber = randomCardNumber();
    const ip = getRandomIP();

    const config = getCurrencyConfig(currency);
    const bankCode = await getBankCode(currency, config);
    const phone = getPhone(currency, bankCode);

    let payloadObj = {
      merchant_api_key: config.merchantAPI,
      merchant_code: config.merchantCode,
      transaction_code: transactionCode,
      transaction_timestamp: timestamp,
      transaction_amount: amount,
      user_id: userID,
      currency_code: currency,
      payment_code: config.depositMethod,
      ip_address: ip,
      ...(bankCode && { bank_code: bankCode }),
      ...(phone && { phone }),
      ...(cardNumber && { card_number: cardNumber }),
      callback_url: config.callbackURL,
    };

    payloadObj = await applyCurrencySpecifics(currency, payloadObj, bankCode, cardNumber);
    const payload = buildPayload(payloadObj);
    const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);

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
