import fetch from "node-fetch";
import readlineSync from "readline-sync";
import logger from "../../logger.js";
import { faker } from "@faker-js/faker";
import { randomInt } from "crypto";
import { encryptDecrypt, getAccountNumber, getRandomIP, getRandomName } from "../../helpers/utils.js";
import { randomPhoneNumber, randomMyanmarPhoneNumber, randomCardNumber, generateUTR, randomAmount } from "../../helpers/depositHelper.js";
import { getCurrencyConfig } from "../../helpers/depositConfigMap.js";

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

class BatchDepositV4Service {
    constructor() {
        this.lastTransactionNumber = 0;
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
            codes.push(`TEST-DP-V4-${this.lastTransactionNumber}`);
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

    async submitUTR(currency, transactionCode, retries = RETRY_ATTEMPTS) {
        if (!UTR_CURRENCIES.includes(currency)) return { success: true, skipped: true };

        const utr = generateUTR(currency);
        const config = getCurrencyConfig(currency);

        const encryptedPayload = encryptDecrypt(
            "encrypt",
            `transaction_code=${transactionCode}&utr=${utr}`,
            config.merchantAPI,
            config.secretKey
        );

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
                    await this.delay(RETRY_DELAY * attempt);
                }
            }
        }

        return { success: false, error: "Max retries exceeded" };
    }

    getBankCode(currency, config) {
        if (currency === "BRL") return "PIX";
        if (currency === "MXN") return "SPEI";
        if (config.bankCodeOptions) return config.bankCodeOptions[Math.floor(Math.random() * config.bankCodeOptions.length)];
        return "";
    }

    getPhone(currency, bankCode) {
        if (currency === "BDT") return randomPhoneNumber("bdt");
        if (currency === "MMK" && bankCode === "WAVEPAY") return randomMyanmarPhoneNumber();
        if (currency === "IDR" && bankCode === "OVO") return randomPhoneNumber("idr");
        return "";
    }

    async applyCurrencySpecifics(payload, currency, bankCode, cardNumber) {
        switch (currency) {
            case "KRW":
                payload.bank_name = bankCode;
                payload.bank_code = bankCode;
                payload.bank_account_number = await getAccountNumber(5);
                payload.card_holder_name = await getRandomName("kr", true);
                payload.cust_name = await getRandomName("kr", true);
                break;
            case "THB":
                // account_type tidak bisa interaktif di batch — default ke "Savings"
                payload.account_type = "Savings";
                payload.cust_name = await getRandomName("th", true);
                payload.depositor_bank = bankCode;
                payload.bank_account_number = cardNumber;
                break;
            case "JPY":
                payload.cust_name = await getRandomName("jp", true);
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
                payload.bank_code = "KBZPAY";
                break;
        }
        return payload;
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
            const bankCode = this.getBankCode(currency, config);
            const phone = this.getPhone(currency, bankCode);
            const cardNumber = config.cardNumber ? randomCardNumber() : "";

            let payload = {
                transaction_amount: amount,
                payment_code: config.depositMethod,
                user_id: currency === "JPY" ? `CUST-JP-${faker.string.numeric(5)}` : randomInt(100, 999).toString(),
                currency_code: currency,
                callback_url: config.callbackURL,
                ip_address: getRandomIP(),
                redirect_url: "https://kaskus.id",
            };

            if (bankCode) payload.bank_code = bankCode;
            if (phone) payload.cust_phone = phone;
            if (config.cardNumber) payload.card_number = cardNumber;

            payload = await this.applyCurrencySpecifics(payload, currency, bankCode, cardNumber);

            const encryptedTransactionCode = encryptDecrypt("encrypt", transactionCode, config.merchantAPI, config.secretKey);

            const response = await this.fetchWithTimeout(
                `${config.BASE_URL}/api/${config.merchantCode}/v4/generateDeposit`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Encrypted-Transaction": encryptedTransactionCode
                    },
                    body: JSON.stringify(payload)
                }
            );

            const responseBody = await response.text();
            let resultDP;
            try {
                resultDP = JSON.parse(responseBody);
            } catch (parseError) {
                throw new Error(`Failed to parse response JSON: ${parseError.message}`);
            }

            if (response.ok) {
                const pageUrl = resultDP.data?.page_url || resultDP.data?.pay_url || "No URL";
                logger.info(`✅ Success | ${transactionCode} | URL: ${pageUrl}`);
                this.stats.success++;

                if (UTR_CURRENCIES.includes(currency)) {
                    await this.submitUTR(currency, transactionCode);
                }

                return { success: true, result: resultDP };
            } else {
                logger.error(`❌ Deposit failed for ${transactionCode}: ${JSON.stringify(resultDP)}`);
                this.stats.failed++;
                this.stats.errors.push({ transactionCode, error: resultDP });
                return { success: false, error: resultDP };
            }
        } catch (err) {
            logger.error(`❌ Deposit Error: ${err.message} (${transactionCode})`);
            this.stats.failed++;
            this.stats.errors.push({ transactionCode, error: err.message });
            return { success: false, error: err.message };
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

            if (i + dynamicConcurrency < tasks.length) {
                await this.delay(500);
            }
        }

        return results;
    }

    getUserInput() {
        const envCurrency = process.env.CURRENCY?.trim().toUpperCase();
        let currenciesToProcess = [];

        if (envCurrency) {
            try {
                getCurrencyConfig(envCurrency);
                currenciesToProcess = [envCurrency];
            } catch {
                console.error(`❌ Invalid currency: ${envCurrency}`);
                process.exit(1);
            }
        } else {
            console.error("❌ CURRENCY tidak ditemukan. Jalankan via index.js.");
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

    async batchDeposit() {
        try {
            logger.info("======== Batch Deposit V4 Request ========");
            this.stats.startTime = Date.now();

            const { currenciesToProcess, jumlah, amounts } = this.getUserInput();

            logger.info(`Currency: ${currenciesToProcess.join(", ")} | Merchant: ${process.env.CURRENT_MERCHANT || "-"}`);

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

const batchService = new BatchDepositV4Service();
batchService.batchDeposit();