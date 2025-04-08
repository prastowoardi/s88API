import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const envFile = {
    dev: '.env_dev',
    staging: '.env_staging',
    production: '.env_production'
}[process.env.NODE_ENV] || '.env_staging';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../', envFile) });

export const BASE_URL = process.env.BASE_URL;
export const SECRET_KEY_INR = process.env.SECRET_KEY_INR;
export const DEPOSIT_METHOD_INR = process.env.DEPOSIT_METHOD_INR;
export const PAYOUT_METHOD_INR = process.env.PAYOUT_METHOD_INR;
export const MERCHANT_API_KEY_INR = process.env.MERCHANT_API_KEY_INR;
export const MERCHANT_CODE_INR = process.env.MERCHANT_CODE_INR;

export const MERCHANT_CODE_VND = process.env.MERCHANT_CODE_VND;
export const SECRET_KEY_VND = process.env.SECRET_KEY_VND;
export const DEPOSIT_METHOD_VND = process.env.DEPOSIT_METHOD_VND;
export const PAYOUT_METHOD_VND = process.env.PAYOUT_METHOD_VND;
export const MERCHANT_API_KEY_VND = process.env.MERCHANT_API_KEY_VND;

export const MERCHANT_CODE_BDT = process.env.MERCHANT_CODE_BDT;
export const SECRET_KEY_BDT = process.env.SECRET_KEY_BDT;
export const DEPOSIT_METHOD_BDT = process.env.DEPOSIT_METHOD_BDT;
export const PAYOUT_METHOD_BDT = process.env.PAYOUT_METHOD_BDT;
export const MERCHANT_API_KEY_BDT = process.env.MERCHANT_API_KEY_BDT;

export const MERCHANT_CODE_MMK = process.env.MERCHANT_CODE_MMK;
export const SECRET_KEY_MMK = process.env.SECRET_KEY_MMK;
export const DEPOSIT_METHOD_MMK = process.env.DEPOSIT_METHOD_MMK;
export const PAYOUT_METHOD_MMK = process.env.PAYOUT_METHOD_MMK;
export const MERCHANT_API_KEY_MMK = process.env.MERCHANT_API_KEY_MMK;

export const PMI_BASE_URL = process.env.PMI_BASE_URL;
export const PMI_AUTHORIZATION = process.env.PMI_AUTHORIZATION;
export const MERCHANT_CODE_PMI = process.env.MERCHANT_CODE_PMI;
export const SECRET_KEY_PMI = process.env.SECRET_KEY_PMI;
export const DEPOSIT_METHOD_PMI = process.env.DEPOSIT_METHOD_PMI;
export const PAYOUT_METHOD_PMI = process.env.PAYOUT_METHOD_PMI;
export const MERCHANT_API_KEY_PMI = process.env.MERCHANT_API_KEY_PMI;

if (!SECRET_KEY_INR || !SECRET_KEY_VND || !SECRET_KEY_BDT || !SECRET_KEY_MMK || !SECRET_KEY_PMI) {
    throw new Error("SECRET_KEY is required and cannot be empty.");
}

console.log(`Loaded environment: ${envFile}`);
