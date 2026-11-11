import fetch from "node-fetch";
import readlineSync from "readline-sync";
import logger from "../../logger.js";
import { faker } from "@faker-js/faker";
import crypto, { randomInt } from "crypto";
import { 
    encryptDecrypt, 
    signVerify, 
    getRandomIP, 
    getRandomName, 
    generateEmail, 
    getAccountNumber 
} from "../../helpers/utils.js";
import { 
    randomPhoneNumber, 
    randomMyanmarPhoneNumber, 
    randomCardNumber, 
    generateUTR, 
    randomAmount 
} from "../../helpers/depositHelper.js";
import { getCurrencyConfig } from "../../helpers/depositConfigMap.js";
import { getSupportedCurrencies, validateCurrency } from "../../helpers/currencyHelper.js";
import { CALLBACK_URL } from "../../Config/config.js";

const UTR_CURRENCIES = ["INR", "BDT", "MMK"];
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

class BatchDepositV5Service {
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

    getCurrencyConfig(currency) {
        const config = getCurrencyConfig(currency);
        config.bankCodeOptions = this.userBankCodes[currency] || config.bankCodeOptions || null;
        return config;
    }

    validateTransactionCount(count) {
        if (count < 1) throw new Error("Transaction count must be at least 1");
        if (count > 1000) throw new Error("Transaction count cannot exceed 1000 for safety");
        return count;
    }

    validateAmountRange(min, max) {
        if (min > max) throw new Error("Minimum amount must be less than maximum amount");
        if (min < 1) throw new Error("Minimum amount must be at least 1");
        return { min, max };
    }

    generateTransactionCodes(count) {
        if (this.lastTransactionNumber === 0) {
            this.lastTransactionNumber = Math.floor(Date.now() / 1000);
        }
        const codes = [];
        for (let i = 1; i <= count; i++) {
            this.lastTransactionNumber += 1;
            codes.push(`TEST-DP-V5-${this.lastTransactionNumber}`);
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
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }

    async submitUTR(currency, transactionCode, bankCode, baseURL = null, retries = RETRY_ATTEMPTS) {
        if (!UTR_CURRENCIES.includes(currency)) return { success: true, skipped: true };

        const config = this.getCurrencyConfig(currency);
        const targetBaseURL = baseURL || config.BASE_URL;

        let reference = generateUTR(currency);
        if (currency === 'MMK' && (bankCode === 'KBZPAY' || bankCode === 'WAVEPAY')) {
            reference = reference.substring(0, 5);
        }

        const payloadObj = { transaction_code: transactionCode, reference };
        const payloadStr = JSON.stringify(payloadObj);
        const signature = signVerify("sign", payloadStr, config.secretKey);

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await this.fetchWithTimeout(
                    `${targetBaseURL}/api/${config.merchantCode}/v5/submitReference`,
                    {
                        method: "POST",
                        headers: { 
                            "Content-Type": "application/json", 
                            sign: signature 
                        },
                        body: payloadStr
                    }
                );

                const responseText = await response.text();
                try {
                    const parsed = JSON.parse(responseText);
                    // logger.info(`Submit UTR Response (${transactionCode}):\n${JSON.stringify(parsed, null, 2)}`);
                    this.stats.utrSubmitted++;
                    return { success: true, reference, response: responseText };
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
                    await this.delay(RETRY_DELAY * attempt);
                }
            }
        }

        return { success: false, error: "Max retries exceeded" };
    }

    getBankCode(currency, config) {
        if (currency === "BRL") return "PIX";
        if (currency === "MXN") return "SPEI";
        if (config.bankCodeOptions && config.bankCodeOptions.length) {
            return config.bankCodeOptions[Math.floor(Math.random() * config.bankCodeOptions.length)];
        }
        return "";
    }

    getPhone(currency, bankCode) {
        if (currency === "BDT") return randomPhoneNumber("bdt");
        if (currency === "MMK" && (bankCode === "WAVEPAY" || bankCode === "wavepay")) return randomMyanmarPhoneNumber();
        if (currency === "IDR" && (bankCode === "OVO" || bankCode === "ovo")) return randomPhoneNumber("idr");
        if (["INR", "MYR", "PKR", "TWD"].includes(currency)) return randomPhoneNumber(currency.toLowerCase());
        return "";
    }

    async applyCurrencySpecificPayload(payload, currency, bankCode, cardNumber) {
        switch (currency) {
            // Logic Erfolgpay (Commented as requested)
            /*
            case "INR":
                payload.product_name="pillow"
                payload.cust_name="Percival Parlay Peacock"
                payload.cust_email="percival_peacock@test.com"
                payload.cust_phone="9812763405"
                payload.cust_city="Mumbai"
                payload.cust_country="India"
                payload.zip_code="21323",
                payload.cust_pan_number="VIPPA1236A",
                payload.cust_address="The Stacks, Columbus, Ohio",
                payload.cust_website_url="https://api.mins31.com"
                break;
            */
            case "KRW":
                payload.cust_name = await getRandomName("kr", true);
                payload.bank_name = bankCode;
                payload.bank_code = bankCode;
                payload.bank_account_number = await getAccountNumber(5);
                payload.card_holder_name = await getRandomName("kr", true);
                break;
            case "JPY":
                if (!payload.cust_name) payload.cust_name = await getRandomName("jp", true);
                break;
            case "THB":
                payload.account_type = "Savings";
                payload.cust_name = await getRandomName("th", true);
                payload.depositor_bank = bankCode;
                payload.bank_account_number = cardNumber;
                break;
            case "HKD":
                payload.card_number = "3566111111111113";
                payload.card_date = "06/25";
                payload.card_cvv = "100";
                payload.card_holder_name = "bob Brown";
                break;
            case "IDR":
                payload.cust_phone = randomPhoneNumber("idr");
                break;
            case "MMK":
                payload.bank_code = bankCode || "KBZPAY";
                break;
        }
        return payload;
    }

    async makeDepositRequest(config, payloadStr, signature, transactionCode) {
        const urls = Object.keys(process.env)
            .filter(key => key.startsWith('BASE_URL'))
            .map(key => process.env[key]?.trim())
            .filter(Boolean);

        if (!urls.length && config.BASE_URL) {
            urls.push(config.BASE_URL.trim());
        }

        for (const base of urls) {
            const url = `${base}/api/${config.merchantCode}/v5/generateDeposit`;

            try {
                const response = await this.fetchWithTimeout(url, {
                    method: "POST",
                    headers: { 
                        "Content-Type": "application/json", 
                        sign: signature 
                    },
                    body: payloadStr
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
            config = this.getCurrencyConfig(currency);
        } catch (err) {
            logger.error(`❌ ${err.message}`);
            this.stats.failed++;
            this.stats.errors.push({ transactionCode, error: err.message });
            return { success: false, error: err.message };
        }

        for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
            const currentTxCode = attempt === 1 ? transactionCode : `${transactionCode}-${attempt}`;
            try {
                const bankCode = this.getBankCode(currency, config);
                const phone = this.getPhone(currency, bankCode);
                const cardNumber = config.cardNumber ? randomCardNumber() : "";

                let payload = {
                    transaction_code: currentTxCode,
                    transaction_amount: amount,
                    payment_code: config.depositMethod,
                    user_id: currency === "JPY" ? `CUST-JP-${faker.string.numeric(5)}` : crypto.randomUUID(),
                    currency_code: currency,
                    callback_url: config.callbackURL || CALLBACK_URL,
                    ip_address: getRandomIP(),
                    redirect_url: "https://kaskus.id",
                };

                if (bankCode) payload.bank_code = bankCode;
                if (phone) payload.cust_phone = phone;
                if (cardNumber) payload.card_number = cardNumber;

                payload = await this.applyCurrencySpecificPayload(payload, currency, bankCode, cardNumber);

                const payloadStr = JSON.stringify(payload);
                const signature = signVerify("sign", payloadStr, config.secretKey);

                const { result: resultDP, url: workingBaseURL } = await this.makeDepositRequest(config, payloadStr, signature, currentTxCode);

                const responseLog = typeof resultDP === "object" && resultDP !== null ? JSON.stringify(resultDP, null, 2) : resultDP;
                // logger.info(`Deposit Response (${currentTxCode}):\n${responseLog}`);

                const isSuccess = resultDP && (
                    resultDP.status === "success" ||
                    resultDP.data?.page_url ||
                    resultDP.data?.pay_url ||
                    resultDP.pay_url ||
                    resultDP.data?.transaction_no
                );

                if (isSuccess) {
                    const pageUrl = resultDP.data?.page_url || resultDP.data?.pay_url || resultDP.pay_url || "No URL";
                    const transactionNo = resultDP.data?.transaction_no || resultDP.transaction_no || currentTxCode;
                    
                    let refLog = "";
                    if (UTR_CURRENCIES.includes(currency)) {
                        refLog = generateUTR(currency);
                        if (currency === 'MMK' && (bankCode === 'KBZPAY' || bankCode === 'WAVEPAY')) {
                            refLog = refLog.substring(0, 5);
                        }
                    }

                    let logMsg = `✅ ${transactionNo} | Request Amount: ${amount} (${currency}) | Pay URL: ${pageUrl}`;
                    if (UTR_CURRENCIES.includes(currency)) logMsg += ` | Reference: ${refLog}`;
                    if (bankCode) logMsg += ` | Bank Code: ${bankCode}`;
                    logger.info(logMsg);

                    this.stats.success++;

                    if (UTR_CURRENCIES.includes(currency)) {
                        await this.submitUTR(currency, currentTxCode, bankCode, workingBaseURL);
                    }

                    return { success: true, result: resultDP };
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

                logger.error(`❌ Deposit Error: ${err.message} (${currentTxCode})`);
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
        logger.info(`Progress: ${completed}/${total} (${percentage}%) | Success: ${this.stats.success} | Failed: ${this.stats.failed} | ETA: ${Math.round(eta / 1000)}s`);
    }

    async processBatch(tasks, totalCount) {
        const results = [];
        const dynamicConcurrency = getDynamicBatchSize(totalCount);

        logger.info(`Dynamic concurrency: ${dynamicConcurrency} (untuk ${totalCount} transaksi)`);

        for (let i = 0; i < tasks.length; i += dynamicConcurrency) {
            const batch = tasks.slice(i, i + dynamicConcurrency);
            const batchResults = await Promise.allSettled(batch.map(task => task()));
            results.push(...batchResults);

            this.updateProgress(Math.min(i + dynamicConcurrency, tasks.length), tasks.length);
        }

        return results;
    }

    getUserInput() {
        const currency = process.env.CURRENCY?.trim().toUpperCase();

        if (!currency) {
            console.error("❌ CURRENCY tidak ditemukan di environment. Jalankan via index.js.");
            process.exit(1);
        }

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
            logger.info("======== PayBO Batch Deposit V5 Request ========");
            this.stats.startTime = Date.now();

            const { currency, jumlah, amounts } = this.getUserInput();

            await this.handleBankCodes(currency);

            logger.info(`Currency: ${currency} | Merchant: ${process.env.CURRENT_MERCHANT || "-"}`);

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
            this.stats.errors.forEach(({ error }) => {
                const errorMsg = typeof error === "string" ? error : JSON.stringify(error);
                errorCounts[errorMsg] = (errorCounts[errorMsg] || 0) + 1;
            });

            Object.entries(errorCounts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .forEach(([error, count]) => {
                    logger.error(`${count} transactions: ${error.substring(0, 100)}${error.length > 100 ? "..." : ""}`);
                });
        }

        logger.info("======== REQUEST DONE ========\n\n");
    }
}

const batchService = new BatchDepositV5Service();
batchService.batchDeposit();
