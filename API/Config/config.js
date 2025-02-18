import dotenv from 'dotenv';

// Menentukan environment (default: production)
const env = process.env.NODE_ENV === "staging.inr" ? ".env.staging" : ".env.production";
dotenv.config({ path: env });

export const BASE_URL = process.env.BASE_URL;
export const SECRET_KEY_INR = process.env.SECRET_KEY_INR;
export const DEPOSIT_METHOD_INR = process.env.DEPOSIT_METHOD_INR;
export const MERCHANT_CODE_INR = process.env.MERCHANT_CODE_INR
export const MERCHANT_CODE_VND = process.env.MERCHANT_CODE_VND
export const SECRET_KEY_VND = process.env.SECRET_KEY_VND;
export const DEPOSIT_METHOD_VND = process.env.DEPOSIT_METHOD_VND;

if (!SECRET_KEY_INR || !SECRET_KEY_VND) {
    throw new Error("SECRET_KEY is required and cannot be empty.");
}
