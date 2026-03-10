import fetch from "node-fetch";
import readlineSync from "readline-sync";
import logger from "../../logger.js";
import { randomInt } from "crypto";
import { payoutConfigMap, getPayoutConfig } from "../../helpers/payoutConfigMap.js";
import { encryptDecryptPayout, getRandomName, getAccountNumber, getRandomIP } from "../../helpers/utils.js";
import * as AllConfigs from "../../Config/config.js";
import { getValidIFSC } from "../../helpers/payoutHelper.js";
import { fakerJA } from "@faker-js/faker";

const SUPPORTED_CURRENCIES = Object.keys(payoutConfigMap).filter(cur => cur !== 'PMI');

const CURRENCY_CONFIG = new Map(
  SUPPORTED_CURRENCIES.map(cur => {
    const config = getPayoutConfig(cur);
    return [cur, {
      ...config,
      apiKey: config.merchantAPI, 
      // Default value
      bankAccount: cur === 'VND' ? "2206491508" : `${getAccountNumber(cur === 'JPY' ? 7 : 6)}`,
      bankCodes: cur === 'VND' ? ["970436", "970407", "970416", "970422", "970418"] : []
    }];
  })
);

const CONFIG = {
  SUPPORTED_CURRENCIES: SUPPORTED_CURRENCIES,
  MAX_CONCURRENT_REQUESTS: 5,
  REQUEST_DELAY: 100,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  BATCH_SIZE: 10,
  REQUEST_TIMEOUT: 20000
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
  if (!config) throw new Error(`Config not found for ${currency}`);

  const timestamp = Math.floor(Date.now() / 1000);
  
  const basePayload = {
    merchant_code: config.merchantCode,
    transaction_code: transactionCode,
    transaction_timestamp: timestamp,
    transaction_amount: Number(amount),
    user_id: userID.toString(),
    currency_code: currency,
    bank_account_number: options.bankAccount || config.bankAccount,
    account_name: name,
    payout_code: config.payoutMethod,
    callback_url: options.callback_url || AllConfigs.CALLBACK_URL,
    ip_address: getRandomIP()
  };

  switch (currency) {
    case 'INR':
      return { ...basePayload, ifsc_code: options.ifscCode };
    case 'VND':
      const randomBankCode = config.bankCodes[Math.floor(Math.random() * config.bankCodes.length)];
      return { ...basePayload, bank_code: randomBankCode };
    case 'MMK':
      return { ...basePayload, bank_code: options.bankCode, bank_name: "bankName" };
    case 'JPY':
      return { 
        ...basePayload, 
        branch_name: options.branchName,
        branch_code: options.branchCode,
        bank_code: options.bankCode,
        account_type: options.accountType || 1
      };
    case 'THB':
      return { ...basePayload, bank_name: "Siam Commercial Bank" };
    default:
      return basePayload;
  }
}

async function payout(userID, currency, amount, transactionCode, name, options = {}) {
  try {
    const config = CURRENCY_CONFIG.get(currency);
    const payload = buildPayload(userID, currency, amount, transactionCode, name, options);
    const encryptedPayload = encryptDecryptPayout("encrypt", payload, config.apiKey, config.secretKey);

    const result = await retryWithBackoff(async () => {
      const response = await fetch(`${AllConfigs.BASE_URL}/api/v1/payout/${config.merchantCode}`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "User-Agent": "BatchPayoutSystem/2.0"
        },
        body: JSON.stringify({ key: encryptedPayload }),
        timeout: CONFIG.REQUEST_TIMEOUT
      });

      const responseText = await response.text();
      
      let parsedResult;
      try {
        parsedResult = JSON.parse(responseText);
      } catch {
        throw new Error(`Invalid JSON: ${responseText}`);
      }

      if (!response.ok) {
        throw new Error(parsedResult.message || `HTTP ${response.status}`);
      }

      return parsedResult;
    });

    if (result.encrypted_data) {
      result.decrypted = encryptDecryptPayout("decrypt", result.encrypted_data, config.apiKey, config.secretKey);
    }

    return { success: true, data: result };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function batchProcess(requests) {
  const results = [];
  for (let i = 0; i < requests.length; i += CONFIG.BATCH_SIZE) {
    const batch = requests.slice(i, i + CONFIG.BATCH_SIZE);
    logger.info(`📦 Batch ${Math.floor(i / CONFIG.BATCH_SIZE) + 1}/${Math.ceil(requests.length / CONFIG.BATCH_SIZE)}`);
    
    const batchPromises = batch.map(async (req, idx) => {
      if (idx > 0) await delay(CONFIG.REQUEST_DELAY * idx);
      return payout(req.userID, req.currency, req.amount, req.transactionCode, req.name, req.options);
    });
    
    const batchResults = await Promise.allSettled(batchPromises);
    batchResults.forEach((res, idx) => {
      const req = batch[idx];
      if (res.status === 'fulfilled' && res.value.success) {
        logger.info(`✅ ${req.transactionCode} Success`);
        results.push({ ...res.value, transactionCode: req.transactionCode });
      } else {
        const errorMsg = res.status === 'rejected' ? res.reason.message : res.value.error;
        logger.error(`❌ ${req.transactionCode} Failed: ${errorMsg}`);
        results.push({ success: false, error: errorMsg, transactionCode: req.transactionCode });
      }
    });
  }
  return results;
}

async function preloadIFSCCodes(count) {
  logger.info(`⏳ Loading ${count} IFSC Codes...`);
  const codes = [];
  for (let i = 0; i < count; i++) {
    const code = await getValidIFSC();
    if (code) codes.push(code);
  }
  return codes;
}

async function batchPayout() {
  const startTime = Date.now();
  try {
    const envCurrency = process.env.CURRENCY?.toUpperCase();
    const availableCurrencies = Object.keys(payoutConfigMap).filter(cur => cur !== 'PMI');
    
    let currencies = (envCurrency === "ALL") ? availableCurrencies : [envCurrency];

    if (!envCurrency || (!availableCurrencies.includes(envCurrency) && envCurrency !== "ALL")) {
      logger.error("❌ Invalid CURRENCY env. Choose: " + availableCurrencies.join(", ") + " or ALL");
      return;
    }

    const jumlah = readlineSync.questionInt(`Berapa Transaksi (${currencies.join(',')}): `);
    const amount = readlineSync.questionInt("Amount per Transaksi: ");

    const allRequests = [];
    
    for (const cur of currencies) {
      const config = CURRENCY_CONFIG.get(cur);
      logger.info(`--- Preparing ${jumlah} transactions for ${cur} ---`);

      let ifsc = (cur === "INR") ? await preloadIFSCCodes(jumlah) : [];
      
      let sharedBankCode = "";
      if (config.requiresBankCode) {
        sharedBankCode = readlineSync.question(`Masukkan Bank Code untuk ${cur} (Shared for this batch): `).toUpperCase();
        while (!sharedBankCode) {
          sharedBankCode = readlineSync.question(`❌ Bank Code wajib diisi! Masukkan Bank Code ${cur}: `).toUpperCase();
        }
      }

      for (let i = 0; i < jumlah; i++) {
        lastWithdrawTimestamp++;
        
        const options = { 
          bankCode: sharedBankCode,
          callback_url: AllConfigs.CALLBACK_URL 
        };

        if (cur === "INR") options.ifscCode = ifsc[i];
        
        if (cur === "JPY") {
          const rawBranch = fakerJA.location.city();
          options.branchName = `${rawBranch}支店`;
          options.branchCode = fakerJA.string.numeric(3);
          options.accountType = Math.random() < 0.5 ? 1 : 2;
        }

        allRequests.push({
          userID: randomInt(100, 999),
          currency: cur,
          amount,
          transactionCode: `TEST-BATCH-WD-${cur}-${lastWithdrawTimestamp}`,
          name: await getRandomName(),
          options
        });
      }
    }

    // Eksekusi Batch
    logger.info(`🚀 Starting batch processing for total ${allRequests.length} transactions...`);
    const results = await batchProcess(allRequests);
    
    const successCount = results.filter(r => r.success).length;
    logger.info("======== SUMMARY ========");
    logger.info(`Total Req: ${allRequests.length}`);
    logger.info(`Success  : ${successCount}`);
    logger.info(`Failed   : ${allRequests.length - successCount}`);
    logger.info(`Time     : ${((Date.now() - startTime) / 1000).toFixed(2)}s`);

  } catch (error) {
    logger.error("💥 Batch failed:", error.message);
  }
}

process.on('SIGINT', () => {
  logger.info('\n👋 Gracefully shutting down...');
  process.exit(0);
});

batchPayout();

export { payout, batchPayout };