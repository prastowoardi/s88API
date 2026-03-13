import fetch from "node-fetch";
import readline from "readline";
import logger from "../../logger.js";
import { randomInt } from "crypto";
import { encryptDecrypt, getRandomIP, getRandomName } from "../../helpers/utils.js";
import { generateUTR, randomPhoneNumber, randomMyanmarPhoneNumber, randomCardNumber } from "../../helpers/depositHelper.js";
import { getCurrencyConfig } from "../../helpers/depositConfigMap.js";

const SUPPORTED_CURRENCIES = ["INR", "VND", "BDT", "MMK", "PMI", "KRW", "THB","PHP", "JPY"];
const UTR_CURRENCIES = ["INR", "BDT"];
const PHONE_CURRENCIES = ["INR", "BDT"];

class DepositService {
    constructor() {
        this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        });
    }

    ask(question) {
        return new Promise((resolve) => this.rl.question(question, resolve));
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
        if (!/^[a-zA-Z0-9]+$/.test(bankCode))
        throw new Error("Bank Code must contain only letters and numbers");
        return bankCode;
    }

    generateTransactionCode() {
        return `TEST-DP-V4-${Math.floor(Date.now() / 1000)}`;
    }

    async getBankCode(config, currency) {
        if (config.requiresBankCode) {
            const input = await this.ask("Masukkan Bank Code: ");
            return this.validateBankCode(input.trim(), currency);
        }
        return (
            config.bankCodeOptions?.[
                Math.floor(Math.random() * config.bankCodeOptions.length)
            ] || ""
        );
    }

    getPhoneNumber(currency, bankCode) {
        if (PHONE_CURRENCIES.includes(currency))
        return randomPhoneNumber(currency.toLowerCase());
        if (currency === "MMK" && bankCode === "WAVEPAY") {
            const phone = randomMyanmarPhoneNumber();
            logger.info(`Phone Number WavePay: ${phone}`);
            return phone;
        }
        return "";
    }

    async buildPayload(config, tx, userInfo) {
        const basePayload = {
            merchant_api_key: config.merchantAPI,
            merchant_code: config.merchantCode,
            transaction_code: tx.code,
            transaction_timestamp: tx.timestamp,
            transaction_amount: tx.amount,
            user_id: tx.userID,
            currency_code: tx.currency,
            payment_code: config.depositMethod,
            ip_address: tx.ip,
            ...(tx.bankCode && { bank_code: tx.bankCode }),
            ...(tx.phone && { phone: tx.phone }),
            ...(tx.currency === "THB" && {
                depositor_name: await getRandomName('th', true),
                depositor_account_number: userInfo.accountNumber,
            }),
            callback_url: config.callbackURL,
            redirect_url: "https://x.com",
        };

        if (tx.currency === "THB") {
            const depositorBank = await this.ask("Masukkan Depositor Bank: ");
            if (!/^[a-z0-9A-Z]+$/.test(depositorBank))
                throw new Error("Depositor Bank must contain only letters");
                basePayload.depositor_bank = depositorBank;
        }

        if (tx.currency === "JPY") {
            basePayload.depositor_name = await getRandomName('jp', true);
        }

        // Only for Flowpay
        // if (tx.currency === "INR") {
        //     basePayload.phone = "9123456789";
        //     basePayload.depositor_name = userInfo.name;
        //     basePayload.email = `${userInfo.name.toLowerCase().replace(/\s/g, "")}@tank.com`;
        // }

        return Object.entries(basePayload)
            .map(([k, v]) => {
                if (k === "depositor_name" || k === "callback_url" || k === "redirect_url" || k === "ip_address" || k === "email") return `${k}=${v}`; // biarkan plain (biar tidak double encode)
                return `${k}=${encodeURIComponent(v)}`;
            })
            .join("&");
    }

    async sendEncryptedRequest(url, key) {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key }),
        });

        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);

        try {
            return JSON.parse(text);
        } catch {
            throw new Error(`Invalid JSON response: ${text}`);
        }
    }

    async makeDepositRequest(config, payload) {
        const encrypted = encryptDecrypt(
            "encrypt",
            payload,
            config.merchantAPI,
            config.secretKey
        );

        const urls = [
            config.BASE_URL,
            process.env.BASE_URL_2,
            process.env.BASE_URL_3,
        ].filter(Boolean);

        for (const base of urls) {
            const url = `${base}/api/${config.merchantCode}/v4/dopayment`;

            logger.info(`Trying: ${url}`);
            logger.info(`Payload: ${payload}`);
            logger.info(`Encrypted: ${encrypted}\n`);

            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ key: encrypted }),
                });

                const text = await response.text();
                
                let json;
                try {
                    json = JSON.parse(text);
                } catch (e) {
                    logger.error(`❌ Failed to parse JSON from ${url}: ${e.message}`);
                    continue;
                }

                if (!response.ok) {
                    if (json.message === "[DP] Unauthorize" || response.status === 401) {
                        logger.warn(`⚠️ Unauthorized at ${base}, trying next URL...\n`);
                        continue;
                    }
                    throw new Error(`HTTP ${response.status}: ${text}`);
                }

                return { result: json, url: base };
            } catch (err) {
                if (err.message.includes("HTTP")) throw err;
                logger.error(`🚫 Network error on ${base}: ${err.message}`);
            }
        }

        throw new Error("All API URLs failed (Unauthorized or Network Error)");
    }

    async submitUTR(currency, transactionCode) {
        if (!UTR_CURRENCIES.includes(currency)) {
            logger.warn("Submit UTR hanya tersedia untuk INR & BDT.");
            return;
        }

        const config = getCurrencyConfig(currency);
        const utr = generateUTR(currency);
        logger.info(`✅ UTR: ${utr}`);

        const payload = `transaction_code=${transactionCode}&utr=${utr}`;
        const encrypted = encryptDecrypt(
            "encrypt",
            payload,
            config.merchantAPI,
            config.secretKey
        );

        let url;

        if (baseURL.includes("singhapay")) {
            url = `${baseURL}/api/${config.merchantCode}/v3/submit-utr`;
            console.log("Endpoint: ", url);
        } else {
            url = `${baseURL}/api/${config.merchantCode}/v4/submit-utr`;
            console.log("Endpoint: ", url);
        }

        try {
            const result = await this.sendEncryptedRequest(url, encrypted);
            logger.info(`Submit UTR Response: ${JSON.stringify(result, null, 2)}`);
        } catch (err) {
            logger.error(`❌ Submit UTR Error: `, err);
        }
    }

    async processStandardDeposit(currency, amount, config, transactionCode) {
        const tx = {
            code: transactionCode,
            timestamp: Math.floor(Date.now() / 1000).toString(),
            amount,
            userID: randomInt(100, 999),
            currency,
            ip: getRandomIP(),
            bankCode: await this.getBankCode(config, currency),
        };

        tx.phone = this.getPhoneNumber(currency, tx.bankCode);

        const userInfo = {
            name: await getRandomName(),
            accountNumber: randomCardNumber(),
        };

        const payload = await this.buildPayload(config, tx, userInfo);
        const { result, url } = await this.makeDepositRequest(config, payload);

        logger.info(`Deposit Response:\n${JSON.stringify(result, null, 2)}`);

        if (UTR_CURRENCIES.includes(currency)) {
            const confirm = (await this.ask("Input UTR (YES/NO): "))
                .trim()
                .toUpperCase();
            if (confirm === "YES") await this.submitUTR(currency, transactionCode, url);
            else logger.info("Skip Submit UTR.");
        }

        return result;
    }

    async getUserInput() {
        const envCurrency = process.env.CURRENCY?.trim().toUpperCase();

        let currency = SUPPORTED_CURRENCIES.includes(envCurrency)
            ? envCurrency
            : null;

        if (!currency) {
            const input = await this.ask("Masukkan Currency (INR/VND/BDT/MMK/THB/KRW/PMI): ");
            currency = this.validateCurrency(input.trim().toUpperCase());
        }

        const amountInput = await this.ask("Masukkan Amount: ");
        const amount = this.validateAmount(amountInput.trim());

        // logger.info(`Currency: ${currency}`);
        // logger.info(`Amount: ${amount}`);

        return { currency, amount };
    }


    async sendDeposit() {
        try {
            logger.info("======== DEPOSIT V4 REQUEST ========");
            const { currency, amount } = await this.getUserInput();
            const config = getCurrencyConfig(currency);
            if (!config) {
                logger.error(`❌ Config untuk ${currency} tidak ditemukan.`);
                return;
            }

            const transactionCode = this.generateTransactionCode();
            await this.processStandardDeposit(currency, amount, config, transactionCode);

            logger.info("======== REQUEST DONE ========\n");
        } catch (err) {
            logger.error(`❌ Error: ${err.message}`);
        } finally {
            this.close();
        }
    }
}

new DepositService().sendDeposit();
