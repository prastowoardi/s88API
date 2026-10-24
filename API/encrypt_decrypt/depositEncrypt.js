import { randomInt } from "crypto";
import { ask } from "../helpers/cli.js";
import { encryptDecrypt } from "../helpers/utils.js";
import { getCurrencyConfig } from "../helpers/depositConfigMap.js";

async function depositEncrypt() {
    console.log("\n=== DEPOSIT ENCRYPTION/DECRYPTION ===");

    const userID = randomInt(100, 999);
    const currency = (await ask("Masukkan Currency (INR/VND/BDT): ")).toUpperCase();
    const amount = await ask("Masukkan Amount: ");

    const config = getCurrencyConfig(currency);

    if (!config) {
        console.error("❌ Invalid Currency. Please enter INR, VND, or BDT.");
        return;
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const transactionCode = `TEST-DP-${timestamp}`;

    let bankCode = "";
    if (currency === "VND" || currency === "BDT") {
        bankCode = (await ask("Masukkan Bank Code: ")).trim();
        if (!bankCode) {
            console.error("❌ Bank code wajib diisi untuk currency VND/BDT.");
            return;
        }
    }

    let payloadString = `merchant_api_key=${config.merchantAPI}&merchant_code=${config.merchantCode}&transaction_code=${transactionCode}&transaction_timestamp=${timestamp}&transaction_amount=${amount}&user_id=${userID}&currency_code=${currency}&payment_code=${config.depositMethod}`;

    if (currency === "VND" || currency === "BDT") {
        payloadString += `&bank_code=${bankCode}`;
    }

    console.log("\n📜 Payload String:", payloadString);

    const encryptedPayload = encryptDecrypt("encrypt", payloadString, config.merchantAPI, config.secretKey);
    console.log(`\n🔑 Encrypted Payload:`, encryptedPayload);

    console.log(`\n========================================== DONE ========================================== `);
}

depositEncrypt();
