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
