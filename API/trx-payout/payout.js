import fetch from "node-fetch";
import readlineSync from "readline-sync";
import logger from "../logger.js";
import { randomInt } from "crypto";
import { encryptDecrypt, encryptDecryptPayout } from "../helpers/utils.js";
import {
  BASE_URL, CALLBACK_URL, PMI_WD_URL, PMI_AUTHORIZATION, 
  SECRET_KEY_INR, SECRET_KEY_VND, SECRET_KEY_MMK, SECRET_KEY_BDT,
  PAYOUT_METHOD_INR, PAYOUT_METHOD_VND, PAYOUT_METHOD_PMI, PAYOUT_METHOD_MMK, PAYOUT_METHOD_BDT,
  MERCHANT_CODE_INR, MERCHANT_CODE_VND, MERCHANT_CODE_MMK, MERCHANT_CODE_BDT,
  MERCHANT_API_KEY_INR, MERCHANT_API_KEY_VND, MERCHANT_API_KEY_PMI, MERCHANT_API_KEY_MMK, MERCHANT_API_KEY_BDT  
} from "../Config/config.js";

import { getValidIFSC, getRandomName, randomPhoneNumber } from "../helpers/payoutHelper.js";

const phone = randomPhoneNumber();
const timestamp = Math.floor(Date.now() / 1000);
const name = await getRandomName();

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
        bank_account_number: "50200102956056",
        bank_branch: "654sadf65",
        bank_code: "HDFC0011965",
        bank_beneficiary: name,
        card_number: "1234123412341234",
        card_exp_date: "12/25",
        card_holder: name
      },
      payment_method: PAYOUT_METHOD_PMI,
      description: "test description",
      client_ip: "123.123.123.123",
      url: {
        callback_url: CALLBACK_URL
      },
      test: 1,
      language: "en"
    };
  
    try {
        const response = await fetch(PMI_WD_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": PMI_AUTHORIZATION,
            "x-api-key": MERCHANT_API_KEY_PMI
          },
          body: JSON.stringify(payload),
        });        
  
        const result = await response.json();
        logger.info("\n📜 Request Payload:", JSON.stringify(payload, null, 2));
        logger.info("\n📥 PMI Response:", result);
    } catch (error) {
        console.error("\n❌ PMI Request Error:", error.message);
    }
  }
  
async function handleRegularPayout(userID, currency, amount, transactionCode, name, CALLBACK_URL) {
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
      bank_code: "970418",
      account_name: name,
      payout_code: payoutMethod,
      callback_url: CALLBACK_URL,
    };
  } else if (currency === "BDT") {
    const bankCode = readlineSync.question("Masukkan Bank Code: ").toUpperCase();
  
    merchantCode = MERCHANT_CODE_BDT;
    payoutMethod = PAYOUT_METHOD_BDT;
    apiKey = MERCHANT_API_KEY_BDT;
    secretKey = SECRET_KEY_BDT;

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
    console.error("❌ Unsupported currency for payout.");
    return;
  }

  const encryptedPayload = encryptDecryptPayout("encrypt", payload, apiKey, secretKey);
  const decryptedPayload = encryptDecryptPayout("decrypt", encryptedPayload, apiKey, secretKey);

  logger.info(`🔗 URL: ${BASE_URL}/api/v1/payout/${merchantCode}`);
  logger.info(`📜 Request Payload : ${JSON.stringify(payload, null, 2)}`);
  logger.info(`�� Encrypted Payload : ${encryptedPayload}`);
//   logger.info(`�� Decrypted Payload ${decryptedPayload}`);

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
        logger.info(`📥Payout Response ${JSON.stringify(result, null, 2)}`);
        logger.info(`⚡️Response Status : ${response.status}`);
    } catch (parseErr) {
        logger.error("❌ Gagal parsing JSON response");
        logger.error("Raw response :\n" + resultText);
        logger.error("Error detail : " + parseErr.message);
    }

    if (result.encrypted_data) {
      const decryptedPayload = encryptDecrypt("decrypt", result.encrypted_data, apiKey, secretKey);
      logger.info(`🔓 Decrypted Payload : ${decryptedPayload}`);
    }
  } catch (error) {
    logger.error(`❌ Payout Error : ${error.message}`);
  }
}

async function sendPayout() {
  logger.info("======== PAYOUT REQUEST ========");
  const userID = randomInt(100, 999);
  const currency = readlineSync.question("Masukkan Currency (INR/VND/BDT/MMK): ").toUpperCase();
  
  if (!["INR", "VND", "BDT", "MMK", "MMK"].includes(currency)) {
        logger.error(`"${currency}" Not supported yet!`);
        return;
  }

  const amount = readlineSync.question("Masukkan Amount: ");
  if (isNaN(amount) || Number(amount) <= 0) {
    logger.error("❌ Amount harus angka!");
    return;
  }
  const transactionCode = `TEST-WD-${timestamp}`;

  if (currency === "PMI") {
    await sendPmiPayout(amount);
  } else {
    await handleRegularPayout(userID, currency, amount, transactionCode, name, CALLBACK_URL);
  }

  logger.info("======== REQUEST DONE ========\n\n");
}

sendPayout();
