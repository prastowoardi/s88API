import readline from 'readline';
import logger from "../../logger.js";
import dotenv from 'dotenv';
import { randomInt } from "crypto";
import { encryptDecrypt, getRandomIP, getRandomName } from "../../helpers/utils.js";
import { randomPhoneNumber, randomMyanmarPhoneNumber, randomCardNumber } from "../../helpers/depositHelper.js";
import { getCurrencyConfig } from "../../helpers/depositConfigMap.js";
import { localCurrency } from "../../helpers/currencyConfigMap.js";

dotenv.config();

const SUPPORTED_CURRENCIES = ["INR", "VND", "BDT", "MMK", "KRW", "THB"];
const PHONE_CURRENCIES = ["INR", "BDT"];

class DepositV2Service {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
    }

    ask(q) {
        return new Promise((resolve) => this.rl.question(q, (a) => resolve(a.trim())));
    }

    close() {
        this.rl.close();
    }

    validateCurrency(currency) {
        const upper = currency?.toUpperCase();
        if (!SUPPORTED_CURRENCIES.includes(upper)) {
            throw new Error(`"${currency}" not supported yet! Supported: ${SUPPORTED_CURRENCIES.join(", ")}`);
        }
        return upper;
    }

    validateAmount(amount) {
        const n = Number(amount);
        if (isNaN(n) || n <= 0) throw new Error("Amount must be a positive number");
        return n;
    }

    validateBankCode(code) {
        if (!/^[a-zA-Z0-9]+$/.test(code)) throw new Error("Bank Code must contain only letters and numbers");
        return code;
    }

    async getBankCode(config) {
        if (config.requiresBankCode) {
            return this.validateBankCode(await this.ask("Masukkan Bank Code: "));
        }
        return config.bankCodeOptions?.[Math.floor(Math.random() * config.bankCodeOptions.length)] || "";
    }

    getPhone(currency, bankCode) {
        if (PHONE_CURRENCIES.includes(currency)) {
            return randomPhoneNumber(currency.toLowerCase());
        }
        if (currency === "MMK" && bankCode === "WAVEPAY") {
            const phone = randomMyanmarPhoneNumber();
            logger.info(`📱 WavePay Phone: ${phone}`);
            return phone;
        }
        return "";
    }

    async buildPayload(config, tx, user) {
        const params = {
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
            redirect_url: "kaskus.id",
            callback_url: config.callbackURL,
        };

        // THB Only
        if (tx.currency === "THB") {
            const depositorBank = await this.ask("Masukkan Depositor Bank: ");
            if (!/^[a-z0-9A-Z]+$/.test(depositorBank)) {
                throw new Error("Depositor Bank must contain only letters");
            }

            Object.assign(params, {
                depositor_bank: depositorBank,
                depositor_name: user.name,
                depositor_account_number: user.accountNumber,
            });
        }

        // Only for Erfolg provider
        // if (tx.currency === "INR") {
        //     product_name="pillow"
        //     depositor_name=await getRandomName("in", true)
        //     email="pillow@mail.com"
        //     phone="9876371231"
        //     depositor_city="Mumbai"
        //     depositor_country="India"
        //     depositor_zip_code="21323"
        //     depositor_pan_number="HWULX6881T",
        //     depositor_address="mumbai",
        //     depositor_merchant_url="aa.com"
        // }

        // return new URLSearchParams(params).toString();
        return Object.entries(params)
            .map(([k, v]) => {
                if (k === "depositor_name" || k === "callback_url" || k === "ip_address") return `${k}=${v}`; // biarkan plain (biar tidak double encode)
                return `${k}=${encodeURIComponent(v)}`;
            })
            .join("&");
    }

    async execute() {
        try {
            logger.info("======== DEPOSIT V2 REQUEST ========");

            const currencyEnv = process.env.CURRENCY;
            const currency = this.validateCurrency(currencyEnv);
            const config = getCurrencyConfig(currency);

            const amount = this.validateAmount(await this.ask("Masukkan Amount: "));
            const timestamp = Math.floor(Date.now() / 1000).toString();
            const transactionCode = `TEST-DP-V2-${timestamp}`;

            const user = {
                id: randomInt(100, 999),
                name: await getRandomName(localCurrency[currency], true),
                accountNumber: randomCardNumber(),
            };

            const tx = {
                code: transactionCode,
                timestamp,
                amount,
                userID: user.id,
                currency,
                ip: getRandomIP(),
            };

            tx.bankCode = await this.getBankCode(config);
            tx.phone = this.getPhone(currency, tx.bankCode);

            const payload = await this.buildPayload(config, tx, user);
            const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);
            const paymentURL = `${config.BASE_URL}/${config.merchantCode}/v2/dopayment?key=${encrypted}`;

            logger.info(`Request Payload: ${payload}\n`);
            logger.info(`PayURL: ${paymentURL}`);
            logger.info("======== REQUEST DONE ========\n\n");
        } catch (err) {
            logger.error(`❌ Error: ${err.message}`);
        } finally {
            this.close();
        }
    }
}

new DepositV2Service().execute();
