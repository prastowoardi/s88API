import fetch from "node-fetch";
import readlineSync from "readline-sync";
import { randomInt } from "crypto";
import { encryptDecrypt } from "../API/utils.js";
import { BASE_URL, SECRET_KEY_INR, SECRET_KEY_VND, SECRET_KEY_BDT, DEPOSIT_METHOD_INR, DEPOSIT_METHOD_VND, DEPOSIT_METHOD_BDT, MERCHANT_CODE_INR, MERCHANT_CODE_VND, MERCHANT_CODE_BDT, MERCHANT_API_KEY_INR, MERCHANT_API_KEY_VND, MERCHANT_API_KEY_BDT } from "../API/Config/config.js";

function randomPhoneNumber() {
    const prefixes = ['017', '018', '019', '016', '015'];
    const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const randomNumber = Math.floor(Math.random() * 100000000);
    return randomPrefix + randomNumber.toString().padStart(6, '0');
}
const phoneNumber = randomPhoneNumber();

const currencyConfig = {
    INR: {
        merchantCode: MERCHANT_CODE_INR,
        depositMethod: DEPOSIT_METHOD_INR,
        secretKey: SECRET_KEY_INR,
        merchantAPI: MERCHANT_API_KEY_INR,
    },
    VND: {
        merchantCode: MERCHANT_CODE_VND,
        depositMethod: DEPOSIT_METHOD_VND,
        secretKey: SECRET_KEY_VND,
        merchantAPI: MERCHANT_API_KEY_VND,
        bankCodeVND: ["acbbank", "mbbank", "tpbank", "vietinbank", "vietcombank", "bidv"]
    },
    BDT: {
        merchantCode: MERCHANT_CODE_BDT,
        depositMethod: DEPOSIT_METHOD_BDT,
        secretKey: SECRET_KEY_BDT,
        merchantAPI: MERCHANT_API_KEY_BDT,
        bankCodeBDT: ["1002", "1001", "1004", "1003"],
        phoneNumber: phoneNumber
    }
};

async function sendDeposit() {
    console.log("\n=== DEPOSIT REQUEST ===");

    const userID = randomInt(100, 999);
    const currency = readlineSync.question("Masukkan Currency (INR/VND/BDT): ").toUpperCase();
    const amount = readlineSync.question("Masukkan Amount: ");

    const config = currencyConfig[currency];

    if (!config) {
        console.error("Invalid Currency. Please enter INR or VND.");
        return;
    }

    const { merchantCode, depositMethod, secretKey, merchantAPI, bankCodeVND, bankCodeBDT, phoneNumber } = config;

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const transactionCode = `TEST-DP-${timestamp}`;

    let bankCode = "";
    switch (currency) {
        case "VND":
            bankCode = bankCodeVND[Math.floor(Math.random() * bankCodeVND.length)];
            break;
        case "BDT":
            bankCode = bankCodeBDT[Math.floor(Math.random() * bankCodeBDT.length)];
            break;
    }
    
    let payloadString = `merchant_api_key=${merchantAPI}&merchant_code=${merchantCode}&transaction_code=${transactionCode}&transaction_timestamp=${timestamp}&transaction_amount=${amount}&user_id=${userID}&currency_code=${currency}&payment_code=${depositMethod}`;

    if (currency === "VND" || currency === "BDT" && bankCode) {
        payloadString += `&bank_code=${bankCode}`;
    }
    if (currency === "BDT") {
        payloadString += `&phone=${phoneNumber}`
    }

    console.log(`\n🔗 Base URL: ${BASE_URL}/api/v1/payout/${merchantCode}`);

    const encryptedPayload = encryptDecrypt("encrypt", payloadString, merchantAPI, secretKey);
    const decryptedPayload = encryptDecrypt("decrypt", encryptedPayload, merchantAPI, secretKey);

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
            throw new Error(`❌ HTTP error! Status: ${response.status}`);
        }

        const result = await response.json();
        console.log("\nDeposit Response:", result);
    } catch (error) {
        console.error("\n❌ Deposit Error:", error);
        if (error instanceof SyntaxError) {
            console.error("Received data is not valid JSON. Response body may be HTML.");
        }
    }
}

export { sendDeposit };

sendDeposit();
