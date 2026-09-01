import fetch from "node-fetch";
import { randomInt } from "crypto";
import readlineSync from "readline-sync";
import logger from "../../logger.js";
import dotenv from "dotenv";
import { encryptDecrypt, getRandomIP, getRandomName, generateEmail } from "../../helpers/utils.js";
import {
    randomPhoneNumber,
    randomMyanmarPhoneNumber,
    randomCardNumber,
    generateUTR,
    randomAmount
} from "../../helpers/depositHelper.js";
import { getCurrencyConfig } from "../../helpers/depositConfigMap.js";

dotenv.config();

const AVAILABLE_CURRENCIES = ["INR", "VND", "BDT", "MMK", "BRL", "IDR", "THB", "MXN", "KRW", "PHP", "HKD", "KHR", "MYR", "JPY", "PKR", "NPR"];
const UTR_CURRENCIES = ["INR", "BDT"];
const PHONE_REQUIRED_CURRENCIES = {
    MMK: "wavepay",
    BDT: true
};

class BatchDepositV2Service {
    constructor() {
        this.lastTransactionNumber = 0;
        this.userBankCodes = {};
        this.stats = {
            total: 0,
            success: 0,
            failed: 0,
            startTime: null,
            endTime: null
        };
    }

    generateTransactionCodes(count) {
        if (this.lastTransactionNumber === 0) {
            this.lastTransactionNumber = Math.floor(Date.now() / 1000);
        }

        const codes = [];
        for (let i = 0; i < count; i++) {
            this.lastTransactionNumber++;
            codes.push(`TEST-DP-${this.lastTransactionNumber}`);
        }
        return codes;
    }

    validateCurrency(input) {
        const upperInput = input.toUpperCase();
        if (upperInput === "ALL") {
            return AVAILABLE_CURRENCIES;
        }
        
        if (AVAILABLE_CURRENCIES.includes(upperInput)) {
            return [upperInput];
        }
        
        throw new Error(`Invalid currency. Available: ${AVAILABLE_CURRENCIES.join("/")}, or 'ALL'`);
    }

    validateTransactionCount(count) {
        if (count < 1 || count > 1000) {
            throw new Error("Transaction count must be between 1 and 1000");
        }
        return count;
    }

    validateAmountRange(min, max) {
        if (min > max) {
            throw new Error("Minimum amount must be less than maximum amount");
        }
        if (min < 1) {
            throw new Error("Minimum amount must be at least 1");
        }
        return { min, max };
    }

    getPhoneNumber(currency, bankCode) {
        if (currency === "MMK" && bankCode === PHONE_REQUIRED_CURRENCIES.MMK) {
            return randomMyanmarPhoneNumber();
        }
        if (["BDT", "INR", "MYR", "NPR", "PKR", "VND"].includes(currency)) {
            return randomPhoneNumber(currency.toLowerCase());
        }
        return "";
    }

    // Bank code handling: random dari daftar yang diinput user (handleBankCodes)
    getBankCode(config, currency) {
        const options = config.bankCodeOptions || this.userBankCodes[currency];
        if (options && options.length) {
            return options[Math.floor(Math.random() * options.length)];
        }
        return "";
    }

    buildPayload(config, transactionData) {
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
        if (transactionData.bank_code && !bankCode) payloadParts.push(`bank_code=${transactionData.bank_code}`);
        if (phone) payloadParts.push(`phone=${phone}`);
        if (transactionData.depositor_name) payloadParts.push(`depositor_name=${transactionData.depositor_name}`);
        if (transactionData.depositor_bank) payloadParts.push(`depositor_bank=${transactionData.depositor_bank}`);
        if (transactionData.depositor_bank_code) payloadParts.push(`depositor_bank_code=${transactionData.depositor_bank_code}`);
        if (transactionData.depositor_account_number) payloadParts.push(`depositor_account_number=${transactionData.depositor_account_number}`);
        if (transactionData.email) payloadParts.push(`email=${transactionData.email}`);

        return payloadParts.join('&');
    }

    async applyCurrencySpecificFields(tx, userInfo) {
        const { currency } = tx;

        const sanitizeName = (name) => String(name || "")
            .replace(/[^\p{L}\s]/gu, "")
            .replace(/\s+/g, " ")
            .trim();

        if (currency === "THB") {
            const thbBankCodes = this.userBankCodes["THB"] || [];
            tx.depositor_bank = thbBankCodes.length
                ? thbBankCodes[Math.floor(Math.random() * thbBankCodes.length)]
                : await getRandomName('th', true);
            tx.depositor_name = sanitizeName(await getRandomName('th', true));
            tx.depositor_account_number = userInfo.accountNumber;
        }

        if (currency === "JPY") {
            tx.depositor_name = sanitizeName(await getRandomName('jp', true));
        }

        if (currency === "NPR") {
            const nprBankCodes = this.userBankCodes["NPR"] || ["FONEPAY"];
            tx.bank_code = "FONEPAY";
            tx.depositor_bank_code = nprBankCodes[Math.floor(Math.random() * nprBankCodes.length)];
            tx.depositor_name = sanitizeName(await getRandomName('np', true));
            tx.depositor_account_number = userInfo.accountNumber;
        }

        if (currency === "KRW") {
            tx.depositor_name = sanitizeName(await getRandomName('kr', true));
            tx.depositor_account_number = userInfo.accountNumber;
        }

        if (currency === "MYR") {
            tx.email = userInfo.data.email;
        }
    }

    async createDepositV2({ currency, amount, transactionCode, bankCode }) {
        try {
            const config = getCurrencyConfig(currency);
            const userID = Math.floor(Math.random() * 900) + 100;
            const timestamp = Math.floor(Date.now() / 1000).toString();
            const ip = getRandomIP();

            const userInfo = {
                accountNumber: randomCardNumber(),
                data: await generateEmail()
            };

            if (currency !== "NPR") {
                bankCode = bankCode || this.getBankCode(config, currency);
            }

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

            await this.applyCurrencySpecificFields(transactionData, userInfo);

            const payload = this.buildPayload(config, transactionData);
            const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);
            const payURL = `${config.BASE_URL}/${config.merchantCode}/v2/dopayment?key=${encrypted}`;

            
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(payURL, { 
                method: "GET",
                signal: controller.signal 
            });
            clearTimeout(timeout);

            if (response.ok || (response.status >= 300 && response.status < 400)) {
                logger.info(`✅ PayURL Aktif (${response.status}) [${transactionCode}]: ${payURL}`);
                this.stats.success++;
                return { success: true, payURL };
            } else {
                throw new Error(`Halaman mengembalikan status HTTP ${response.status}`);
            }

        } catch (error) {
            let errorMsg = error.message;
            if (error.name === 'AbortError') {
                errorMsg = "Request timeout / website lambat merespon";
            }
            
            logger.error(`❌ PayURL TIDAK BISA DIBUKA (${transactionCode}): ${errorMsg}`);
            this.stats.failed++;
            return { success: false, error: errorMsg };
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Progress tracking
    updateProgress(current, total, currency) {
        const percentage = ((current / total) * 100).toFixed(1);
        const elapsed = Date.now() - this.stats.startTime;
        const eta = current > 0 ? (elapsed / current) * (total - current) : 0;
        
        logger.info(`Progress [${currency}]: ${current}/${total} (${percentage}%) - ETA: ${Math.round(eta/1000)}s`);
    }

    async processCurrencyBatch(currency, transactionCodes, amounts, bankCode, maxConcurrency = 5) {
        logger.info(`\n🚀 Processing ${transactionCodes.length} transactions for ${currency}...`);
        
        const results = [];
        for (let i = 0; i < transactionCodes.length; i += maxConcurrency) {
            const batch = transactionCodes.slice(i, i + maxConcurrency);
            const batchAmounts = amounts.slice(i, i + maxConcurrency);
            
            const promises = batch.map((transactionCode, index) => 
                this.createDepositV2({
                    currency,
                    amount: batchAmounts[index],
                    transactionCode,
                    bankCode
                })
            );

            const batchResults = await Promise.allSettled(promises);
            results.push(...batchResults);
            
            this.updateProgress(Math.min(i + maxConcurrency, transactionCodes.length), transactionCodes.length, currency);
            
            if (i + maxConcurrency < transactionCodes.length) {
                await this.delay(500);
            }
        }

        return results;
    }

    getUserInput() {
        const envCurrency = process.env.CURRENCY;
        let currencyCode = [];

        if (envCurrency && AVAILABLE_CURRENCIES.includes(envCurrency.trim())) {
            currencyCode = [envCurrency.trim()];
        } else {
            console.error(`❌ Invalid currency: ${envCurrency}`);
            process.exit(1);
        }

        const jumlah = this.validateTransactionCount(
            readlineSync.questionInt("Berapa Transaksi: ")
        );

        let amounts = [];
        if (jumlah === 1) {
            const fixedAmount = readlineSync.questionInt("Masukkan amount: ");
            amounts = [fixedAmount];
        } else {
            const min = readlineSync.questionInt("Masukkan minimum amount: ");
            const max = readlineSync.questionInt("Masukkan maximum amount: ");
            this.validateAmountRange(min, max);
            
            amounts = Array.from({ length: jumlah }, () => randomAmount(min, max));
        }

        return { currencyCode, jumlah, amounts };
    }

    async handleBankCodes(currencyCode) {
        for (const currency of currencyCode) {
            const config = getCurrencyConfig(currency);
            if (!config.requiresBankCode && currency !== "NPR") continue;

            const hint = currency === "NPR" ? " (depositor bank code, default FONEPAY)" : "";
            logger.info(`\n${currency} membutuhkan bank code${hint}.`);
            logger.info(`Bisa diisi lebih dari 1, pisahkan dengan koma (misal: KBNK,SCB,BBL). Akan dirandom per transaksi.`);

            if (currency === "MMK") {
                const bankCode = readlineSync.question(`Masukkan Bank Code untuk MMK (default wavepay): `) || "wavepay";
                if (!/^[a-zA-Z0-9]+$/.test(bankCode)) {
                    throw new Error("Bank Code must contain only letters and numbers");
                }
                this.userBankCodes[currency] = [bankCode.toLowerCase()];
                continue;
            }

            const raw = readlineSync.question(`Bank Code untuk ${currency}${hint}: `);
            const codes = (raw || (currency === "NPR" ? "FONEPAY" : "")).split(/[,\s]+/).map(c => c.trim()).filter(Boolean);
            if (codes.length === 0) {
                throw new Error(`Bank Code untuk ${currency} wajib diisi.`);
            }
            codes.forEach(c => {
                if (!/^[a-zA-Z0-9]+$/.test(c)) {
                    throw new Error(`Bank Code '${c}' untuk ${currency} hanya boleh huruf/angka.`);
                }
            });
            this.userBankCodes[currency] = codes;
        }
    }

    async batchDepositV2() {
        try {
            logger.info("======== Batch Deposit Request ========");
            this.stats.startTime = Date.now();

            const { currencyCode, jumlah, amounts } = this.getUserInput();
            
            this.stats.total = currencyCode.length * jumlah;

            await this.handleBankCodes(currencyCode);

            for (const currency of currencyCode) {
                logger.info(`\nProcessing ${currency} (${jumlah} transaksi)...`);
                const transactionCodes = this.generateTransactionCodes(jumlah);
                
                await this.processCurrencyBatch(currency, transactionCodes, amounts);
            }

            this.stats.endTime = Date.now();
            this.printSummary();

        } catch (error) {
            logger.error(`❌ Batch processing error: ${error.message}`);
        }
    }

    printSummary() {
        const duration = (this.stats.endTime - this.stats.startTime) / 1000;

        logger.info("======== BATCH SUMMARY ========");
        logger.info(`Total Transactions: ${this.stats.total}`);
        logger.info(`Successful: ${this.stats.success}`);
        logger.info(`Failed: ${this.stats.failed}`);
        logger.info(`Total Duration: ${duration.toFixed(2)}s`);
        logger.info(`Average per transaction: ${(duration / this.stats.total).toFixed(2)}s`);
        logger.info("======== BATCH REQUEST DONE ========\n\n");
    }
}

// Alternative simpler approach for smaller batches
class SimpleBatchDepositV2 {
    static async execute() {
        logger.info("======== Batch Deposit Request ========");
        
        try {
            const availableCurrencies = ["INR", "BDT", "VND", "MMK"];
            const input = readlineSync.question(`Pilih currency (${availableCurrencies.join("/")}, atau 'ALL'): `).toUpperCase();

            let currencyCode = [];
            if (input === "ALL") {
                currencyCode = availableCurrencies;
            } else if (availableCurrencies.includes(input)) {
                currencyCode = [input];
            } else {
                throw new Error("Invalid currency selection");
            }

            const jumlah = readlineSync.questionInt("Berapa Transaksi: ");
            if (jumlah < 1 || jumlah > 100) {
                throw new Error("Transaction count must be between 1 and 100");
            }

            let amounts = [];
            if (jumlah === 1) {
                amounts = [readlineSync.questionInt("Masukkan amount: ")];
            } else {
                const min = readlineSync.questionInt("Masukkan minimum amount: ");
                const max = readlineSync.questionInt("Masukkan maximum amount: ");
                amounts = Array.from({ length: jumlah }, () => randomAmount(min, max));
            }

            let lastTransactionNumber = Math.floor(Date.now() / 1000);
            
            for (const currency of currencyCode) {
                logger.info(`\nProcessing ${currency}...`);
                
                for (let i = 0; i < jumlah; i++) {
                    const transactionCode = `TEST-DP-${++lastTransactionNumber}`;
                    const amount = amounts[i] || amounts[0];
                    
                    await createDepositV2({ currency, amount, transactionCode });
                }
            }

            logger.info("======== BATCH REQUEST DONE ========\n\n");
            
        } catch (error) {
            logger.error(`❌ Error: ${error.message}`);
        }
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
            logger.error("❌ Bank Code harus berupa huruf/angka.");
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

    const payload = payloadParts.join('&');
    const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);
    const payURL = `${config.BASE_URL}/${config.merchantCode}/v2/dopayment?key=${encrypted}`;

    logger.info(`🔗 PayURL: ${payURL}`);
}

// Main execution - choose approach
const batchService = new BatchDepositV2Service();
batchService.batchDepositV2();

// Alternative execution (uncomment to use simple approach)
// SimpleBatchDepositV2.execute();