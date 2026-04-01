import fetch from "node-fetch";
import { randomInt } from "crypto";
import readlineSync from "readline-sync";
import logger from "../../logger.js";
import { encryptDecrypt } from "../../helpers/utils.js";
import * as AllConfigs from "../../Config/config.js";
import { randomPhoneNumber } from "../../helpers/payoutHelper.js";
import { generateUTR, randomAmount } from "../../helpers/depositHelper.js";
import { sendCallback } from "../../helpers/callbackHelper.js";

const AVAILABLE_CURRENCIES = ["INR", "BDT", "VND", "MMK"];
const UTR_CURRENCIES = ["INR", "BDT"];
const PHONE_REQUIRED_CURRENCIES = ["BDT"];
const MAX_CONCURRENT_REQUESTS = 10;
const REQUEST_TIMEOUT = 30000; // 30 seconds
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 second base delay

class BatchDepositV4Service {
    constructor() {
        this.lastTransactionNumber = 0;
        this.stats = {
            total: 0,
            success: 0,
            failed: 0,
            utrSubmitted: 0,
            // callbackSent: 0,
            startTime: null,
            endTime: null,
            errors: []
        };
        this.currencyConfig = this.initializeCurrencyConfig();
    }

    initializeCurrencyConfig() {
        const configMap = {};
        const AVAILABLE_CURRENCIES = ["INR", "BDT", "VND", "MMK", "THB", "JPY", "BRL"]; // Tambah sesuai kebutuhan

        AVAILABLE_CURRENCIES.forEach(cur => {
            configMap[cur] = {
                BASE_URL: AllConfigs.BASE_URL,
                merchantCode: AllConfigs[`MERCHANT_CODE_${cur}`],
                depositMethod: AllConfigs[`DEPOSIT_METHOD_${cur}`],
                secretKey: AllConfigs[`SECRET_KEY_${cur}`],
                merchantAPI: AllConfigs[`MERCHANT_API_KEY_${cur}`],
                bankCodeOptions: this.getDefaultBankCodes(cur),
                requiresUTR: ["INR", "BDT"].includes(cur),
                requiresPhone: ["BDT"].includes(cur)
            };
        });
        return configMap;
    }

    getDefaultBankCodes(currency) {
        const defaultCodes = {
            VND: ["eximbank", "techcombank", "mbbank", "tpbank", "vpbank"],
            BDT: ["1002", "1001", "1004", "1003"],
        };
        return defaultCodes[currency] || null;
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
        if (count < 1) {
            throw new Error("Transaction count must be at least 1");
        }
        if (count > 1000) {
            throw new Error("Transaction count cannot exceed 1000 for safety");
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

    generateTransactionCodes(count) {
        if (this.lastTransactionNumber === 0) {
            this.lastTransactionNumber = Math.floor(Date.now() / 1000);
        }

        const codes = [];
        for (let i = 1; i <= count; i++) {
            this.lastTransactionNumber += 1;
            codes.push(`TEST-DP-${this.lastTransactionNumber}`);
        }
        return codes;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async fetchWithTimeout(url, options, timeout = REQUEST_TIMEOUT) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }

    async submitUTR(currency, transactionCode, retries = RETRY_ATTEMPTS) {
        const config = this.currencyConfig[currency];
        if (!config || !config.requiresUTR) {
            return { success: true, skipped: true };
        }

        const utr = generateUTR(currency);
        const payloadString = `transaction_code=${transactionCode}&utr=${utr}`;
        const encryptedPayload = encryptDecrypt("encrypt", payloadString, config.merchantAPI, config.secretKey);

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await this.fetchWithTimeout(
                    `${AllConfigs.BASE_URL}/api/${config.merchantCode}/v3/submit-utr`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ key: encryptedPayload })
                    }
                );

                const responseText = await response.text();
                
                try {
                    JSON.parse(responseText);
                    this.stats.utrSubmitted++;
                    return { success: true, utr, response: responseText };
                } catch (e) {
                    logger.warn(`⚠️ Invalid JSON response in submitUTR (${transactionCode}):`, responseText);
                    return { success: false, error: "Invalid JSON response", response: responseText };
                }
            } catch (err) {
                if (attempt === retries) {
                    logger.error(`❌ Submit UTR Failed after ${retries} attempts (${transactionCode}):`, err.message);
                    return { success: false, error: err.message };
                } else {
                    logger.warn(`⚠️ Submit UTR attempt ${attempt} failed (${transactionCode}), retrying...`);
                    await this.delay(RETRY_DELAY * attempt); // Exponential backoff
                }
            }
        }

        return { success: false, error: "Max retries exceeded", utr: utr };
    }

    // async sendCallbackSafe(callbackData, transactionCode) {
    //     try {
    //         await sendCallback(callbackData);
    //         this.stats.callbackSent++;
    //         logger.info(`✅ Callback success for transaction_no ${callbackData.transactionNo}`);
    //         return { success: true };
    //     } catch (error) {
    //         logger.error(`❌ Callback failed for ${transactionCode}:`, error.message);
    //         return { success: false, error: error.message };
    //     }
    // }

    buildPayload(config, transactionData) {
        const payload = {
            callback_url: AllConfigs.CALLBACK_URL,
            merchant_api_key: config.merchantAPI,
            merchant_code: config.merchantCode,
            transaction_code: transactionData.transactionCode,
            transaction_timestamp: transactionData.timestamp,
            transaction_amount: transactionData.amount,
            user_id: randomInt(100000, 999999),
            currency_code: transactionData.currency,
            payment_code: config.depositMethod
        };

        if (transactionData.bankCode) payload.bank_code = transactionData.bankCode;
        if (transactionData.phone) payload.phone = transactionData.phone;

        return Object.entries(payload)
            .map(([key, val]) => `${key}=${val}`)
            .join('&');
    }

    async sendDeposit({ currency, amount, transactionCode }) {
        const config = this.currencyConfig[currency];
        if (!config) {
            const error = `Invalid currency: ${currency}`;
            logger.error(`❌ ${error}`);
            this.stats.failed++;
            this.stats.errors.push({ transactionCode, error });
            return { success: false, error };
        }

        try {
            const timestamp = this.lastTransactionNumber;
            
            let bankCode = "";
            if (config.bankCodeOptions) {
                bankCode = config.bankCodeOptions[Math.floor(Math.random() * config.bankCodeOptions.length)];
            }

            let phone = "";
            if (config.requiresPhone) {
                phone = randomPhoneNumber();
            }

            const transactionData = {
                transactionCode,
                timestamp,
                amount,
                currency,
                bankCode,
                phone
            };

            const payload = this.buildPayload(config, transactionData);
            const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);

            const response = await this.fetchWithTimeout(
                `${config.BASE_URL}/api/${config.merchantCode}/v4/dopayment`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ key: encrypted })
                }
            );

            const responseBody = await response.text();
            let resultDP;
            
            try {
                resultDP = JSON.parse(responseBody);
            } catch (parseError) {
                throw new Error(`Failed to parse response JSON: ${parseError.message}`);
            }

            if (resultDP.status === "success") {
                const transactionNo = resultDP.transaction_no;
                let utr = " ";

                if (config.requiresUTR) {
                    const utrSubmitted = await this.submitUTR(currency, transactionCode);
                    if (utrSubmitted.success) {
                        utr = utrSubmitted.utr;
                    }
                }

                let logMsg = `✅ ${transactionNo} | Amount: ${amount} (${currency}) | Pay URL: ${resultDP.pay_url}`;
                if (currency === "INR") logMsg += ` | UTR: ${utr}`;
                // logMsg += ` | Success: ${resultDP.message}`;
                logger.info(logMsg);

                this.stats.success++;

                // if (transactionNo) {
                //     await this.sendCallbackSafe({
                //         transactionNo,
                //         amount,
                //         utr,
                //         status: 0,
                //         transactionType: 1,
                //         currency
                //     }, transactionCode);
                // } else {
                //     logger.warn(`⚠️ transaction_no not found for ${transactionCode}`);
                // }

                return { success: true, transactionNo, result: resultDP };
            } else {
                const error = `Deposit failed: ${JSON.stringify(resultDP)}`;
                logger.error(`❌ Deposit failed for ${transactionCode}:`, resultDP);
                // logger.info(`Payload: ${payload}`);
                
                this.stats.failed++;
                this.stats.errors.push({ transactionCode, error: resultDP });
                return { success: false, error: resultDP };
            }
        } catch (err) {
            const error = `Deposit Error: ${err.message}`;
            logger.error(`❌ ${error} (${transactionCode})`);
            
            this.stats.failed++;
            this.stats.errors.push({ transactionCode, error: err.message });
            return { success: false, error: err.message };
        }
    }

    updateProgress(completed, total) {
        const percentage = ((completed / total) * 100).toFixed(1);
        const elapsed = Date.now() - this.stats.startTime;
        const eta = completed > 0 ? (elapsed / completed) * (total - completed) : 0;
        
        logger.info(`Progress: ${completed}/${total} (${percentage}%) | Success: ${this.stats.success} | Failed: ${this.stats.failed} | ETA: ${Math.round(eta/1000)}s`);
    }

    async processBatch(tasks, maxConcurrency = MAX_CONCURRENT_REQUESTS) {
        const results = [];
        
        for (let i = 0; i < tasks.length; i += maxConcurrency) {
            const batch = tasks.slice(i, i + maxConcurrency);
            const batchPromises = batch.map(task => task());
            
            const batchResults = await Promise.allSettled(batchPromises);
            results.push(...batchResults);
            
            this.updateProgress(Math.min(i + maxConcurrency, tasks.length), tasks.length);
            
            if (i + maxConcurrency < tasks.length) {
                await this.delay(500);
            }
        }
        
        return results;
    }

    getUserInput() {
        const envCurrency = process.env.CURRENCY;
        let currenciesToProcess = [];

        if (envCurrency && AVAILABLE_CURRENCIES.includes(envCurrency.trim())) {
            currenciesToProcess = [envCurrency.trim()];
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

        return { currenciesToProcess, jumlah, amounts };
    }

    async handleMMKBankCode(currenciesToProcess) {
        if (currenciesToProcess.includes("MMK")) {
            const bankCode = readlineSync.question("Masukkan Bank Code untuk MMK: ");
            if (!/^[a-zA-Z0-9]+$/.test(bankCode)) {
                throw new Error("Bank Code must contain only letters and numbers");
            }
            this.currencyConfig.MMK.bankCodeOptions = [bankCode.toLowerCase()];
        }
    }

    async batchDeposit() {
        try {
            logger.info("======== Batch Deposit V3 Request ========");
            this.stats.startTime = Date.now();

            const { currenciesToProcess, jumlah, amounts } = this.getUserInput();
            await this.handleMMKBankCode(currenciesToProcess);

            this.stats.total = currenciesToProcess.length * jumlah;

            const tasks = [];
            for (const currency of currenciesToProcess) {
                const transactionCodes = this.generateTransactionCodes(jumlah);
                for (let i = 0; i < transactionCodes.length; i++) {
                    const transactionCode = transactionCodes[i];
                    const amount = amounts[i] || amounts[0];
                    
                    tasks.push(() => this.sendDeposit({ currency, amount, transactionCode }));
                }
            }

            await this.processBatch(tasks);

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
        logger.info(`Successful Deposits: ${this.stats.success}`);
        logger.info(`Failed Deposits: ${this.stats.failed}`);
        logger.info(`UTR Submitted: ${this.stats.utrSubmitted}`);
        // logger.info(`Callbacks Sent: ${this.stats.callbackSent}`);
        logger.info(`Total Duration: ${duration.toFixed(2)}s`);
        
        if (this.stats.total > 0) {
            logger.info(`Average per transaction: ${(duration / this.stats.total).toFixed(2)}s`);
        }

        if (this.stats.errors.length > 0) {
            const errorCounts = {};
            this.stats.errors.forEach(error => {
                const errorMsg = typeof error.error === 'string' ? error.error : JSON.stringify(error.error);
                errorCounts[errorMsg] = (errorCounts[errorMsg] || 0) + 1;
            });

            Object.entries(errorCounts)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
                .forEach(([error, count]) => {
                    logger.info(`${count} transactions: ${error}`);
                });
        }

        logger.info("======== REQUEST DONE ========\n\n");
    }
}

const batchService = new BatchDepositV4Service();
batchService.batchDeposit();
