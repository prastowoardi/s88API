import fetch from "node-fetch";
import readline from "readline";
import logger from "../../logger.js";
import { randomInt } from "crypto";
import { encryptDecrypt, getRandomIP } from "../../helpers/utils.js";
import { generateUTR, randomPhoneNumber, randomMyanmarPhoneNumber } from "../../helpers/depositHelper.js";
import { getCurrencyConfig } from "../../helpers/depositConfigMap.js";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function ask(question) {
  return new Promise(resolve => rl.question(question, answer => resolve(answer)));
}

async function submitUTR(currency, transactionCode) {
    if (!["INR", "BDT"].includes(currency)) {
        logger.error("❌ Submit UTR hanya tersedia untuk INR & BDT.");
        return;
    }

    const utr = generateUTR(currency);
    logger.info(`✅ UTR : ${utr}`);

    const config = getCurrencyConfig(currency);
    const payloadString = `transaction_code=${transactionCode}&utr=${utr}`;
    const encryptedPayload = encryptDecrypt("encrypt", payloadString, config.merchantAPI, config.secretKey);

    try {
        const response = await fetch(`${config.BASE_URL}/api/${config.merchantCode}/v3/submit-utr`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: encryptedPayload })
        });

        const responseText = await response.text();
        if (!response.ok) {
            logger.error(`❌ HTTP Error: ${response.status}`);
            logger.info(`Response : ${responseText}`);
            return;
        }

        const result = JSON.parse(responseText);
        logger.info(`Submit UTR Response : ${JSON.stringify(result, null, 2)}`);
    } catch (err) {
        logger.error(`❌ Submit UTR Error : ${err}`);
    }
}

async function sendDeposit() {
    try {
        logger.info("======== DEPOSIT V3 REQUEST ========");

        const userID = randomInt(100, 999);
        const timestamp = Math.floor(Date.now() / 1000).toString();

        const currencyInput = await ask("Masukkan Currency (INR/VND/BDT/MMK/PMI): ");
        const currency = currencyInput.trim().toUpperCase();

        if (!["INR", "VND", "BDT", "MMK", "PMI", "KRW"].includes(currency)) {
            logger.error("❌ Invalid currency. Masukkan INR, VND, BDT, MMK, KRW atau PMI.");
            rl.close();
            return;
        }

        const amountInput = await ask("Masukkan Amount: ");
        const amount = amountInput.trim();

        if (isNaN(amount) || Number(amount) <= 0) {
            logger.error("❌ Amount harus berupa angka lebih dari 0.");
            rl.close();
            return;
        }

        const transactionCode = `TEST-DP-${timestamp}`;

        const config = getCurrencyConfig(currency);
        let bankCode = "";
        let phone = "";
        const ip = getRandomIP();

        if (config.requiresBankCode) {
            const bankCodeInput = await ask("Masukkan Bank Code: ");
            bankCode = bankCodeInput.trim();

            if (!/^[a-zA-Z0-9]+$/.test(bankCode)) {
                logger.error("❌ Bank Code harus berupa huruf/angka.");
                rl.close();
                return;
            }

            if (currency === 'MMK') {
                bankCode = bankCode.toUpperCase();
            } else {
                bankCode = bankCode.toLowerCase();
            }
        } else if (config.bankCodeOptions) {
        bankCode = config.bankCodeOptions[Math.floor(Math.random() * config.bankCodeOptions.length)];
        }

        if (currency === "MMK" && bankCode === "WAVEPAY") {
            phone = randomMyanmarPhoneNumber();
            logger.info(`Phone Number WavePay: ${phone}`);
        }

        if (currency === "BDT") {
            phone = randomPhoneNumber("bdt");
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
                "Authorization": PMI_AUTHORIZATION,
            };

            try {
                const response = await fetch(PMI_DP_URL, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(payload)
                });

                const responseText = await response.text();
                const parsed = JSON.parse(responseText.replace(/\\"/g, '"'));

                logger.info(`Response Status: ${response.status}`);
                logger.info(`✅ PMI Deposit Response ${JSON.stringify(parsed, null, 2)}`);
            } catch (err) {
                logger.error(`❌ PMI Deposit Error : ${err}`);
            }
            logger.info("PMI deposit belum di-implementasi di CLI ini.");
            rl.close();
            return;
        } else {
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
            // if (currency === "VND") {
            //         payload += "&random_bank_code=OBT";
            // }
            const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);

            logger.info(`URL : ${config.BASE_URL}/api/${config.merchantCode}/v3/dopayment`);
            logger.info(`Merchant Code : ${config.merchantCode}`);
            logger.info(`Request Payload : ${payload}`);
            logger.info(`Encrypted : ${encrypted}`);

            const response = await fetch(`${config.BASE_URL}/api/${config.merchantCode}/v3/dopayment`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: encrypted })
            });

            const responseBody = await response.text();
            let resultDP;
            try {
                resultDP = JSON.parse(responseBody);
            } catch (parseError) {
                logger.error(`❌ Gagal parse JSON: ${parseError.message}`);
                rl.close();
                return;
            }
            if (!response.ok) {
                logger.error(`❌ Deposit gagal: ${JSON.stringify(resultDP)}`);
                rl.close();
                return;
            }

            logger.info("Deposit Response: " + JSON.stringify(resultDP, null, 2));
            logger.info(`Response Status: ${response.status}`);

            if (["INR", "BDT"].includes(currency)) {
                await submitUTR(currency, transactionCode);
            }
        }

        logger.info("======== REQUEST DONE ========\n\n");
    } catch (error) {
        logger.error(`❌ Error umum: ${error}`);
    } finally {
        rl.close();
    }
}

sendDeposit();
