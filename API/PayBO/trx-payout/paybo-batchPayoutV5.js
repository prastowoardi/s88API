import fetch from "node-fetch";
import readlineSync from "readline-sync";
import logger from "../../logger.js";
import { randomInt } from "crypto";
import { encryptDecrypt, signVerify, stableStringify, getRandomIP, getRandomName, getAccountNumber } from "../../helpers/utils.js";
import { getValidIFSC } from "../../helpers/payoutHelper.js";
import { getPayoutConfig } from "../../helpers/payoutConfigMap.js";
import { fileURLToPath } from 'url';

const SUPPORTED_CURRENCIES = ["INR", "VND", "BRL", "THB", "IDR", "MXN", "BDT", "KRW", "PHP", "JPY"];
const BANK_CODE_REQUIRED = ["IDR", "VND", "BDT", "THB", "BRL", "MXN", "KRW", "PHP", "JPY"];
const PIX_ACCOUNT_TYPES = ["CPF", "CPNJ", "EMAIL", "PHONE", "EVP"];
const MAX_BATCH_SIZE = 1000;
const MAX_CONCURRENT_REQUESTS = 10;

const validateAmount = (amount) => {
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error("Amount must be a positive number");
  }
  return numAmount;
};

const validateBankCode = (bankCode, currency) => {
  if (BANK_CODE_REQUIRED.includes(currency) && !bankCode?.trim()) {
    throw new Error(`Bank Code is required for ${currency}`);
  }
  return bankCode?.trim() || "";
};

const validateCount = (count) => {
  const numCount = parseInt(count);
  if (isNaN(numCount) || numCount <= 0 || numCount > MAX_BATCH_SIZE) {
    throw new Error(`Count must be between 1 and ${MAX_BATCH_SIZE}`);
  }
  return numCount;
};

// Payload building functions
const buildBasePayload = (userID, currency, amount, transactionCode, name, callbackURL, config) => {
  const timestamp = Math.floor(Date.now() / 1000);
  
  return {
    merchant_code: config.merchantCode,
    transaction_code: transactionCode,
    transaction_timestamp: `${timestamp}`,
    transaction_amount: `${amount}`,
    user_id: userID.toString(),
    currency_code: currency,
    payout_code: config.payoutMethod,
    account_name: name,
    ip_user: getRandomIP(),
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
    bank_account_number: getAccountNumber(6),
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

  return updatedPayload;
};

// Core payout function
async function payout(userID, currency, amount, transactionCode, name, bankCode, callbackURL) {
  const config = getPayoutConfig(currency);
  let payload = buildBasePayload(userID, currency, amount, transactionCode, name, callbackURL, config);

  if (currency === "INR" && config.requiresIFSC) {
    payload = await addINRSpecificFields(payload);
  }
  
  if (BANK_CODE_REQUIRED.includes(currency)) {
    payload = addBankCodeFields(payload, bankCode, currency);
  }

  return await executePayoutRequest(payload, config, transactionCode);
}

async function executePayoutRequest(payload, config, transactionCode) {
  const apiUrl = `${config.BASE_URL}/api/${config.merchantCode}/v5/payout`;
  const rawPayload = stableStringify(payload);
  const signature = signVerify("sign", payload, config.secretKey);

  if (!signVerify("verify", { payload, signature }, config.secretKey)) {
    throw new Error("Invalid signature generation");
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "sign": signature
    },
    body: rawPayload
  });

  return await handleResponse(response, config, transactionCode);
}

async function handleResponse(response, config, transactionCode) {
  const responseText = await response.text();
  
  let result;
  try { 
    result = JSON.parse(responseText); 
  } catch (parseErr) {
    logger.error(`[${transactionCode}] Failed to parse JSON response`);
    throw new Error(`JSON parsing failed: ${parseErr.message}`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} - ${result.message || JSON.stringify(result)}`);
  }

  if (result.encrypted_data) {
    try {
      const decryptedPayload = encryptDecrypt("decrypt", result.encrypted_data, config.merchantAPI, config.secretKey);
      result.decrypted_data = JSON.parse(decryptedPayload);
    } catch (decryptErr) {
      logger.warn(`[${transactionCode}] Failed to decrypt: ${decryptErr.message}`);
    }
  }

  return result;
}

// Batch processing with concurrency control
async function batchPayoutWithConcurrency(payoutRequests, maxConcurrent = MAX_CONCURRENT_REQUESTS) {
  const results = [];
  const total = payoutRequests.length;
  let completed = 0;
  let success = 0;
  let failed = 0;

  for (let i = 0; i < payoutRequests.length; i += maxConcurrent) {
    const chunk = payoutRequests.slice(i, i + maxConcurrent);
    const chunkResults = await Promise.allSettled(
      chunk.map(async (request, localIndex) => {
        const globalIndex = i + localIndex;
        const startTime = Date.now();
        
        try {
          const result = await payout(
            request.userID,
            request.currency,
            request.amount,
            request.transactionCode,
            request.name,
            request.bankCode,
            request.callbackURL
          );
          
          const duration = Date.now() - startTime;
          completed++;
          success++;
          
          logger.info(`✅ [${completed}/${total}] ${request.transactionCode} - ${result.message}\n`);
          
          return {
            success: true,
            index: globalIndex + 1,
            transactionCode: request.transactionCode,
            currency: request.currency,
            amount: request.amount,
            duration,
            result
          };
        } catch (error) {
          const duration = Date.now() - startTime;
          completed++;
          failed++;
          
          logger.error(`❌ [${completed}/${total}] ${request.transactionCode} - ${error.message}\n`);
          
          return {
            success: false,
            index: globalIndex + 1,
            transactionCode: request.transactionCode,
            currency: request.currency,
            amount: request.amount,
            duration,
            error: error.message
          };
        }
      })
    );

    results.push(...chunkResults.map(r => r.status === 'fulfilled' ? r.value : r.reason));
  }

  // Summary
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
  const avgDuration = Math.round(totalDuration / results.length);

  logger.info('BATCH SUMMARY');
  logger.info('='.repeat(50));
  logger.info(`Total: ${total} | ✅ Success: ${success} | ❌ Failed: ${failed}`);
  logger.info(`Avg Duration: ${avgDuration}ms | Total Time: ${totalDuration}ms`);
  logger.info('='.repeat(50) + '\n');

  return results;
}

// Generate batch requests
async function generateBatchRequests(currency, bankCode, amount, count) {
  logger.info(`\n⏳ Generating ${count} requests...`);
  
  const baseTimestamp = Math.floor(Date.now() / 1000);
  const requests = [];
  
  const names = await Promise.all(
    Array(count).fill(null).map(() => getRandomName())
  );

  for (let i = 0; i < count; i++) {
    requests.push({
      userID: randomInt(100, 999),
      currency,
      amount,
      transactionCode: `TEST-WD-${baseTimestamp}-${String(i).padStart(4, '0')}`,
      name: names[i],
      bankCode,
      callbackURL: null
    });
  }

  logger.info(`✅ Generated ${count} requests\n`);
  return requests;
}

async function collectBatchInputs(currency) {
  
  let bankCode = "";
  if (BANK_CODE_REQUIRED.includes(currency)) {
    bankCode = readlineSync.question(`\nBank Code for ${currency}: `);
    validateBankCode(bankCode, currency);
  }

  const amount = validateAmount(readlineSync.questionInt("Amount: "));
  const count = validateCount(readlineSync.questionInt(`Berapa Transaksi (1-${MAX_BATCH_SIZE}): `));

  return { bankCode, amount, count };
}

async function getCurrency() {
  const currencyInput = readlineSync.question("Masukkan Currency (INR/VND/BRL/etc): ");
  const upperCurrency = currencyInput.toUpperCase();
  
  if (!SUPPORTED_CURRENCIES.includes(upperCurrency)) {
    logger.error(`❌ Currency ${upperCurrency} is not supported.`);
    logger.error(`   Supported: ${SUPPORTED_CURRENCIES.join(', ')}`);
    process.exit(1);
  }
  
  return upperCurrency;
}

async function sendBatchPayout(currency = null) {
  const startTime = Date.now();
  
  try {
    let selectedCurrency = currency || process.env.CURRENCY;
    
    if (!selectedCurrency) {
      logger.info("🚀 BATCH WITHDRAW V5");
      selectedCurrency = await getCurrency();
    }
    
    const upperCurrency = selectedCurrency.toUpperCase();
    
    if (!SUPPORTED_CURRENCIES.includes(upperCurrency)) {
      logger.error(`❌ Currency ${upperCurrency} is not supported.`);
      logger.error(`   Supported: ${SUPPORTED_CURRENCIES.join(', ')}`);
      process.exit(1);
    }
    
    logger.info("🚀 BATCH WITHDRAW V5");    
    const { bankCode, amount, count } = await collectBatchInputs(upperCurrency);
    
    const requests = await generateBatchRequests(upperCurrency, bankCode, amount, count);
    const results = await batchPayoutWithConcurrency(requests);
    
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    logger.info(`Batch completed in ${totalTime}s\n`);
    
    return results;

  } catch (error) {
    logger.error(`❌ Batch payout failed: ${error.message}\n`);
    throw error;
  }
}

const shutdown = (signal) => {
  logger.info(`\n👋 Received ${signal}, shutting down gracefully...`);
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
  logger.error(`❌ Uncaught Exception: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`❌ Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

export { payout, batchPayoutWithConcurrency as batchPayout, sendBatchPayout };

const __filename = fileURLToPath(import.meta.url);
if (__filename === process.argv[1]) {
  const currency = process.argv[2] || process.env.CURRENCY || null;
  
  sendBatchPayout(currency).catch(error => {
    logger.error('❌ Fatal error:', error.message);
    process.exit(1);
  });
}