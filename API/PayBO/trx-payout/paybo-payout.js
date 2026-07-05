import fetch from "node-fetch";
import readline from 'readline';
import logger from "../../logger.js";
import { randomInt } from "crypto";
import { encryptDecrypt, getRandomIP, getRandomName, getAccountNumber, getCryptoRate, jpyBankList } from "../../helpers/utils.js";
import { getValidIFSC } from "../../helpers/payoutHelper.js";
import { getPayoutConfig } from "../../helpers/payoutConfigMap.js";
import CoinKey from 'coinkey';

const SUPPORTED_CURRENCIES = ["INR", "VND", "BRL", "THB", "IDR", "MXN", "BDT", "KRW", "PHP", "JPY", "MMK", "USDT", "MYR"];
const CURRENCIES_REQUIRING_BANK_CODE = ["IDR", "VND", "BDT", "THB", "BRL", "MXN", "KRW", "PHP", "JPY", "MMK", "USDT"];
const PIX_ACCOUNT_TYPES = ["CPF", "CNPJ", "EMAIL", "PHONE", "EVP"];
const BANK_ACCOUNT_NUMBER = getAccountNumber(6) || "11133322";

class PayoutService {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    this.jpyData = {
      bankCode: "",
      branchCode: "",
      bankName: "",
      branchName: ""
    };
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
      user_id: String(userID),
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
      if (!ifscCode) throw new Error("IFSC code tidak ditemukan");

      const bank = ifscCode.substring(0, 4);
      Object.assign(payload, {
        ifsc_code: ifscCode,
        bank_account_number: BANK_ACCOUNT_NUMBER,
        bank_code: bank,
        bank_name: bank,
        // Hanya untuk Erfolg Flowpay
        cust_email: `user${randomInt(1000, 9999)}@example.com`,
        cust_phone: `+91765${randomInt(1000000, 9999999)}`,
      });
    }

    if (CURRENCIES_REQUIRING_BANK_CODE.includes(currency)) {
      if (!bankCode) throw new Error(`Bank Code wajib diisi untuk ${currency}!`);
      
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

    if (currency === "THB") payload.bank_name = "SCB";
    
    if (currency === "JPY") {
      payload.branch_code = this.jpyData.branchCode || "001";
      
      if (this.jpyData.bankName) {
        payload.bank_name = this.jpyData.bankName;
      }
      
      if (this.jpyData.branchName) {
        payload.branch_name = this.jpyData.branchName;
      }
    }
    
    if (currency === "MMK") {
      payload.bank_name = bankCode === "WAVEPAY" ? "WAVEPAY" : "KBZPAY";
    }

    if (currency === "USDT") {
      const fromFiat = await this.ask("Masukkan Fiat Asal (contoh: USD/INR/IDR): ");
      const fiat = fromFiat.toUpperCase().trim() || "USD";

      logger.info(`Fetching Rate: ${fiat} -> USDT...`);
      const cryptoData = await getCryptoRate(payload.transaction_amount, fiat, config, "USDT", "withdraw");

      let estimasi = "0";

      if (cryptoData && cryptoData.forex) {
        const { forex, token, usedAddress } = cryptoData;

        logger.info(`✅ Rate: ${forex} | Address: ${usedAddress}`);
        
        payload.rate = String(forex);
        payload.bank_account_number = usedAddress;
        
        if (token) {
          payload.token = token;
          logger.info(`✅ Token dilampirkan.`);
        }

        estimasi = (Number(payload.transaction_amount) / Number(forex)).toFixed(2);
        logger.info(`Estimasi Crypto: ${estimasi} USDT`);
      } else {
        throw new Error("Gagal mendapatkan rate crypto dari server.");
      }

      const cryptoAmountInput = await this.ask(`Masukkan Crypto Amount (Enter untuk pakai estimasi amount ${estimasi}): `);
      payload.crypto_amount = cryptoAmountInput.trim() || String(estimasi);
    }

    if (currency === "MYR") {
      payload.bank_account_number = getAccountNumber(8);
    }

    if (currency === "IDR") {
      payload.bank_account_number = '081328645436';
    }
  }

  async makePayoutRequest(config, payload) {
    const url = `${config.BASE_URL}/api/v1/payout/${config.merchantCode}`;
    
    const cleanedPayload = Object.fromEntries(
      Object.entries(payload).filter(([_, v]) => v !== undefined && v !== null && v !== "")
    );

    logger.info(`Request URL: ${url}`);
    logger.info(`Request Payload: ${JSON.stringify(payload, null, 2)}`);

    const encryptedPayload = encryptDecrypt("encrypt", cleanedPayload, config.merchantAPI, config.secretKey, true);
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
      const decryptedPayload = encryptDecrypt("decrypt", result.encrypted_data, config.merchantAPI, config.secretKey, true);
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
      const data = JSON.parse(error.message.split(' - ')[1]);

      console.log(`[${new Date().toISOString()}] INFO: Response [400]: ${JSON.stringify({
        ...data,
        message: `${data.message}. error code ${data.error?.code}`,
        error: {
          ...data.error,
          message: `${data.error?.message}. error code ${data.error?.code}`
        }
      }, null, 2)}`);
    }
  }

  async promptForBankCode(currency) {
    if (!CURRENCIES_REQUIRING_BANK_CODE.includes(currency)) {
      return "";
    }

    if (currency === "JPY") {
      logger.info("🔍 Fetching JPY Bank List dari API...");
      const config = getPayoutConfig("JPY");
      
      try {
        const bankListResponse = await jpyBankList(config);

        if (bankListResponse && bankListResponse.code === 0 && Array.isArray(bankListResponse.data) && bankListResponse.data.length > 0) {
          const randomBank = bankListResponse.data[Math.floor(Math.random() * bankListResponse.data.length)];
          
          this.jpyData.bankCode = randomBank.code;
          this.jpyData.bankName = randomBank.name;
          
          logger.info(`🏢 Selected Bank: ${this.jpyData.bankName} (${this.jpyData.bankCode})`);
          logger.info(`🌐 Find Branch ${this.jpyData.bankCode}...`);

          try {
            const branchResponse = await fetch(`https://zengin-code.github.io/api/branches/${this.jpyData.bankCode}.json`);
            if (branchResponse.ok) {
              const branches = await branchResponse.json();
              const branchKeys = Object.keys(branches);
              
              if (branchKeys.length > 0) {
                const randomBranchKey = branchKeys[Math.floor(Math.random() * branchKeys.length)];
                const selectedBranch = branches[randomBranchKey];
                
                this.jpyData.branchCode = selectedBranch.code;
                this.jpyData.branchName = selectedBranch.name;
                
                logger.info(`🎲 Combined Branch: ${this.jpyData.branchName} (${this.jpyData.branchCode})`);
              }
            }
          } catch (zenginErr) {
            logger.warn(`⚠️ Gagal fetch Zengin API: ${zenginErr.message}`);
          }

          if (!this.jpyData.branchCode) {
            this.jpyData.branchCode = `00${Math.floor(Math.random() * 9) + 1}`;
            this.jpyData.branchName = "Main Branch";
            logger.info(`🔄 Menggunakan fallback branch code: ${this.jpyData.branchCode}`);
          }

          return this.jpyData.bankCode;
        }
      } catch (err) {
        logger.error(`❌ Gagal mengambil JPY Bank List otomatis: ${err.message}`);
      }
      
      logger.info("⚠️ Beralih ke input manual...");
    }

    const bankCode = await this.ask(`Masukkan Bank Code untuk ${currency}: `);
    if (!bankCode) {
      throw new Error(`Bank Code wajib diisi untuk ${currency}!`);
    }

    if (currency === "JPY") {
      this.jpyData.bankCode = bankCode;
      this.jpyData.branchCode = await this.ask("Masukkan Branch Code untuk JPY (Default 001): ") || "001";
      this.jpyData.bankName = await this.ask("Masukkan Bank Name untuk JPY (Opsional): ");
      this.jpyData.branchName = await this.ask("Masukkan Branch Name untuk JPY (Opsional): ") || "Main Branch";
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
      } else {
          const inputCurrency = await this.ask("Masukkan Currency: ");
          currency = this.validateCurrency(inputCurrency);
      }

      const userID = randomInt(100, 999).toString();
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
      logger.error(`❌ Error: ${error.message}`);
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