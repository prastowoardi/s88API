import fetch from "node-fetch";
import readlineSync from "readline-sync";
import logger from "../../logger.js";
import { randomInt } from "crypto";
import { encryptDecryptPayout } from "../../helpers/utils.js";
import {
  BASE_URL, CALLBACK_URL,
  SECRET_KEY_INR, SECRET_KEY_VND, 
  PAYOUT_METHOD_INR, PAYOUT_METHOD_VND,
  MERCHANT_CODE_INR, MERCHANT_CODE_VND,
  MERCHANT_API_KEY_INR, MERCHANT_API_KEY_VND,
} from "../../Config/config.js";
import { getValidIFSC, getRandomName } from "../../helpers/payoutHelper.js";

let lastWithdrawTimestamp = Math.floor(Date.now() / 1000);

async function payout(userID, currency, amount, transactionCode, name, ifscCode = null, callback_url = null) {
  const timestamp = Math.floor(Date.now() / 1000);
  let merchantCode, payoutMethod, payload, apiKey, secretKey;
  const bank = ifscCode.substring(0, 4);
  
  if (currency === "INR") {
    if (!ifscCode || typeof ifscCode !== "string" || ifscCode.trim() === "") {
      logger.error("❌ IFSC Code kosong atau tidak valid untuk INR.");
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
      bank_code: bank,
      bank_name: bank,
    };
  } else if (currency === "VND") {
    merchantCode = MERCHANT_CODE_VND;
    payoutMethod = PAYOUT_METHOD_VND;
    apiKey = MERCHANT_API_KEY_VND;
    secretKey = SECRET_KEY_VND;

    const bankCodeVND = ["970436", "970407", "970416", "970422", "970418"];
    const randomBankCode = bankCodeVND[Math.floor(Math.random() * bankCodeVND.length)];

    payload = {
      merchant_code: merchantCode,
      transaction_code: transactionCode,
      transaction_timestamp: timestamp,
      transaction_amount: amount,
      user_id: userID.toString(),
      currency_code: currency,
      bank_account_number: "2206491508",
      bank_code: randomBankCode,
      account_name: name,
      payout_code: payoutMethod,
      callback_url: CALLBACK_URL,
    };
  } else {
    logger.error("❌ Unsupported currency for withdraw.");
    return;
  }

  const encryptedPayload = encryptDecryptPayout("encrypt", payload, apiKey, secretKey);

  try {
    const response = await fetch(`${BASE_URL}/api/v1/payout/${merchantCode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: encryptedPayload }),
    });

    const rawResponse = await response.text();
    let result;

    try {
      result = JSON.parse(rawResponse);
    } catch (e) {
      logger.error(`❌ Gagal parse JSON untuk ${transactionCode}:\n`, rawResponse);
      return;
    }

    logger.info(`✅ Withdraw (${transactionCode}): ${result.message || JSON.stringify(result)}`);

    if (result.encrypted_data) {
      const decryptedPayload = encryptDecryptPayout("decrypt", result.encrypted_data, apiKey, secretKey);
      logger.info("Decrypted Payload:", decryptedPayload);
    }
  } catch (error) {
    logger.error(`❌ Withdraw failed for ${transactionCode}:`, error.message || error);
  }
}

async function sendPayoutBatch({ userID, currency, amount, transactionCode, name, ifscCode, callback_url }) {
  await payout(userID, currency, amount, transactionCode, name, ifscCode, callback_url);
}

async function batchPayout() {
  logger.info("======== Batch Payout Request ========");
  const availableCurrencies = ["INR", "VND"];
  const input = readlineSync.question(`Pilih currency (${availableCurrencies.join("/")}, atau 'ALL'): `).toUpperCase();

  let currenciesToProcess = [];

  if (input === "ALL") {
    currenciesToProcess = availableCurrencies;
  } else if (availableCurrencies.includes(input)) {
    currenciesToProcess = [input];
  } else {
    logger.error("❌ Currency tidak valid.");
    return;
  }

  const jumlah = readlineSync.questionInt("Berapa Transaksi: ");

  const preloadedIFSCs = [];

  if (currenciesToProcess.includes("INR")) {
    logger.info("⏳ Menyiapkan IFSC Codes untuk INR...");

    for (let i = 0; i < jumlah; i++) {
      const ifsc = await getValidIFSC();
      if (!ifsc) {
        logger.error(`❌ Gagal mendapatkan IFSC untuk transaksi ke-${i + 1}`);
        return;
      }
      preloadedIFSCs.push(ifsc);
    }

    logger.info(`✅ ${preloadedIFSCs.length} IFSC Code berhasil disiapkan`);

    preloadedIFSCs.forEach((code, idx) => {
      logger.info(`IFSC ${idx + 1}: ${code}`);
    });
  }

  for (const currency of currenciesToProcess) {
    for (let i = 0; i < jumlah; i++) {
      lastWithdrawTimestamp++;
      const transactionCode = `TEST-WD-${lastWithdrawTimestamp}`;
      const userID = randomInt(100, 999);
      const userName = await getRandomName();
      const ifscCode = currency === "INR" ? preloadedIFSCs[i] : null;

      const amount = readlineSync.questionInt(`Masukkan amount untuk transaksi ke-${i + 1} (${currency}): `);

      await sendPayoutBatch({
        userID,
        currency,
        amount,
        transactionCode,
        name: userName,
        ifscCode,
        callback_url: CALLBACK_URL,
      });
    }
  }

  logger.info("======== REQUEST DONE ========\n\n");
}

async function main() {
  try {
    await batchPayout();
  } catch (error) {
    logger.error(`❌ Batch Payout Error: ${error.message}`);
  }
}

main();