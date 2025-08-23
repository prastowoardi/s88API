import fetch from "node-fetch";
import readlineSync from "readline-sync";
import logger from "../../logger.js";
import dotenv from "dotenv";
import { encryptDecrypt, getRandomIP } from "../../helpers/utils.js";
import {
    randomPhoneNumber,
    randomMyanmarPhoneNumber,
    generateUTR,
    randomAmount
} from "../../helpers/depositHelper.js";
import { getCurrencyConfig } from "../../helpers/depositConfigMap.js";

dotenv.config();

const AVAILABLE_CURRENCIES = ["INR", "BDT", "VND", "MMK"];
const UTR_CURRENCIES = ["INR", "BDT"];
const PHONE_REQUIRED_CURRENCIES = {
    MMK: "wavepay",
    BDT: true
};

class BatchDepositV2Service {
    constructor() {
        this.lastTransactionNumber = 0;
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
        if (min >= max) {
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
        if (currency === "BDT") {
            return randomPhoneNumber("bdt");
        }
        return "";
    }

    // Bank code handling with validation
    getBankCode(config) {
        if (config.requiresBankCode) {
            const bankCode = readlineSync.question("Masukkan Bank Code: ");
            if (!/^[a-z0-9]+$/.test(bankCode)) {
                throw new Error("Bank Code must contain only lowercase letters and numbers");
            }
            return bankCode;
        }
        
        if (config.bankCodeOptions) {
            return config.bankCodeOptions[Math.floor(Math.random() * config.bankCodeOptions.length)];
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
        if (phone) payloadParts.push(`phone=${phone}`);

        return payloadParts.join('&');
    }

    async submitUTR(currency, transactionCode, config, retries = 3) {
        if (!UTR_CURRENCIES.includes(currency)) {
            return;
        }

        const utr = generateUTR(currency);
        const utrPayload = `transaction_code=${transactionCode}&utr=${utr}`;
        const encryptedUTR = encryptDecrypt("encrypt", utrPayload, config.merchantAPI, config.secretKey);

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await fetch(`${config.BASE_URL}/api/${config.merchantCode}/v3/submit-utr`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ key: encryptedUTR }),
                    timeout: 10000 // 10 seconds timeout
                });

                const result = await response.text();
                logger.info(`Submit UTR Result (${transactionCode}): ${result}`);
                return;

            } catch (err) {
                if (attempt === retries) {
                    logger.error(`❌ Submit UTR Failed after ${retries} attempts (${transactionCode}):`, err.message);
                } else {
                    logger.warn(`⚠️ Submit UTR attempt ${attempt} failed (${transactionCode}), retrying...`);
                    await this.delay(1000 * attempt); // Exponential backoff
                }
            }
        }
    }

    async createDepositV2({ currency, amount, transactionCode, bankCode }) {
        try {
            const config = getCurrencyConfig(currency);
            const userID = Math.floor(Math.random() * 900) + 100;
            const timestamp = Math.floor(Date.now() / 1000).toString();
            const ip = getRandomIP();

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

            const payload = this.buildPayload(config, transactionData);
            const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);
            const payURL = `${config.BASE_URL}/${config.merchantCode}/v2/dopayment?key=${encrypted}`;

            logger.info(`🔗 PayURL (${transactionCode}): ${payURL}`);

            // Submit UTR if required
            if (UTR_CURRENCIES.includes(currency)) {
                await this.submitUTR(currency, transactionCode, config);
            }

            this.stats.success++;
            return { success: true, payURL };

        } catch (error) {
            logger.error(`❌ Failed to create deposit (${transactionCode}):`, error.message);
            this.stats.failed++;
            return { success: false, error: error.message };
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
        const currencyInput = readlineSync.question(`Pilih currency (${AVAILABLE_CURRENCIES.join("/")}, atau 'ALL'): `);
        const currenciesToProcess = this.validateCurrency(currencyInput);

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

        return { currenciesToProcess, jumlah, amounts };
    }

    async batchDepositV2() {
        try {
            logger.info("======== Batch Deposit Request ========");
            this.stats.startTime = Date.now();

            const { currenciesToProcess, jumlah, amounts } = this.getUserInput();
            
            this.stats.total = currenciesToProcess.length * jumlah;

            // Get bank code once for currencies that require it
            const bankCodes = {};
            for (const currency of currenciesToProcess) {
                const config = getCurrencyConfig(currency);
                if (config.requiresBankCode && !bankCodes[currency]) {
                    logger.info(`\nBank code required for ${currency}`);
                    bankCodes[currency] = this.getBankCode(config);
                }
            }

            for (const currency of currenciesToProcess) {
                const transactionCodes = this.generateTransactionCodes(jumlah);
                const bankCode = bankCodes[currency] || "";
                
                await this.processCurrencyBatch(currency, transactionCodes, amounts, bankCode);
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

            let currenciesToProcess = [];
            if (input === "ALL") {
                currenciesToProcess = availableCurrencies;
            } else if (availableCurrencies.includes(input)) {
                currenciesToProcess = [input];
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
            
            for (const currency of currenciesToProcess) {
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