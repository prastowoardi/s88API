import fetch from "node-fetch";
import readlineSync from "readline-sync";
import { randomInt } from "crypto";
import { encryptDecrypt } from "../API/utils.js";
import {
    BASE_URL, SECRET_KEY_INR, SECRET_KEY_VND, SECRET_KEY_BDT, SECRET_KEY_MMK, SECRET_KEY_PMI,
    DEPOSIT_METHOD_INR, DEPOSIT_METHOD_VND, DEPOSIT_METHOD_BDT, DEPOSIT_METHOD_MMK, DEPOSIT_METHOD_PMI,
    MERCHANT_CODE_INR, MERCHANT_CODE_VND, MERCHANT_CODE_BDT, MERCHANT_CODE_MMK, MERCHANT_CODE_PMI,
    MERCHANT_API_KEY_INR, MERCHANT_API_KEY_VND, MERCHANT_API_KEY_BDT, MERCHANT_API_KEY_MMK, MERCHANT_API_KEY_PMI
} from "../API/Config/config.js";

function randomPhoneNumber() {
    const prefixes = ['017', '018', '019', '016', '015'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const number = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    return prefix + number;
}

async function submitUTR(currency, transactionCode) {
    console.log("\n=== SUBMIT UTR REQUEST ===");

    if (!["INR", "BDT"].includes(currency)) {
        console.error("❌ Submit UTR hanya tersedia untuk INR & BDT.");
        return;
    }

    const utr = readlineSync.question("Masukkan UTR: ");

    if (currency === "INR" && !/^\d{12}$/.test(utr)) {
        console.error("❌ UTR untuk INR harus berupa 12 digit angka.");
        return;
    }

    const config = currency === "INR"
        ? { merchantCode: MERCHANT_CODE_INR, secretKey: SECRET_KEY_INR, merchantAPI: MERCHANT_API_KEY_INR }
        : { merchantCode: MERCHANT_CODE_BDT, secretKey: SECRET_KEY_BDT, merchantAPI: MERCHANT_API_KEY_BDT };

    const payloadString = `transaction_code=${transactionCode}&utr=${utr}`;
    const encryptedPayload = encryptDecrypt("encrypt", payloadString, config.merchantAPI, config.secretKey);

    try {
        const response = await fetch(`${BASE_URL}/api/${config.merchantCode}/v3/submit-utr`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: encryptedPayload })
        });

        const responseText = await response.text();
        if (!response.ok) {
            console.error("❌ HTTP Error:", response.status);
            console.log("Response:", responseText);
            return;
        }

        const result = JSON.parse(responseText);
        console.log("\n✅ Submit UTR Response:", result);
    } catch (err) {
        console.error("\n❌ Submit UTR Error:", err);
    }
}

async function sendDeposit() {
    console.log("\n=== DEPOSIT REQUEST ===");

    const userID = randomInt(100, 999);
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const currency = readlineSync.question("Masukkan Currency (INR/VND/BDT/MMK/PMI): ").toUpperCase();
    const amount = readlineSync.question("Masukkan Amount: ");

    if (!["INR", "VND", "BDT", "MMK", "PMI"].includes(currency)) {
        console.error("❌ Invalid currency. Masukkan INR, VND, BDT, MMK, atau PMI.");
        return;
    }

    if (isNaN(amount) || Number(amount) <= 0) {
        console.error("❌ Amount harus berupa angka lebih dari 0.");
        return;
    }

    const transactionCode = `TEST-DP-${timestamp}`;

    const currencyConfig = {
        INR: {
            merchantCode: MERCHANT_CODE_INR,
            depositMethod: DEPOSIT_METHOD_INR,
            secretKey: SECRET_KEY_INR,
            merchantAPI: MERCHANT_API_KEY_INR
        },
        VND: {
            merchantCode: MERCHANT_CODE_VND,
            depositMethod: DEPOSIT_METHOD_VND,
            secretKey: SECRET_KEY_VND,
            merchantAPI: MERCHANT_API_KEY_VND,
            requiresBankCode: true
        },
        BDT: {
            merchantCode: MERCHANT_CODE_BDT,
            depositMethod: DEPOSIT_METHOD_BDT,
            secretKey: SECRET_KEY_BDT,
            merchantAPI: MERCHANT_API_KEY_BDT,
            bankCodeOptions: ["1002", "1001", "1004", "1003"]
        },
        MMK: {
            merchantCode: MERCHANT_CODE_MMK,
            depositMethod: DEPOSIT_METHOD_MMK,
            secretKey: SECRET_KEY_MMK,
            merchantAPI: MERCHANT_API_KEY_MMK,
            requiresBankCode: true
        },
        PMI: {
            merchantCode: MERCHANT_CODE_PMI,
            depositMethod: DEPOSIT_METHOD_PMI,
            secretKey: SECRET_KEY_PMI,
            merchantAPI: MERCHANT_API_KEY_PMI,
            callbackURL: "https://webhook-test.com/edc022bb3b18610530dc7f70c799af79"
        }
    };

    const config = currencyConfig[currency];
    let bankCode = "";
    let phone = "";

    if (config.requiresBankCode) {
        bankCode = readlineSync.question("Masukkan Bank Code: ").toLowerCase();
        if (!/^[a-z0-9]+$/.test(bankCode)) {
            console.error("❌ Bank Code harus berupa huruf/angka.");
            return;
        }
    } else if (config.bankCodeOptions) {
        bankCode = config.bankCodeOptions[Math.floor(Math.random() * config.bankCodeOptions.length)];
    }

    if (currency === "BDT") {
        phone = randomPhoneNumber();
    }

    if (currency === "PMI") {
        const payload = {
            invoice_id: transactionCode,
            amount: amount,
            currency: "INR",
            payment_method: config.depositMethod,
            callback_url: config.callbackURL
        };

        const headers = {
            "Content-Type": "application/json",
            "Authorization": "Basic Rno4RjdmcE9BdlY4SnlVWTpCNTI2RklidXVITVkxMVdD"
        };

        try {
            const response = await fetch("https://dev.octo88.co/transaction/deposit", {
                method: "POST",
                headers,
                body: JSON.stringify(payload)
            });

            const responseText = await response.text();
            const parsed = JSON.parse(responseText.replace(/\\"/g, '"'));

            console.log("Response Status: ", response.status);
            console.log("\n✅ PMI Deposit Response:", JSON.stringify(parsed, null, 2));
        } catch (err) {
            console.error("\n❌ PMI Deposit Error:", err);
        }
    } else {
        let payload = `merchant_api_key=${config.merchantAPI}&merchant_code=${config.merchantCode}&transaction_code=${transactionCode}&transaction_timestamp=${timestamp}&transaction_amount=${amount}&user_id=${userID}&currency_code=${currency}&payment_code=${config.depositMethod}`;

        if (bankCode) payload += `&bank_code=${bankCode}`;
        if (phone) payload += `&phone=${phone}`;

        const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);
        const decrypted = encryptDecrypt("decrypt", encrypted, config.merchantAPI, config.secretKey);

        console.log("\n🔗 Request Payload:", payload);
        console.log("\n🔐 Encrypted:", encrypted);
        // console.log("\n🔓 Decrypted:", decrypted);

        try {
            const response = await fetch(`${BASE_URL}/api/${config.merchantCode}/v3/dopayment`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: encrypted })
            });

            const responseBody = await response.text();

            if (!response.ok) {
                console.log("❌ HTTP Error:", response.status);
                console.log("Response:", responseBody);
                return;
            }

            const resultDP = JSON.parse(responseBody);
            console.log("\n✅ Deposit Response:", JSON.stringify(resultDP, null, 2));

            if (["INR", "BDT"].includes(currency)) {
                await submitUTR(currency, transactionCode);
            }
        } catch (err) {
            console.error("\n❌ Deposit Error:", err);
        }
    }
}

sendDeposit();
