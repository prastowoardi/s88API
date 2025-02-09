import fetch from "node-fetch"; 
import readlineSync from "readline-sync";
import { randomInt } from "crypto";
import { encryptData } from "../API/utils.js";
import { BASE_URL, MERCHANT_CODE, SECRET_KEY } from "../API/Config/config.js";

async function sendDeposit() {
    console.log("\n=== DEPOSIT REQUEST ===");

    const userID = randomInt(100, 999); 

    const amount = readlineSync.question("Masukkan Amount: ");
    const currency = readlineSync.question("Masukkan Currency (INR/VND): ").toUpperCase();
    const payoutCode = readlineSync.question("Masukkan Payment Code: ");

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const transactionCode = `TEST-DEP-${timestamp}`;

    const payload = {
        merchant_code: MERCHANT_CODE,
        transaction_code: transactionCode,
        transaction_timestamp: timestamp,
        transaction_amount: amount,
        user_id: userID.toString(),
        currency_code: currency,
        payout_code: payoutCode
    };

    const encryptedPayload = encryptData(payload, SECRET_KEY);

    try {
        const response = await fetch(`${BASE_URL}/deposit/${MERCHANT_CODE}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: encryptedPayload })
        });

        if (!response.ok) {
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

// Jalankan fungsi deposit
sendDeposit();
