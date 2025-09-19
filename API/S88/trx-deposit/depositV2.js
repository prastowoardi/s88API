import readline from 'readline';
import logger from "../../logger.js";
import dotenv from 'dotenv';
import { randomInt } from "crypto";
import { encryptDecrypt, getRandomIP, getRandomName } from "../../helpers/utils.js";
import { randomPhoneNumber, randomMyanmarPhoneNumber, randomCardNumber } from "../../helpers/depositHelper.js";
import { getCurrencyConfig } from "../../helpers/depositConfigMap.js";

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

    ask(question) {
        return new Promise(resolve => 
            this.rl.question(question, answer => resolve(answer))
        );
    }

    close() {
        this.rl.close();
    }

    validateCurrency(currency) {
        const upperCurrency = currency.toUpperCase();
        if (!SUPPORTED_CURRENCIES.includes(upperCurrency)) {
            throw new Error(`"${currency}" Not supported yet! Supported: ${SUPPORTED_CURRENCIES.join(", ")}`);
        }
        return upperCurrency;
    }

    validateAmount(amount) {
        const trimmedAmount = amount.trim();
        if (!trimmedAmount || isNaN(trimmedAmount) || Number(trimmedAmount) <= 0) {
            throw new Error("Amount must be a positive number");
        }
        return trimmedAmount;
    }

    validateBankCode(bankCode) {
        if (!/^[a-z0-9A-Z]+$/.test(bankCode)) {
            throw new Error("Bank Code must contain only letters and numbers");
        }
        return bankCode;
    }

    generateTransactionCode() {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        return `TEST-DP-${timestamp}`;
    }

    async getBankCode(config) {
        if (config.requiresBankCode) {
            const bankCodeInput = await this.ask("Masukkan Bank Code: ");
            return this.validateBankCode(bankCodeInput);
        }
        
        if (config.bankCodeOptions) {
            return config.bankCodeOptions[Math.floor(Math.random() * config.bankCodeOptions.length)];
        }
        
        return "";
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

        const basePayload = [
            `merchant_api_key=${config.merchantAPI}`,
            `merchant_code=${config.merchantCode}`,
            `transaction_code=${transactionCode}`,
            `transaction_timestamp=${timestamp}`,
            `transaction_amount=${amount}`,
            `user_id=${userID}`,
            `currency_code=${currency}`,
            `payment_code=${config.depositMethod}`,
            `callback_url=${config.callbackURL}`,
            `ip_address=${ip}`
        ].join('&');

        let payload = basePayload;
        
        if (bankCode) payload += `&bank_code=${bankCode}`;
        if (phone) payload += `&phone=${phone}`;
        
        if (currency === "THB") {
            payload += `&depositor_name=${userInfo.name}`;
            payload += `&depositor_account_number=${userInfo.accountNumber}`;
        }

        return payload;
    }

    generatePaymentURL(config, encryptedKey) {
        return `${config.BASE_URL}/${config.merchantCode}/v2/dopayment?key=${encryptedKey}`;
    }

    async getUserInput() {
        const currencyInput = await this.ask("Masukkan Currency (INR/VND/BDT/MMK/KRW,THB): ");
        const currency = this.validateCurrency(currencyInput);

        const amountInput = await this.ask("Masukkan Amount: ");
        const amount = this.validateAmount(amountInput);

        return { currency, amount };
    }

    logResults(payload, paymentURL) {
        logger.info("======== DEPOSIT V2 REQUEST ========");
        logger.info(`Request Payload: ${payload}\n`);
        logger.info(`PayURL: ${paymentURL}`);
        logger.info("======== REQUEST DONE ========\n\n");
    }

    async depositV2() {
        try {
            const { currency, amount } = await this.getUserInput();
            
            logger.info(`Currency: ${currency}`);
            logger.info(`Amount: ${amount}`);

            const userID = randomInt(100, 999);
            const timestamp = Math.floor(Date.now() / 1000).toString();
            const transactionCode = this.generateTransactionCode();
            const config = getCurrencyConfig(currency);
            const ip = getRandomIP();
            const name = await getRandomName();
            const accountNumber = randomCardNumber();

            const bankCode = await this.getBankCode(config);
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
            const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);
            const paymentURL = this.generatePaymentURL(config, encrypted);

            this.logResults(payload, paymentURL);

        } catch (error) {
            logger.error(`❌ Error: ${error.message}`);
        } finally {
            this.close();
        }
    }
}

class SimpleDepositV2 {
    static async execute() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        const ask = (question) => new Promise(resolve => 
            rl.question(question, answer => resolve(answer))
        );

        try {
            const userID = randomInt(100, 999);
            const timestamp = Math.floor(Date.now() / 1000).toString();

            const currencyInput = await ask("Masukkan Currency (INR/VND/BDT/MMK/KRW,THB): ");
            const currency = currencyInput.toUpperCase();

            if (!SUPPORTED_CURRENCIES.includes(currency)) {
                throw new Error(`"${currency}" Not supported yet! Supported: ${SUPPORTED_CURRENCIES.join(", ")}`);
            }

            const amountInput = await ask("Masukkan Amount: ");
            const amount = amountInput.trim();

            if (!amount || isNaN(amount) || Number(amount) <= 0) {
                throw new Error("Amount must be a positive number");
            }

            logger.info(`Currency: ${currency}`);
            logger.info(`Amount: ${amount}`);

            const transactionCode = `TEST-DP-${timestamp}`;
            const config = getCurrencyConfig(currency);
            const ip = getRandomIP();
            const name = await getRandomName();
            const accountNumber = randomCardNumber();

            let bankCode = "";
            let phone = "";

            if (config.requiresBankCode) {
                const bankCodeInput = await ask("Masukkan Bank Code: ");
                if (!/^[a-z0-9A-Z]+$/.test(bankCodeInput)) {
                    throw new Error("Bank Code must contain only letters and numbers");
                }
                bankCode = bankCodeInput;
            } else if (config.bankCodeOptions) {
                bankCode = config.bankCodeOptions[Math.floor(Math.random() * config.bankCodeOptions.length)];
            }

            if (PHONE_CURRENCIES.includes(currency)) {
                phone = randomPhoneNumber(currency.toLowerCase());
            } else if (currency === "MMK" && bankCode === "WAVEPAY") {
                phone = randomMyanmarPhoneNumber();
                logger.info(`Phone Number WavePay: ${phone}`);
            }

            const payloadParts = [
                `merchant_api_key=${config.merchantAPI}`,
                `merchant_code=${config.merchantCode}`,
                `transaction_code=${transactionCode}`,
                `transaction_timestamp=${timestamp}`,
                `transaction_amount=${amount}`,
                `user_id=${userID}`,
                `currency_code=${currency}`,
                `payment_code=${config.depositMethod}`,
                `callback_url=${config.callbackURL}`,
                `ip_address=${ip}`
            ];

            if (bankCode) payloadParts.push(`bank_code=${bankCode}`);
            if (phone) payloadParts.push(`phone=${phone}`);
            
            if (currency === "THB") {
                const depositorBank = await ask("Masukkan Depositor Bank: ");
                if (!/^[a-z0-9A-Z]+$/.test(depositorBank)) {
                    throw new Error("Depositor Bank must contain only letters");
                }
                
                payloadParts.push(`depositor_bank=${depositorBank}`)
                payloadParts.push(`depositor_name=${name}`);
                payloadParts.push(`depositor_account_number=${accountNumber}`);
            }

            const payload = payloadParts.join('&');
            const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);
            const paymentURL = `${config.BASE_URL}/${config.merchantCode}/v2/dopayment?key=${encrypted}`;

            logger.info("======== DEPOSIT V2 REQUEST ========");
            logger.info(`Request Payload: ${payload}\n`);
            logger.info(`PayURL: ${paymentURL}`);
            logger.info("======== REQUEST DONE ========\n\n");

        } catch (error) {
            logger.error(`❌ Error: ${error.message}`);
        } finally {
            rl.close();
        }
    }
}

// const depositService = new DepositV2Service();
// depositService.depositV2();

// Alternative execution (uncomment to use simple approach)
SimpleDepositV2.execute();