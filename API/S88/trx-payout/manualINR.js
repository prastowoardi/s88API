import fetch from "node-fetch";
import readlineSync from "readline-sync";
import logger from "../../logger.js";
import { randomInt } from "crypto";
import { encryptDecryptPayout, getRandomIP } from "../../helpers/utils.js";
import { BASE_URL, CALLBACK_URL, SECRET_KEY_INR, PAYOUT_METHOD_INR, MERCHANT_CODE_INR, MERCHANT_API_KEY_INR } from "../../Config/config.js";
import { getValidIFSC, getRandomName } from "../../helpers/payoutHelper.js";

const ifscCode = await getValidIFSC();
console.log(`IFSC Code: ${ifscCode}`);

async function sendPayout() {
  logger.info("======== INR - MANUAL PAYOUT REQUEST ========");

  const amount = readlineSync.question("Masukkan Amount: ");
  logger.info(`Amount input: ${amount}`);
  if (isNaN(amount) || Number(amount) <= 0) {
    console.error("❌ Amount tidak valid.");
    return;
  }

    // Input semua data
    // const userID = readlineSync.question("Masukkan User ID: ");
    // logger.info(`UserID Input: ${userID}`);
    
    // const bankAccountNumber = readlineSync.question("Masukkan Nomor Rekening: ");
    // logger.info(`Bank Account Number input: ${bankAccountNumber}`);
    
    // const accountName = readlineSync.question("Masukkan Nama Akun: ");
    // logger.info(`Account Name input: ${accountName}`);
    
    // const ifscCode = readlineSync.question("Masukkan IFSC Code: ");
    // logger.info(`IFSC Code input: ${ifscCode}`);
    
    // const transactionCode = readlineSync.question("Masukkan Transaction Code: ")
    // logger.info(`Transaction Code input: ${transactionCode}`);

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const transactionCode = `TEST-WD-${timestamp}`;

    // const accountName = await getRandomName();
    // const bankAccountNumber = 111111;
    const userID = randomInt(100);
    const ip = getRandomIP();

    const merchantCode = MERCHANT_CODE_INR;
    const payoutMethod = PAYOUT_METHOD_INR;
    const apiKey = MERCHANT_API_KEY_INR;
    const secretKey = SECRET_KEY_INR;

    const payload = {
        merchant_code: merchantCode,
        transaction_code: transactionCode,
        transaction_timestamp: timestamp,
        transaction_amount: amount,
        user_id: userID,
        currency_code: "INR",
        bank_account_number: 60531708910,
        ifsc_code: "MAHB0002591",
        account_name: "M K AMUSEMENTS",
        payout_code: payoutMethod,
        callback_url: CALLBACK_URL,
        ip_address: ip
    };

    logger.info(`URL: ${BASE_URL}/api/v1/payout/${merchantCode}`);
    logger.info(`Request Payload:\n${JSON.stringify(payload, null, 2)}`);

    const encryptedPayload = encryptDecryptPayout("encrypt", payload, apiKey, secretKey);
    logger.info(`Encrypted Key: ${encryptedPayload}`);

    try {
        const response = await fetch(`${BASE_URL}/api/v1/payout/${merchantCode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: encryptedPayload }),
        });

        let resultText;
        try {
            resultText = await response.text();
            const result = JSON.parse(resultText);

        if (!response.ok) {
            logger.warn(`⚠️ HTTP Error ${response.status}`);
        }
            logger.info(`Payout Response\n${JSON.stringify(result, null, 2)}`);
            logger.info(`Response Status: ${response.status}`);
        } catch (parseErr) {
            logger.error("❌ Gagal parsing JSON response");
            logger.error("Raw response:\n" + resultText);
            logger.error("Error detail: " + parseErr.message);
        }
    } catch (error) {
        logger.error("❌ Payout Error: " + error.message);
    }

    logger.info("======== REQUEST DONE ========\n\n");
}

sendPayout();
