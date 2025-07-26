import fetch from "node-fetch";
import readlineSync from "readline-sync";
import logger from "../../logger.js";
import { randomInt } from "crypto";
import { encryptDecryptPayout, getRandomIP } from "../../helpers/utils.js";
import { BASE_URL, SECRET_KEY_VND, PAYOUT_METHOD_VND, MERCHANT_CODE_VND, MERCHANT_API_KEY_VND } from "../Config/config.js";
import { getRandomName } from "../../helpers/payoutHelper.js";

async function sendPayout() {
    logger.info("=== VND - PAYOUT REQUEST ===");

    const amount = readlineSync.question("Masukkan Amount: ");
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

    const bankCode = readlineSync.question("Masukkan Bank Code: ");
    logger.info(`Bank Code Input: ${bankCode}`);

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const transactionCode = `TEST-WD-${timestamp}`;

    const accountName = await getRandomName();
    const bankAccountNumber = 111111;
    const userID = randomInt(100);

    const merchantCode = MERCHANT_CODE_VND;
    const payoutMethod = PAYOUT_METHOD_VND;
    const apiKey = MERCHANT_API_KEY_VND;
    const secretKey = SECRET_KEY_VND;
    const ip = getRandomIP();

    const payload = {
        merchant_code: merchantCode,
        transaction_code: transactionCode,
        transaction_timestamp: timestamp,
        transaction_amount: amount,
        user_id: userID,
        currency_code: "VND",
        bank_account_number: bankAccountNumber,
        bank_code: bankCode,
        account_name: accountName,
        payout_code: payoutMethod,
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
            logger.info(`Payout Response ${JSON.stringify(result, null, 2)}`);
            logger.info(`Response Status: ${response.status}`);
        } catch (parseErr) {
            logger.error("❌ Gagal parsing JSON response");
            logger.error("Raw response:\n" + resultText);
            logger.error("Error detail: " + parseErr.message);
        }
    } catch (error) {
        console.error("❌ Payout Error:", error.message);
    }

    logger.info("======== REQUEST DONE ========\n\n");
}

sendPayout();
