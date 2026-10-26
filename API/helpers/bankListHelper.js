import axios from "axios";
import logger from "../logger.js";
import { encryptDecrypt } from "./utils.js";
import { getPayoutConfig } from "./payoutConfigMap.js";
import { getCurrencyConfig } from "./depositConfigMap.js";

/**
 * Mendapatkan konfigurasi yang valid untuk Bank List API berdasarkan currency
 * @param {string} currency 
 * @param {Object} [overrideConfig] 
 * @returns {Object}
 */
export function resolveBankConfig(currency, overrideConfig = null) {
  const activeCurrency = (currency || process.env.CURRENCY || "VND").toUpperCase();
  let cfg = overrideConfig;

  if (!cfg) {
    try {
      cfg = getCurrencyConfig(activeCurrency);
    } catch {
      try {
        cfg = getPayoutConfig(activeCurrency);
      } catch {
        cfg = null;
      }
    }
  }

  const merchantCode = cfg?.merchantCode || process.env[`MERCHANT_CODE_${activeCurrency}`] || process.env.MERCHANT_CODE;
  const merchantAPI = cfg?.merchantAPI || cfg?.apiKey || process.env[`MERCHANT_API_KEY_${activeCurrency}`] || process.env.MERCHANT_API_KEY;
  const secretKey = cfg?.secretKey || process.env[`SECRET_KEY_${activeCurrency}`] || process.env.SECRET_KEY;
  const baseUrl = (cfg?.BASE_URL || process.env.BASE_URL || "").replace(/\/+$/, "");

  if (!merchantCode || !merchantAPI || !secretKey || !baseUrl) {
    const missing = [];
    if (!merchantCode) missing.push("MERCHANT_CODE");
    if (!merchantAPI) missing.push("MERCHANT_API_KEY");
    if (!secretKey) missing.push("SECRET_KEY");
    if (!baseUrl) missing.push("BASE_URL");
    throw new Error(`Kredensial belum lengkap untuk currency ${activeCurrency}: ${missing.join(", ")}`);
  }

  return {
    BASE_URL: baseUrl,
    merchantCode,
    merchantAPI,
    secretKey,
    currency: activeCurrency,
  };
}

/**
 * Get Bank Codes (Bank List API)
 * POST /api/{merchant_code}/{type}/bank-list
 *
 * Headers: Content-Type: application/json
 * Request Body: { "key": "[encrypted: merchant_code=SKU123456789&currency_code=VND]" }
 *
 * @param {Object} params
 * @param {string} params.currency - e.g. VND, INR, BDT, etc. (must be written in capital letters)
 * @param {'payment'|'payout'} [params.type='payment'] - 'payment' (deposit) or 'payout' (withdraw)
 * @param {Object} [params.config] - Override config jika diperlukan
 * @param {string} [params.baseUrl] - Override Base URL jika diperlukan
 * @param {number} [params.timeout=10000] - Request timeout (ms)
 * @returns {Promise<{
 *   status: number,
 *   data: any,
 *   url: string,
 *   merchantCode: string,
 *   currency: string,
 *   type: string,
 *   success: boolean,
 *   banks: Array<{code: string, name: string}>,
 *   message: string|null,
 *   payloadBeforeEncrypt: string,
 *   payloadAfterEncrypt: string
 * }>}
 */
export async function getBankList({
  currency,
  type = "payment",
  config = null,
  baseUrl = null,
  timeout = 10000,
} = {}) {
  if (!currency || !currency.trim()) {
    throw new Error("Parameter 'currency' wajib diisi (misal: VND, INR, BDT)!");
  }

  const cleanType = String(type || "payment").toLowerCase().trim();
  if (!["payment", "payout"].includes(cleanType)) {
    throw new Error("Parameter 'type' hanya mendukung 'payment' (deposit) atau 'payout' (withdraw)!");
  }

  const cfg = resolveBankConfig(currency, config);
  const targetBaseUrl = (baseUrl || cfg.BASE_URL).replace(/\/+$/, "");
  const upperCurrency = cfg.currency;

  const url = `${targetBaseUrl}/api/${cfg.merchantCode}/${cleanType}/bank-list`;
  const payloadString = `merchant_code=${cfg.merchantCode}&currency_code=${upperCurrency}`;
  const encryptedKey = encryptDecrypt("encrypt", payloadString, cfg.merchantAPI, cfg.secretKey);

  logger.info(`🏦 Fetching Bank List (${cleanType.toUpperCase()})`);
  logger.info(`   URL                      : ${url}`);
  logger.info(`   Merchant Code            : ${cfg.merchantCode}`);
  logger.info(`   Currency                 : ${upperCurrency}`);
  logger.info(`   Type                     : ${cleanType}`);
  logger.info(`   Payload (Before Encrypt) : ${payloadString}`);
  logger.info(`   Payload (After Encrypt)  : ${encryptedKey}`);

  const response = await axios({
    method: "POST",
    url,
    headers: {
      "Content-Type": "application/json",
    },
    data: { key: encryptedKey },
    timeout,
    validateStatus: () => true,
  });

  const resData = response.data;
  const isSuccess = response.status === 200 && (resData?.status === "success" || resData?.success === true);
  const banks = Array.isArray(resData?.data) ? resData.data : [];

  return {
    status: response.status,
    data: resData,
    url,
    merchantCode: cfg.merchantCode,
    currency: upperCurrency,
    type: cleanType,
    success: isSuccess,
    banks,
    message: resData?.message || null,
    payloadBeforeEncrypt: payloadString,
    payloadAfterEncrypt: encryptedKey,
  };
}

export default {
  resolveBankConfig,
  getBankList,
};
