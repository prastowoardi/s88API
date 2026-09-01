import fetch from "node-fetch";
import readlineSync from "readline-sync";
import logger from "../../logger.js";
import { randomInt } from "crypto";
import { encryptDecrypt, getRandomIP, getRandomName, generateEmail } from "../../helpers/utils.js";
import { CALLBACK_URL } from "../../Config/config.js";
import { getCurrencyConfig } from "../../helpers/depositConfigMap.js";

import { randomPhoneNumber } from "../../helpers/payoutHelper.js";
import { generateUTR, randomAmount, randomMyanmarPhoneNumber, randomCardNumber } from "../../helpers/depositHelper.js";

const UTR_CURRENCIES = ["INR", "BDT"];
const PHONE_REQUIRED_CURRENCIES = ["BDT"];
const REQUEST_TIMEOUT = 30000; // 30 seconds
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 second base delay

// Dynamic batch size based on transaction count
const getDynamicBatchSize = (count) => {
    if (count > 500) return 250;
    if (count > 200) return 40;
    if (count > 100) return 30;
    return 10;
};

class BatchDepositV3Service {
    constructor() {
        this.lastTransactionNumber = 0;
        this.userBankCodes = {};
        this.stats = {
            total: 0,
            success: 0,
            failed: 0,
            utrSubmitted: 0,
            startTime: null,
            endTime: null,
            errors: []
        };
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

    async submitUTR(currency, transactionCode, utr, retries = RETRY_ATTEMPTS) {
        if (!UTR_CURRENCIES.includes(currency)) {
            return { success: true, skipped: true };
        }

        const config = getCurrencyConfig(currency);

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

        return { success: false, error: "Max retries exceeded" };
    }

    buildPayload(config, transactionData) {
        const {
            transactionCode,
            timestamp,
            amount,
            currency,
            bankCode,
            phone
        } = transactionData;

        const payloadParts = [
            `callback_url=${config.callbackURL || CALLBACK_URL}`,
            `merchant_api_key=${config.merchantAPI}`,
            `merchant_code=${config.merchantCode}`,
            `transaction_code=${transactionCode}`,
            `transaction_timestamp=${timestamp}`,
            `transaction_amount=${amount}`,
            `user_id=${transactionData.userID}`,
            `currency_code=${currency}`,
            `payment_code=${config.depositMethod}`,
            `ip_address=${transactionData.ip}`
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

    async sendDeposit({ currency, amount, transactionCode }) {
        let config;
        try {
            config = getCurrencyConfig(currency);
        } catch (err) {
            logger.error(`❌ ${err.message}`);
            this.stats.failed++;
            this.stats.errors.push({ transactionCode, error: err.message });
            return { success: false, error: err.message };
        }

        try {
            const timestamp = this.lastTransactionNumber;
            
            let bankCode = "";
            const bankOptions = config.bankCodeOptions || this.userBankCodes[currency];
            if (currency !== "NPR" && bankOptions && bankOptions.length) {
                bankCode = bankOptions[Math.floor(Math.random() * bankOptions.length)];
            }

            const userInfo = {
                accountNumber: randomCardNumber(),
                data: await generateEmail()
            };

            let phone = "";
            if (PHONE_REQUIRED_CURRENCIES.includes(currency)) {
                phone = randomPhoneNumber(currency.toLowerCase());
            }
            if (currency === "MMK" && bankCode === "wavepay") {
                phone = randomMyanmarPhoneNumber();
            }
            if (["INR", "MYR", "NPR", "PKR"].includes(currency)) {
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

            const payload = this.buildPayload(config, transactionData);
            const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);

            const endpoint = currency === "KRW"
                ? `/api/${config.merchantCode}/v3/krw-payment`
                : `/api/${config.merchantCode}/v3/dopayment`;

            const response = await this.fetchWithTimeout(
                `${config.BASE_URL}${endpoint}`,
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
                const remark = resultDP?.data?.additional?.remark || "-";

                let utr = "-";
                if (UTR_CURRENCIES.includes(currency)) {
                    utr = generateUTR(currency); 
                }

                let logMsg = `✅ ${transactionNo} | Amount: ${amount} (${currency}) | Remark: ${remark}`;
                if (currency === "INR") logMsg += ` | UTR: ${utr}`;
                logMsg += ` | Success: ${resultDP.message}`;
                logger.info(logMsg);                

                this.stats.success++;

                if (UTR_CURRENCIES.includes(currency)) {
                    await this.submitUTR(currency, transactionCode, utr); 
                }

                return { success: true, transactionNo, result: resultDP };
            } else {
                logger.error(`❌ Deposit failed for ${transactionCode}: ${resultDP.message}`);
                
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

    async processBatch(tasks, totalCount) {
        const results = [];
        const dynamicConcurrency = getDynamicBatchSize(totalCount);

        logger.info(`Dynamic concurrency: ${dynamicConcurrency} (untuk ${totalCount} transaksi)`);
        
        for (let i = 0; i < tasks.length; i += dynamicConcurrency) {
            const batch = tasks.slice(i, i + dynamicConcurrency);
            const batchPromises = batch.map(task => task());
            
            const batchResults = await Promise.allSettled(batchPromises);
            results.push(...batchResults);
            
            this.updateProgress(Math.min(i + dynamicConcurrency, tasks.length), tasks.length);
            
            if (i + dynamicConcurrency < tasks.length) {
                await this.delay(500);
            }
        }
        
        return results;
    }

    getUserInput() {
        // Currency di-inject dari index.js via process.env.CURRENCY
        const currency = process.env.CURRENCY?.trim().toUpperCase();

        if (!currency) {
            console.error("❌ CURRENCY tidak ditemukan di environment. Jalankan via index.js.");
            process.exit(1);
        }

        // Validasi currency ada di depositConfigMap
        try {
            getCurrencyConfig(currency);
        } catch {
            console.error(`❌ Currency '${currency}' tidak ada di depositConfigMap.`);
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

        return { currency, jumlah, amounts };
    }

    async handleBankCodes(currency) {
        const config = getCurrencyConfig(currency);
        if (!config.requiresBankCode && currency !== "NPR") return;

        const hint = currency === "NPR" ? " (depositor bank code, default FONEPAY)" : "";
        logger.info(`Bisa diisi lebih dari 1, pisahkan dengan koma (misal: KBNK,SCB,BBL). Akan dirandom per transaksi.`);

        if (currency === "MMK") {
            const bankCode = readlineSync.question(`Masukkan Bank Code untuk MMK (default wavepay): `) || "wavepay";
            if (!/^[a-zA-Z0-9]+$/.test(bankCode)) {
                throw new Error("Bank Code must contain only letters and numbers");
            }
            this.userBankCodes[currency] = [bankCode.toLowerCase()];
            return;
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

    async batchDeposit() {
        try {
            logger.info("======== Batch Deposit V3 Request ========");
            this.stats.startTime = Date.now();

            const { currency, jumlah, amounts } = this.getUserInput();

            await this.handleBankCodes(currency);

            this.stats.total = jumlah;

            const transactionCodes = this.generateTransactionCodes(jumlah);
            const tasks = transactionCodes.map((transactionCode, i) => {
                const amount = amounts[i] || amounts[0];
                return () => this.sendDeposit({ currency, amount, transactionCode });
            });

            await this.processBatch(tasks, this.stats.total);

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
                    logger.error(`${count} transactions: ${error.substring(0, 100)}${error.length > 100 ? '...' : ''}`);
                });
        }

        logger.info("======== REQUEST DONE ========\n\n");
    }
}

const batchService = new BatchDepositV3Service();
batchService.batchDeposit();