import fetch from "node-fetch";
import readlineSync from "readline-sync";
import logger from "../../logger.js";
import { randomInt } from "crypto";
import { encryptDecrypt, encryptDecryptPayout } from "../../helpers/utils.js";
import {
  BASE_URL, CALLBACK_URL, 
  SECRET_KEY_INR, SECRET_KEY_VND, 
  PAYOUT_METHOD_INR, PAYOUT_METHOD_VND,
  MERCHANT_CODE_INR, MERCHANT_CODE_VND,
  MERCHANT_API_KEY_INR, MERCHANT_API_KEY_VND,  
} from "../../Config/config.js";

import { getValidIFSC, getRandomName, randomPhoneNumber } from "../../helpers/payoutHelper.js";

const phone = randomPhoneNumber();
const timestamp = Math.floor(Date.now() / 1000);
const name = await getRandomName();
  
async function payout(userID, currency, amount, transactionCode, name, bankCode,  CALLBACK_URL) {
  let merchantCode, payoutMethod, payload, apiKey, secretKey;

  if (currency === "INR") {
    const ifscCode = await getValidIFSC();
    if (!ifscCode) return logger.error("❌ IFSC code tidak ditemukan");

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
      bank_code: bankCode,
      account_name: name,
      payout_code: payoutMethod,
      callback_url: CALLBACK_URL,
    };
  } else {
    console.error("❌ Unsupported currency for payout.");
    return;
  }

  const encryptedPayload = encryptDecryptPayout("encrypt", payload, apiKey, secretKey);
  const decryptedPayload = encryptDecryptPayout("decrypt", encryptedPayload, apiKey, secretKey);

  logger.info(`URL: ${BASE_URL}/api/v1/payout/${merchantCode}`);
  logger.info(`Request Payload : ${JSON.stringify(payload, null, 2)}`);
  logger.info(`Encrypted Payload : ${encryptedPayload}`);

  try {
    const response = await fetch(`${BASE_URL}/api/v1/payout/${merchantCode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: encryptedPayload }),
    });

    let resultText, result;
    try {
        resultText = await response.text();
        result = JSON.parse(resultText);
        
    if (!response.ok) {
        logger.warn(`⚠️ HTTP Error ${response.status}`);
    }
        logger.info(`Payout Response ${JSON.stringify(result, null, 2)}`);
        logger.info(`Response Status : ${response.status}`);
    } catch (parseErr) {
        logger.error("❌ Gagal parsing JSON response");
        logger.error("Raw response :\n" + resultText);
        logger.error("Error detail : " + parseErr.message);
    }

    if (result.encrypted_data) {
      const decryptedPayload = encryptDecrypt("decrypt", result.encrypted_data, apiKey, secretKey);
      logger.info(`Decrypted Payload : ${decryptedPayload}`);
    }
  } catch (error) {
    logger.error(`❌ Payout Error : ${error.message}`);
  }
}

async function sendPayout() {
    logger.info("======== PAYOUT REQUEST ========");
    const userID = randomInt(100, 999);
    const currency = readlineSync.question("Masukkan Currency (INR/VND): ").toUpperCase();

    let bankCode = "";
    if (currency === "VND") {
        bankCode = readlineSync.question("Masukkan Bank Code: ");
        if (!bankCode) {
            logger.error("❌ Bank Code wajib diisi untuk VND!");
            return;
        }
    }

    if (!["INR", "VND"].includes(currency)) {
        logger.error(`"${currency}" Not supported yet!`);
        return;
    }

    const amount = readlineSync.question("Masukkan Amount: ");
    if (isNaN(amount) || Number(amount) <= 0) {
        logger.error("❌ Amount harus angka!");
        return;
    }

    const transactionCode = `TEST-WD-${timestamp}`;

    await payout(userID, currency, amount, transactionCode, name, bankCode, CALLBACK_URL);

    logger.info("======== REQUEST DONE ========\n\n");
}

sendPayout();
