import dotenv from 'dotenv';

// Menentukan environment (default: production)
const envFile = process.env.NODE_ENV === "staging.inr" ? ".env.staging" : ".env.production";
dotenv.config({ path: envFile });

export const BASE_URL = process.env.BASE_URL;
export const MERCHANT_CODE = process.env.MERCHANT_CODE;
export const SECRET_KEY = process.env.SECRET_KEY;

if (!SECRET_KEY) {
    throw new Error("SECRET_KEY is required and cannot be empty.");
}
