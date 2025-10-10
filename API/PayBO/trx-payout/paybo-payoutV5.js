import fetch from "node-fetch";
import readline from 'readline';
import logger from "../../logger.js";
import { randomInt } from "crypto";
import { encryptDecrypt, signVerify, stableStringify, getRandomIP, getRandomName, getAccountNumber } from "../../helpers/utils.js";
import { getValidIFSC } from "../../helpers/payoutHelper.js";
import { getPayoutConfig } from "../../helpers/payoutConfigMap.js";
import { fileURLToPath } from 'url';

const SUPPORTED_CURRENCIES = ["INR", "VND", "BRL", "THB", "IDR", "MXN", "BDT", "KRW", "PHP"];
const BANK_CODE_REQUIRED = ["IDR", "VND", "BDT", "THB", "BRL", "MXN", "KRW", "PHP"];
const PIX_ACCOUNT_TYPES = ["CPF", "CPNJ", "EMAIL", "PHONE", "EVP"];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
rl.input.setEncoding('utf8'); // Windows terminal

const ask = (question) => new Promise(resolve => rl.question(question, resolve));

const validateCurrency = (currency) => {
  const upperCurrency = currency?.toUpperCase();
  if (!SUPPORTED_CURRENCIES.includes(upperCurrency)) {
    throw new Error(`Currency "${currency}" is not supported for payout`);
  }
  return upperCurrency;
};

const validateAmount = (amount) => {
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error("Amount must be a number greater than 0");
  }
  return numAmount;
};

const validateBankCode = (bankCode, currency) => {
  if (BANK_CODE_REQUIRED.includes(currency) && !bankCode?.trim()) {
    throw new Error(`Bank Code is required for ${currency}`);
  }
  return bankCode?.trim();
};

const buildBasePayload = (userID, currency, amount, transactionCode, name, callbackURL, config) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const ip = getRandomIP();

  return {
    merchant_code: config.merchantCode,
    transaction_code: transactionCode,
    transaction_timestamp: `${timestamp}`,
    transaction_amount: `${amount}`,
    user_id: userID.toString(),
    currency_code: currency,
    payout_code: config.payoutMethod,
    account_name: name,
    ip_user: ip,
    callback_url: callbackURL || config.callbackURL,
  };
};

const addINRSpecificFields = async (payload) => {
  const ifscCode = await getValidIFSC();
  if (!ifscCode) throw new Error("IFSC code not found");

  const bank = ifscCode.substring(0, 4);
  return {
    ...payload,
    ifsc_code: ifscCode,
    bank_account_number: `${getAccountNumber(6)}`,
    bank_code: bank,
    bank_name: bank,
  };
};

const addBankCodeFields = (payload, bankCode, currency) => {
  const updatedPayload = {
    ...payload,
    bank_code: bankCode,
    bank_account_number: Math.floor(1e10 + Math.random() * 9e10).toString(),
  };

  if (currency === "BRL" && bankCode === "PIX") {
    const accountType = PIX_ACCOUNT_TYPES[Math.floor(Math.random() * PIX_ACCOUNT_TYPES.length)];
    updatedPayload.account_type = accountType;
  }

  if (currency === "KRW") updatedPayload.bank_name = "우리은행";
  if (currency === "THB") updatedPayload.bank_name = "SCB";

  return updatedPayload;
};

async function payout(userID, currency, amount, transactionCode, name, bankCode, callbackURL) {
  try {
    const config = getPayoutConfig(currency);
    let payload = buildBasePayload(userID, currency, amount, transactionCode, name, callbackURL, config);

    if (currency === "INR" && config.requiresIFSC) payload = await addINRSpecificFields(payload);
    if (BANK_CODE_REQUIRED.includes(currency)) payload = addBankCodeFields(payload, bankCode, currency);

    return await executePayoutRequest(payload, config);
  } catch (error) {
    throw error;
  }
}

async function executePayoutRequest(payload, config) {
  const apiUrl = `${config.BASE_URL}/api/${config.merchantCode}/v5/payout`;

  logger.info(`API URL: ${apiUrl}`);
  logger.info(`Request Payload: ${JSON.stringify(payload, null, 2)}`);

  const rawPayload = stableStringify(payload);
  const signature = signVerify("sign", payload, config.secretKey);
  logger.info(`Signature: ${signature}`);

  const isValid = signVerify("verify", { payload, signature }, config.secretKey);
  logger.info(isValid ? "✅ VALID SIGN" : "❌ INVALID SIGN");
  if (!isValid) throw new Error("Invalid signature");

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "sign": signature
    },
    body: rawPayload
  });

  return await handleResponse(response, config);
}

async function handleResponse(response, config) {
  const responseText = await response.text();
  let result;

  try { result = JSON.parse(responseText); }
  catch (parseErr) {
    logger.error("❌ Failed to parse JSON response");
    logger.error(`Raw response:\n${responseText}`);
    throw new Error(`JSON parsing failed: ${parseErr.message}`);
  }

  if (!response.ok) {
    const errorMsg = `HTTP ${response.status} - ${JSON.stringify(result, null, 2)}`;
    logger.error(`❌ Payout failed: ${errorMsg}`);
    logger.info("======== PROCESS DONE ========\n");

    throw new Error(`Payout request failed: ${errorMsg}`);
  }

  logger.info(`Payout Response: ${JSON.stringify(result, null, 2)}`);
  logger.info(`Response Status: ${response.status}`);

  if (result.encrypted_data) {
    try {
      const decryptedPayload = encryptDecrypt("decrypt", result.encrypted_data, config.merchantAPI, config.secretKey);
      logger.info(`Decrypted Response Payload: ${decryptedPayload}`);
      result.decrypted_data = JSON.parse(decryptedPayload);
    } catch (decryptErr) {
      logger.warn(`⚠️ Failed to decrypt response: ${decryptErr.message}`);
    }
  }

  return result;
}

async function collectInputs() {
  const currency = validateCurrency(currencyInput);

  let bankCode = "";
  if (BANK_CODE_REQUIRED.includes(currency)) {
    bankCode = await ask(`Enter Bank Code for ${currency}: `);
    validateBankCode(bankCode, currency);
  }

  const amountInput = await ask("Enter Amount: ");
  const amount = validateAmount(amountInput);

  return { bankCode, amount };
}

async function sendPayout() {
  try {
    logger.info("======== PAYOUT REQUEST ========");

    const envCurrency = process.env.CURRENCY;
    let currency;

    if (envCurrency && SUPPORTED_CURRENCIES.includes(envCurrency.toUpperCase())) {
      currency = envCurrency.toUpperCase();
      logger.info(`Currency: ${currency}`);
    } else {
      const { currency: inputCurrency, bankCode, amount } = await collectInputs();
      currency = inputCurrency;

      const userID = randomInt(100, 999);
      const transactionCode = `TEST-WD-${Math.floor(Date.now() / 1000)}`;
      const name = await getRandomName();

      logger.info(`Currency: ${currency}`);
      logger.info(`Amount: ${amount}`);
      logger.info(`User ID: ${userID}`);
      logger.info(`Transaction Code: ${transactionCode}`);
      logger.info(`Account Name: ${name}`);

      const result = await payout(userID, currency, amount, transactionCode, name, bankCode, null);

      logger.info("======== REQUEST DONE ========\n");
      return result;
    }

    let bankCode = "";
    if (BANK_CODE_REQUIRED.includes(currency)) {
      bankCode = await ask(`Enter Bank Code for ${currency}: `);
      validateBankCode(bankCode, currency);
    }

    const amountInput = await ask("Enter Amount: ");
    const amount = validateAmount(amountInput);

    const userID = randomInt(100, 999);
    const transactionCode = `TEST-WD-${Math.floor(Date.now() / 1000)}`;
    const name = await getRandomName();

    logger.info(`Currency: ${currency}`);
    logger.info(`Amount: ${amount}`);
    logger.info(`User ID: ${userID}`);
    logger.info(`Transaction Code: ${transactionCode}`);
    logger.info(`Account Name: ${name}`);

    const result = await payout(userID, currency, amount, transactionCode, name, bankCode, null);

    logger.info("======== REQUEST DONE ========\n");
    return result;

  } catch (error) {
    logger.error(`❌ Payout failed: ${error.message}`);
    throw error;
  } finally {
    rl.close();
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('\n👋 Payout process interrupted');
  rl.close();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  logger.error(`❌ Uncaught Exception: ${error.message}`);
  rl.close();
  process.exit(1);
});

export { payout, sendPayout };

// Run if called directly
const __filename = fileURLToPath(import.meta.url);
if (__filename === process.argv[1]) {
  sendPayout().catch(error => process.exit(1));
}