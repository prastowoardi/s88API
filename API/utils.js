import crypto from 'crypto';

export function encryptData(data, secretKey) {
    if (!secretKey) {
        throw new Error("SECRET_KEY is required and cannot be empty.");
    }

    const keyBuffer = crypto.createHash('sha256').update(secretKey).digest();

    const iv = crypto.createHash('sha256').update(secretKey, 'utf8').digest('hex').substring(0, 16);

    const cipher = crypto.createCipheriv("aes-256-cbc", keyBuffer, iv);

    let encrypted = cipher.update(JSON.stringify(data), "utf8", "base64");
    encrypted += cipher.final("base64");

    return encodeURIComponent(encrypted);
}

export function decryptData(encryptedData, secretKey) {
    if (!secretKey) {
        throw new Error("SECRET_KEY is required and cannot be empty.");
    }

    const keyBuffer = crypto.createHash('sha256').update(secretKey).digest();

    const iv = crypto.createHash('sha256').update(secretKey, 'utf8').digest('hex').substring(0, 16);

    const decipher = crypto.createDecipheriv("aes-256-cbc", keyBuffer, iv);

    const decodedData = decodeURIComponent(encryptedData);

    let decrypted = decipher.update(decodedData, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return JSON.parse(decrypted);
}

const secretKey = 'mysecretkey';
const data = {
    merchant_api_key: 'testdelete1',
    merchant_code: 'SKU20220714094803',
    transaction_code: 'TEST-DP-1739955362',
    transaction_timestamp: 1739955362,
    transaction_amount: 900,
    user_id: 369,
    currency_code: 'INR',
    payment_code: 'INRDEMO01D'
};

// Enkripsi data
const encryptedData = encryptData(data, secretKey);
console.log('Encrypted Data:', encryptedData);  // Akan menghasilkan URL-encoded base64

// Dekripsi data
const decryptedData = decryptData(encryptedData, secretKey);
console.log('Decrypted Data:', decryptedData);
