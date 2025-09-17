import fetch from "node-fetch";
import { randomInt } from "crypto";
import readlineSync from "readline-sync";
import { encryptDecrypt, encryptDecryptPayout, getRandomName } from "../helpers/utils.js";
import { getPayoutConfig } from "../helpers/payoutConfigMap.js";
import { getRandomIFSC } from "../helpers/payoutHelper.js";

async function payoutEncrypt() {
    console.log("\n=== ENCRYPT/DECRYPT ===");

    const userID = randomInt(100, 999);
    
    const currency = readlineSync.question("Masukkan Currency (INR/VND): ").toUpperCase();
    const amount = readlineSync.question("Masukkan Amount: ");

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const transactionCode = `TEST-WD-${timestamp}`;
    
    const config = getPayoutConfig(currency);
    if (!config) {
        throw new Error(`❌ Configuration not found for currency: ${currency}`);
    }

    let payload;

    if (currency === "INR") {
        payload = {
            merchant_code: config.merchantCode,
            transaction_code: transactionCode,
            transaction_timestamp: timestamp,
            transaction_amount: amount,
            user_id: userID.toString(),
            currency_code: currency,
            bank_account_number: "11133322",
            ifsc_code: await getRandomIFSC(currency),
            account_name: await getRandomName(),
            payout_code: config.payoutMethod,
            callback_url: config.callbackURL
        };
    } else if (currency === "VND") {;
        payload = {
            merchant_code: config.merchantCode,
            transaction_code: transactionCode,
            transaction_timestamp: timestamp,
            transaction_amount: amount,
            user_id: userID.toString(),
            currency_code: currency,
            bank_account_number: "2206491508",
            bank_code: "970418",
            account_name: await getRandomName(),
            payout_code: config.payoutMethod,
        };
    } else {
        console.error("❌ Currency not supported!");
        return;
    }

    console.log("\n📜 Request Payload:", JSON.stringify(payload, null, 2));

    const encryptedPayload = encryptDecryptPayout("encrypt", payload, config.apiKey, config.secretKey);
    console.log(`\n🔑 Encrypted Payload:`, encryptedPayload);

    const decryptedPayload = encryptDecrypt("decrypt", encryptedPayload, config.apiKey, config.secretKey);
    console.log("\n🔓 Decrypted Payload:", decryptedPayload);

    console.log(`\n======================================== DONE ======================================== `);
}

payoutEncrypt();
