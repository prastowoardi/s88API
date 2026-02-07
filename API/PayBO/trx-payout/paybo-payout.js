import fetch from "node-fetch";
import readline from 'readline';
import logger from "../../logger.js";
import { randomInt } from "crypto";
import { encryptDecrypt, encryptDecryptPayout, getRandomIP, getRandomName, getAccountNumber } from "../../helpers/utils.js";
import { getValidIFSC } from "../../helpers/payoutHelper.js";
import { getPayoutConfig } from "../../helpers/payoutConfigMap.js";

const SUPPORTED_CURRENCIES = ["INR", "VND", "BRL", "THB", "IDR", "MXN", "BDT", "KRW", "PHP", "JPY", "MMK", "USDT"];
const CURRENCIES_REQUIRING_BANK_CODE = ["IDR", "VND", "BDT", "THB", "BRL", "MXN", "KRW", "PHP", "JPY", "MMK", "USDT"];
const PIX_ACCOUNT_TYPES = ["CPF", "CNPJ", "EMAIL", "PHONE", "EVP"];
const BANK_ACCOUNT_NUMBER = getAccountNumber(6) || "11133322";

class PayoutService {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  ask(question) {
    return new Promise(resolve => this.rl.question(question, answer => resolve(answer)));
  }

  validateCurrency(currency) {
    const upperCurrency = currency.toUpperCase();
    if (!SUPPORTED_CURRENCIES.includes(upperCurrency)) {
      throw new Error(`Currency "${currency}" belum didukung untuk payout.`);
    }
    return upperCurrency;
  }

  validateAmount(amount) {
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error("Amount harus angka lebih besar dari 0!");
    }
    return numAmount;
  }

  async buildPayload(userID, currency, amount, transactionCode, name, bankCode, callbackURL) {
    const config = getPayoutConfig(currency);
    const timestamp = Math.floor(Date.now() / 1000);
    const ip = getRandomIP();

    const payload = {
      merchant_code: config.merchantCode,
      transaction_code: transactionCode,
      transaction_timestamp: timestamp,
      transaction_amount: Number(amount),
      user_id: userID.toString(),
      currency_code: currency,
      payout_code: config.payoutMethod,
      callback_url: callbackURL || config.callbackURL,
      account_name: name,
      ip_address: ip,
    };

    await this.addCurrencySpecificFields(payload, currency, bankCode, config);
    return payload;
  }

  async addCurrencySpecificFields(payload, currency, bankCode, config) {
    if (currency === "INR" && config.requiresIFSC) {
      const ifscCode = await getValidIFSC();
      if (!ifscCode) {
        throw new Error("IFSC code tidak ditemukan");
      }

      const bank = ifscCode.substring(0, 4);
      Object.assign(payload, {
        ifsc_code: ifscCode,
        bank_account_number: BANK_ACCOUNT_NUMBER,
        bank_code: bank,
        bank_name: bank,
      });
    }

    if (CURRENCIES_REQUIRING_BANK_CODE.includes(currency)) {
      if (!bankCode) {
        throw new Error(`Bank Code wajib diisi untuk ${currency}!`);
      }
      
      payload.bank_code = bankCode;
      payload.bank_account_number = Math.floor(1e10 + Math.random() * 9e10).toString();

      if (currency === "BRL" && bankCode === "PIX") {
        payload.account_type = PIX_ACCOUNT_TYPES[Math.floor(Math.random() * PIX_ACCOUNT_TYPES.length)];
      }

      if (currency === "KRW") {
        payload.bank_name = "우리은행";
        payload.cust_name = await getRandomName("kr", true);
      }
    }

    if (currency === "THB") {
      payload.bank_name = "SCB";
    }

    if (currency === "MMK") {
      Object.assign(payload, {
        bank_name: bankCode === "WAVEPAY" ? "WAVEPAY" : "KBZPAY"
      })
    }

    if (currency === "USDT") {
      Object.assign(payload, {
        rate: readlineSync.question("Masukkan Rate: ").trim()
      });
    }
  }

  async makePayoutRequest(config, payload) {
    const url = `${config.BASE_URL}/api/v1/payout/${config.merchantCode}`;
    
    logger.info(`Request URL: ${url}`);
    logger.info(`Request Payload: ${JSON.stringify(payload, null, 2)}`);

    const encryptedPayload = encryptDecryptPayout("encrypt", payload, config.merchantAPI, config.secretKey);
    logger.info(`Encrypted Payload: ${encryptedPayload}`);

    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: encryptedPayload }),
      });
    } catch (err) {
      logger.error(`❌ Network error: ${err.message}`);
      throw err;
    }

    return this.handleResponse(response, config);
  }

  async handleResponse(response, config) {
    const responseText = await response.text();

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseErr) {
      logger.error("❌ Gagal parsing JSON response");
      logger.error(`Raw response: ${responseText}`);
      throw new Error(`JSON parsing error: ${parseErr.message}`);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} - ${JSON.stringify(result)}`);
    }

    logger.info(`Payout Response: ${JSON.stringify(result, null, 2)}`);
    logger.info(`Response Status: ${response.status}`);

    if (result.encrypted_data) {
      const decryptedPayload = encryptDecrypt("decrypt", result.encrypted_data, config.merchantAPI, config.secretKey);
      logger.info(`Decrypted Response Payload: ${decryptedPayload}`);
    }

    return result;
  }

  async executePayout(userID, currency, amount, transactionCode, name, bankCode, callbackURL) {
    try {
      const config = getPayoutConfig(currency);
      const payload = await this.buildPayload(userID, currency, amount, transactionCode, name, bankCode, callbackURL);
      
      return await this.makePayoutRequest(config, payload);
    } catch (error) {
      logger.error(`❌ Payout Error: ${error.message}`);
      throw error;
    }
  }

  async promptForBankCode(currency) {
    if (!CURRENCIES_REQUIRING_BANK_CODE.includes(currency)) {
      return "";
    }

    const bankCode = await this.ask(`Masukkan Bank Code untuk ${currency}: `);
    if (!bankCode) {
      throw new Error(`Bank Code wajib diisi untuk ${currency}!`);
    }
    return bankCode;
  }

  async run() {
    try {
      logger.info("======== PAYOUT REQUEST ========");

      const envCurrency = process.env.CURRENCY;
          
      let currency;
      if (envCurrency && SUPPORTED_CURRENCIES.includes(envCurrency)) {
          currency = envCurrency;
          // logger.info(`Currency: ${currency}`);
      }

      const userID = randomInt(100, 999);
      const bankCode = await this.promptForBankCode(currency);
      const amountInput = await this.ask("Masukkan Amount: ");
      const amount = this.validateAmount(amountInput);
      
      logger.info(`Currency: ${currency}`);
      logger.info(`Amount: ${amount}`);

      const transactionCode = `TEST-WD-${Math.floor(Date.now() / 1000)}`;
      const name = await getRandomName();
      
      await this.executePayout(userID, currency, amount, transactionCode, name, bankCode, null);
      
      logger.info("======== REQUEST DONE ========\n");
      
    } catch (error) {
      // logger.error(`❌ Error: ${error.message}`);
      throw error;
    } finally {
      this.cleanup();
    }
  }

  cleanup() {
    this.rl.close();
  }
}

const payoutService = new PayoutService();
payoutService.run();