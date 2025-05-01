import { randomInt } from "crypto";
import readlineSync from "readline-sync";
import { encryptDecrypt } from "../helpers/utils.js";
import { SECRET_KEY_INR, SECRET_KEY_VND, SECRET_KEY_BDT, DEPOSIT_METHOD_INR, DEPOSIT_METHOD_VND, DEPOSIT_METHOD_BDT, 
          MERCHANT_CODE_INR, MERCHANT_CODE_VND, MERCHANT_CODE_BDT, 
          MERCHANT_API_KEY_INR, MERCHANT_API_KEY_VND, MERCHANT_API_KEY_BDT } from "../Config/config.js";

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
    }
};

async function depositEncrypt() {
    console.log("\n=== DEPOSIT ENCRYPTION/DECRYPTION ===");

    const userID = randomInt(100, 999);
    const currency = readlineSync.question("Masukkan Currency (INR/VND/BDT): ").toUpperCase();
    const amount = readlineSync.question("Masukkan Amount: ");

    const config = currencyConfig[currency];

    if (!config) {
        console.error("❌ Invalid Currency. Please enter INR, VND, or BDT.");
        return;
    }

    const { merchantCode, depositMethod, secretKey, merchantAPI, bankCodeVND, bankCodeBDT } = config;

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const transactionCode = `TEST-DP-${timestamp}`;

    let bankCode = "";
    if (currency === "VND") {
        bankCode = bankCodeVND[Math.floor(Math.random() * bankCodeVND.length)];
    } else if (currency === "BDT") {
        bankCode = bankCodeBDT[Math.floor(Math.random() * bankCodeBDT.length)];
    }

    let payloadString = `merchant_api_key=${merchantAPI}&merchant_code=${merchantCode}&transaction_code=${transactionCode}&transaction_timestamp=${timestamp}&transaction_amount=${amount}&user_id=${userID}&currency_code=${currency}&payment_code=${depositMethod}`;

    if (currency === "VND" || currency === "BDT") {
        payloadString += `&bank_code=${bankCode}`;
    }

    console.log("\n📜 Payload String:", payloadString);

    const encryptedPayload = encryptDecrypt("encrypt", payloadString, merchantAPI, secretKey);
    console.log(`\n🔑 Encrypted Payload:`, encryptedPayload);

    console.log(`\n==================================================== DONE ============================================================== `);
}

depositEncrypt();
