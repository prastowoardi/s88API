import fetch from "node-fetch";
import readlineSync from "readline-sync";
import logger from "../../logger.js";
import { faker } from '@faker-js/faker';
import { randomInt } from "crypto";
import { 
    encryptDecrypt, 
    signVerify, 
    getRandomIP, 
    getRandomName, 
    getAccountNumber, 
    registerCustomerJPY, 
    pollKYCStatus 
} from "../../helpers/utils.js";
import { 
    randomPhoneNumber, 
    randomMyanmarPhoneNumber, 
    randomCardNumber, 
    generateUTR, 
    randomAmount 
} from "../../helpers/depositHelper.js";
import { getCurrencyConfig } from "../../helpers/depositConfigMap.js";

import { BASE_URL, CALLBACK_URL } from "../../Config/config.js";

const SUPPORTED_CURRENCIES = ["INR","VND","BDT","MMK","PMI","KRW","THB","IDR","BRL","MXN","PHP","HKD","JPY","USDT", "KHR"];
const UTR_CURRENCIES = ["INR", "BDT"];
const PHONE_REQUIRED_CURRENCIES = ["BDT"];
const MAX_CONCURRENT_REQUESTS = 10;
const REQUEST_TIMEOUT = 30000;
const RETRY_ATTEMPTS = 3;

const getDynamicBatchSize = (count) => {
    if (count > 500) return 250;
    if (count > 200) return 40;
    if (count > 100) return 30;
    return 10; 
};

class BatchDepositV5Service {
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

    async submitUTR(currency, transactionCode) {
        if (!UTR_CURRENCIES.includes(currency)) return;

        const reference = generateUTR(currency);
        const config = getCurrencyConfig(currency);
        const payloadObj = { transaction_code: transactionCode, reference };
        const payloadStr = JSON.stringify(payloadObj);
        const signature = signVerify("sign", payloadStr, config.secretKey);

        logger.info(`UTR: ${reference} | Signature: ${signature}`);

        try {
            const res = await fetch(`${config.BASE_URL}/api/${config.merchantCode}/v5/submitReference`, {
                method: "POST",
                headers: { "Content-Type": "application/json", sign: signature },
                body: payloadStr
            });

            const text = await res.text();
            const result = JSON.parse(text);
            logger.info(`Submit UTR Response: ${JSON.stringify(result)}`);
            this.stats.utrSubmitted++;
        } catch (err) {
            logger.error(`❌ Submit UTR Error: ${err.message}`);
        }
    }

    getBankCode(currency, config) {
        if (currency === "BRL") return "PIX";
        if (currency === "MXN") return "SPEI";
        if (config.bankCodeOptions) {
            return config.bankCodeOptions[Math.floor(Math.random() * config.bankCodeOptions.length)];
        }
        return "";
    }

    getPhone(currency, bankCode) {
        if (currency === "BDT") return randomPhoneNumber("bdt");
        if (currency === "MMK" && bankCode === "WAVEPAY") return randomMyanmarPhoneNumber();
        if (currency === "IDR" && bankCode === "OVO") return randomPhoneNumber("idr");
        return "";
    }

    async applyCurrencySpecificPayload(payload, currency, bankCode, cardNumber) {
        switch(currency) {
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
                payload.bank_code = "KBZPAY";
                break;
        }
        return payload;
    }

    async sendDeposit({ currency, amount, transactionCode }) {
        const config = getCurrencyConfig(currency);
        if (!config) {
            this.stats.failed++;
            return { success: false };
        }

        try {
            const bankCode = this.getBankCode(currency, config);
            const phone = this.getPhone(currency, bankCode);
            const cardNumber = config.cardNumber ? randomCardNumber() : "";

            let payload = {
                transaction_code: transactionCode,
                transaction_amount: amount,
                payment_code: config.depositMethod,
                user_id: currency === "JPY" ? `CUST-JP-${faker.string.numeric(5)}` : randomInt(100, 999).toString(),
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

            logger.info(`URL: ${config.BASE_URL}/api/${config.merchantCode}/v5/generateDeposit`);
            // logger.info(`Request Payload: ${JSON.stringify(payload, null, 2)}`);
            // logger.info(`Signature: ${signature}`);

            const res = await fetch(`${config.BASE_URL}/api/${config.merchantCode}/v5/generateDeposit`, {
                method: "POST",
                headers: { "Content-Type": "application/json", sign: signature },
                body: payloadStr
            });

            const responseBody = await res.text();
            let resultDP = JSON.parse(responseBody);

            if (res.ok) {
                const pageUrl = resultDP.data?.page_url || resultDP.data?.pay_url || "No URL";
                logger.info(`✅ Success | ${transactionCode} | URL: ${pageUrl}`);
                this.stats.success++;

                if (UTR_CURRENCIES.includes(currency)) {
                    await this.submitUTR(currency, transactionCode);
                }
                return { success: true };
            } else {
                logger.error(`❌ Deposit gagal: ${JSON.stringify(resultDP)}`);
                this.stats.failed++;
                return { success: false };
            }
        } catch (err) {
            logger.error(`❌ Deposit Error: ${err.message}`);
            this.stats.failed++;
            return { success: false };
        }
    }

    async batchDeposit() {
        try {
            logger.info("======== BATCH DEPOSIT V5 DINAMIS ========");
            this.stats.startTime = Date.now();

            const envCurrency = process.env.CURRENCY;
            let currency = SUPPORTED_CURRENCIES.includes(envCurrency) ? envCurrency : readlineSync.question("Masukkan Currency: ").trim().toUpperCase();
            
            const jumlah = readlineSync.questionInt("Berapa Transaksi: ");
            const min = readlineSync.questionInt("Masukkan minimum amount: ");
            const max = readlineSync.questionInt("Masukkan maximum amount: ");

            this.stats.total = jumlah;
            const codes = Array.from({ length: jumlah }, (_, i) => `TEST-DP-BATCH-V5-${Math.floor(Date.now() / 1000) + i}`);
            
            const dynamicConcurrency = getDynamicBatchSize(jumlah);
            
            for (let i = 0; i < codes.length; i += dynamicConcurrency) {
                const batch = codes.slice(i, i + dynamicConcurrency);
                await Promise.all(batch.map(code => 
                    this.sendDeposit({ 
                        currency, 
                        amount: randomAmount(min, max), 
                        transactionCode: code 
                    })
                ));
                
                const progress = Math.min(i + dynamicConcurrency, jumlah);
                logger.info(`Progress: ${progress}/${jumlah} (${((progress/jumlah)*100).toFixed(1)}%)`);
            }

            this.stats.endTime = Date.now();
            this.printSummary();
        } catch (error) {
            logger.error(`❌ Batch error: ${error.message}`);
        }
    }

    printSummary() {
        const duration = (this.stats.endTime - this.stats.startTime) / 1000;
        logger.info("======== BATCH SUMMARY ========");
        logger.info(`Total: ${this.stats.total} | Success: ${this.stats.success} | Failed: ${this.stats.failed} | UTR: ${this.stats.utrSubmitted}`);
        logger.info(`Duration: ${duration.toFixed(2)}s`);
        logger.info("======== REQUEST DONE ========\n\n");
    }
}

new BatchDepositV5Service().batchDeposit();