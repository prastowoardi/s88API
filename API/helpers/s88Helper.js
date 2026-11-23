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

export const resolveS88Config = resolveConfig;

/**
 * Mengambil seluruh BASE_URL yang tersedia dari config dan environment variables untuk environment yang aktif
 * @param {Object} [cfg]
 * @returns {string[]}
 */
export function getAvailableBaseUrls(cfg = null) {
  const list = [];
  if (cfg?.BASE_URL) {
    list.push(cfg.BASE_URL.replace(/\/+$/, ""));
  }
  const envUrls = Object.keys(process.env)
    .filter((k) => k.startsWith("BASE_URL"))
    .map((k) => process.env[k]?.trim())
    .filter(Boolean);

  for (const u of envUrls) {
    const clean = u.replace(/\/+$/, "");
    if (!list.includes(clean)) {
      list.push(clean);
    }
  }
  return list;
}

/**
 * Memeriksa apakah response HTTP menandakan domain / kredensial belum diizinkan
 * @param {number} status
 * @param {any} data
 * @returns {boolean}
 */
export function isUnauthorizedResponse(status, data) {
  if (status === 401 || status === 403) return true;
  if (!data) return false;
  const msg = String(data.message || data.error || "").toLowerCase();
  return (
    msg.includes("unauthorized") ||
    msg.includes("unauthorize") ||
    msg.includes("invalid key / merchant code") ||
    msg.includes("unauthorized domain")
  );
}

/**
 * Normalisasi format tanggal apapun ke d-m-Y (DD-MM-YYYY) yang dibutuhkan oleh S88 API backend
 * @param {string|Date} dateStr 
 * @returns {string}
 */
export function normalizeToDMY(dateStr) {
  if (!dateStr) return "";
  const str = String(dateStr).trim();
  if (/^\d{2}-\d{2}-\d{4}/.test(str)) return str.substring(0, 10);
  const m1 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m1) return `${m1[2].padStart(2, "0")}-${m1[1].padStart(2, "0")}-${m1[3]}`;
  const m2 = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m2) return `${m2[3].padStart(2, "0")}-${m2[2].padStart(2, "0")}-${m2[1]}`;
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }
  return str;
}

/**
 * Format objek Date ke format MM/DD/YYYY HH:mm dalam zona waktu UTC+8
 * @param {Date|string|number} [date]
 * @returns {string}
 */
export function formatToUTC8(date = new Date()) {
  const d = new Date(date);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Singapore", // UTC+8
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.month}/${map.day}/${map.year} ${map.hour}:${map.minute}`;
}

/**
 * Mendapatkan rentang tanggal default UTC+8:
 * - startDate: 4 jam sebelum waktu request dijalankan (MM/DD/YYYY HH:mm)
 * - endDate: akhir hari saat request pada jam 23:59 (MM/DD/YYYY 23:59)
 * @param {Date|string|number} [date=new Date()]
 * @param {number} [hoursBefore=4]
 * @returns {{ startDate: string, endDate: string }}
 */
export function getDefaultDateRangeUTC8(date = new Date(), hoursBefore = 4) {
  const d = new Date(date);
  const startObj = new Date(d.getTime() - hoursBefore * 60 * 60 * 1000);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Singapore", // UTC+8
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const partsStart = formatter.formatToParts(startObj);
  const mapStart = Object.fromEntries(partsStart.map((p) => [p.type, p.value]));

  const partsEnd = formatter.formatToParts(d);
  const mapEnd = Object.fromEntries(partsEnd.map((p) => [p.type, p.value]));

  const startDate = `${mapStart.month}/${mapStart.day}/${mapStart.year} ${mapStart.hour}:${mapStart.minute}`;
  const endDate = `${mapEnd.month}/${mapEnd.day}/${mapEnd.year} 23:59`;

  return { startDate, endDate };
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
  logger.info(`   URL                      : ${url}`);
  logger.info(`   Merchant Code            : ${cfg.merchantCode}`);
  logger.info(`   Currency                 : ${cfg.currency}`);
  logger.info(`   Transaction Code         : ${cleanTxCode}`);
  logger.info(`   Payload (Before Encrypt) : ${rawString}`);
  logger.info(`   Payload (After Encrypt)  : ${encrypted}`);

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
    payloadBeforeEncrypt: rawString,
    payloadAfterEncrypt: encrypted,
  };
}

/**
 * Get Balance (S88 / Singhapay / Apexpay / PayBO / Rubik / Octopay)
 * - Singhapay / PayBO : POST /api/v1/balance/{{merchant_code}} dengan Body JSON { key: encrypted }
 * - S88 / Rubik / Octopay : GET /api/v1/balance/{{merchant_code}}?key={{encrypted_key}} (Query Params, bukan body raw)
 *
 * @param {Object} params
 * @param {string} [params.currency]
 * @param {Object} [params.config]
 * @param {string} [params.startDate]
 * @param {string} [params.endDate]
 * @returns {Promise<{status: number, data: any, url: string, method: string, merchantCode: string, payloadBeforeEncrypt: string, payloadAfterEncrypt: string}>}
 */
export async function getBalance({ currency = null, config = null, startDate = null, endDate = null } = {}) {
  const cfg = resolveConfig(currency, config);
  const defaultDates = getDefaultDateRangeUTC8();
  const effectiveStartDate = startDate || defaultDates.startDate;
  const effectiveEndDate = endDate || defaultDates.endDate;

  logger.info(`💰 Fetching Account Balance`);
  logger.info(`   Merchant Code : ${cfg.merchantCode}`);
  logger.info(`   Currency      : ${cfg.currency}`);

  // Format yang didukung:
  // 1. `merchant_code=${cfg.merchantCode}&start_date=${effectiveStartDate}&end_date=${effectiveEndDate}`
  // 2. `merchant_code=${cfg.merchantCode}` (form-urlencoded style)
  // 3. `${cfg.merchantCode}` (plain string)
  const formats = [
    `merchant_code=${cfg.merchantCode}&start_date=${effectiveStartDate}&end_date=${effectiveEndDate}`,
    `merchant_code=${cfg.merchantCode}`,
    cfg.merchantCode,
  ];

  const baseUrls = getAvailableBaseUrls(cfg);
  let lastResponse = null;

  for (const baseUrl of baseUrls) {
    const url = `${baseUrl}/api/v1/balance/${cfg.merchantCode}`;
    const lowerUrl = baseUrl.toLowerCase();

    // Deteksi method berdasarkan URL:
    // - singha, paybo (dan mirror xyz) menggunakan POST
    // - s88, rubik, octopay (dan default lainnya) menggunakan GET via query params (bukan body raw)
    const isPostDomain = ["singha", "paybo", "xyz"].some((keyword) => lowerUrl.includes(keyword));
    const preferredMethod = isPostDomain ? "POST" : "GET";

    for (const raw of formats) {
      const encrypted = encryptDecrypt("encrypt", raw, cfg.merchantAPI, cfg.secretKey);

      logger.info(`   URL                      : ${url}`);
      logger.info(`   Method                   : ${preferredMethod}`);
      logger.info(`   Payload (Before Encrypt) : ${raw}`);
      logger.info(`   Payload (After Encrypt)  : ${encrypted}`);

      const sendBalanceRequest = async (method) => {
        const reqConfig = {
          method,
          url,
          validateStatus: () => true,
        };

        if (method === "POST") {
          reqConfig.headers = { "Content-Type": "application/json" };
          reqConfig.data = { key: encrypted };
        } else {
          // GET: dikirim via query params (?key=...), bukan body raw
          reqConfig.params = { key: encrypted };
        }

        return await axios(reqConfig);
      };

      try {
        let usedMethod = preferredMethod;
        let response = await sendBalanceRequest(usedMethod);

        // Fallback jika terkena HTTP 405 Method Not Allowed pada domain tertentu
        if (response.status === 405) {
          const fallbackMethod = preferredMethod === "POST" ? "GET" : "POST";
          logger.warn(`⚠️ [${baseUrl}] Method ${preferredMethod} 405 Not Allowed, mencoba fallback ke ${fallbackMethod}...`);
          response = await sendBalanceRequest(fallbackMethod);
          usedMethod = fallbackMethod;
        }

        lastResponse = {
          status: response.status,
          data: response.data,
          url,
          method: usedMethod,
          merchantCode: cfg.merchantCode,
          payloadBeforeEncrypt: raw,
          payloadAfterEncrypt: encrypted,
        };

        // Jika response sukses (200), return hasil
        if (response.status === 200 && response.data) {
          return lastResponse;
        }

        if (isUnauthorizedResponse(response.status, response.data)) {
          logger.warn(`⚠️ [${baseUrl}] Domain/kredensial belum diizinkan, mencoba opsi lain...`);
          break;
        }
      } catch (err) {
        logger.warn(`⚠️ [${baseUrl}] Gagal request (${err.message}), mencoba opsi lain...`);
      }
    }
  }

  return lastResponse;
}

/**
 * Get Transaction List (S88 / Singhapay / Apexpay)
 * GET /api/v1/transaction/{{merchant_code}}
 *
 * Parameters inside encrypted key:
 * - start_date (Y, MM/DD/YYYY HH:mm in UTC+8, max range 3 days)
 * - end_date   (Y, MM/DD/YYYY HH:mm in UTC+8, max range 3 days)
 * - status     (N, pending / completed / failed / processing)
 * - page       (N, integer >= 1)
 *
 * @param {Object} params
 * @param {string} params.startDate
 * @param {string} params.endDate
 * @param {string} [params.status]
 * @param {number} [params.page=1]
 * @param {string} [params.currency]
 * @param {Object} [params.config]
 * @returns {Promise<{status: number, data: any, url: string, page: number}>}
 */
export async function getTransactionList({
  startDate,
  endDate,
  status = null,
  page = 1,
  currency = null,
  config = null,
} = {}) {
  if (!startDate || !startDate.trim()) {
    throw new Error("start_date wajib diisi! Format: MM/DD/YYYY HH:mm atau MM/DD/YYYY (UTC+8).");
  }
  if (!endDate || !endDate.trim()) {
    throw new Error("end_date wajib diisi! Format: MM/DD/YYYY HH:mm atau MM/DD/YYYY (UTC+8).");
  }

  const cfg = resolveConfig(currency, config);

  const fromDate = normalizeToDMY(startDate);
  const toDate = normalizeToDMY(endDate);

  const jsonPayload = {
    from_date: fromDate,
    to_date: toDate,
    start_date: startDate.trim(),
    end_date: endDate.trim(),
  };

  if (status && status.trim() && status.trim().toUpperCase() !== "ALL") {
    jsonPayload.status = status.trim().toLowerCase();
  }

  if (page && Number(page) >= 1) {
    jsonPayload.page = Number(page);
  }

  const rawJson = JSON.stringify(jsonPayload);
  const encryptedJson = encryptDecrypt("encrypt", jsonPayload, cfg.merchantAPI, cfg.secretKey, true);

  // Fallback query string format
  const paramsList = [
    `start_date=${startDate.trim()}`,
    `end_date=${endDate.trim()}`,
  ];

  if (status && status.trim() && status.trim().toUpperCase() !== "ALL") {
    paramsList.push(`status=${status.trim().toLowerCase()}`);
  }

  if (page && Number(page) >= 1) {
    paramsList.push(`page=${Number(page)}`);
  }

  const rawQuery = paramsList.join("&");
  const encryptedQuery = encryptDecrypt("encrypt", rawQuery, cfg.merchantAPI, cfg.secretKey, false);

  logger.info(`📋 Fetching Transaction List`);
  logger.info(`   Merchant Code            : ${cfg.merchantCode}`);
  logger.info(`   Currency                 : ${cfg.currency}`);
  logger.info(`   Page                     : ${page || 1}`);
  logger.info(`   Payload (Before Encrypt) : ${rawJson}`);
  logger.info(`   Payload (After Encrypt)  : ${encryptedJson}`);

  // Dapatkan seluruh BASE_URL yang tersedia di .env / config
  const baseUrls = getAvailableBaseUrls(cfg);

  const payloadCandidates = [
    { key: encryptedJson, raw: rawJson },
    { key: encryptedQuery, raw: rawQuery },
  ];

  let lastResponse = null;

  for (const baseUrl of baseUrls) {
    const endpoints = [
      `${baseUrl}/api/v1/transaction/${cfg.merchantCode}`,
      `${baseUrl}/api/v1/transactions/${cfg.merchantCode}`,
    ];

    for (const endpoint of endpoints) {
      for (const p of payloadCandidates) {
        const fullUrl = `${endpoint}?key=${p.key}`;

        try {
          const startTime = Date.now();
          const response = await axios({
            method: "GET",
            url: fullUrl,
            headers: {
              "Content-Type": "application/json",
            },
            data: { key: p.key },
            validateStatus: () => true,
          });
          const durationMs = Date.now() - startTime;

          const resData = response.data;
          lastResponse = {
            status: response.status,
            statusText: response.statusText || (response.status === 200 ? "OK" : ""),
            data: resData,
            url: endpoint,
            baseUrl,
            fullUrl,
            method: "GET",
            headers: { "Content-Type": "application/json" },
            durationMs,
            page: page || 1,
            rawParams: p.raw,
            payloadBeforeEncrypt: p.raw,
            payloadAfterEncrypt: p.key,
          };

          // Jika response sukses (200 dan success: true), langsung kembalikan hasil
          if (response.status === 200 && (resData?.success === true || Array.isArray(resData?.data))) {
            logger.info(`✅ Berhasil terhubung ke domain: ${baseUrl}`);
            return lastResponse;
          }

          // Jika unauthorized domain atau 401/403/404, log warning dan coba domain/endpoint berikutnya
          if (isUnauthorizedResponse(response.status, resData) || response.status === 404) {
            logger.warn(`⚠️ [${baseUrl}] Domain/endpoint belum diizinkan (${resData?.message || `HTTP ${response.status}`}), mencoba domain/endpoint lain...`);
            continue;
          }

          if (response.status === 200) {
            return lastResponse;
          }
        } catch (err) {
          logger.warn(`⚠️ [${baseUrl}] Gagal request (${err.message}), mencoba domain lain...`);
          lastResponse = {
            status: 500,
            statusText: "Internal Error",
            data: { success: false, message: err.message },
            url: endpoint,
            baseUrl,
            fullUrl,
            method: "GET",
            headers: { "Content-Type": "application/json" },
            durationMs: 0,
            page: page || 1,
            rawParams: p.raw,
            payloadBeforeEncrypt: p.raw,
            payloadAfterEncrypt: p.key,
          };
        }
      }
    }
  }

  return lastResponse;
}

export default {
  resolveConfig,
  resolveS88Config,
  formatToUTC8,
  getDefaultDateRangeUTC8,
  normalizeToDMY,
  getAvailableBaseUrls,
  isUnauthorizedResponse,
  checkTransactionStatus,
  getBalance,
  getTransactionList,
};
