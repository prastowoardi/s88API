import fetch from "node-fetch";
import readline from 'readline';
import logger from "../../logger.js";
import { randomInt } from "crypto";
import { encryptDecrypt, signVerify, stableStringify, getRandomIP, getRandomName, getAccountNumber, getCryptoRate } from "../../helpers/utils.js";
import { getValidIFSC } from "../../helpers/payoutHelper.js";
import { getPayoutConfig } from "../../helpers/payoutConfigMap.js";
import { fileURLToPath } from 'url';
import { read } from "fs";

const SUPPORTED_CURRENCIES = ["INR", "VND", "BRL", "THB", "IDR", "MXN", "BDT", "KRW", "PHP", "JPY", "MMK", "USDT"];
const BANK_CODE_REQUIRED = ["IDR", "VND", "BDT", "THB", "BRL", "MXN", "KRW", "PHP", "JPY", "MMK"];
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

const buildBasePayload = async (userID, currency, amount, transactionCode, name, callbackURL, config) => {
  const timestamp = Math.floor(Date.now() / 1000);

  return {
    merchant_code: config.merchantCode,
    transaction_code: transactionCode,
    transaction_timestamp: String(timestamp),
    transaction_amount: String(amount),
    user_id: String(userID),
    currency_code: currency,
    payout_code: config.payoutMethod,
    // account_name: name,
    account_name: "Ram Kumar",
    ip_user: getRandomIP(),
    callback_url: callbackURL || config.callbackURL,
    ...(currency === "KRW" && { cust_name: await getRandomName("kr", true) }),
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
    updatedPayload.account_type = PIX_ACCOUNT_TYPES[Math.floor(Math.random() * PIX_ACCOUNT_TYPES.length)];
  }

  if (currency === "KRW") updatedPayload.bank_name = "우리은행";
  if (currency === "THB") updatedPayload.bank_name = "SCB";
  if (currency === "MMK") {
    updatedPayload.bank_name = bankCode === "WAVEPAY" ? "WAVEPAY" : "KBZPAY";
  }

  return updatedPayload;
};

async function payout(userID, currency, amount, transactionCode, name, bankCode, callbackURL) {
  const config = getPayoutConfig(currency);
  if (!config) throw new Error(`No config found for currency: ${currency}`);

  let payload = await buildBasePayload(userID, currency, amount, transactionCode, name, callbackURL, config);
  
  if (currency === "INR" && config.requiresIFSC) payload = await addINRSpecificFields(payload);
  if (BANK_CODE_REQUIRED.includes(currency)) payload = addBankCodeFields(payload, bankCode, currency);

  if (currency === "USDT") {
      const fromCurrency = await ask("Masukkan Fiat Asal (contoh: USD/INR/IDR): ");
      const fiat = fromCurrency.toUpperCase().trim() || "USD";

      logger.info(`Fetching Crypto Rate: ${fiat} -> USDT...`);
      
      const cryptoData = await getCryptoRate(amount, fiat, config, "USDT", "withdraw");
      
      if (cryptoData && cryptoData.forex) {
        logger.info(`Rate Found: ${cryptoData.forex}`);
        payload.rate = String(cryptoData.forex);
          
        if (cryptoData.token) {
          payload.token = cryptoData.token; 
          logger.info(`✅ Token Attached: ${payload.token}`);
        } else {
          logger.warn("⚠️ Warning: API Rate sukses tapi tidak memberikan TOKEN.");
        }

        const estimasi = (amount / cryptoData.forex).toFixed(2);
        logger.info(`Estimasi Crypto yang diterima: ${estimasi} USDT`);
      } else {
        throw new Error("Gagal mendapatkan rate crypto dari server.");
      }

      const inputCrypto = await ask("Masukkan Crypto Amount (Enter untuk pakai Amount awal): ");
      payload.crypto_amount = inputCrypto.trim() || String(amount);
      
      if (!payload.bank_account_number || payload.bank_account_number.length > 15) {
          const address = await ask("Masukkan Wallet Address USDT: ");
          payload.bank_account_number = address.trim();
      }
  }

  return await executePayoutRequest(payload, config);
}

async function executePayoutRequest(payload, config) {
  const apiUrl = `${config.BASE_URL}/api/${config.merchantCode}/v5/payout`;

  const cleanedPayload = Object.fromEntries(
    Object.entries(payload).filter(([_, v]) => v !== undefined && v !== null && v !== "")
  );

  logger.info(`Request Payload: ${JSON.stringify(cleanedPayload, null, 2)}`);

  const rawPayload = stableStringify(cleanedPayload);
  const signature = signVerify("sign", cleanedPayload, config.secretKey);

  const isValid = signVerify("verify", { payload: cleanedPayload, signature }, config.secretKey);
  if (!isValid) throw new Error("Signature verification failed before sending");

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

  try { 
    result = JSON.parse(responseText); 
  } catch (parseErr) {
    logger.error("❌ JSON Parse Error");
    logger.error(`Raw: ${responseText}`);
    throw new Error("Invalid JSON response from server");
  }

  logger.info(`Response [${response.status}]: ${JSON.stringify(result, null, 2)}`);

  if (result.encrypted_data) {
    try {
      const decryptedPayload = encryptDecrypt("decrypt", result.encrypted_data, config.merchantAPI || config.merchantCode, config.secretKey);
      result.decrypted_data = JSON.parse(decryptedPayload);
      logger.info(`🔓 Decrypted: ${decryptedPayload}`);
    } catch (err) {
      logger.warn(`⚠️ Decrypt failed: ${err.message}`);
    }
  }

  return result;
}

async function collectInputs(existingCurrency) {
  let currency = existingCurrency;
  
  if (!currency) {
    const input = await ask("Enter Currency: ");
    currency = validateCurrency(input);
  }

  let bankCode = "";
  if (BANK_CODE_REQUIRED.includes(currency)) {
    bankCode = await ask(`Enter Bank Code for ${currency}: `);
    validateBankCode(bankCode, currency);
  }

  const amountInput = await ask("Enter Amount: ");
  const amount = validateAmount(amountInput);

  return { currency, bankCode, amount };
}

async function sendPayout() {
  try {
    logger.info("============== START PAYOUT ==============");

    const envCurrency = process.env.CURRENCY;
    const { currency, bankCode, amount } = await collectInputs(envCurrency);

    const userID = randomInt(1000, 9999);
    const transactionCode = `TEST-WD-${Date.now()}`;
    const name = await getRandomName();

    const result = await payout(userID, currency, amount, transactionCode, name, bankCode, null);
    
    logger.info("============== PROCESS DONE ==============");
    return result;

  } catch (error) {
    logger.error(`❌ Payout Failed: ${error.message}`, { stack: error.stack });

    if (error.message.includes("Signature")) {
      logger.warn("Check Secret Key or API Key.");
    }
  } finally {
    rl.close();
  }
}

process.on('SIGINT', () => {
  rl.close();
  process.exit(0);
});

const __filename = fileURLToPath(import.meta.url);
if (__filename === process.argv[1]) {
  sendPayout();
}

export { payout, sendPayout };