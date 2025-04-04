import fetch from "node-fetch";
import readlineSync from "readline-sync";
import { randomInt } from "crypto";
import { encryptDecrypt } from "../API/utils.js";
import { BASE_URL, SECRET_KEY_INR, SECRET_KEY_VND, SECRET_KEY_BDT, SECRET_KEY_PMI,
    DEPOSIT_METHOD_INR, DEPOSIT_METHOD_VND, DEPOSIT_METHOD_BDT, DEPOSIT_METHOD_PMI, 
    MERCHANT_CODE_INR, MERCHANT_CODE_VND, MERCHANT_CODE_BDT, MERCHANT_CODE_PMI, 
    MERCHANT_API_KEY_INR, MERCHANT_API_KEY_VND, MERCHANT_API_KEY_BDT, MERCHANT_API_KEY_PMI 
} from "../API/Config/config.js";

function randomPhoneNumber() {
    const prefixes = ['017', '018', '019', '016', '015'];
    const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const randomNumber = Math.floor(Math.random() * 100000000);
    return randomPrefix + randomNumber.toString().padStart(6, '0');
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

    const { merchantCode, secretKey, merchantAPI } = config;

    const payloadString = `transaction_code=${transactionCode}&utr=${utr}`;
    const encryptedPayload = encryptDecrypt("encrypt", payloadString, merchantAPI, secretKey);

    try {
        const response = await fetch(`${BASE_URL}/api/${merchantCode}/v3/submit-utr`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: encryptedPayload })
        });

        if (!response.ok) {
            console.log(`Response body: ${await response.text()}`);
            throw new Error(`❌ HTTP error! Status: ${response.status}`);
        }

        const result = await response.json();
        console.log("\n✅ Submit UTR Response:", result);
    } catch (error) {
        console.error("\n❌ Submit UTR Error:", error);
    }
}

const phoneNumber = randomPhoneNumber();
const timestamp = Math.floor(Date.now() / 1000).toString();

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
    },
    PMI: {
        merchantCode: MERCHANT_CODE_PMI,
        depositMethod: DEPOSIT_METHOD_PMI,
        secretKey: SECRET_KEY_PMI,
        merchantAPI: MERCHANT_API_KEY_PMI,
        invoiceID: `TEST-DP-${timestamp}`,
        callbackURL: "https://webhook-test.com/edc022bb3b18610530dc7f70c799af79",
    }
};

async function sendDeposit() {
    console.log("\n=== DEPOSIT REQUEST ===");

    const userID = randomInt(100, 999);
    const currency = readlineSync.question("Masukkan Currency (INR/VND/BDT/PMI): ").toUpperCase();
    const amount = readlineSync.question("Masukkan Amount: ");

    const config = currencyConfig[currency];

    if (!config) {
        console.error("Invalid Currency. Please enter INR, VND, BDT or PMI.");
        return;
    }

    const { merchantCode, depositMethod, secretKey, merchantAPI, bankCodeVND, bankCodeBDT, phoneNumber, invoiceID, callbackURL } = config;

    const transactionCode = `TEST-DP-${timestamp}`;

    let bankCode = "";
    if (currency === "VND") {
        bankCode = bankCodeVND[Math.floor(Math.random() * bankCodeVND.length)];
    } else if (currency === "BDT") {
        bankCode = bankCodeBDT[Math.floor(Math.random() * bankCodeBDT.length)];
    }

    if (currency === "PMI") {
        const payload = {
            invoice_id: invoiceID,
            amount: amount,
            currency: "INR",
            payment_method: depositMethod,
            callback_url: callbackURL
        };

        const paymentURL = `https://dev.octo88.co/transaction/deposit`;

        console.log(`\n🔗 URL: ${paymentURL}`);
        console.log("\nRequest Payload:", payload);
        const headers = { 
            "Content-Type": "application/json",
            "Authorization": "Basic Rno4RjdmcE9BdlY4SnlVWTpCNTI2RklidXVITVkxMVdD"
        };

        try {
            const response = await fetch(paymentURL, {
                method: "POST",
                headers: headers,
                body: JSON.stringify(payload)
            });
        
            let responseBody = await response.text();
            responseBody = responseBody.replace(/\\"/g, '"');

            const parsedResponse = JSON.parse(responseBody);
        
            console.log("Response Status: ", response.status);
            console.log("\n✅ PMI Deposit Response:");
            console.log(JSON.stringify(parsedResponse, null, 2));
        
            if (!response.ok) {
                throw new Error(`❌ HTTP error! Status: ${response.status}`);
            }
        } catch (error) {
            console.error("\n❌ Deposit Error:", error);
        }        

    } else {
        let payloadString = `merchant_api_key=${merchantAPI}&merchant_code=${merchantCode}&transaction_code=${transactionCode}&transaction_timestamp=${timestamp}&transaction_amount=${amount}&user_id=${userID}&currency_code=${currency}&payment_code=${depositMethod}`;

        if (currency === "VND" || currency === "BDT") {
            let bankCode = currency === "VND" ? bankCodeVND[Math.floor(Math.random() * bankCodeVND.length)] : bankCodeBDT[Math.floor(Math.random() * bankCodeBDT.length)];
            payloadString += `&bank_code=${bankCode}`;
        }
        if (currency === "BDT") {
            payloadString += `&phone=${phoneNumber}`
        }

        const paymentURL = `${BASE_URL}/api/${merchantCode}/v3/dopayment`;

        const encryptedPayload = encryptDecrypt("encrypt", payloadString, merchantAPI, secretKey);
        const decryptedPayload = encryptDecrypt("decrypt", encryptedPayload, merchantAPI, secretKey);

        console.log(`\n🔗 URL: ${BASE_URL}/api/${merchantCode}/v3/submit-utr`);
        try {
            const response = await fetch(paymentURL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: encryptedPayload })
            });

            let responseBody = await response.text();
            responseBody = responseBody.replace(/\\"/g, '"');

            const parseResponse = JSON.parse(responseBody);

            if (!response.ok) {
                console.log(`Response body: ${responseBody}`);
                throw new Error(`❌ HTTP error! Status: ${response.status}`);
            }

            console.log("\n✅ Deposit Response:", JSON.stringify(parseResponse, null, 2));

            if (currency === "INR" || currency === "BDT") {
                await submitUTR(currency, transactionCode);
            }

        } catch (error) {
            console.error("\n❌ Deposit Error:", error);
            if (error instanceof SyntaxError) {
                console.error("Received data is not valid JSON. Response body may be HTML.");
            }
        }
    }
}

sendDeposit();
