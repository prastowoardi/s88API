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

            const envCurrency = process.env.CURRENCY;
            
            let currency;
            if (envCurrency && SUPPORTED_CURRENCIES.includes(envCurrency)) {
                currency = envCurrency;
            } else {
                const currencyInput = await this.ask("Masukkan Currency (INR/VND/BDT/MMK/THB/KRW/PMI): ");
                currency = this.validateCurrency(currencyInput.trim().toUpperCase());
            }

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

DepositV2Service.execute();