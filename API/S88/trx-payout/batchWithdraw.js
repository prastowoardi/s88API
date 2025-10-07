import fetch from "node-fetch";
import readlineSync from "readline-sync";
import logger from "../../logger.js";
import { randomInt } from "crypto";
import { encryptDecryptPayout, getRandomName, getAccountNumber } from "../../helpers/utils.js";
import {
  BASE_URL, CALLBACK_URL,
  SECRET_KEY_INR, SECRET_KEY_VND, SECRET_KEY_MMK,
  PAYOUT_METHOD_INR, PAYOUT_METHOD_VND, PAYOUT_METHOD_MMK,
  MERCHANT_CODE_INR, MERCHANT_CODE_VND, MERCHANT_CODE_MMK,
  MERCHANT_API_KEY_INR, MERCHANT_API_KEY_VND, MERCHANT_API_KEY_MMK
} from "../../Config/config.js";
import { getValidIFSC } from "../../helpers/payoutHelper.js";

const CURRENCY_CONFIG = new Map([
  ['INR', {
    merchantCode: MERCHANT_CODE_INR,
    payoutMethod: PAYOUT_METHOD_INR,
    apiKey: MERCHANT_API_KEY_INR,
    secretKey: SECRET_KEY_INR,
    requiresIfsc: true,
    bankAccount: `${getAccountNumber(6)}`
  }],
  ['VND', {
    merchantCode: MERCHANT_CODE_VND,
    payoutMethod: PAYOUT_METHOD_VND,
    apiKey: MERCHANT_API_KEY_VND,
    secretKey: SECRET_KEY_VND,
    requiresIfsc: false,
    bankAccount: "2206491508",
    bankCodes: ["970436", "970407", "970416", "970422", "970418"]
  }],
  ['MMK', {
    merchantCode: MERCHANT_CODE_MMK,
    payoutMethod: PAYOUT_METHOD_MMK,
    apiKey: MERCHANT_API_KEY_MMK,
    secretKey: SECRET_KEY_MMK,
    requiresIfsc: false,
    bankAccount: `${getAccountNumber(6)}`
  }]
]);

const CONFIG = {
  MAX_CONCURRENT_REQUESTS: 5,
  REQUEST_DELAY: 100,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  BATCH_SIZE: 10
};

let lastWithdrawTimestamp = Math.floor(Date.now() / 1000);

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function retryWithBackoff(fn, attempts = CONFIG.RETRY_ATTEMPTS) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === attempts - 1) throw error;
      const delayTime = CONFIG.RETRY_DELAY * Math.pow(2, i);
      logger.warn(`⚠️ Attempt ${i + 1} failed, retrying in ${delayTime}ms...`);
      await delay(delayTime);
    }
  }
}

function buildPayload(userID, currency, amount, transactionCode, name, options = {}) {
  const config = CURRENCY_CONFIG.get(currency);
  const timestamp = Math.floor(Date.now() / 1000);
  
  const basePayload = {
    merchant_code: config.merchantCode,
    transaction_code: transactionCode,
    transaction_timestamp: timestamp,
    transaction_amount: amount,
    user_id: userID.toString(),
    currency_code: currency,
    bank_account_number: config.bankAccount,
    account_name: name,
    payout_code: config.payoutMethod,
    callback_url: options.callback_url || CALLBACK_URL,
  };

  switch (currency) {
    case 'INR':
      return { ...basePayload, ifsc_code: options.ifscCode };
    case 'VND':
      const randomBankCode = config.bankCodes[Math.floor(Math.random() * config.bankCodes.length)];
      return { ...basePayload, bank_code: randomBankCode };
    case 'MMK':
      return {
        ...basePayload, 
        bank_code: options.bankCode,
        bank_name: "bankName"
      };
    default:
      throw new Error(`Unsupported currency: ${currency}`);
  }
}

function validatePayoutRequest(currency, ifscCode = null, bankCode = null) {
  const config = CURRENCY_CONFIG.get(currency);
  
  if (!config) throw new Error(`❌ Unsupported currency: ${currency}`);
  if (currency === 'INR' && (!ifscCode || typeof ifscCode !== "string" || ifscCode.trim() === "")) {
    throw new Error("❌ IFSC Code kosong atau tidak valid");
  }
  if (currency === 'MMK' && (!bankCode || typeof bankCode !== "string" || bankCode.trim() === "")) {
    throw new Error("❌ Bank Code kosong atau tidak valid");
  }
  return true;
}

async function payout(userID, currency, amount, transactionCode, name, options = {}) {
  try {
    validatePayoutRequest(currency, options.ifscCode, options.bankCode);
    
    const config = CURRENCY_CONFIG.get(currency);
    const payload = buildPayload(userID, currency, amount, transactionCode, name, options);
    const encryptedPayload = encryptDecryptPayout("encrypt", payload, config.apiKey, config.secretKey);

    const result = await retryWithBackoff(async () => {
      const response = await fetch(`${BASE_URL}/api/v1/payout/${config.merchantCode}`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "User-Agent": "BatchPayoutSystem/1.0"
        },
        body: JSON.stringify({ key: encryptedPayload }),
        timeout: 20000 // 20 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
      }

      return response;
    });

    const rawResponse = await result.text();
    let parsedResult;

    try {
      parsedResult = JSON.parse(rawResponse);
    } catch {
      throw new Error(`❌ Gagal parse JSON untuk ${transactionCode}: ${rawResponse}`);
    }

    if (parsedResult.encrypted_data) {
      const decryptedPayload = encryptDecryptPayout("decrypt", parsedResult.encrypted_data, config.apiKey, config.secretKey);
      parsedResult.decrypted = decryptedPayload;
    }

    return { success: true, data: parsedResult };
    
  } catch (error) {
    return { success: false, error: error.message || error.toString() };
  }
}

async function batchProcess(requests) {
  const results = [];
  
  for (let i = 0; i < requests.length; i += CONFIG.BATCH_SIZE) {
    const batch = requests.slice(i, i + CONFIG.BATCH_SIZE);
    logger.info(`📦 Processing batch ${Math.floor(i / CONFIG.BATCH_SIZE) + 1}/${Math.ceil(requests.length / CONFIG.BATCH_SIZE)}`);
    
    const batchPromises = batch.map(async (request, index) => {
      if (index > 0) await delay(CONFIG.REQUEST_DELAY * index);
      return payout(
        request.userID,
        request.currency,
        request.amount,
        request.transactionCode,
        request.name,
        request.options
      );
    });
    
    const batchResults = await Promise.allSettled(batchPromises);
    
    batchResults.forEach((result, index) => {
      const request = batch[index];
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          logger.info(`✅ Transaction ${request.transactionCode} completed: ${JSON.stringify(result.value.data)}`);
          results.push({ success: true, data: result.value.data, transactionCode: request.transactionCode });
        } else {
          logger.error(`❌ Transaction ${request.transactionCode} failed: ${result.value.error}`);
          results.push({ success: false, error: result.value.error, transactionCode: request.transactionCode });
        }
      } else {
        logger.error(`💥 Promise rejected for ${request.transactionCode}:`, result.reason);
        results.push({ success: false, error: result.reason.message || result.reason, transactionCode: request.transactionCode });
      }
    });

    if (i + CONFIG.BATCH_SIZE < requests.length) {
      await delay(CONFIG.REQUEST_DELAY * 2);
    }
  }
  
  return results;
}

async function preloadIFSCCodes(count) {
  logger.info("⏳ Menyiapkan IFSC Codes untuk INR...");
  const ifscCodes = [];
  const promises = [];
  
  for (let i = 0; i < count; i++) {
    const promise = retryWithBackoff(async () => {
      const ifsc = await getValidIFSC();
      if (!ifsc) throw new Error(`Gagal mendapatkan IFSC untuk transaksi ke-${i + 1}`);
      return ifsc;
    });
    promises.push(promise);
    
    if (promises.length >= CONFIG.MAX_CONCURRENT_REQUESTS) {
      const results = await Promise.allSettled(promises);
      results.forEach(r => r.status === 'fulfilled' && ifscCodes.push(r.value));
      promises.length = 0;
      logger.info(`📈 Progress: ${ifscCodes.length}/${count} IFSC codes loaded`);
    }
  }

  if (promises.length > 0) {
    const results = await Promise.allSettled(promises);
    results.forEach(r => r.status === 'fulfilled' && ifscCodes.push(r.value));
  }

  if (ifscCodes.length < count) {
    throw new Error(`❌ Hanya berhasil memuat ${ifscCodes.length}/${count} IFSC codes`);
  }
  
  logger.info(`✅ ${ifscCodes.length} IFSC Code berhasil disiapkan`);
  return ifscCodes;
}

async function batchPayout() {
  const startTime = Date.now();
  try {
    logger.info("======== Batch Payout Request ========");
    
    const availableCurrencies = Array.from(CURRENCY_CONFIG.keys());
    const input = readlineSync.question(`Pilih currency (${availableCurrencies.join("/")}, atau 'ALL'): `).toUpperCase();

    let currenciesToProcess = [];
    if (input === "ALL") currenciesToProcess = availableCurrencies;
    else if (availableCurrencies.includes(input)) currenciesToProcess = [input];
    else throw new Error("❌ Currency tidak valid");

    const jumlah = readlineSync.questionInt("Berapa Transaksi: ");
    const amount = readlineSync.questionInt("Amount: ");
    if (jumlah <= 0 || amount <= 0) throw new Error("❌ Jumlah transaksi dan amount harus lebih dari 0");

    let preloadedIFSCs = [];
    if (currenciesToProcess.includes("INR")) {
      preloadedIFSCs = await preloadIFSCCodes(jumlah);
    }

    const mmkBankCodes = [];
    if (currenciesToProcess.includes("MMK")) {
      for (let i = 0; i < jumlah; i++) {
        const bankCode = readlineSync.question(`Masukkan Bank Code untuk transaksi MMK ke-${i + 1}: `).toUpperCase();
        mmkBankCodes.push(bankCode);
      }
    }

    const allRequests = [];
    for (const currency of currenciesToProcess) {
      for (let i = 0; i < jumlah; i++) {
        lastWithdrawTimestamp++;
        const transactionCode = `TEST-WD-${lastWithdrawTimestamp}`;
        const userID = randomInt(100, 999);
        const userName = await getRandomName();
        const options = { callback_url: CALLBACK_URL };
        if (currency === "INR") options.ifscCode = preloadedIFSCs[i];
        else if (currency === "MMK") options.bankCode = mmkBankCodes[i];
        allRequests.push({ userID, currency, amount, transactionCode, name: userName, options });
      }
    }

    logger.info(`🚀 Starting batch processing of ${allRequests.length} transactions...`);
    const results = await batchProcess(allRequests);

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;
    const duration = (Date.now() - startTime) / 1000;
    
    logger.info("======== BATCH PROCESSING COMPLETED ========");
    logger.info(`Successful: ${successCount}`);
    logger.info(`Failed: ${failureCount}`);
    logger.info(`Duration: ${duration.toFixed(2)}s`);
    
    if (failureCount > 0) {      
      const failedTransactions = results.filter(r => !r.success);
      const errorTypes = {};
      failedTransactions.forEach(f => {
        const errorType = f.error?.split(':')[0] || 'Unknown Error';
        errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
      });
      Object.entries(errorTypes).forEach(([errorType, count]) => {
        logger.info(`${errorType}: ${count} occurrences`);
      });
    }
    
  } catch (error) {
    logger.error("❌ Batch payout failed:", error.message);
    logger.error("❌ Full error details:", error);
    throw error;
  }
}

process.on('SIGINT', () => {
  logger.info('👋 Gracefully shutting down...');
  process.exit(0);
});

batchPayout().catch(error => {
  logger.error('💥 Fatal error:', error);
  process.exit(1);
});

export { payout, batchPayout, batchProcess };