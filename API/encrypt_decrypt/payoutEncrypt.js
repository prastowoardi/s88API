import fetch from "node-fetch";
import { randomInt } from "crypto";
import readlineSync from "readline-sync";
import { encryptDecrypt, encryptDecryptPayout, getRandomName } from "../helpers/utils.js";
import { SECRET_KEY_INR, SECRET_KEY_VND, PAYOUT_METHOD_INR, PAYOUT_METHOD_VND, MERCHANT_CODE_INR, MERCHANT_CODE_VND, MERCHANT_API_KEY_INR, MERCHANT_API_KEY_VND, CALLBACK_URL } from "../Config/config.js";
import { getRandomIFSC } from "../helpers/payoutHelper.js";

async function payoutEncrypt() {
    console.log("\n=== ENCRYPT/DECRYPT ===");

    const userID = randomInt(100, 999);
    
    const currency = readlineSync.question("Masukkan Currency (INR/VND): ").toUpperCase();
    const amount = readlineSync.question("Masukkan Amount: ");

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const transactionCode = `TEST-WD-${timestamp}`;
    
    let merchantCode, payoutMethod, payload, secretKey, apiKey;

    if (currency === "INR") {
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
            ifsc_code: await getRandomIFSC(currency),
            account_name: await getRandomName(),
            payout_code: payoutMethod,
            CALLBACK_URL
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
            account_name: await getRandomName(),
            payout_code: payoutMethod,
        };
    } else {
        console.error("❌ Currency not supported!");
        return;
    }

    console.log("\n📜 Request Payload:", JSON.stringify(payload, null, 2));

    const encryptedPayload = encryptDecryptPayout("encrypt", payload, apiKey, secretKey);
    console.log(`\n🔑 Encrypted Payload:`, encryptedPayload);

    const decryptedPayload = encryptDecrypt("decrypt", encryptedPayload, apiKey, secretKey);
    console.log("\n🔓 Decrypted Payload:", decryptedPayload);

    console.log(`\n======================================== DONE ======================================== `);
}

payoutEncrypt();
