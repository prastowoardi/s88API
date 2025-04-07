import fetch from "node-fetch";
import readlineSync from "readline-sync";
import { randomInt } from "crypto";
import { encryptDecrypt, encryptDecryptPayout } from "../API/utils.js";
import {
  BASE_URL, SECRET_KEY_INR, SECRET_KEY_VND, SECRET_KEY_MMK,
  PAYOUT_METHOD_INR, PAYOUT_METHOD_VND, PAYOUT_METHOD_PMI, PAYOUT_METHOD_MMK,
  MERCHANT_CODE_INR, MERCHANT_CODE_VND, MERCHANT_CODE_MMK,
  MERCHANT_API_KEY_INR, MERCHANT_API_KEY_VND, MERCHANT_API_KEY_MMK  
} from "../API/Config/config.js";

import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const timestamp = Math.floor(Date.now() / 1000).toString();

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

async function getValidIFSC(currency, maxRetries = 3) {
    let attempts = 0;
    while (attempts < maxRetries) {
        const ifscCode = await getRandomIFSC(currency);
        if (ifscCode) return ifscCode;
        console.warn(`⚠️ Percobaan ${attempts + 1} gagal mendapatkan IFSC. Mencoba lagi...`);
        attempts++;
    }
    console.error("❌ Gagal mendapatkan IFSC setelah beberapa percobaan.");
    return null;
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

function randomPhoneNumber() {
    const prefixes = ['017', '018', '019', '016', '015'];
    const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const randomNumber = Math.floor(Math.random() * 100000000);
    return randomPrefix + randomNumber.toString().padStart(6, '0');
}

const phone = randomPhoneNumber();
const name = await getRandomName();
const ifscCode = await getValidIFSC();
console.log(`IFSC Code: ${ifscCode}`);

async function sendPmiPayout(amount) {
    const payload = {
      invoice_id: `TEST-WD-${timestamp}`,
      amount: amount,
      country: "IN",
      currency: "INR",
      payer: {
        id: "15645646546541",
        document: "84932568207",
        first_name: "Sagar",
        last_name: "Dass",
        phone: phone,
        email: "sagar.dass@gmail.com",
        address: {
          street: "E-1/8, Vasant Vihar",
          city: "New Delhi",
          state: "Delhi",
          zip_code: "110057"
        }
      },
      bank_account: {
        bank_account_number: "65465ddd6654sss",
        bank_branch: "654sadf65",
        bank_code: ifscCode,
        bank_beneficiary: name,
        card_number: "1234123412341234",
        card_exp_date: "12/25",
        card_holder: name
      },
      payment_method: PAYOUT_METHOD_PMI,
      description: "test description",
      client_ip: "123.123.123.123",
      url: {
        callback_url: "https://webhook-test.com/edc022bb3b18610530dc7f70c799af79"
      },
      test: 1,
      language: "en"
    };
  
    try {
      const response = await fetch("https://dev.octo88.co/transaction/cashout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Basic Rno4RjdmcE9BdlY4SnlVWTpCNTI2RklidXVITVkxMVdD",
          "x-api-key": "MERCHANT_API_KEY_PMI"
        },
        body: JSON.stringify(payload),
      });
  
      const result = await response.json();
      console.log("\n📜 Request Payload:", JSON.stringify(payload, null, 2));
      console.log("\n📥 PMI Response:", result);
    } catch (error) {
      console.error("\n❌ PMI Request Error:", error.message);
    }
  }
  
async function handleRegularPayout(userID, currency, amount, transactionCode, name) {
  let merchantCode, payoutMethod, payload, apiKey, secretKey;
  if (!ifscCode) return;

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
  } else if (currency === "MMK") {
    const bankCode = readlineSync.question("Masukkan Bank Code: ").toUpperCase();
  
    merchantCode = MERCHANT_CODE_MMK;
    payoutMethod = PAYOUT_METHOD_MMK;
    apiKey = MERCHANT_API_KEY_MMK;
    secretKey = SECRET_KEY_MMK;
  
    payload = {
        merchant_code: merchantCode,
        transaction_code: transactionCode,
        transaction_timestamp: timestamp,
        transaction_amount: amount,
        user_id: userID.toString(),
        currency_code: currency,
        bank_account_number: "11133311",
        bank_code: bankCode,
        bank_name: "bankName",
        account_name: name,
        payout_code: payoutMethod,
    };
  } else {
    console.error("❌ Unsupported currency for payout.");
    return;
  }

  const encryptedPayload = encryptDecryptPayout("encrypt", payload, apiKey, secretKey);
  const decryptedPayload = encryptDecryptPayout("decrypt", encryptedPayload, apiKey, secretKey);

  console.log(`\n🔗 URL: ${BASE_URL}/api/v1/payout/${merchantCode}`);
  console.log("\n📜 Request Payload:", JSON.stringify(payload, null, 2));
  console.log("\n�� Encrypted Payload:", encryptedPayload);
//   console.log("\n�� Decrypted Payload:", decryptedPayload);

  try {
    const response = await fetch(`${BASE_URL}/api/v1/payout/${merchantCode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: encryptedPayload }),
    });

    const result = await response.json();
    console.log("\n📥 Payout Response:", result);

    if (result.encrypted_data) {
      const decryptedPayload = encryptDecrypt("decrypt", result.encrypted_data, apiKey, secretKey);
      console.log("\n🔓 Decrypted Payload:", decryptedPayload);
    }
  } catch (error) {
    console.error("\n❌ Payout Error:", error.message);
  }
}

async function sendPayout() {
  console.log("\n=== PAYOUT REQUEST ===");
  const userID = randomInt(100, 999);
  const currency = readlineSync.question("Masukkan Currency (INR/VND/MMK/PMI): ").toUpperCase();
  const amount = readlineSync.question("Masukkan Amount: ");
  const transactionCode = `TEST-WD-${Math.floor(Date.now() / 1000)}`;

  if (currency === "PMI") {
    await sendPmiPayout(amount);
  } else {
    await handleRegularPayout(userID, currency, amount, transactionCode, name);
  }
}

sendPayout();
