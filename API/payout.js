import fetch from "node-fetch";
import readlineSync from "readline-sync";
import { randomInt } from "crypto";
import { encryptDecrypt, encryptDecryptPayout } from "../API/utils.js";
import { BASE_URL, SECRET_KEY_INR, SECRET_KEY_VND, PAYOUT_METHOD_INR, PAYOUT_METHOD_VND, MERCHANT_CODE_INR, MERCHANT_CODE_VND, MERCHANT_API_KEY_INR, MERCHANT_API_KEY_VND } from "../API/Config/config.js";
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ifscDataPath = path.resolve(__dirname, 'src/banks.json');

async function getRandomIFSC(currency) {
    try {
        await fs.access(ifscDataPath);
        
        const data = await fs.readFile(ifscDataPath, 'utf8');
        const ifscData = JSON.parse(data);

        if (!ifscData.NTDRESP || !Array.isArray(ifscData.NTDRESP.BANKLIST)) {
            throw new Error("Format data banks.json tidak valid!");
        }

        const bankList = ifscData.NTDRESP.BANKLIST;

        if (bankList.length === 0) {
            throw new Error("Data bank kosong!");
        }

        const randomBank = bankList[Math.floor(Math.random() * bankList.length)];

        if (!randomBank.MIFSCCODE) {
            throw new Error(`Bank ${randomBank.BANKNAME} tidak memiliki IFSC yang valid.`);
        }

        if (currency === "INR") {
            console.log(`✅ Bank: ${randomBank.BANKNAME} (${randomBank.BANKCODE})`);
            console.log(`✅ IFSC Code: ${randomBank.MIFSCCODE}`);
        }

        return randomBank.MIFSCCODE;
    } catch (error) {
        console.error(`❌ Error saat membaca IFSC data: ${error.message}`);
        return null;
    }
}

async function getRandomName() {
    try {
        const response = await fetch('https://randomuser.me/api/');
        const data = await response.json();
        return `${data.results[0].name.first} ${data.results[0].name.last}`;
    } catch (error) {
        console.error("❌ Gagal mengambil data:", error);
        return null;
    }
}

async function sendPayout() {
    console.log("\n=== PAYOUT REQUEST ===");

    const userID = randomInt(100, 999);
    const currency = readlineSync.question("Masukkan Currency (INR/VND): ").toUpperCase();
    const amount = readlineSync.question("Masukkan Amount: ");
    
    const name = await getRandomName();

    const ifscCode = await getRandomIFSC(currency);
    if (!ifscCode) {
        console.error("❌ IFSC code tidak ditemukan! Payout dibatalkan.");
        return;
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const transactionCode = `TEST-WD-${timestamp}`;

    let merchantCode, payoutMethod, payload, secretKey, apiKey;

    if (currency === "INR") {
        merchantCode = MERCHANT_CODE_INR;
        payoutMethod = PAYOUT_METHOD_INR;
        apiKey = MERCHANT_API_KEY_INR;
        secretKey = SECRET_KEY_INR;
        payload = {
            merchant_code: merchantCode,
            transaction_code: transactionCode,
            transaction_timestamp: timestamp,
            transaction_amount: amount,
            user_id: userID.toString(),
            currency_code: currency,
            bank_account_number: "11133322",
            ifsc_code: ifscCode,
            account_name: name,
            payout_code: payoutMethod,
        };
    } else if (currency === "VND") {
        merchantCode = MERCHANT_CODE_VND;
        payoutMethod = PAYOUT_METHOD_VND;
        apiKey = MERCHANT_API_KEY_VND;
        secretKey = SECRET_KEY_VND;
        payload = {
            merchant_code: merchantCode,
            transaction_code: transactionCode,
            transaction_timestamp: timestamp,
            transaction_amount: amount,
            user_id: userID.toString(),
            currency_code: currency,
            bank_account_number: "2206491508",
            bank_code: "970418",
            account_name: name,
            payout_code: payoutMethod,
        };
    } else {
        console.error("❌ Currency not supported!");
        return;
    }

    console.log(`\n🔗 URL: ${BASE_URL}/api/v1/payout/${merchantCode}`);

    const encryptedPayload = encryptDecryptPayout("encrypt", payload, apiKey, secretKey);
    console.log(`\n🔑 Key:`, encryptedPayload);
    console.log("\n📜 Request Payload:", JSON.stringify(payload, null, 2));

    try {
        const response = await fetch(`${BASE_URL}/api/v1/payout/${merchantCode}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: encryptedPayload }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.log(`\n🔒 Encrypted Key: ${encryptedPayload}`);
            console.error(`\n❌ Error response body: ${errorText}`);
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const result = await response.json();
        console.log("\nPayout Response:", result);

        if (result.encrypted_data) {
            const decryptedPayload = encryptDecrypt("decrypt", result.encrypted_data, apiKey, secretKey);
            console.log("\n🔓 Decrypted Payload:", decryptedPayload);
        }

    } catch (error) {
        console.error("\n❌ Payout Error:", error.message);
    }
}

sendPayout();
