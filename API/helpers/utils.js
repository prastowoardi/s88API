import fetch from "node-fetch";
import CryptoJS from 'crypto-js';
import logger from "../logger.js";
import { API_NINJAS_KEY } from "../Config/config.js";
import CoinKey from 'coinkey';
import { v4 as uuidv4 } from 'uuid';
import { fakerJA as faker } from '@faker-js/faker';
import fs from 'fs';
import FormData from 'form-data';

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
    th: ["สมชาย ใจดี", "สุดา นารี", "นภัทร พานิช", "ชนิดา เล็ก", "กิตติชัย วงศ์สุวรรณ", "พิมพ์พรรณ ศรีทอง", "อภิชัย เดชะ", "วาสนา ศิริกุล", "ศักดิ์สิทธิ์ จันทรา", "มัลลิกา ภู่วัฒน์"],
    cn: ["李伟", "王芳", "张伟", "陈杰", "刘洋", "赵静", "杨磊", "黄娜", "吴强", "周丽"],
    jp: ["佐藤 太郎", "中村 優希", "鈴木 彩", "田中 翔", "高橋 健", "山本 美咲", "伊藤 海斗", "渡辺 花子", "小林 涼", "松本 愛"],
    in: ["आरव शर्मा", "प्रिया सिंह", "रोहन पटेल", "अनन्या गुप्ता", "विवान वर्मा", "काव्या मिश्रा", "अर्जुन यादव", "नेहा अग्रवाल", "आदित्य चौहान", "इशिता मेहता"],
    bd: ["রাহিম হোসেন", "ফাতিমা আক্তার", "শাকিব আহমেদ", "নুসরাত জাহান", "তানভীর রহমান", "মারিয়া ইসলাম", "রাকিব হাসান", "সাবরিনা ইয়াসমিন", "ইমরান করিম", "সানজিদা আক্তার"],
    kr: ["김민준", "박지우", "이수진", "최현", "정은지", "한서준", "윤하린", "오지민", "장도윤", "서예린"],
    my: ["အောင်ကျော်", "မြသုဇာ", "ထက်နိုင်", "သန္တာဝင်း", "မောင်မောင်ဦး", "ခင်ခင်ဝင်း", "ဇေယျာထွန်း", "ဆုမြတ်လှိုင်", "အေးချိုစံ", "သက်နိုင်ဦး"],
    vn: ["Nguyễn Văn An", "Trần Thị Mai", "Lê Quang Huy", "Phạm Thị Lan", "Hoàng Đức Minh", "Vũ Thị Hằng", "Đặng Quốc Toàn", "Bùi Thị Hương", "Đỗ Văn Long", "Trịnh Ngọc Ánh"],
    id: ["Andi Pratama", "Siti Nurhaliza", "Budi Santoso", "Cindy Melati", "Rizky Hidayat", "Dewi Lestari", "Ahmad Fauzan", "Tania Putri", "Doni Saputra", "Laras Wulandari"],
    en: ["John Smith", "Emily Brown", "Michael Johnson", "Sarah Davis", "David Miller", "Jessica Wilson", "Daniel Taylor", "Olivia Moore", "James Anderson", "Sophia Thomas"]
}

export async function getRandomName(locale = "en", forceLocal = false) {
    const normalizedLocale = locale.toLowerCase();
    const hasLocalData = !!localNames[normalizedLocale];

    if (!hasLocalData || !forceLocal) {
        try {
            const response = await fetch("https://api.api-ninjas.com/v1/randomuser", {
                headers: { "X-Api-Key": API_NINJAS_KEY }
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            if (data && data.name) return data.name;

        } catch (error) {
            console.warn("⚠️ Gagal ambil nama dari API Ninjas:", error.message);
        }
    }

    const selectedLocale = localNames[normalizedLocale] || localNames["en"];
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

export async function getCryptoRate(amount, fromCurrency, config, toCurrency = "USDT", type = "withdraw") {
    const wallet = CoinKey.createRandom();
    // console.log("SAVE BUT DO NOT SHARE THIS:", wallet.privateKey.toString('hex'));
    // console.log("Address:", wallet.publicAddress);

    try {
        const encryptedMerchant = encryptDecrypt("encrypt", config.merchantCode, config.merchantAPI, config.secretKey);
        const url = `${config.BASE_URL}/api/${config.merchantCode}/v4/crypto-rate`;
        
        const requestBody = {
            amount: amount.toString(),
            type: type,
            from: fromCurrency,
            to: toCurrency,
            address: wallet.publicAddress
        };

        logger.info(`Requesting Rate: ${fromCurrency} -> ${toCurrency} (${type})`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'X-Encrypted-MerchantCode': encryptedMerchant,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const result = await response.json();

        if (result.success && result.data) {
            return result.data;
        }
        
        logger.error(`❌ API Error: ${result.message || 'Unknown Error'}`);
        return null;

    } catch (error) {
        logger.error(`❌ System Error: ${error.message}`);
        return null;
    }
}

export const generateRandomJPYData = async (customerID) => {
    const bankKanjis = ["みずほ銀行", "三菱UFJ銀行", "三井住友銀行", "りそな銀行", "楽天銀行", "ゆうちょ銀行", "PayPay銀行"];
    const selectedBank = faker.helpers.arrayElement(bankKanjis);

    const branchName = faker.location.city(); 
    const branchCode = faker.string.numeric(3);
    const fullBranchFormat = `${branchName}支店(${branchCode})`;

    const lastNameKanji = faker.person.lastName();
    const firstNameKanji = faker.person.firstName();
    const fullNameKanji = `${lastNameKanji} ${firstNameKanji}`;


    const katakanaChars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
    const randomKatakana = (len) => Array.from({ length: len }, () => katakanaChars[Math.floor(Math.random() * katakanaChars.length)]).join('');

    let lastNameKana = faker.person.lastName({ variant: 'katakana' });
    let firstNameKana = faker.person.firstName({ variant: 'katakana' });
    if (/[一-龠]/.test(lastNameKana)) {
        lastNameKana = randomKatakana(4);
        firstNameKana = randomKatakana(3);
    }
    const fullNameFurigana = `${lastNameKana} ${firstNameKana}`;
    
    const birthDate = faker.date.between({ from: '1970-01-01', to: '2000-12-31' })
                        .toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD

    return {
        customer_id: customerID || `CUST-JP-${faker.string.numeric(5)}`,
        recipient_name: fullNameKanji, 
        full_bank_name: selectedBank,
        swift_code: fullBranchFormat,
        user_name_kanji: fullNameKanji, 
        user_name_furigana: fullNameFurigana, 
        birth_date: birthDate,
        nationality: "JAPAN",
        address: `${faker.location.state()}${faker.location.city()}${faker.location.streetAddress()}`,
        phone: "81" + faker.string.numeric(9),
        email: faker.internet.email(),
        income_source1: "1",
        income_source2: "0",
        income_source3: "0",
        income_source4: "0",
        attachment1Path: "./file.pdf",
        attachment2Path: "./file.pdf"
    };
}

export async function registerCustomerJPY(config, customerId) {
    const { merchantCode, BASE_URL, secretKey, merchantAPI } = config;
    const url = `${BASE_URL}/api/kyc/register/${merchantCode}`;

    try {
        logger.info(`🔍 Pre-checking status for: ${customerId}...`);
        const checkRes = await pollKYCStatus(customerId, config);
        
        const resDataCheck = checkRes?.data;
        const currentStatus = Array.isArray(resDataCheck) ? resDataCheck[0]?.status : resDataCheck?.status;

        if (currentStatus) {
            const statusUpper = currentStatus.toUpperCase();
            
            if (statusUpper === "APPROVED") {
                logger.warn(`✅ User ${customerId} is already APPROVED. Skipping registration.`);
                return { success: true, message: "Already Approved", data: resDataCheck };
            } 
            
            if (statusUpper === "PENDING" || statusUpper === "PROCESSING") {
                logger.warn(`⏳ User ${customerId} is still PENDING. Skipping registration.`);
                return { success: true, message: "Already Pending", data: resDataCheck };
            }

            if (statusUpper === "REJECTED") {
                logger.info(`♻️ User ${customerId} was REJECTED. Re-registering with new data...`);
            }
        }

        const payload = await generateRandomJPYData(customerId); 
        const nationalityCode = "JAPAN"; 
        const encryptedCustomerId = encryptDecrypt("encrypt", payload.customer_id, merchantAPI, secretKey);

        const fileDepan = "./file.pdf"; 
        const fileBelakang = "./file.pdf";

        if (!fs.existsSync(fileDepan) || !fs.existsSync(fileBelakang)) {
            throw new Error(`File gambar tidak ditemukan! Pastikan ${fileDepan} & ${fileBelakang} sudah ada.`);
        }

        const form = new FormData();
        form.append('currency', 'JPY');
        form.append('recipient_name', payload.recipient_name);
        form.append('full_bank_name', payload.full_bank_name);
        form.append('swift_code', payload.swift_code);
        form.append('user_name_kanji', payload.user_name_kanji);
        form.append('user_name_furigana', payload.user_name_furigana);
        form.append('birth_date', payload.birth_date);
        form.append('nationality', nationalityCode);
        form.append('address', payload.address);
        form.append('phone', payload.phone);
        form.append('email', payload.email);
        form.append('income_source1', "1");
        form.append('income_source2', "0");
        form.append('income_source3', "0");
        form.append('income_source4', "0");

        form.append('attachment1', fs.createReadStream(fileDepan));
        form.append('attachment2', fs.createReadStream(fileBelakang));

        logger.info(`📤 Sending KYC with Real Images: ${payload.customer_id}`);

        const logFormData = (formData) => {
            logger.info("--- 📦 Payload Register User ---");

            const streams = formData._streams || [];

            for (let i = 0; i < streams.length; i++) {
                const item = streams[i];
                
                if (typeof item === 'string' && item.includes('name="')) {
                    const nameMatch = item.match(/name="([^"]+)"/);
                    if (nameMatch) {
                        const fieldName = nameMatch[1];
                        const value = streams[i + 1]; // Value biasanya ada di indeks setelah header

                        if (typeof value === 'string' || typeof value === 'number') {
                            logger.info(`Field [${fieldName}]: ${value}`);
                        } else if (value && value.path) {
                            logger.info(`Field [${fieldName}]: 📄 File (${value.path})`);
                        } else {
                            logger.info(`Field [${fieldName}]: [Binary/Buffer]`);
                        }
                    }
                }
            }
            logger.info("---------------------------------");
        };

        logFormData(form);

        const bodyBuffer = await new Promise((resolve, reject) => {
            const chunks = [];
            form.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            form.on('error', (err) => reject(err));
            form.on('end', () => resolve(Buffer.concat(chunks)));
            form.resume(); 
        });

        const response = await fetch(url, {
            method: 'POST',
            body: bodyBuffer,
            headers: {
                ...form.getHeaders(),
                'X-Encrypted-Customer-Id': encryptedCustomerId,
                'Idempotency-Key': uuidv4()
            }
        });

        const resText = await response.text();
        const resData = JSON.parse(resText);
        if (!response.ok) {
            logger.error(`❌ API Response (${response.status}): ${JSON.stringify(JSON.parse(resText), null, 2)}`);
            return resData;
        } else {
            logger.info(`✅ KYC Registration Successful for ${payload.customer_id}: ${JSON.stringify(JSON.parse(resText), null, 2)}`);
            return resData;
        }

        // FOR DEBUGGING PURPOSES ONLY - LOG RAW RESPONSE
        // const resultJson = JSON.parse(resText);
        // logger.info(`⛹ User ID Registered: ${payload.customer_id}`);
        // logger.info(`🔍 Encrypted User ID: ${encryptedCustomerId}`);
        // return payload;

    } catch (error) {
        console.error("DEBUG ERROR REGISTER:", error); 
        // logger.error(`❌ Registration Error: ${error.message}`);
        // throw error;
    }
}

export async function pollKYCStatus(customerId, config) {
    const { merchantCode, BASE_URL, secretKey, merchantAPI } = config;
    const url = `${BASE_URL}/api/kyc/poll-status/${merchantCode}`;
    const encryptedCustomerId = encryptDecrypt("encrypt", customerId, merchantAPI, secretKey);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'X-Encrypted-Customer-Id': encryptedCustomerId,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ currency: "JPY" })
        });
        return await response.json(); 
    } catch (err) {
        return { status: "ERROR", message: err.message };
    }
}