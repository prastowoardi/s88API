import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateEnvironment, getEnvConfig, getEnvVar } from './env.js';

// Load environment
const envFiles = {
    staging: '.env_staging',
    production: '.env_production',
    singhapay_staging: '.env_singhaStag',
    singhapay: '.env_singhapay',
    apexpay_staging: '.apexpay_staging',
    apexpay_production: '.apexpay_prod',
    PayBO_staging: '.paybo_staging',
    gempita_staging: '.staging_gempita',
    staging_swftx: '.staging_swftx',
    PayBO_production: '.paybo_production',
    PayBO_wandpay: '.paybo_wandpay',
    PayBO_swftx: '.paybo_swftx',
    PayBO_rangoon: '.paybo_rangoon',
    PayBO_demo: '.paybo_demo',
    PayBO_commspay: '.paybo_commspay',
    PayBO_erfolgpay: '.paybo_erfolgpay',
    PayBO_next8: '.paybo_next8',
    PayBO_snappay: '.paybo_snappay',
    PayBO_mcpay: '.paybo_mcpay',
    PayBO_flexipay: '.paybo_flexipay',
    shadow: '.env_shadow'
};

const envFile = envFiles[process.env.NODE_ENV] || '.env_staging';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../../', envFile) });

// Validate required environment variables via env.js
validateEnvironment();

const envConfig = getEnvConfig();

const currencies = ['INR', 'VND', 'BDT', 'MMK', 'BRL', 'IDR', 'THB', 'MXN', 'KRW', 'PHP', 'HKD', "KHR", "MYR", 'JPY'];
const merchantFields = ['SECRET_KEY', 'DEPOSIT_METHOD', 'PAYOUT_METHOD', 'MERCHANT_API_KEY', 'MERCHANT_CODE'];
const staticFields = ['BASE_URL', 'API_NINJAS_KEY', 'MERCHANT_API_KEY_IDR', 'SECRET_TOKEN'];

const allFields = [
    ...staticFields,
    ...currencies.flatMap(curr => merchantFields.map(field => `${field}_${curr}`))
];

const exports = {};
allFields.forEach(field => {
    exports[field] = process.env[field];
});

export const {
    BASE_URL,
    API_NINJAS_KEY,
    SECRET_TOKEN,
    SECRET_KEY_INR, DEPOSIT_METHOD_INR, PAYOUT_METHOD_INR, MERCHANT_API_KEY_INR, MERCHANT_CODE_INR,
    SECRET_KEY_VND, DEPOSIT_METHOD_VND, PAYOUT_METHOD_VND, MERCHANT_API_KEY_VND, MERCHANT_CODE_VND,
    SECRET_KEY_BDT, DEPOSIT_METHOD_BDT, PAYOUT_METHOD_BDT, MERCHANT_API_KEY_BDT, MERCHANT_CODE_BDT,
    SECRET_KEY_MMK, DEPOSIT_METHOD_MMK, PAYOUT_METHOD_MMK, MERCHANT_API_KEY_MMK, MERCHANT_CODE_MMK,
    SECRET_KEY_BRL, DEPOSIT_METHOD_BRL, PAYOUT_METHOD_BRL, MERCHANT_API_KEY_BRL, MERCHANT_CODE_BRL,
    SECRET_KEY_IDR, DEPOSIT_METHOD_IDR, PAYOUT_METHOD_IDR, MERCHANT_API_KEY_IDR, MERCHANT_CODE_IDR,
    SECRET_KEY_THB, DEPOSIT_METHOD_THB, PAYOUT_METHOD_THB, MERCHANT_API_KEY_THB, MERCHANT_CODE_THB,
    SECRET_KEY_MXN, DEPOSIT_METHOD_MXN, PAYOUT_METHOD_MXN, MERCHANT_API_KEY_MXN, MERCHANT_CODE_MXN,
    SECRET_KEY_KRW, DEPOSIT_METHOD_KRW, PAYOUT_METHOD_KRW, MERCHANT_API_KEY_KRW, MERCHANT_CODE_KRW,
    SECRET_KEY_PHP, DEPOSIT_METHOD_PHP, PAYOUT_METHOD_PHP, MERCHANT_API_KEY_PHP, MERCHANT_CODE_PHP,
    SECRET_KEY_HKD, DEPOSIT_METHOD_HKD, PAYOUT_METHOD_HKD, MERCHANT_API_KEY_HKD, MERCHANT_CODE_HKD,
    SECRET_KEY_JPY, DEPOSIT_METHOD_JPY, PAYOUT_METHOD_JPY, MERCHANT_API_KEY_JPY, MERCHANT_CODE_JPY,
    SECRET_KEY_KHR, DEPOSIT_METHOD_KHR, PAYOUT_METHOD_KHR, MERCHANT_API_KEY_KHR, MERCHANT_CODE_KHR,
    SECRET_KEY_MYR, DEPOSIT_METHOD_MYR, PAYOUT_METHOD_MYR, MERCHANT_API_KEY_MYR, MERCHANT_CODE_MYR,
    SECRET_KEY_PKR, DEPOSIT_METHOD_PKR, PAYOUT_METHOD_PKR, MERCHANT_API_KEY_PKR, MERCHANT_CODE_PKR,
    SECRET_KEY_NPR, DEPOSIT_METHOD_NPR, PAYOUT_METHOD_NPR, MERCHANT_API_KEY_NPR, MERCHANT_CODE_NPR,
    SECRET_KEY_USDT, DEPOSIT_METHOD_USDT, PAYOUT_METHOD_USDT, MERCHANT_API_KEY_USDT, MERCHANT_CODE_USDT
} = process.env;

export const CALLBACK_URL = process.env.CALLBACK_URL || "https://webhook.prastowoardi616.workers.dev/webhook";

export { envConfig };

/**
 * Lazy validation per currency:
 * Hanya memeriksa variabel yang diperlukan untuk currency yang sedang dipakai.
 */
export function validateCurrencyConfig(currency) {
    if (!currency) return true;
    const curr = currency.toUpperCase();
    const isPayBO = process.env.NODE_ENV && process.env.NODE_ENV.startsWith('PayBO_');
    const missing = [];

    const hasBaseUrl = process.env.BASE_URL || BASE_URL;
    if (!hasBaseUrl) {
        missing.push("BASE_URL");
    }

    const isGempitaOrGptPay =
        process.env.NODE_ENV === 'gempita_staging' ||
        process.env.NODE_ENV === 'PayBO_snappay' ||
        process.env.IS_GEMPITA === 'true' ||
        process.env.IS_GPTPAY === 'true';

    if (isGempitaOrGptPay) {
        if (!process.env.SECRET_TOKEN && !SECRET_TOKEN) {
            missing.push("SECRET_TOKEN");
        }
    } else {
        const hasSecret = process.env[`SECRET_KEY_${curr}`] || process.env.SECRET_KEY || process.env[`SECRET_KEY_${curr.toLowerCase()}`];
        if (!hasSecret) {
            missing.push(`SECRET_KEY_${curr}`);
        }
    }

    if (missing.length > 0) {
        const msg = `❌ Konfigurasi belum lengkap untuk currency ${curr}: ${missing.join(', ')}`;
        console.error(msg);
        throw new Error(msg);
    }
    return true;
}

// Validasi hanya jika CURRENCY sudah diset di environment
if (process.env.CURRENCY) {
    try {
        validateCurrencyConfig(process.env.CURRENCY);
    } catch (e) {
        console.warn(`⚠️ [Config Warning] ${e.message}`);
    }
}
