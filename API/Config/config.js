import dotenv from 'dotenv';

// Menentukan environment (default: production)
const env = process.env.NODE_ENV === "staging" ? ".env" : ".env.production";
dotenv.config({ path: env });

export const BASE_URL = process.env.BASE_URL;
export const SECRET_KEY_INR = process.env.SECRET_KEY_INR;
export const DEPOSIT_METHOD_INR = process.env.DEPOSIT_METHOD_INR;
export const PAYOUT_METHOD_INR = process.env.PAYOUT_METHOD_INR;
export const MERCHANT_API_KEY_INR = process.env.MERCHANT_API_KEY_INR
export const MERCHANT_CODE_INR = process.env.MERCHANT_CODE_INR


export const MERCHANT_CODE_VND = process.env.MERCHANT_CODE_VND
export const SECRET_KEY_VND = process.env.SECRET_KEY_VND;
export const DEPOSIT_METHOD_VND = process.env.DEPOSIT_METHOD_VND;
export const PAYOUT_METHOD_VND = process.env.PAYOUT_METHOD_VND;
export const MERCHANT_API_KEY_VND = process.env.MERCHANT_API_KEY_VND


export const MERCHANT_CODE_BDT = process.env.MERCHANT_CODE_BDT
export const SECRET_KEY_BDT = process.env.SECRET_KEY_BDT;
export const DEPOSIT_METHOD_BDT = process.env.DEPOSIT_METHOD_BDT;
export const PAYOUT_METHOD_BDT = process.env.PAYOUT_METHOD_BDT;
export const MERCHANT_API_KEY_BDT = process.env.MERCHANT_API_KEY_BDT


if (!SECRET_KEY_INR || !SECRET_KEY_VND || !SECRET_KEY_BDT) {
    throw new Error("SECRET_KEY is required and cannot be empty.");
}
