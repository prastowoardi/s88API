import fetch from "node-fetch";
import readline from 'readline';
import logger from "../../logger.js";
import { randomInt } from "crypto";
import { encryptDecrypt, encryptDecryptPayout, getRandomIP } from "../../helpers/utils.js";
import { getPayoutConfig } from "../../helpers/payoutConfigMap.js";
import { getValidIFSC, getRandomName, randomPhoneNumber } from "../../helpers/payoutHelper.js";

const timestamp = Math.floor(Date.now() / 1000);
const phone = randomPhoneNumber();
const name = await getRandomName();
const ip = getRandomIP();
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise(resolve => rl.question(question, answer => resolve(answer)));
}

async function sendPmiPayout(config, amount) {
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
    payment_method: config.payoutMethod,
    description: "test description",
    client_ip: "123.123.123.123",
    url: {
      callback_url: config.callbackURL
    },
    test: 1,
    language: "en"
  };

  try {
    const response = await fetch(config.BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": config.authorization,
        "x-api-key": config.merchantAPI
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    logger.info("PMI Payload:", JSON.stringify(payload, null, 2));
    logger.info("PMI Response:", result);
  } catch (err) {
    logger.error("❌ PMI Payout Error:", err.message);
  }
}

async function handleRegularPayout(userID, currency, amount, transactionCode, name, config) {
  let payload = {
    merchant_code: config.merchantCode,
    transaction_code: transactionCode,
    transaction_timestamp: timestamp,
    transaction_amount: Number(amount),
    user_id: userID.toString(),
    currency_code: currency,
    payout_code: config.payoutMethod,
    callback_url: config.callbackURL,
    account_name: name,
    ip_address: ip,
  };

  if (config.requiresIFSC) {
    const ifscCode = await getValidIFSC();
    if (!ifscCode) return logger.error("❌ IFSC tidak tersedia.");
    payload.ifsc_code = ifscCode;
    payload.bank_account_number = "11133322";
  }

  if (config.requiresBankCode) {
    const bankCode = await ask(`Masukkan Bank Code untuk ${currency}: `);
    if (!bankCode) return logger.error("❌ Bank Code wajib diisi!");
    payload.bank_code = bankCode;
    payload.bank_account_number = "2206491508";
  }

  const encryptedPayload = encryptDecryptPayout("encrypt", payload, config.merchantAPI, config.secretKey);
  logger.info(`Encrypted Payload: ${encryptedPayload}`);
  logger.info(`Payload: ${JSON.stringify(payload, null, 2)}`);

  try {
    const response = await fetch(`${config.BASE_URL}/api/v1/payout/${config.merchantCode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: encryptedPayload })
    });

    const resultText = await response.text();
    const result = JSON.parse(resultText);

    if (!response.ok) {
      logger.warn(`⚠️ Payout Error ${response.status}`);
    }

    logger.info(`Response: ${JSON.stringify(result, null, 2)}`);

    if (result.encrypted_data) {
      const decrypted = encryptDecrypt("decrypt", result.encrypted_data, config.merchantAPI, config.secretKey);
      logger.info(`Decrypted Response: ${decrypted}`);
    }
  } catch (err) {
    logger.error(`❌ Request Error: ${err.message}`);
  }
}

async function sendPayout() {
  try { 
    logger.info("======== PAYOUT REQUEST ========");

    const userID = randomInt(100, 999);
    const currencyInput = await ask("Masukkan Currency (INR/VND/BRL/IDR/MXN/THB/BDT): ");
    const currency = currencyInput.toUpperCase();
    if (!["INR", "VND", "BDT", "MMK", "THB", "PMI"].includes(currency)) {
      logger.error(`❌ Currency '${currency}' tidak didukung.`);
      return;
    }

    const amount = await ask("Masukkan Amount: ");
    if (isNaN(amount) || Number(amount) <= 0) {
      logger.error("❌ Amount harus angka lebih besar dari 0!");
      return;
    }

    const transactionCode = `TEST-WD-${timestamp}`;
    const config = getPayoutConfig(currency);

    if (config.isExternal) {
      await sendPmiPayout(config, amount);
    } else {
      await handleRegularPayout(userID, currency, amount, transactionCode, name, config);
    }

    logger.info("======== REQUEST DONE ========\n");
  } catch (err) {
    logger.error(`❌ Error: ${err.message}`);
  } finally {
    rl.close();
  }
}

sendPayout();
