import crypto from 'crypto';
import { SECRET_KEY_INR, SECRET_KEY_VND, MERCHANT_CODE_INR, MERCHANT_CODE_VND, MERCHANT_API_KEY_VND, MERCHANT_API_KEY_INR } from "../API/Config/config.js";

export function encryptData(data, secretKey) {
    if (!secretKey) {
        throw new Error("SECRET_KEY is required and cannot be empty.");
    }

    const keyBuffer = crypto.createHash('sha256').update(secretKey).digest();

    const iv = crypto.createHash('sha256').update(secretKey, 'utf8').digest().slice(0, 16);

    const cipher = crypto.createCipheriv("aes-256-cbc", keyBuffer, iv);

    let encrypted = cipher.update(data, "utf8", "base64");
    encrypted += cipher.final("base64");

    encrypted = encrypted.replace(/\+/g, '%2B').replace(/\//g, '%2F').replace(/=/g, '%3D');

    return encrypted;
}

export function decryptData(encryptedData, secretKey) {
    if (!secretKey) {
        throw new Error("SECRET_KEY is required and cannot be empty.");
    }

    const keyBuffer = crypto.createHash('sha256').update(secretKey).digest();

    const iv = crypto.createHash('sha256').update(secretKey, 'utf8').digest().slice(0, 16);

    const decipher = crypto.createDecipheriv("aes-256-cbc", keyBuffer, iv);

    const decodedData = encryptedData.replace(/%2B/g, '+').replace(/%2F/g, '/').replace(/%3D/g, '=');

    let decrypted = decipher.update(decodedData, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
}

// const secretKey = SECRET_KEY_INR;
// const data = `merchant_api_key=${MERCHANT_API_KEY_INR}&merchant_code=${MERCHANT_CODE_INR}&transaction_code=TEST-DP-1739970804&transaction_timestamp=1739970804&transaction_amount=900&user_id=722&currency_code=INR&payment_code=INRDEMO01D`;
const secretKey = SECRET_KEY_VND;
const data = `merchant_api_key=${MERCHANT_API_KEY_VND}&merchant_code=${MERCHANT_CODE_VND}&transaction_code=TEST-DP-1739972015&transaction_timestamp=1739972015&transaction_amount=51000&user_id=464&currency_code=VND&payment_code=VND01D&random_bank_code=OBT`

const encryptedData = encryptData(data, secretKey);
console.log('\nEncrypted Data:', encryptedData);

const decryptedData = decryptData(encryptedData, secretKey);
console.log('\nDecrypted Data:', decryptedData);
