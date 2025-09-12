import fetch from "node-fetch";
import readline from "readline";
import logger from "../../logger.js";
import { randomInt } from "crypto";
import { encryptDecrypt, getRandomIP, getRandomName } from "../../helpers/utils.js";
import { generateUTR, randomPhoneNumber, randomMyanmarPhoneNumber, randomCardNumber } from "../../helpers/depositHelper.js";
import { getCurrencyConfig } from "../../helpers/depositConfigMap.js";
import { warn } from "console";

const SUPPORTED_CURRENCIES = ["INR", "VND", "BDT", "MMK", "PMI", "KRW", "THB"];
const UTR_CURRENCIES = ["INR", "BDT", "MMK"];
const PHONE_CURRENCIES = ["INR", "BDT"];
const DEPOSITOR_BANK_THB = ["SCB", "KTB", "BBL"]

class DepositService {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
    }

    ask(question) {
        return new Promise(resolve => 
            this.rl.question(question, answer => resolve(answer))
        );
    }

    close() {
        this.rl.close();
    }

    validateCurrency(currency) {
        if (!SUPPORTED_CURRENCIES.includes(currency)) {
            throw new Error(`Invalid currency. Supported: ${SUPPORTED_CURRENCIES.join(", ")}`);
        }
        return currency;
    }

    validateAmount(amount) {
        const numAmount = Number(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            throw new Error("Amount must be a positive number");
        }
        return numAmount;
    }

    validateBankCode(bankCode, currency) {
        if (!/^[a-zA-Z0-9]+$/.test(bankCode)) {
            throw new Error("Bank Code must contain only letters and numbers");
        }
        return currency === 'MMK' ? bankCode.toUpperCase() : bankCode.toLowerCase();
    }

    generateTransactionCode() {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        return `TEST-DP-${timestamp}`;
    }

    async getBankCode(config, currency) {
        if (config.requiresBankCode) {
            const bankCodeInput = await this.ask("Masukkan Bank Code: ");
            return this.validateBankCode(bankCodeInput.trim(), currency);
        }
        
        if (config.bankCodeOptions) {
            return config.bankCodeOptions[Math.floor(Math.random() * config.bankCodeOptions.length)];
        }
        
        return "";
    }

    getRandomBank() {
        const randomIndex = Math.floor(Math.random() * DEPOSITOR_BANK_THB.length);
        return DEPOSITOR_BANK_THB[randomIndex];
    }

    getPhoneNumber(currency, bankCode) {
        if (PHONE_CURRENCIES.includes(currency)) {
            return randomPhoneNumber(currency.toLowerCase());
        }
        
        if (currency === "MMK" && bankCode === "WAVEPAY") {
            const phone = randomMyanmarPhoneNumber();
            logger.info(`Phone Number WavePay: ${phone}`);
            return phone;
        }
        
        return "";
    }

    buildPayload(config, transactionData, userInfo) {
        const {
            transactionCode,
            timestamp,
            amount,
            userID,
            currency,
            ip,
            bankCode,
            phone
        } = transactionData;

        let payload = [
            `merchant_api_key=${config.merchantAPI}`,
            `merchant_code=${config.merchantCode}`,
            `transaction_code=${transactionCode}`,
            `transaction_timestamp=${timestamp}`,
            `transaction_amount=${amount}`,
            `user_id=${userID}`,
            `currency_code=${currency}`,
            `payment_code=${config.depositMethod}`,
            `ip_address=${ip}`,
            `callback_url=${config.callbackURL}`
        ].join('&');

        if (bankCode) payload += `&bank_code=${bankCode}`;
        if (phone) payload += `&phone=${phone}`;
        
        if (currency === "THB") {
            payload += `&depositor_name=${userInfo.name}`;
            payload += `&depositor_bank_THB=${this.getRandomBank()}`;
            payload += `&depositor_account_number=${userInfo.accountNumber}`;
        }

        return payload;
    }

    async makeDepositRequest(config, payload) {
        const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);

        const urls = [
            config.BASE_URL,
            process.env.BASE_URL_2,
            process.env.BASE_URL_3,
        ].filter(Boolean);

        let lastError = null;

        for (let i = 0; i < urls.length; i++) {
            const url = `${urls[i]}/api/${config.merchantCode}/v3/dopayment`;

            logger.info(`URL: ${url}`);
            logger.info(`Merchant Code: ${config.merchantCode}`);
            logger.info(`Request Payload: ${payload}`);
            logger.info(`Encrypted: ${encrypted}`);
            
            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ key: encrypted })
                });

                const responseBody = await response.text();
                let result;

                try {
                    result = JSON.parse(responseBody);
                } catch (parseErr) {
                    lastError = new Error(`Failed to parse response JSON from ${url}: ${parseErr.message}`);
                    logger.error(`Parse error on ${url}: ${parseErr.message}`);
                    continue;                
                }

                if (!response.ok) {
                    logger.warn(`HTTP ${response.status}: ${responseBody}`);
                    if (result.message === "[DP] Unauthorize") {
                        logger.warn(`Unauthorized on ${urls[i]}, trying next API URL\n`);
                        logger.info(`================== Trying Other URL ==================\n`);
                        lastError = new Error(`Unauthorized on ${url}`);
                        continue;
                    }

                    lastError = new Error(`HTTP ${response.status} from ${url}: ${result.message || responseBody}`);
                    logger.error(`HTTP error on ${url}: ${response.status} - ${result.message || responseBody}`);
                    continue;
                }
                return { result, url: urls[i] };
            } catch (err) {
                lastError = err;
                logger.error(`Network error on ${url}: ${err.message}`);
                continue;            
            }
        }

        throw lastError || new Error("All API URLs failed without specific error");
    }

    async submitUTR(currency, transactionCode, baseURL) {
        if (!UTR_CURRENCIES.includes(currency)) {
            logger.error("❌ Submit UTR hanya tersedia untuk INR, BDT & MMK.");
            return;
        }

        let utr;
        if (currency === "MMK") {
            utr = Math.floor(10000 + Math.random() * 90000).toString();
        } else {
            utr = generateUTR(currency);
        }
        logger.info(`✅ UTR: ${utr}`);

        const config = getCurrencyConfig(currency);
        const payloadString = `transaction_code=${transactionCode}&utr=${utr}`;
        const encryptedPayload = encryptDecrypt("encrypt", payloadString, config.merchantAPI, config.secretKey);

        const endpoint =
            currency === "MMK"
                ? `${baseURL}/api/${config.merchantCode}/v3/submit-refno`
                : `${baseURL}/api/${config.merchantCode}/v3/submit-utr`;

        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: encryptedPayload })
            });

            const responseText = await response.text();

            if (!response.ok) {
                logger.error(`❌ HTTP Error: ${response.status}`);
                logger.info(`Response: ${responseText}`);
                return null;
            }

            const result = JSON.parse(responseText);
            logger.info(`Submit UTR Response: ${JSON.stringify(result, null, 2)}`);
            return result;
        } catch (err) {
            logger.error(`❌ Submit UTR Error: ${err}`);
            return null;
        }
    }

    async processPMIDeposit(transactionCode, amount, config) {
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
            logger.error(`❌ PMI Deposit Error: ${err}`);
        }
        
        logger.info("PMI deposit belum di-implementasi di CLI ini.");
    }

    async processStandardDeposit(currency, amount, config, transactionCode) {
        const userID = randomInt(100, 999);
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const ip = getRandomIP();
        const name = await getRandomName();
        const accountNumber = randomCardNumber();

        const bankCode = await this.getBankCode(config, currency);
        const phone = this.getPhoneNumber(currency, bankCode);

        const transactionData = {
            transactionCode,
            timestamp,
            amount,
            userID,
            currency,
            ip,
            bankCode,
            phone
        };

        const userInfo = { name, accountNumber };

        const payload = this.buildPayload(config, transactionData, userInfo);
        const response = await this.makeDepositRequest(config, payload);

        if (!response) {
            throw new Error("Failed Submit Deposit!");
        }

        const { result, url: successfulURL } = response;

        logger.info("Deposit Response: " + JSON.stringify(result, null, 2));

        // Submit UTR if required
        if (UTR_CURRENCIES.includes(currency)) {
            await this.submitUTR(currency, transactionCode, successfulURL);
        }

        return result;
    }

    async getUserInput() {
        const currencyInput = await this.ask("Masukkan Currency (INR/VND/BDT/MMK/THB/KRW/PMI): ");
        const currency = this.validateCurrency(currencyInput.trim().toUpperCase());

        const amountInput = await this.ask("Masukkan Amount: ");
        const amount = this.validateAmount(amountInput.trim());

        return { currency, amount };
    }

    async sendDeposit() {
        try {
            logger.info("======== DEPOSIT V3 REQUEST ========");

            const { currency, amount } = await this.getUserInput();
            const transactionCode = this.generateTransactionCode();
            const config = getCurrencyConfig(currency);

            if (currency === "PMI") {
                await this.processPMIDeposit(transactionCode, amount, config);
            } else {
                await this.processStandardDeposit(currency, amount, config, transactionCode);
            }

            logger.info("======== REQUEST DONE ========\n\n");

        } catch (error) {
            logger.error(`❌ Error: ${error.message}`);
        } finally {
            this.close();
        }
    }
}

const depositService = new DepositService();
depositService.sendDeposit();