import fetch from "node-fetch"; 
import readlineSync from "readline-sync";
import { randomInt } from "crypto";
import { encryptData, decryptData } from "../API/utils.js";
import { BASE_URL, SECRET_KEY_INR, SECRET_KEY_VND, PAYOUT_METHOD_INR, PAYOUT_METHOD_VND, MERCHANT_CODE_INR, MERCHANT_CODE_VND, MERCHANT_API_KEY_INR } from "../API/Config/config.js";

async function sendPayout() {
    console.log("\n=== PAYOUT REQUEST ===");

    const userID = randomInt(100, 999); 

    const currency = readlineSync.question("Masukkan Currency (INR/VND): ").toUpperCase();
    const amount = readlineSync.question("Masukkan Amount: ");
    
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const transactionCode = `TEST-WD-${timestamp}`;

    let merchantCode, payoutMethod, payload, secretKey;

    if (currency === "INR") {
        merchantCode = MERCHANT_CODE_INR;
        payoutMethod = PAYOUT_METHOD_INR;
        secretKey = SECRET_KEY_INR;
        payload = {
            merchant_code: merchantCode,
            transaction_code: transactionCode,
            transaction_timestamp: timestamp,
            transaction_amount: amount,
            user_id: userID.toString(),
            currency_code: currency,
            bank_account_number: "11133322",
            ifsc_code: "HDFC0CAACOB",
            account_name: "Johny",
            payout_code: payoutMethod,
        };
    } else if (currency === "VND") {
        merchantCode = MERCHANT_CODE_VND;
        payoutMethod = PAYOUT_METHOD_VND;
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
            account_name: "BUI THOA HOA",
            payout_code: payoutMethod, 
        };
    } else {
        console.error("Currency not supported!");
        return;
    }

    const encryptedPayload = encryptData(payload, currency === "INR" ? SECRET_KEY_INR : SECRET_KEY_VND);
    const decryptedPayload = decryptData(encryptedPayload, secretKey);

    try {
        const response = await fetch(`${BASE_URL}/api/v1/payout/${merchantCode}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: encryptedPayload })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.log(`\nEncrypted Key: ${encryptedPayload}`);
            console.log(`\nDecrypted Key: ${JSON.stringify(decryptedPayload, null, 2)}`);
            console.error(`\nError response body: ${errorText}`);
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const result = await response.json();
        console.log("\nPayout Response:", result);
    } catch (error) {
        console.error("\nPayout Error:", error);
    }
}

sendPayout();
