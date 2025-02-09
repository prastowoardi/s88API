import crypto from 'crypto';

export function encryptData(data, secretKey) {
    if (!secretKey) {
        throw new Error("SECRET_KEY is required and cannot be empty.");
    }

    // Hashing secretKey dengan SHA-256 untuk memastikan panjang 32 byte
    const keyBuffer = crypto.createHash('sha256').update(secretKey).digest();

    // IV harus sepanjang 16 byte
    const iv = Buffer.alloc(16, 0);

    const cipher = crypto.createCipheriv("aes-256-cbc", keyBuffer, iv);

    let encrypted = cipher.update(JSON.stringify(data), "utf8", "hex");
    encrypted += cipher.final("hex");

    return encrypted;
}

export function decryptData(encryptedData, secretKey) {
    if (!secretKey) {
        throw new Error("SECRET_KEY is required and cannot be empty.");
    }

    // Hashing secretKey dengan SHA-256 untuk memastikan panjang 32 byte
    const keyBuffer = crypto.createHash('sha256').update(secretKey).digest();

    const iv = Buffer.alloc(16, 0);  // IV sepanjang 16 byte

    const decipher = crypto.createDecipheriv("aes-256-cbc", keyBuffer, iv);
    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return JSON.parse(decrypted);
}
