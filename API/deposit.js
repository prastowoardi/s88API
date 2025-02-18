import fetch from "node-fetch"; 
import readlineSync from "readline-sync";
import { randomInt } from "crypto";
import { encryptData } from "../API/utils.js";
import { BASE_URL, SECRET_KEY_INR, SECRET_KEY_VND, DEPOSIT_METHOD_INR, DEPOSIT_METHOD_VND, MERCHANT_CODE_INR, MERCHANT_CODE_VND} from "../API/Config/config.js";

async function sendDeposit() {
    console.log("\n=== DEPOSIT REQUEST ===");

    const userID = randomInt(100, 999); 

    const amount = readlineSync.question("Masukkan Amount: ");
    const currency = readlineSync.question("Masukkan Currency (INR/VND): ").toUpperCase();

    let merchantCode, depositMethod, secretKey;
    if (currency === "INR") {
        merchantCode = MERCHANT_CODE_INR;
        depositMethod = DEPOSIT_METHOD_INR;
        secretKey = SECRET_KEY_INR;
    } else if (currency === "VND") {
        merchantCode = MERCHANT_CODE_VND;
        depositMethod = DEPOSIT_METHOD_VND;
        secretKey = SECRET_KEY_VND;
    } else {
        console.log("Please check merchant code or deposit method!");
        return;
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const transactionCode = `TEST-DP-${timestamp}`;

    const payload = {
        merchant_code: merchantCode,
        transaction_code: transactionCode,
        transaction_timestamp: timestamp,
        transaction_amount: amount,
        user_id: userID.toString(),
        currency_code: currency,
        deposit_method: depositMethod
    };

    const encryptedPayload = encryptData(payload, secretKey);

    try {
        const response = await fetch(`${BASE_URL}/api/${merchantCode}/v3/dopayment`, { //?key=${encryptedPayload}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: encryptedPayload })
        });

        if (!response.ok) {
            console.log(`Response body: ${await response.text()}`);
            console.log(merchantCode)
            console.log(secretKey)
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
