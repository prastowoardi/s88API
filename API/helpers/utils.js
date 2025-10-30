import CryptoJS from 'crypto-js';
import logger from "../logger.js";
import { API_NINJAS_KEY } from "../Config/config.js";

export const encryptDecrypt = (action, data, apikey, secretkey) => {
    const key = CryptoJS.SHA256(apikey); 
    const iv = CryptoJS.enc.Utf8.parse(CryptoJS.SHA256(secretkey).toString(CryptoJS.enc.Hex).substring(0, 16)); 

    if (!['encrypt', 'decrypt'].includes(action)) {
        console.error("Invalid action. Use 'encrypt' or 'decrypt'.");
        return null;
    }

    if (action === "encrypt") {
        return encodeURIComponent(
            CryptoJS.AES.encrypt(data, key, {
                iv,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            }).toString()
        );
    }

    if (action === "decrypt") {
        return CryptoJS.AES.decrypt(decodeURIComponent(data), key, {
            iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        }).toString(CryptoJS.enc.Utf8);
    }
};

export const encryptDecryptPayout = (action, data, apikey, secretkey) => {
    const key = CryptoJS.SHA256(apikey);
    const iv = CryptoJS.enc.Utf8.parse(CryptoJS.SHA256(secretkey).toString(CryptoJS.enc.Hex).substring(0, 16));

    if (!['encrypt', 'decrypt'].includes(action)) {
        console.error("Invalid action. Use 'encrypt' or 'decrypt'.");
        return null;
    }

    if (action === "encrypt") {
        const dataString = JSON.stringify(data);
        return encodeURIComponent(
            CryptoJS.AES.encrypt(dataString, key, {
                iv,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            }).toString()
        );
    }

    if (action === "decrypt") {
        const decryptedData = CryptoJS.AES.decrypt(decodeURIComponent(data), key, {
            iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        }).toString(CryptoJS.enc.Utf8);
        
        try {
            return JSON.parse(decryptedData);
        } catch (e) {
            console.error("Error parsing decrypted data:", e);
            return null;
        }
    }
};

export function signVerify(action, data, secretkey) {
    if (!['sign', 'verify'].includes(action)) {
        console.error("Invalid action. Use 'sign' or 'verify'.");
        return null;
    }

    const decodeKey = decodeURIComponent(secretkey);
    let dataString = typeof data === 'string' ? data : stableStringify(data);
        
    dataString = dataString.replace(/[\u007F-\uFFFF]/g, function (c) {
        return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
    });

    const key = CryptoJS.enc.Utf8.parse(decodeKey);
    const hmacHex = CryptoJS.HmacSHA256(dataString, key).toString(CryptoJS.enc.Hex);
    const signature = Buffer.from(hmacHex, 'utf8').toString('base64');

    if (action === "sign") {
        // logger.info(`Generated Signature (Base64): ${signature}`);
        return signature;
    }

    if (action === "verify") {
        let { payload, signature: sig } = data;

        let payloadString = typeof payload === 'string' ? payload : stableStringify(payload);
    
        payloadString = payloadString.replace(/[\u007F-\uFFFF]/g, function (c) {
            return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
        });

        const expectedHmacHex = CryptoJS.HmacSHA256(payloadString, key).toString(CryptoJS.enc.Hex);
        const expectedSignature = Buffer.from(expectedHmacHex, 'utf8').toString('base64');

        return sig === expectedSignature;
    }

    return null;
}

export function stableStringify(obj) {
    if (typeof obj !== 'object' || obj === null) return JSON.stringify(obj);
    const keys = Object.keys(obj).sort();
    let result = '{';
    keys.forEach((key, i) => {
        if (i) result += ',';
        result += JSON.stringify(key) + ':' + stableStringify(obj[key]);
    });
    result += '}';
    return result;
}

export function verifySign(bizContent, sign, secretKey) {
    const isValid = signVerify("verify", { payload: bizContent, signature: sign }, secretKey);

    if (isValid) {
        logger.info("VALID SIGN");
    } else {
        logger.error("INVALID SIGN");
    }

    return isValid;
}

export function getRandomIP() {
    const isIPv6 = Math.random() > 0.5;

    if (isIPv6) {
        // IPv6: 8 blok angka heksadesimal (0x0000 – 0xFFFF)
        return Array.from({ length: 8 }, () =>
            Math.floor(Math.random() * 0x10000).toString(16)
        ).join(':');
    } else {
        // IPv4: 4 blok angka desimal (0–255)
        return Array.from({ length: 4 }, () =>
            Math.floor(Math.random() * 256)
        ).join('.');
    }
}

const localNames = {
    th: ["สมชาย ใจดี", "สุดา นารี", "นภัทร พานิช", "ชนิดา เล็ก"],
    cn: ["李伟", "王芳", "张伟", "陈杰"],
    jp: ["佐藤 太郎", "中村 優希", "鈴木 彩", "田中 翔"],
    en: ["John Smith", "Emily Brown", "Michael Johnson", "Sarah Davis"],
    in: ["आरव शर्मा", "प्रिया सिंह", "रोहन पटेल", "अनन्या गुप्ता"],
    bd: ["রাহিম হোসেন", "ফাতিমা আক্তার", "শাকিব আহমেদ", "নুসরাত জাহান"],
    kr: ["김민준", "박지우", "이수진", "최현"],
    my: ["အောင်ကျော်", "မြသုဇာ", "ထက်နိုင်", "သန္တာဝင်း"],
    vn: ["Nguyễn Văn An", "Trần Thị Mai", "Lê Quang Huy", "Phạm Thị Lan"],
    id: ["Andi Pratama", "Siti Nurhaliza", "Budi Santoso", "Cindy Melati"]
};

export async function getRandomName(locale = "en", forceLocal = false) {
    if (!forceLocal) {
        try {
            const response = await fetch('https://api.api-ninjas.com/v1/randomuser', {
                headers: { 'X-Api-Key': API_NINJAS_KEY }
            });
            const data = await response.json();
            if (data.name) return data.name; // pakai API
        } catch (error) {
            console.warn("❌ Gagal ambil dari API Ninjas:", error.message);
        }
    }

    // fallback lokal
    const selectedLocale = localNames[locale.toLowerCase()] || localNames["en"];
    const randomIndex = Math.floor(Math.random() * selectedLocale.length);
    return selectedLocale[randomIndex];
}

export function getAccountNumber(length = 8) {
    if (!Number.isInteger(length) || length <= 0) return '';
    let s = '';
    for (let i = 0; i < length; i++) {
        s += Math.floor(Math.random() * 10); // 0..9
    }
    return s;
}
