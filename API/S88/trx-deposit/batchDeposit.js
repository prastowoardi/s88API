import fetch from "node-fetch";
import readlineSync from "readline-sync";
import logger from "../../logger.js";
import crypto, { randomInt } from "crypto";
import { encryptDecrypt, getRandomIP, getRandomName, generateEmail } from "../../helpers/utils.js";
import { CALLBACK_URL } from "../../Config/config.js";
import { getCurrencyConfig } from "../../helpers/depositConfigMap.js";
import { getSupportedCurrencies, validateCurrency } from "../../helpers/currencyHelper.js";

import { randomPhoneNumber } from "../../helpers/payoutHelper.js";
import { generateUTR, randomAmount, randomMyanmarPhoneNumber, randomCardNumber } from "../../helpers/depositHelper.js";

const UTR_CURRENCIES = ["INR", "BDT"];
const PHONE_REQUIRED_CURRENCIES = ["BDT"];
const REQUEST_TIMEOUT = 45000; // 45 seconds
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

    async submitUTR(currency, transactionCode, utr, baseURL = null, retries = RETRY_ATTEMPTS) {
        if (!UTR_CURRENCIES.includes(currency)) {
            return { success: true, skipped: true };
        }

        const config = getCurrencyConfig(currency);
        const targetBaseURL = baseURL || config.BASE_URL;

        const payloadString = `transaction_code=${transactionCode}&utr=${utr}`;
        const encryptedPayload = encryptDecrypt("encrypt", payloadString, config.merchantAPI, config.secretKey);

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await this.fetchWithTimeout(
                    `${targetBaseURL}/api/${config.merchantCode}/v3/submit-utr`,
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
        const payload = {
            merchant_api_key: config.merchantAPI,
            merchant_code: config.merchantCode,
            transaction_code: transactionData.transactionCode,
            transaction_timestamp: transactionData.timestamp,
            transaction_amount: transactionData.amount,
            user_id: transactionData.userID,
            currency_code: transactionData.currency,
            payment_code: config.depositMethod,
            ip_address: transactionData.ip,
            ...(transactionData.bankCode && { bank_code: transactionData.bankCode }),
            ...(transactionData.bank_code && !transactionData.bankCode && { bank_code: transactionData.bank_code }),
            ...(transactionData.phone && { phone: transactionData.phone }),
            ...(transactionData.depositor_name && { depositor_name: transactionData.depositor_name }),
            ...(transactionData.depositor_bank && { depositor_bank: transactionData.depositor_bank }),
            ...(transactionData.depositor_bank_code && { depositor_bank_code: transactionData.depositor_bank_code }),
            ...(transactionData.depositor_account_number && { depositor_account_number: transactionData.depositor_account_number }),
            ...(transactionData.email && { email: transactionData.email }),
            callback_url: config.callbackURL || CALLBACK_URL,
        };

        return Object.entries(payload)
            .map(([k, v]) => {
                if (k === "depositor_name" || k === "callback_url" || k === "ip_address" || k === "email" || k === "depositor_merchant_url") return `${k}=${v}`;
                return `${k}=${encodeURIComponent(v)}`;
            })
            .join("&");
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

    async makeDepositRequest(config, encrypted, transactionCode, currency) {
        const urls = Object.keys(process.env)
            .filter(key => key.startsWith('BASE_URL'))
            .map(key => process.env[key]?.trim())
            .filter(Boolean);

        if (!urls.length && config.BASE_URL) {
            urls.push(config.BASE_URL.trim());
        }

        const endpoint = currency === "KRW"
            ? `/api/${config.merchantCode}/v3/krw-payment`
            : `/api/${config.merchantCode}/v3/dopayment`;

        for (const base of urls) {
            const url = `${base}${endpoint}`;

            try {
                const response = await this.fetchWithTimeout(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ key: encrypted })
                });

                const responseBody = await response.text();
                let resultDP;

                try {
                    resultDP = JSON.parse(responseBody);
                } catch (parseError) {
                    logger.warn(`⚠️ Failed to parse JSON from ${url} (${transactionCode}): ${parseError.message}`);
                    continue;
                }

                if (!response.ok) {
                    if (resultDP?.message === "[DP] Unauthorize" || response.status === 401) {
                        logger.warn(`⚠️ Unauthorized at ${base}, trying next...`);
                        continue;
                    }
                    if (resultDP?.status === "failed") {
                        return { result: resultDP, url: base };
                    }
                    throw new Error(`HTTP ${response.status}: ${responseBody}`);
                }

                return { result: resultDP, url: base };
            } catch (err) {
                if (err.message.includes("HTTP")) throw err;
                logger.warn(`⚠️ Connection issue at ${base} (${transactionCode}): ${err.message}, trying next...`);
                continue;
            }
        }

        throw new Error("All API URLs failed (Unauthorized or Connection Issue)");
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

        for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
            const currentTxCode = attempt === 1 ? transactionCode : `${transactionCode}-${attempt}`;
            try {
                const timestamp = Math.floor(Date.now() / 1000);
                
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
                    transactionCode: currentTxCode,
                    timestamp,
                    amount,
                    currency,
                    userID: crypto.randomUUID(),
                    ip: getRandomIP(),
                    bankCode,
                    phone
                };

                await this.applyCurrencySpecificFields(transactionData, userInfo);

                const payload = this.buildPayload(config, transactionData);
                const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);

                const { result: resultDP, url: workingBaseURL } = await this.makeDepositRequest(config, encrypted, currentTxCode, currency);

                if (resultDP && resultDP.status === "success") {
                    const transactionNo = resultDP.transaction_no;
                    const remark = resultDP?.data?.additional?.remark || "-";

                    let utr = "-";
                    if (UTR_CURRENCIES.includes(currency)) {
                        utr = generateUTR(currency); 
                    }

                    let logMsg = `✅ ${transactionNo} | Amount: ${amount} (${currency}) | Remark: ${remark}`;
                    if (UTR_CURRENCIES.includes(currency)) logMsg += ` | UTR: ${utr}`;
                    logMsg += ` | Success: ${resultDP.message}`;
                    logger.info(logMsg);                

                    this.stats.success++;

                    if (UTR_CURRENCIES.includes(currency)) {
                        await this.submitUTR(currency, currentTxCode, utr, workingBaseURL); 
                    }

                    return { success: true, transactionNo, result: resultDP };
                } else {
                    const errorMsg = resultDP?.message || JSON.stringify(resultDP);
                    const isUnauthorized = errorMsg.toLowerCase().includes("unauthoriz");
                    if (isUnauthorized && attempt < RETRY_ATTEMPTS) {
                        logger.warn(`⚠️ [Attempt ${attempt}/${RETRY_ATTEMPTS}] Unauthorized for ${currentTxCode}, retrying...`);
                        await this.delay(500);
                        continue;
                    }

                    logger.error(`❌ Deposit failed for ${currentTxCode}: ${errorMsg}`);
                    this.stats.failed++;
                    this.stats.errors.push({ transactionCode: currentTxCode, error: resultDP });
                    return { success: false, error: resultDP };
                }
            } catch (err) {
                const isUnauthorized = err.message.toLowerCase().includes("unauthoriz");
                if (isUnauthorized && attempt < RETRY_ATTEMPTS) {
                    logger.warn(`⚠️ [Attempt ${attempt}/${RETRY_ATTEMPTS}] Unauthorized for ${currentTxCode}, retrying...`);
                    await this.delay(500);
                    continue;
                }

                const error = `Deposit Error: ${err.message}`;
                logger.error(`❌ ${error} (${currentTxCode})`);
                this.stats.failed++;
                this.stats.errors.push({ transactionCode: currentTxCode, error: err.message });
                return { success: false, error: err.message };
            }
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