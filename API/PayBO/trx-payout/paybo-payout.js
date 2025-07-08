import fetch from "node-fetch";
import readline from 'readline';
import logger from "../../logger.js";
import { randomInt } from "crypto";
import { encryptDecrypt, encryptDecryptPayout } from "../../helpers/utils.js";
import { getValidIFSC, getRandomName } from "../../helpers/payoutHelper.js";
import { getPayoutConfig } from "../../helpers/payoutConfigMap.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise(resolve => rl.question(question, answer => resolve(answer)));
}
async function payout(userID, currency, amount, transactionCode, name, bankCode, callbackURL) {
  const config = getPayoutConfig(currency);
  const timestamp = Math.floor(Date.now() / 1000);

  let payload = {
    merchant_code: config.merchantCode,
    transaction_code: transactionCode,
    transaction_timestamp: timestamp,
    transaction_amount: Number(amount),
    user_id: userID.toString(),
    currency_code: currency,
    payout_code: config.payoutMethod,
    callback_url: callbackURL || config.callbackURL,
    account_name: name,
  };

  if (currency === "INR" && config.requiresIFSC) {
    const ifscCode = await getValidIFSC();
    if (!ifscCode) {
      logger.error("❌ IFSC code tidak ditemukan");
      return;
    }
    payload.ifsc_code = ifscCode;
    payload.bank_account_number = "11133322";
  }

  if (["IDR", "VND", "BDT", "THB", "BRL", "MXN", "KRW"].includes(currency)) {
    if (!bankCode) {
      logger.error(`❌ Bank Code wajib diisi untuk ${currency}!`);
      return;
    }
    payload.bank_code = bankCode;
    payload.bank_account_number = Math.floor(1e10 + Math.random() * 9e10).toString();
    // payload.bank_account_number = "11111111";
    // payload.bank_account_number = "8823237861";
  }

  if (currency === "BRL" && bankCode === "PIX") {
    const types = ["CPF", "CPNJ", "EMAIL", "PHONE", "EVP"];
    const accountType = Math.floor(Math.random() * types.length);
    payload.account_type = types[accountType];
  }

  logger.info(`${config.BASE_URL}/api/v1/payout/${config.merchantCode}`);
  logger.info(`Request Payload : ${JSON.stringify(payload, null, 2)}`);

  const encryptedPayload = encryptDecryptPayout("encrypt", payload, config.merchantAPI, config.secretKey);

  logger.info(`Encrypted Payload : ${encryptedPayload}`);

  try {
    const response = await fetch(`${config.BASE_URL}/api/v1/payout/${config.merchantCode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: encryptedPayload }),
    });

    const responseText = await response.text();

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseErr) {
      logger.error("❌ Gagal parsing JSON response");
      logger.error("Raw response :\n" + responseText);
      logger.error("Error detail : " + parseErr.message);
      return;
    }

    if (!response.ok) {
      logger.error(`❌ Payout gagal: HTTP ${response.status} - ${JSON.stringify(result)}`);
      return;
    }

    logger.info(`Payout Response: ${JSON.stringify(result, null, 2)}`);
    logger.info(`Response Status: ${response.status}`);

    if (result.encrypted_data) {
      const decryptedPayload = encryptDecrypt("decrypt", result.encrypted_data, config.merchantAPI, config.secretKey);
      logger.info(`Decrypted Response Payload : ${decryptedPayload}`);
    }

  } catch (error) {
    logger.error(`❌ Payout Error : ${error.message}`);
  }
}

async function sendPayout() {
  try {  
    logger.info("======== PAYOUT REQUEST ========");
    const userID = randomInt(100, 999);
    const currencyInput = await ask("Masukkan Currency (INR/VND/BRL/IDR/MXN/THB/BDT/KRW): ");
    const currency = currencyInput.toUpperCase();
    if (!["INR", "VND", "BRL", "THB", "IDR", "MXN", "BDT", "KRW"].includes(currency)) {
      logger.error(`❌ Currency "${currency}" belum didukung untuk payout.`);
      return;
    }

    let bankCode = "";
    if (["IDR", "VND", "BDT", "THB", "BRL", "MXN", "KRW"].includes(currency)) {
      bankCode = await ask(`Masukkan Bank Code untuk ${currency}: `);
      if (!bankCode) {
        logger.error(`❌ Bank Code wajib diisi untuk ${currency}!`);
        return;
      }
    }

    const amount = await ask("Masukkan Amount: ");
    if (isNaN(amount) || Number(amount) <= 0) {
      logger.error("❌ Amount harus angka lebih besar dari 0!");
      return;
    }
    logger.info(`Currency : ${currency}`);
    logger.info(`Amount : ${amount}`);
    
    const transactionCode = `TEST-WD-${Math.floor(Date.now() / 1000)}`;
    const name = await getRandomName();

    await payout(userID, currency, amount, transactionCode, name, bankCode, null);

    logger.info("======== REQUEST DONE ========\n\n");
  } catch (err) {
    logger.error(`❌ Error: ${err.message}`);
  } finally {
    rl.close();
  }
}

sendPayout();
