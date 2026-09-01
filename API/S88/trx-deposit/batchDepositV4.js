import fetch from "node-fetch";
import { randomInt } from "crypto";
import readlineSync from "readline-sync";
import logger from "../../logger.js";
import { encryptDecrypt, getRandomIP, getRandomName, generateEmail } from "../../helpers/utils.js";
import * as AllConfigs from "../../Config/config.js";
import { randomPhoneNumber, randomMyanmarPhoneNumber, randomCardNumber, generateUTR, randomAmount } from "../../helpers/depositHelper.js";
import { sendCallback } from "../../helpers/callbackHelper.js";
import { getCurrencyConfig } from "../../helpers/depositConfigMap.js";

const AVAILABLE_CURRENCIES = ["INR", "VND", "BDT", "MMK", "BRL", "IDR", "THB", "MXN", "KRW", "PHP", "HKD", "KHR", "MYR", "JPY", "PKR", "NPR"];
const UTR_CURRENCIES = ["INR", "BDT"];
const PHONE_REQUIRED_CURRENCIES = ["BDT"];
const MAX_CONCURRENT_REQUESTS = 10;
const REQUEST_TIMEOUT = 30000; // 30 seconds
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 second base delay

class BatchDepositV4Service {
    constructor() {
        this.lastTransactionNumber = 0;
        this.userBankCodes = {};
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
    }

    getCurrencyConfig(currency) {
        const config = getCurrencyConfig(currency);
        config.bankCodeOptions = this.userBankCodes[currency] || null;
        return config;
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
        if (!UTR_CURRENCIES.includes(currency)) {
            return { success: true, skipped: true };
        }

        const config = this.getCurrencyConfig(currency);
        const utr = generateUTR(currency);
        const payloadString = `transaction_code=${transactionCode}&utr=${utr}`;
        const encryptedPayload = encryptDecrypt("encrypt", payloadString, config.merchantAPI, config.secretKey);

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await this.fetchWithTimeout(
                    `${config.BASE_URL}/api/${config.merchantCode}/v3/submit-utr`,
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

    buildPayload(config, transactionData, userInfo) {
        const payload = {
            callback_url: AllConfigs.CALLBACK_URL,
            merchant_api_key: config.merchantAPI,
            merchant_code: config.merchantCode,
            transaction_code: transactionData.transactionCode,
            transaction_timestamp: transactionData.timestamp,
            transaction_amount: transactionData.amount,
            user_id: transactionData.userID,
            currency_code: transactionData.currency,
            payment_code: config.depositMethod,
            ip_address: transactionData.ip
        };

        if (transactionData.bankCode) payload.bank_code = transactionData.bankCode;
        if (transactionData.bank_code) payload.bank_code = transactionData.bank_code;
        if (transactionData.depositor_bank) payload.depositor_bank = transactionData.depositor_bank;
        if (transactionData.depositor_bank_code) payload.depositor_bank_code = transactionData.depositor_bank_code;
        if (transactionData.depositor_name) payload.depositor_name = transactionData.depositor_name;
        if (transactionData.depositor_account_number) payload.depositor_account_number = transactionData.depositor_account_number;
        if (transactionData.email) payload.email = transactionData.email;
        if (transactionData.phone) payload.phone = transactionData.phone;

        return Object.entries(payload)
            .map(([key, val]) => {
                if (key === "depositor_name" || key === "callback_url" || key === "redirect_url" || key === "ip_address" || key === "email") return `${key}=${val}`; // biarkan plain (biar tidak double encode)
                return `${key}=${encodeURIComponent(val)}`;
            })
            .join('&');
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
            tx.depositor_name = sanitizeName(await getRandomName());
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

    async sendDeposit({ currency, amount, transactionCode }) {
        let config;
        try {
            config = this.getCurrencyConfig(currency);
        } catch (err) {
            const error = err.message;
            logger.error(`❌ ${error}`);
            this.stats.failed++;
            this.stats.errors.push({ transactionCode, error });
            return { success: false, error };
        }

        try {
            const timestamp = this.lastTransactionNumber;

            const userInfo = {
                accountNumber: randomCardNumber(),
                data: await generateEmail()
            };

            let bankCode = "";
            if (currency !== "NPR" && config.bankCodeOptions) {
                bankCode = config.bankCodeOptions[Math.floor(Math.random() * config.bankCodeOptions.length)];
            }

            let phone = "";
            if (currency === "MMK" && bankCode === "wavepay") {
                phone = randomMyanmarPhoneNumber();
            } else if (["BDT", "INR", "MYR", "NPR", "PKR"].includes(currency)) {
                phone = randomPhoneNumber(currency.toLowerCase());
            }

            const transactionData = {
                transactionCode,
                timestamp,
                amount,
                currency,
                userID: randomInt(100, 999),
                ip: getRandomIP(),
                bankCode,
                phone
            };

            await this.applyCurrencySpecificFields(transactionData, userInfo);

            const payload = this.buildPayload(config, transactionData, userInfo);
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
                const parsedData = JSON.parse(responseBody);
                resultDP = Array.isArray(parsedData) ? parsedData[0] : parsedData;
            } catch (parseError) {
                throw new Error(`Failed to parse response JSON: ${parseError.message}`);
            }

            if (resultDP && resultDP.status === "success") {
                const transactionNo = resultDP.transaction_no;
                const actualAmount = resultDP.amount;
                let utr = " ";

                if (UTR_CURRENCIES.includes(currency)) {
                    const utrSubmitted = await this.submitUTR(currency, transactionCode);
                    if (utrSubmitted.success) {
                        utr = utrSubmitted.utr;
                    }
                }

                let logMsg = `✅ ${transactionNo} | Request Amount: ${amount} (${currency}) | Actual Amount: ${actualAmount} (${currency}) | Pay URL: ${resultDP.pay_url}`;
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
        let currencyCode = [];

        if (envCurrency && AVAILABLE_CURRENCIES.includes(envCurrency.trim().toUpperCase())) {
            currencyCode = [envCurrency.trim().toUpperCase()];
        } else {
            console.error(`❌ Invalid currency: ${envCurrency}. Available: ${AVAILABLE_CURRENCIES.join("/")}`);
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
            const needsBankCode = config.requiresBankCode || currency === "NPR";
            if (!needsBankCode) continue;

            if (currency === "MMK") {
                // MMK tetap minta bank code single (biarkan default wavepay)
                const bankCode = readlineSync.question(`Masukkan Bank Code untuk MMK (default wavepay): `) || "wavepay";
                if (!/^[a-zA-Z0-9]+$/.test(bankCode)) {
                    throw new Error("Bank Code must contain only letters and numbers");
                }
                this.userBankCodes[currency] = [bankCode.toLowerCase()];
            } else {
                const hint = currency === "NPR" ? " (depositor bank code, default FONEPAY)" : "";
                logger.info(`Bisa diisi lebih dari 1, pisahkan dengan koma (misal: KBNK,SCB,BBL). Akan dirandom per transaksi.`);
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
    }

    async batchDeposit() {
        try {
            logger.info("======== Batch Deposit V4 Request ========");
            this.stats.startTime = Date.now();

            const { currencyCode, jumlah, amounts } = this.getUserInput();
            await this.handleBankCodes(currencyCode);

            this.stats.total = currencyCode.length * jumlah;

            const tasks = [];
            for (const currency of currencyCode) {
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
