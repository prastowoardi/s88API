/**
 * Environment Variable Validation
 * Ensures all required env vars are present and valid
 */

const REQUIRED_VARS = {
  production: ["BASE_URL", "NODE_ENV"],
  staging: ["BASE_URL", "NODE_ENV"],
  development: ["NODE_ENV"],
};

const CURRENCY_VARS = ["MERCHANT_API_KEY", "SECRET_TOKEN", "MERCHANT_CODE"];

export function validateEnvironment() {
  const nodeEnv = process.env.NODE_ENV || "development";
  const required = REQUIRED_VARS[nodeEnv] || REQUIRED_VARS.development;

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  // Validate currency-specific variables if currency is set
  if (process.env.CURRENCY) {
    const currency = process.env.CURRENCY.toUpperCase();
    const currencyRequired = CURRENCY_VARS.map((key) => `${key}_${currency}`);
    const currencyMissing = currencyRequired.filter((key) => !process.env[key]);

    if (currencyMissing.length > 0) {
      console.warn(`Missing currency-specific variables: ${currencyMissing.join(", ")}`);
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
