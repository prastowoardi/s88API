import fetch from "node-fetch";
import readlineSync from "readline-sync";
import { randomInt } from "crypto";
import { encryptDecryptPayout } from "../API/utils.js";
import { BASE_URL, SECRET_KEY_INR, PAYOUT_METHOD_INR, MERCHANT_CODE_INR, MERCHANT_API_KEY_INR } from "../API/Config/config.js";

async function sendPayout() {
    console.log("\n=== PAYOUT REQUEST ===");

    const amount = readlineSync.question("Masukkan Amount: ");
    const userID = randomInt(100, 999).toString();
    
    const bankAccountNumber = readlineSync.question("Masukkan Nomor Rekening: ");
    const accountName = readlineSync.question("Masukkan Nama Akun: ");
    const ifscCode = readlineSync.question("Masukkan IFSC Code: ");
    
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const transactionCode = `TEST-WD-${timestamp}`;

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
        bank_account_number: bankAccountNumber,
        ifsc_code: ifscCode,
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

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`\n❌ Error response body: ${errorText}`);
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const result = await response.json();
        console.log("\nPayout Response:", result);
        console.log("\n⚡️Response Status: ", response.status)
    } catch (error) {
        console.error("\n❌ Payout Error:", error.message);
    }
}

sendPayout();
