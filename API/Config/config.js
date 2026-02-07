import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment
const envFiles = {
    staging: '.env_staging',
    singhapay: '.env_singhapay',
    singhapay_staging: '.env_singhaStag',
    production: '.env_production',
    PayBO_staging: '.paybo_staging',
    PayBO_ezyplus: '.paybo_ezyplus',
    PayBO_wandpay: '.paybo_wandpay',
    PayBO_swftx: '.paybo_swftx',
    PayBO_rangoon: '.paybo_rangoon',
    PayBO_bajix: '.paybo_bajix',
    PayBO_demo: '.paybo_demo',
    PayBO_dreampay: '.paybo_dreampay',
    PayBO_commspay: '.paybo_commspay',
    PayBO_erfolgpay: '.paybo_erfolgpay',
    PayBO_apollo: '.paybo_apollo',
    PayBO_apollo_INR: '.paybo_apollo_inr',
    PayBO_production: '.paybo_production',
    PayBO_xcpay: '.paybo_xcpay',
    PayBO_next8: '.paybo_next8'
};

const envFile = envFiles[process.env.NODE_ENV] || '.env_staging';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../../', envFile) });

const currencies = ['INR', 'VND', 'BDT', 'MMK', 'BRL', 'IDR', 'THB', 'MXN', 'KRW', 'PHP', 'HKD', "KHR", "MYR", 'JPY'];
const merchantFields = ['SECRET_KEY', 'DEPOSIT_METHOD', 'PAYOUT_METHOD', 'MERCHANT_API_KEY', 'MERCHANT_CODE'];
const pmiFields = ['PMI_WD_URL', 'PMI_DP_URL', 'PMI_AUTHORIZATION', 'MERCHANT_CODE_PMI', 'SECRET_KEY_PMI', 'DEPOSIT_METHOD_PMI', 'PAYOUT_METHOD_PMI', 'MERCHANT_API_KEY_PMI'];
const staticFields = ['BASE_URL', 'API_NINJAS_KEY'];

const allFields = [
    ...staticFields,
    ...currencies.flatMap(curr => merchantFields.map(field => `${field}_${curr}`)),
    ...pmiFields
];

const exports = {};
allFields.forEach(field => {
    exports[field] = process.env[field];
});

export const {
    BASE_URL,
    API_NINJAS_KEY,
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
    SECRET_KEY_USDT, DEPOSIT_METHOD_USDT, PAYOUT_METHOD_USDT, MERCHANT_API_KEY_USDT, MERCHANT_CODE_USDT,
    PMI_WD_URL, PMI_DP_URL, PMI_AUTHORIZATION, MERCHANT_CODE_PMI, SECRET_KEY_PMI, DEPOSIT_METHOD_PMI, PAYOUT_METHOD_PMI, MERCHANT_API_KEY_PMI
} = process.env;

export const CALLBACK_URL = "https://webhook.prastowoardi616.workers.dev/webhook";

const missingKeys = currencies.filter(curr => !process.env[`SECRET_KEY_${curr}`]);

if (missingKeys.length > 0) {
    console.error(`❌ Missing SECRET_KEY(s): ${missingKeys.map(k => `SECRET_KEY_${k}`).join(', ')}`);
    throw new Error(`Missing SECRET_KEY(s): ${missingKeys.map(k => `SECRET_KEY_${k}`).join(', ')}`);
}

if (!PMI_DP_URL || !PMI_WD_URL) {
    throw new Error("PMI BASE_URL is required and cannot be empty.");
}

if (!PMI_AUTHORIZATION) {
    throw new Error("PMI authorization is required and cannot be empty.");
}

if (!API_NINJAS_KEY) {
    throw new Error("API Key for get user is empty.");
}
