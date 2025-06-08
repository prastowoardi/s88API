import fetch from "node-fetch";
import readlineSync from "readline-sync";
import { randomInt } from "crypto";
import { encryptDecryptPayout } from "../helpers/utils.js";
import { BASE_URL, SECRET_KEY_VND, PAYOUT_METHOD_VND, MERCHANT_CODE_VND, MERCHANT_API_KEY_VND } from "../Config/config.js";
import { getRandomName, } from "../helpers/payoutHelper.js";

async function sendPayout() {
    console.log("\n=== VND - PAYOUT REQUEST ===");

    const amount = readlineSync.question("Masukkan Amount: ");
    if (isNaN(amount) || Number(amount) <= 0) {
        console.error("❌ Amount tidak valid.");
        return;
    }

    // Input semua data
    // const userID = readlineSync.question("Masukkan User ID: ");
    // const bankAccountNumber = readlineSync.question("Masukkan Nomor Rekening: ");
    // const accountName = readlineSync.question("Masukkan Nama Akun: ");
    const bankCode = readlineSync.question("Masukkan Bank Code: ");
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const transactionCode = `TEST-WD-${timestamp}`;
    
    // Input transaction code
    const accountName = await getRandomName();
    const bankAccountNumber = 111111;
    const userID = randomInt(100);
    // const transactionCode = readlineSync.question("Masukkan Transaction Code: ")


    const merchantCode = MERCHANT_CODE_VND;
    const payoutMethod = PAYOUT_METHOD_VND;
    const apiKey = MERCHANT_API_KEY_VND;
    const secretKey = SECRET_KEY_VND;

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
    };

    console.log(`\n🔗 URL: ${BASE_URL}/api/v1/payout/${merchantCode}`);
    console.log("\n📜 Request Payload:", JSON.stringify(payload, null, 2));

    const encryptedPayload = encryptDecryptPayout("encrypt", payload, apiKey, secretKey);
    console.log(`\n🔑 Encrypted Key:`, encryptedPayload);

    try {
        const response = await fetch(`${BASE_URL}/api/v1/payout/${merchantCode}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: encryptedPayload }),
        });

        const result = await response.json();
        console.log("\n📥 Payout Response:", result);
        console.log("\n⚡️Response Status: ", response.status);
    } catch (error) {
        console.error("\n❌ Payout Error:", error.message);
    }
}

sendPayout();
