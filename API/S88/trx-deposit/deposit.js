import fetch from "node-fetch";
import readline from "readline";
import logger from "../../logger.js";
import { randomInt } from "crypto";
import { encryptDecrypt, getRandomIP,  getRandomName } from "../../helpers/utils.js";
import { generateUTR, randomPhoneNumber, randomMyanmarPhoneNumber, randomCardNumber } from "../../helpers/depositHelper.js";
import { getCurrencyConfig } from "../../helpers/depositConfigMap.js";

const SUPPORTED_CURRENCIES = ["INR", "VND", "BDT", "MMK", "PMI", "KRW", "THB"];
const UTR_CURRENCIES = ["INR", "BDT", "MMK"];
const PHONE_CURRENCIES = ["INR", "BDT"];

class DepositService {
    constructor() {
        this.rl = readline.createInterface({ 
            input: process.stdin, 
            output: process.stdout,
        });
    }

    ask(question) {
        return new Promise((resolve) => 
            this.rl.question(question, (a) => resolve(a.trim())));
    }

    async askYesNo(question) {
        let answer;
        do {
        answer = (await this.ask(`${question} (YES/NO): `)).toUpperCase();
        } while (!["YES", "NO"].includes(answer));
        return answer === "YES";
    }

    close() {
        this.rl.close();
    }

    validateCurrency(currency) {
        const upper = currency.toUpperCase();
        if (!SUPPORTED_CURRENCIES.includes(upper))
        throw new Error(`Invalid currency. Supported: ${SUPPORTED_CURRENCIES.join(", ")}`);
        return upper;
    }

    validateAmount(amount) {
        const numAmount = Number(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            throw new Error("Amount must be a positive number");
        }
        return numAmount;
    }

    validateBankCode(bankCode) {
        if (!/^[a-zA-Z0-9]+$/.test(bankCode))
        throw new Error("Bank Code must contain only letters and numbers");
        return bankCode;
    }

    generateTransactionCode() {
        return `TEST-DP-V3-${Math.floor(Date.now() / 1000)}`;
    }

    async getBankCode(config) {
        if (config.requiresBankCode) {
            return this.validateBankCode(await this.ask("Masukkan Bank Code: "));
        }
        return config.bankCodeOptions?.[Math.floor(Math.random() * config.bankCodeOptions.length)] || "";
    }

    getPhoneNumber(currency, bankCode) {
        if (PHONE_CURRENCIES.includes(currency)) {
            return randomPhoneNumber(currency.toLowerCase());
        }

        if (currency === "MMK" && bankCode === "WAVEPAY") {
            const phone = randomMyanmarPhoneNumber();
            logger.info(`WavePay Phone: ${phone}`);
            return phone;
        }
        return "";
    }

    async buildPayload(config, tx, user) {
        const payload = {
        merchant_api_key: config.merchantAPI,
        merchant_code: config.merchantCode,
        transaction_code: tx.transactionCode,
        transaction_timestamp: tx.timestamp,
        transaction_amount: tx.amount,
        user_id: tx.userID,
        currency_code: tx.currency,
        payment_code: config.depositMethod,
        ip_address: tx.ip,
        callback_url: config.callbackURL,
        ...(tx.bankCode && { bank_code: tx.bankCode }),
        ...(tx.phone && { phone: tx.phone }),
        };

        // THB only
        if (tx.currency === "THB") {
            const depositorBank = await this.ask("Masukkan Depositor Bank: ");
            if (!/^[a-z0-9A-Z]+$/.test(depositorBank))
                throw new Error("Depositor Bank must contain only letters");

            Object.assign(payload, {
                depositor_name: user.name,
                depositor_bank: depositorBank,
                depositor_account_number: user.accountNumber,
            });
        }

        return new URLSearchParams(payload).toString();
    }

    async tryParseJSON(text, url) {
        try {
            return JSON.parse(text);
        } catch (err) {
            logger.error(`❌ Failed to parse JSON from ${url}: ${err.message}`);
            return null;
        }
    }

    async makeDepositRequest(config, payload) {
        const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);
        
        const urls = [
            config.BASE_URL, 
            process.env.BASE_URL_2, 
            process.env.BASE_URL_3,
        ].filter(Boolean);

    for (const base of urls) {
        const url = `${base}/api/${config.merchantCode}/v3/dopayment`;
        logger.info(`Trying: ${url}`);
        logger.info(`Encrypted: ${encrypted}`);

        try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ key: encrypted }),
                });
                const text = await response.text();
                const json = await this.tryParseJSON(text, url);
                if (!json) continue;

                if (!response.ok) {
                    if (json.message === "[DP] Unauthorize") {
                        logger.warn(`⚠️ Unauthorized at ${base}, trying next...\n`);
                        continue;
                    }
                    throw new Error(`HTTP ${res.status}: ${text}`);
                }

                return { result: json, url: base };
            } catch (err) {
                logger.error(`🚫 Network error on ${base}: ${err.message}`);
            }
        }

        throw new Error("All API URLs failed");
    }

    async submitUTR(currency, transactionCode, baseURL) {
        if (!UTR_CURRENCIES.includes(currency))
        return logger.warn("🚫 Submit UTR hanya untuk INR, BDT, MMK.");

        const utr = currency === "MMK"
        ? String(randomInt(10000, 99999))
        : generateUTR(currency);

        logger.info(`✅ UTR: ${utr}`);

        const config = getCurrencyConfig(currency);
        const payload = `transaction_code=${transactionCode}&utr=${utr}`;
        const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);
        const endpoint =
        currency === "MMK"
            ? `${baseURL}/api/${config.merchantCode}/v3/submit-refno`
            : `${baseURL}/api/${config.merchantCode}/v3/submit-utr`;

        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: encrypted }),
            });
            const text = await response.text();
                if (!response.ok) throw new Error(`HTTP ${response.status}: ${text}`);
                logger.info(`Submit UTR Response: ${text}`);
            } catch (err) {
                logger.error(`❌ Submit UTR Error: ${err.message}`);
            }
    }

    async processStandardDeposit(currency, amount, config, transactionCode) {
        const userInfo = {
            name: await getRandomName(),
            accountNumber: randomCardNumber(),
        };

        const transactionData = {
            transactionCode,
            timestamp: Math.floor(Date.now() / 1000),
            amount,
            userID: randomInt(100, 999),
            currency,
            ip: getRandomIP(),
            bankCode: await this.getBankCode(config, currency),
        };
        transactionData.phone = this.getPhoneNumber(currency, transactionData.bankCode);

        const payload = await this.buildPayload(config, transactionData, userInfo);
        const { result, url } = await this.makeDepositRequest(config, payload);

        logger.info(`💰 Deposit Response:\n${JSON.stringify(result, null, 2)}`);

        if (["INR", "BDT"].includes(currency)) {
            const wantUTR = await this.askYesNo("Input UTR?");
            if (wantUTR) await this.submitUTR(currency, transactionCode, url);
            else logger.info("➡️ Skip Submit UTR");
        }

        return result;
    }

    async processPMIDeposit(transactionCode, amount, config) {
        logger.info("⚙️ PMI deposit belum diimplementasi di CLI ini.");
    }

    async getUserInput() {
        const envCurrency = process.env.CURRENCY;
        const currency = envCurrency
        ? this.validateCurrency(envCurrency)
        : this.validateCurrency(await this.ask("Masukkan Currency (INR/VND/BDT/MMK/THB/KRW/PMI): "));

        const amount = this.validateAmount(await this.ask("Masukkan Amount: "));
        return { currency, amount };
    }

    async sendDeposit() {
        try {
            logger.info("======== 🚀 START DEPOSIT REQUEST ========");
            const { currency, amount } = await this.getUserInput();
            const config = getCurrencyConfig(currency);
            const transactionCode = this.generateTransactionCode();

            if (currency === "PMI") {
                await this.processPMIDeposit(transactionCode, amount, config);
            } else {
                await this.processStandardDeposit(currency, amount, config, transactionCode);
            }

            logger.info("======== ✅ REQUEST DONE ========\n");
        } catch (err) {
            logger.error(`❌ Error: ${err.message}`);
        } finally {
            this.close();
        }
    }
}

new DepositService().sendDeposit();
