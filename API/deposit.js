import fetch from "node-fetch";
import readlineSync from "readline-sync";
import { randomInt } from "crypto";
import { encryptData, decryptData } from "../API/utils.js"; 
import { BASE_URL, SECRET_KEY_INR, SECRET_KEY_VND, DEPOSIT_METHOD_INR, DEPOSIT_METHOD_VND, MERCHANT_CODE_INR, MERCHANT_CODE_VND, MERCHANT_API_KEY_INR, MERCHANT_API_KEY_VND } from "../API/Config/config.js";

async function sendDeposit() {
    console.log("\n=== DEPOSIT REQUEST ===");

    const userID = randomInt(100, 999); 

    const currency = readlineSync.question("Masukkan Currency (INR/VND): ").toUpperCase();
    const amount = readlineSync.question("Masukkan Amount: ");

    let merchantCode, depositMethod, secretKey, merchantAPI, randomBankCode;

    if (currency === "INR") {
        merchantCode = MERCHANT_CODE_INR;
        depositMethod = DEPOSIT_METHOD_INR;
        secretKey = SECRET_KEY_INR;
        merchantAPI = MERCHANT_API_KEY_INR;
    } else if (currency === "VND") {
        merchantCode = MERCHANT_CODE_VND;
        depositMethod = DEPOSIT_METHOD_VND;
        secretKey = SECRET_KEY_VND;
        merchantAPI = MERCHANT_API_KEY_VND;
        randomBankCode = "OBT";
    } else {
        console.error("Please check merchant code or deposit method!");
        return;
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const transactionCode = `TEST-DP-${timestamp}`;

    let payloadString = `merchant_api_key=${merchantAPI}&merchant_code=${merchantCode}&transaction_code=${transactionCode}&transaction_timestamp=${timestamp}&transaction_amount=${amount}&user_id=${userID}&currency_code=${currency}&payment_code=${depositMethod}`;

    if (randomBankCode) {
        payloadString += `&random_bank_code=${randomBankCode}`;
    }

    const encryptedPayload = encryptData(payloadString, secretKey);
    const decryptedPayload = decryptData(encryptedPayload, secretKey);

    try {
        const response = await fetch(`${BASE_URL}/api/${merchantCode}/v3/dopayment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: encryptedPayload }) 
        });

        if (!response.ok) {
            console.log(`Response body: ${await response.text()}`);
            console.log(`\nEncrypted Key: ${encryptedPayload}`);
            console.log(`\nDecrypted Key: ${JSON.stringify(decryptedPayload, null, 2)}`);
            throw new Error(`HTTP error! Status: ${response.status}`);
        }        

        const result = await response.json();
        console.log("\nDeposit Response:", result);
    } catch (error) {
        console.error("\nDeposit Error:", error);
        if (error instanceof SyntaxError) {
            console.error("Received data is not valid JSON. Response body may be HTML.");
        }
    }
}

sendDeposit();
