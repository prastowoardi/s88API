/**
 * Environment Variable Validation
 * Ensures all required env vars are present and valid
 */

const REQUIRED_VARS = {
  production: ["BASE_URL", "NODE_ENV"],
  staging: ["BASE_URL", "NODE_ENV"],
  development: ["NODE_ENV"],
};

const CURRENCY_VARS = ["MERCHANT_CODE", "MERCHANT_API_KEY"];

export function validateEnvironment(strict = false) {
  const nodeEnv = process.env.NODE_ENV || "development";
  const required = REQUIRED_VARS[nodeEnv] || REQUIRED_VARS.development;

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    const msg = `Missing required environment variables: ${missing.join(", ")}`;
    if (strict) {
      throw new Error(msg);
    } else {
      console.warn(`⚠️ [Config Warning] ${msg}`);
    }
  }

  // SECRET_TOKEN hanya untuk environment Gempita atau GPTPay (API-Ex)
  const isGempitaOrGptPay =
    nodeEnv === "gempita_staging" ||
    nodeEnv === "PayBO_snappay" ||
    process.env.IS_GEMPITA === "true" ||
    process.env.IS_GPTPAY === "true";

  if (isGempitaOrGptPay && !process.env.SECRET_TOKEN) {
    console.warn("⚠️ [Config Warning] SECRET_TOKEN diperlukan untuk environment Gempita / GPTPay.");
  }

  // Validate currency-specific variables if currency is set
  if (process.env.CURRENCY) {
    const currency = process.env.CURRENCY.toUpperCase();
    const currencyMissing = [];

    const hasMerchantCode = process.env[`MERCHANT_CODE_${currency}`] || process.env.MERCHANT_CODE;
    if (!hasMerchantCode) {
      currencyMissing.push(`MERCHANT_CODE_${currency}`);
    }

    if (!isGempitaOrGptPay) {
      const hasSecretKey = process.env[`SECRET_KEY_${currency}`] || process.env.SECRET_KEY;
      if (!hasSecretKey) {
        currencyMissing.push(`SECRET_KEY_${currency}`);
      }
    }

    if (currencyMissing.length > 0) {
      console.warn(`⚠️ [Config Warning] Missing currency-specific variables: ${currencyMissing.join(", ")}`);
    }
  }

  return true;
}

/**
 * Get environment configuration object
 */
export function getEnvConfig() {
  return {
    nodeEnv: process.env.NODE_ENV || "development",
    baseUrl: process.env.BASE_URL,
    currency: process.env.CURRENCY || "IDR",
    currentMerchant: process.env.CURRENT_MERCHANT,
    isProduction: process.env.NODE_ENV === "production",
    isStaging: process.env.NODE_ENV?.includes("staging"),
  };
}

/**
 * Safe env getter with fallback
 */
export function getEnvVar(key, defaultValue = null) {
  return process.env[key] ?? defaultValue;
}

export default {
  validateEnvironment,
  getEnvConfig,
  getEnvVar,
};
