import fetch from "node-fetch";
import readlineSync from "readline-sync";
import logger from "../../logger.js";
import { randomInt } from "crypto";
import http from "http";
import https from "https";
import { pathToFileURL } from "url";
import { payoutConfigMap, getPayoutConfig } from "../../helpers/payoutConfigMap.js";
import { encryptDecrypt, getRandomName, getAccountNumber, getRandomIP } from "../../helpers/utils.js";
import * as AllConfigs from "../../Config/config.js";
import { getValidIFSC } from "../../helpers/payoutHelper.js";
import { fakerJA } from "@faker-js/faker";

const SUPPORTED_CURRENCIES = Object.keys(payoutConfigMap);

const CURRENCY_CONFIG = new Map(
  SUPPORTED_CURRENCIES.map(cur => {
    const config = getPayoutConfig(cur);
    return [cur, {
      ...config,
      apiKey: config.merchantAPI,
      bankAccount: cur === 'JPY' ? getAccountNumber(7) : cur === 'PKR' ? `03${getAccountNumber(9)}` : getAccountNumber(8),
    }];
  })
);

const CONFIG = {
  MAX_CONCURRENT_REQUESTS: 10,
  REQUEST_DELAY: 100,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  BATCH_SIZE: 20,
  REQUEST_TIMEOUT: 20000
};

const PAYOUT_URL_PREFIX = `${AllConfigs.BASE_URL}/api/v1/payout/`;
const HTTP_AGENT = new http.Agent({ keepAlive: true });
const HTTPS_AGENT = new https.Agent({ keepAlive: true });

let lastWithdrawTimestamp = Math.floor(Date.now() / 1000);

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const SPECIAL_CHARACTER_REGEX = /[^a-zA-Z\s.'-]/;
const SPECIAL_CHARACTER_GLOBAL_REGEX = new RegExp(SPECIAL_CHARACTER_REGEX.source, "g");

const agentFor = (url) => (url.startsWith("https:") ? HTTPS_AGENT : HTTP_AGENT);

async function getCleanRandomName(maxAttempts = 5) {
  let name = "";
  for (let i = 0; i < maxAttempts; i++) {
    name = await getRandomName();
    if (!SPECIAL_CHARACTER_REGEX.test(name)) return name;
  }
  return name.replace(SPECIAL_CHARACTER_GLOBAL_REGEX, "");
}

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

  const basePayload = {
    merchant_code: config.merchantCode,
    transaction_code: transactionCode,
    transaction_timestamp: lastWithdrawTimestamp,
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
    case 'BDT':
    case 'VND':
    case 'MMK':
    case 'NPR':
      return { ...basePayload, bank_code: options.bankCode };
    case 'IDR':
      return { ...basePayload,
        bank_code: options.bankCode,
        bank_name: options.bankCode,
        phone_number: "08111111111"
      };
    case 'KRW':
      return { ...basePayload,
        bank_code: options.bankCode,
        bank_name: options.bankCode
      };
    case 'PKR':
      return { ...basePayload,
        bank_code: options.bankCode,
        phone_number: config.bankAccount
      };
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
    const encryptedPayload = encryptDecrypt("encrypt", payload, config.apiKey, config.secretKey, true);

    // logger.info(`📝 Payload [${transactionCode}]: ${JSON.stringify(payload)}`);
    const url = `${PAYOUT_URL_PREFIX}${config.merchantCode}`;
    const body = JSON.stringify({ key: encryptedPayload });

    const result = await retryWithBackoff(async () => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "BatchPayoutSystem/2.0"
        },
        body,
        agent: agentFor(url),
        signal: AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT)
      });

      const responseText = await response.text();

      let parsedResult;
      try {
        parsedResult = JSON.parse(responseText);
      } catch {
        throw new Error(`Invalid JSON: ${responseText.slice(0, 200)}`);
      }

      if (!response.ok) {
        throw new Error(parsedResult.message || `HTTP ${response.status}`);
      }

      return parsedResult;
    });

    if (result.encrypted_data) {
      result.decrypted = encryptDecrypt("decrypt", result.encrypted_data, config.apiKey, config.secretKey, true);
    }

    return { success: true, data: result };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function runWithConcurrency(tasks, concurrency) {
  const results = new Array(tasks.length);
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const current = index++;
      await delay(CONFIG.REQUEST_DELAY);
      try {
        results[current] = await tasks[current]();
      } catch (err) {
        results[current] = { success: false, error: err.message };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, worker)
  );
  return results;
}

async function batchProcess(requests) {
  const results = [];
  const totalBatches = Math.ceil(requests.length / CONFIG.BATCH_SIZE);

  for (let i = 0; i < requests.length; i += CONFIG.BATCH_SIZE) {
    const batch = requests.slice(i, i + CONFIG.BATCH_SIZE);
    logger.info(`📦 Batch ${Math.floor(i / CONFIG.BATCH_SIZE) + 1}/${totalBatches}`);

    const tasks = batch.map(req => () =>
      payout(req.userID, req.currency, req.amount, req.transactionCode, req.name, req.options)
    );

    const batchResults = await runWithConcurrency(tasks, CONFIG.MAX_CONCURRENT_REQUESTS);

    batchResults.forEach((res, idx) => {
      const code = batch[idx].transactionCode;
      if (res.success) {
        logger.info(`✅ ${code} Success`);
        results.push({ ...res, transactionCode: code });
      } else {
        logger.error(`❌ ${code} Failed: ${res.error}`);
        results.push({ success: false, error: res.error, transactionCode: code });
      }
    });
  }
  return results;
}

async function preloadIFSCCodes(count) {
  logger.info(`⏳ Loading ${count} IFSC Codes...`);
  const total = count + Math.max(2, Math.ceil(count * 0.1));
  const tasks = Array.from({ length: total }, () => () => getValidIFSC());
  const codes = await runWithConcurrency(tasks, CONFIG.MAX_CONCURRENT_REQUESTS);
  return codes.filter(Boolean).slice(0, count);
}

async function generateNames(count) {
  const tasks = Array.from({ length: count }, () => () => getCleanRandomName());
  return runWithConcurrency(tasks, CONFIG.MAX_CONCURRENT_REQUESTS);
}

async function batchPayout() {
  const startTime = Date.now();
  try {
    const envCurrency = process.env.CURRENCY?.toUpperCase();

    let currencies = (envCurrency === "ALL") ? SUPPORTED_CURRENCIES : [envCurrency];

    if (!envCurrency || (!SUPPORTED_CURRENCIES.includes(envCurrency) && envCurrency !== "ALL")) {
      logger.error("❌ Invalid CURRENCY env. Choose: " + SUPPORTED_CURRENCIES.join(", ") + " or ALL");
      return;
    }

    const jumlah = readlineSync.questionInt(`Berapa Transaksi (${currencies.join(',')}): `);
    const amount = readlineSync.questionInt("Amount per Transaksi: ");

    const allRequests = [];

    for (const cur of currencies) {
      const config = CURRENCY_CONFIG.get(cur);
      logger.info(`--- Preparing ${jumlah} transactions for ${cur} ---`);

      const [ifsc, names] = await Promise.all([
        cur === "INR" ? preloadIFSCCodes(jumlah) : Promise.resolve([]),
        generateNames(jumlah)
      ]);

      let sharedBankCode = "";
      if (config.requiresBankCode) {
        sharedBankCode = readlineSync.question(`Masukkan Bank Code untuk ${cur} (Shared for this batch): `).toUpperCase();
        while (!sharedBankCode) {
          sharedBankCode = readlineSync.question(`❌ Bank Code wajib diisi! Masukkan Bank Code ${cur}: `).toUpperCase();
        }
      }

      for (let i = 0; i < jumlah; i++) {
        lastWithdrawTimestamp++;

        const options = { bankCode: sharedBankCode };

        if (cur === "INR") options.ifscCode = ifsc[i];

        if (cur === "JPY") {
          const rawBranch = fakerJA.location.city();
          options.branchName = `${rawBranch}支店`;
          options.branchCode = fakerJA.string.numeric(3);
          options.accountType = randomInt(1, 3);
        }

        allRequests.push({
          userID: randomInt(100, 999),
          currency: cur,
          amount,
          transactionCode: `TEST-BATCH-WD-${cur}-${lastWithdrawTimestamp}-${String(i).padStart(4, '0')}`,
          name: names[i],
          options
        });
      }
    }

    logger.info(`🚀 Starting batch processing for total ${allRequests.length} transactions...`);
    const results = await batchProcess(allRequests);

    const successCount = results.reduce((n, r) => n + r.success, 0);
    logger.info("======== SUMMARY ========");
    logger.info(`Total Req: ${allRequests.length}`);
    logger.info(`Success  : ${successCount}`);
    logger.info(`Failed   : ${allRequests.length - successCount}`);
    logger.info(`Time     : ${((Date.now() - startTime) / 1000).toFixed(2)}s`);

  } catch (error) {
    logger.error("💥 Batch failed:", error.message);
  }
}

export { payout, batchPayout };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.on('SIGINT', () => {
    logger.info('\n👋 Gracefully shutting down...');
    process.exit(0);
  });
  batchPayout();
}
