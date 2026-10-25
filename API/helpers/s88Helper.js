import axios from "axios";
import logger from "../logger.js";
import { encryptDecrypt } from "./utils.js";
import { getPayoutConfig } from "./payoutConfigMap.js";
import { getCurrencyConfig } from "./depositConfigMap.js";

/**
 * Mendapatkan konfigurasi S88 yang valid berdasarkan currency
 * @param {string} currency 
 * @param {Object} [overrideConfig] 
 * @returns {Object}
 */
export function resolveConfig(currency, overrideConfig = null) {
  const activeCurrency = (currency || process.env.CURRENCY || "INR").toUpperCase();
  let cfg = overrideConfig;

  if (!cfg) {
    try {
      cfg = getPayoutConfig(activeCurrency);
    } catch {
      try {
        cfg = getCurrencyConfig(activeCurrency);
      } catch {
        cfg = null;
      }
    }
  }

  if (!cfg || !cfg.merchantCode || !cfg.merchantAPI || !cfg.secretKey) {
    const missing = [];
    if (!cfg?.merchantCode) missing.push("MERCHANT_CODE");
    if (!cfg?.merchantAPI) missing.push("MERCHANT_API_KEY");
    if (!cfg?.secretKey) missing.push("SECRET_KEY");
    throw new Error(`Kredensial belum lengkap untuk currency ${activeCurrency}: ${missing.join(", ")}`);
  }

  return { ...cfg, currency: activeCurrency };
}

/**
 * Check Transaction Status (S88 / Singhapay / Apexpay)
 * POST /api/v1/{{merchant_code}}/transactions/status
 *
 * Headers: Content-Type: application/x-www-form-urlencoded
 * Body: key=ENCRYPTED_KEY_STRING
 * Key contents: merchant_api_key & transaction_code
 *
 * @param {Object} params
 * @param {string} params.transactionCode
 * @param {string} [params.currency]
 * @param {Object} [params.config]
 * @returns {Promise<{status: number, data: any}>}
 */
export async function checkTransactionStatus({ transactionCode, currency = null, config = null }) {
  if (!transactionCode || !transactionCode.trim()) {
    throw new Error("transaction_code wajib diisi!");
  }

  const cleanTxCode = transactionCode.trim();
  const cfg = resolveConfig(currency, config);

  const rawString = `merchant_api_key=${encodeURIComponent(cfg.merchantAPI)}&transaction_code=${encodeURIComponent(cleanTxCode)}`;
  const encrypted = encryptDecrypt("encrypt", rawString, cfg.merchantAPI, cfg.secretKey);

  const url = `${cfg.BASE_URL}/api/v1/${cfg.merchantCode}/transactions/status`;

  logger.info(`🔍 Checking Transaction Status`);
  logger.info(`   URL              : ${url}`);
  logger.info(`   Merchant Code    : ${cfg.merchantCode}`);
  logger.info(`   Currency         : ${cfg.currency}`);
  logger.info(`   Transaction Code : ${cleanTxCode}`);

  const response = await axios({
    method: "POST",
    url,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    data: `key=${encrypted}`,
    validateStatus: () => true,
  });

  return {
    status: response.status,
    data: response.data,
    transactionCode: cleanTxCode,
    url,
  };
}

/**
 * Get Balance (S88 / Singhapay / Apexpay)
 * GET /api/v1/balance/{{merchant_code}}
 *
 * Headers: Content-Type: application/json
 * Body: { "key": "YOUR_ENCRYPTED_KEY" }
 * Key contents: merchant_code
 *
 * @param {Object} params
 * @param {string} [params.currency]
 * @param {Object} [params.config]
 * @returns {Promise<{status: number, data: any}>}
 */
export async function getBalance({ currency = null, config = null } = {}) {
  const cfg = resolveConfig(currency, config);
  const url = `${cfg.BASE_URL}/api/v1/balance/${cfg.merchantCode}`;

  logger.info(`💰 Fetching Account Balance`);
  logger.info(`   URL           : ${url}`);
  logger.info(`   Merchant Code : ${cfg.merchantCode}`);
  logger.info(`   Currency      : ${cfg.currency}`);

  // Format yang didukung:
  // 1. `merchant_code=${cfg.merchantCode}` (form-urlencoded style)
  // 2. `${cfg.merchantCode}` (plain string)
  const formats = [
    `merchant_code=${cfg.merchantCode}`,
    cfg.merchantCode,
  ];

  let lastResponse = null;

  for (const raw of formats) {
    const encrypted = encryptDecrypt("encrypt", raw, cfg.merchantAPI, cfg.secretKey);

    const response = await axios({
      method: "GET",
      url,
      headers: {
        "Content-Type": "application/json",
      },
      data: { key: encrypted },
      validateStatus: () => true,
    });

    lastResponse = {
      status: response.status,
      data: response.data,
      url,
      merchantCode: cfg.merchantCode,
    };

    // Jika response sukses (200), return hasil
    if (response.status === 200 && response.data) {
      return lastResponse;
    }
  }

  return lastResponse;
}

export default {
  resolveConfig,
  checkTransactionStatus,
  getBalance,
};
