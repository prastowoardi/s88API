import fetch from "node-fetch";
import readlineSync from "readline-sync";
import { randomInt } from "crypto";
import { encryptDecryptPayout } from "./helpers/utils.js";
import {
  BASE_URL, CALLBACK_URL,
  SECRET_KEY_INR, SECRET_KEY_VND, SECRET_KEY_MMK,
  PAYOUT_METHOD_INR, PAYOUT_METHOD_VND, PAYOUT_METHOD_MMK,
  MERCHANT_CODE_INR, MERCHANT_CODE_VND, MERCHANT_CODE_MMK,
  MERCHANT_API_KEY_INR, MERCHANT_API_KEY_VND, MERCHANT_API_KEY_MMK
} from "../API/Config/config.js";

import { getValidIFSC, getRandomName, generateCustomUTR } from "./helpers/payoutHelper.js";
import { sendCallback } from "./helpers/callbackHelper.js";

let lastWithdrawTimestamp = Math.floor(Date.now() / 1000);

async function payout(userID, currency, amount, transactionCode, name, ifscCode = null, callback_url = null) {
  const timestamp = Math.floor(Date.now() / 1000);

  let merchantCode, payoutMethod, payload, apiKey, secretKey;

  if (currency === "INR") {
    if (!ifscCode || typeof ifscCode !== "string" || ifscCode.trim() === "") {
      console.error("❌ IFSC Code kosong atau tidak valid untuk INR.");
      return;
    }

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
      callback_url: CALLBACK_URL,
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
      callback_url: CALLBACK_URL,
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
      callback_url: CALLBACK_URL,
    };
  } else {
    console.error("❌ Unsupported currency for withdraw.");
    return;
  }

  const encryptedPayload = encryptDecryptPayout("encrypt", payload, apiKey, secretKey);

  try {
    const response = await fetch(`${BASE_URL}/api/v1/payout/${merchantCode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: encryptedPayload }),
    });

    const result = await response.json();
    console.log(`\n✅ [${currency}] Withdraw (${transactionCode}):`, result.message || JSON.stringify(result));

    if (result.encrypted_data) {
      const decryptedPayload = encryptDecryptPayout("decrypt", result.encrypted_data, apiKey, secretKey);
      console.log("\n🔓 Decrypted Payload:", decryptedPayload);
    }

    // if (callback_url && result.transaction_no) {
    //   await sendCallback({
    //     transactionNo: result.transaction_no,
    //     amount,
    //     utr: generateCustomUTR(),
    //     status: Math.random() < 0.5 ? 0 : 1,  // Simulasi status sukses/gagal
    //     transactionType: 2,  // Withdraw
    //     systemOrderId: transactionCode,
    //     closeTime: new Date().toISOString(),
    //     remark: "",
    //     note: null,
    //   });
    //   console.log(`✅ Callback success for transaction_no ${result.transaction_no}`);
    // } else {
    //   console.warn(`⚠️ [${currency}] transaction_no tidak ditemukan untuk ${transactionCode}`);
    // }
  } catch (error) {
    console.error(`❌ [${currency}] Withdraw failed for ${transactionCode}:`, error.message || error);
  }
}

async function sendPayoutBatch({ userID, currency, amount, transactionCode, name, ifscCode, callback_url }) {
  await payout(userID, currency, amount, transactionCode, name, ifscCode, callback_url);
}

// Fungsi utama batch withdraw
async function batchPayout() {
  const availableCurrencies = ["INR", "VND", "MMK"];
  const input = readlineSync.question(`Pilih currency (${availableCurrencies.join("/")}, atau 'ALL'): `).toUpperCase();

  let currenciesToProcess = [];

  if (input === "ALL") {
    currenciesToProcess = availableCurrencies;
  } else if (availableCurrencies.includes(input)) {
    currenciesToProcess = [input];
  } else {
    console.error("❌ Currency tidak valid.");
    return;
  }

  const jumlah = readlineSync.questionInt("Berapa Transaksi: ");
  const amount = readlineSync.questionInt("Amount: ");

  const preloadedIFSCs = [];

  if (currenciesToProcess.includes("INR")) {
    console.log("⏳ Menyiapkan IFSC Codes untuk INR...");

    for (let i = 0; i < jumlah; i++) {
      const ifsc = await getValidIFSC();
      if (!ifsc) {
        console.error(`❌ Gagal mendapatkan IFSC untuk transaksi ke-${i + 1}`);
        return;
      }
      preloadedIFSCs.push(ifsc);
    }

    console.log(`✅ ${preloadedIFSCs.length} IFSC Code berhasil disiapkan\n`);
  }

  for (const currency of currenciesToProcess) {
    for (let i = 0; i < jumlah; i++) {
      lastWithdrawTimestamp++;
      const transactionCode = `TEST-WD-${lastWithdrawTimestamp}`;
      const userID = randomInt(100, 999);
      const userName = await getRandomName();
      const ifscCode = currency === "INR" ? preloadedIFSCs[i] : null;

      await sendPayoutBatch({
        userID,
        currency,
        amount,
        transactionCode,
        name: userName,
        ifscCode,
        callback_url: CALLBACK_URL,
        transactionType: 2
      });
    }
  }

  console.log("\n✅ Semua transaksi withdraw telah diproses!");
}

batchPayout();
