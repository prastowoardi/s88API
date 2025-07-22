import fetch from "node-fetch";
import readlineSync from "readline-sync";
import logger from "../../logger.js";
import dotenv from "dotenv";
import { encryptDecrypt, getRandomIP } from "../../helpers/utils.js";
import { randomPhoneNumber, randomMyanmarPhoneNumber, generateUTR, randomAmount } from "../../helpers/depositHelper.js";
import { getCurrencyConfig } from "../../helpers/depositConfigMap.js";

dotenv.config();

let lastTransactionNumber = 0;

function generateTransactionCodes(count) {
    if (lastTransactionNumber === 0) {
        lastTransactionNumber = Math.floor(Date.now() / 1000);
    }

    const codes = [];
    for (let i = 0; i < count; i++) {
        lastTransactionNumber++;
        codes.push(`TEST-DP-${lastTransactionNumber}`);
    }
    return codes;
}

async function submitUTR(currency, transactionCode, config) {
    const utrPayload = `transaction_code=${transactionCode}&utr=${generateUTR(currency)}`;
    const encryptedUTR = encryptDecrypt("encrypt", utrPayload, config.merchantAPI, config.secretKey);

    try {
    const response = await fetch(`${config.BASE_URL}/api/${config.merchantCode}/v3/submit-utr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: encryptedUTR })
    });
        const result = await response.text();
        logger.info(`🔄 Submit UTR Result (${transactionCode}): ${result}`);
    } catch (err) {
        logger.error(`❌ Submit UTR Error (${transactionCode}):`, err);
    }
}

async function createDepositV2({ currency, amount, transactionCode }) {
    const config = getCurrencyConfig(currency);
    const userID = Math.floor(Math.random() * 900) + 100;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const ip = getRandomIP();

    let bankCode = "";
    let phone = "";

    if (config.requiresBankCode) {
        bankCode = readlineSync.question("Masukkan Bank Code: ");
        if (!/^[a-z0-9]+$/.test(bankCode)) {
            console.error("❌ Bank Code harus berupa huruf/angka.");
            rl.close();
            return;
        }
    } else if (config.bankCodeOptions) {
        bankCode = config.bankCodeOptions[Math.floor(Math.random() * config.bankCodeOptions.length)];
    }

    if (currency === "MMK" && bankCode === "wavepay") {
        phone = randomMyanmarPhoneNumber();
    }

    if (currency === "BDT") {
        phone = randomPhoneNumber("bdt");
    }

    let payload =
        `merchant_api_key=${config.merchantAPI}` +
        `&merchant_code=${config.merchantCode}` +
        `&transaction_code=${transactionCode}` +
        `&transaction_timestamp=${timestamp}` +
        `&transaction_amount=${amount}` +
        `&user_id=${userID}` +
        `&currency_code=${currency}` +
        `&payment_code=${config.depositMethod}` +
        `&callback_url=${config.callbackURL}` +
        `&ip_address=${ip}`;

    if (bankCode) payload += `&bank_code=${bankCode}`;
    if (phone) payload += `&phone=${phone}`;
    // if (currency === "VND") payload += "&random_bank_code=OBT";

    const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);

    logger.info(`🔗 PayURL (${currency}): ${config.BASE_URL}/${config.merchantCode}/v2/dopayment?key=${encrypted}`);

    try {
        const response = await fetch(`${config.BASE_URL}/api/${config.merchantCode}/v2/dopayment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: encrypted })
        });

        const result = await response.json();

        if (result.status === "success") {
            const transactionNo = result.transaction_no;
            if (["INR", "BDT"].includes(currency)) {
                await submitUTR(currency, transactionCode, config);
            }
            logger.info(`✅ ${transactionNo} | Amount: ${amount} (${currency})| Success: ${result.message}\n`);
        } else {
            logger.error(`❌ ${transactionCode} | Failed: ${JSON.stringify(result)}\n`);
            logger.info(`Payload: ${payload}`);
        }
    } catch (err) {
        logger.error(`❌ Deposit Error (${transactionCode}): ${err.message}\n`);
    }
}

async function batchDepositV2() {
    logger.info("======== Batch Deposit Request ========");
    const availableCurrencies = ["INR", "BDT", "VND", "MMK"];
    const input = readlineSync.question(`Pilih currency (${availableCurrencies.join("/")}, atau 'ALL'): `).toUpperCase();

    let currenciesToProcess = [];

    if (input === "ALL") {
        currenciesToProcess = availableCurrencies;
    } else if (availableCurrencies.includes(input)) {
        currenciesToProcess = [input];
    } else {
        logger.error("❌ Currency tidak valid.");
        return;
    }

    const jumlah = readlineSync.questionInt("Berapa Transaksi: ");
    
    let min, max, fixedAmount;
    if (jumlah === 1) {
        fixedAmount = readlineSync.questionInt("Masukkan amount: ");
    } else {
        min = readlineSync.questionInt("Masukkan minimum amount: ");
        max = readlineSync.questionInt("Masukkan maximum amount: ");
    }

    for (const currency of currenciesToProcess) {
        const transactionCodes = generateTransactionCodes(jumlah);
        for (const transactionCode of transactionCodes) {
            const amount = jumlah === 1 ? fixedAmount : randomAmount(min, max);
            await createDepositV2({ currency, amount, transactionCode });
        }
    }

    logger.info("======== BATCH REQUEST DONE ========\n\n");
}

batchDepositV2();
