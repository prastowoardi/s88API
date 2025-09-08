import fetch from "node-fetch";
import readline from 'readline';
import logger from "../../logger.js";
import { randomInt } from "crypto";
import { encryptDecrypt, encryptDecryptPayout, getRandomIP, getRandomName } from "../../helpers/utils.js";
import { getPayoutConfig } from "../../helpers/payoutConfigMap.js";
import { getValidIFSC, randomPhoneNumber } from "../../helpers/payoutHelper.js";

const CONFIG = {
  SUPPORTED_CURRENCIES: ["INR", "VND", "BDT", "MMK", "THB", "BRL", "IDR", "MXN", "PMI"],
  REQUEST_TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  MAX_AMOUNT: 1000000,
  MIN_AMOUNT: 1
};

const BANK_CONFIG = {
  THB: { bank_name: "Siam Commercial Bank" },
  VND: { bank_account_number: "2206491508" },
  INR: { bank_account_number: "11133322" }
};

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

const validators = {
  currency: (currency) => {
    const upperCurrency = currency?.toUpperCase();
    if (!CONFIG.SUPPORTED_CURRENCIES.includes(upperCurrency)) {
      throw new ValidationError(`❌ Currency '${currency}' tidak didukung. Supported: ${CONFIG.SUPPORTED_CURRENCIES.join(', ')}`);
    }
    return upperCurrency;
  },

  amount: (amount) => {
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= CONFIG.MIN_AMOUNT) {
      throw new ValidationError(`❌ Amount harus angka lebih besar dari ${CONFIG.MIN_AMOUNT}!`);
    }
    if (numAmount > CONFIG.MAX_AMOUNT) {
      throw new ValidationError(`❌ Amount tidak boleh lebih dari ${CONFIG.MAX_AMOUNT}!`);
    }
    return numAmount;
  },

  bankCode: (bankCode, currency) => {
    if (!bankCode?.trim()) {
      throw new ValidationError(`❌ Bank Code untuk ${currency} wajib diisi!`);
    }
    return bankCode.trim().toUpperCase();
  }
};

class PayoutInput {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async ask(question, validator = null, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.rl.close();
        reject(new Error('Input timeout'));
      }, timeout);

      this.rl.question(question, (answer) => {
        clearTimeout(timer);
        try {
          const result = validator ? validator(answer) : answer;
          resolve(result);
        } catch (error) {
          logger.error(error.message);
          // Retry input for validation errors
          if (error instanceof ValidationError) {
            this.ask(question, validator, timeout).then(resolve).catch(reject);
          } else {
            reject(error);
          }
        }
      });
    });
  }

  close() {
    this.rl.close();
  }
}

const utils = {
  delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  retryWithBackoff: async (fn, attempts = CONFIG.RETRY_ATTEMPTS) => {
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === attempts - 1) throw error;
        
        const delayTime = CONFIG.RETRY_DELAY * Math.pow(2, i);
        logger.warn(`⚠️ Attempt ${i + 1} failed, retrying in ${delayTime}ms...`);
        await utils.delay(delayTime);
      }
    }
  },

  generateTransactionCode: () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const random = randomInt(1000, 9999);
    return `TEST-WD-${timestamp}-${random}`;
  },

  sanitizePayload: (payload) => {
    return Object.fromEntries(
      Object.entries(payload).filter(([_, value]) => value != null)
    );
  }
};

class PMIPayout {
  static async createPayload(amount, config) {
    const timestamp = Math.floor(Date.now() / 1000);
    
    return {
      invoice_id: utils.generateTransactionCode(),
      amount: Number(amount),
      country: "IN",
      currency: "INR",
      payer: await PMIPayout.generatePayer(),
      bank_account: await PMIPayout.generateBankAccount(),
      payment_method: config.payoutMethod,
      description: "test description",
      client_ip: getRandomIP(),
      url: {
        callback_url: config.callbackURL
      },
      test: 1,
      language: "en"
    };
  }

  static async generatePayer() {
    const phone = randomPhoneNumber("inr");
    return {
      id: randomInt(10000000000000, 99999999999999).toString(),
      document: randomInt(10000000000, 99999999999).toString(),
      first_name: "Test",
      last_name: "User",
      phone: phone,
      email: `test.user.${Date.now()}@example.com`,
      address: {
        street: "Test Street 123",
        city: "New Delhi",
        state: "Delhi",
        zip_code: "110057"
      }
    };
  }

  static async generateBankAccount() {
    const name = await getRandomName();
    return {
      bank_account_number: randomInt(10000000000000, 99999999999999).toString(),
      bank_branch: randomInt(100000, 999999).toString(),
      bank_code: "HDFC0011965",
      bank_beneficiary: name,
      card_number: "1234123412341234",
      card_exp_date: "12/25",
      card_holder: name
    };
  }

  static async send(config, amount) {
    try {
      const payload = await PMIPayout.createPayload(amount, config);
      
      logger.info("🚀 Sending PMI Payout...");
      logger.debug("PMI Payload:", JSON.stringify(payload, null, 2));

      const result = await utils.retryWithBackoff(async () => {
        const response = await fetch(config.BASE_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": config.authorization,
            "x-api-key": config.merchantAPI,
            "User-Agent": "PayoutSystem/2.0"
          },
          body: JSON.stringify(payload),
          timeout: CONFIG.REQUEST_TIMEOUT
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response.json();
      });

      logger.info("✅ PMI Payout Success:");
      logger.info("Response:", JSON.stringify(result, null, 2));
      
      return { success: true, data: result };

    } catch (error) {
      logger.error("❌ PMI Payout Error:", error.message);
      return { success: false, error: error.message };
    }
  }
}

class regularPayout {
  static async createBasePayload(userID, currency, amount, transactionCode, name, config) {
    const timestamp = Math.floor(Date.now() / 1000);
    const ip = getRandomIP();
    const phone = randomPhoneNumber(currency.toLowerCase());

    return {
      merchant_code: config.merchantCode,
      transaction_code: transactionCode,
      transaction_timestamp: timestamp,
      transaction_amount: Number(amount),
      user_id: userID.toString(),
      currency_code: currency,
      payout_code: config.payoutMethod,
      callback_url: config.callbackURL,
      account_name: name,
      ip_address: ip,
      // phone_number: phone
    };
  }

  static async enhancePayload(payload, currency, config, inputHandler) {
    const enhancedPayload = { ...payload };

    if (config.requiresIFSC) {
      logger.info("🔍 Getting IFSC code...");
      const ifscCode = await utils.retryWithBackoff(async () => {
        const ifsc = await getValidIFSC();
        if (!ifsc) throw new Error("IFSC tidak tersedia");
        return ifsc;
      });
      
      enhancedPayload.ifsc_code = ifscCode;
      enhancedPayload.bank_account_number = BANK_CONFIG.INR.bank_account_number;
      logger.info(`✅ IFSC Code: ${ifscCode}`);
    }

    if (config.requiresBankCode) {
      const bankCode = await inputHandler.ask(
        `Masukkan Bank Code untuk ${currency}: `,
        (code) => validators.bankCode(code, currency)
      );
      
      enhancedPayload.bank_code = bankCode;
      enhancedPayload.bank_account_number = BANK_CONFIG[currency]?.bank_account_number || "2206491508";
    }

    if (currency === "THB") {
      enhancedPayload.bank_name = BANK_CONFIG.THB.bank_name;
    }

    return utils.sanitizePayload(enhancedPayload);
  }

  static async send(userID, currency, amount, transactionCode, name, config, inputHandler) {
      try {
      logger.info("🚀 Creating payout payload...");
      
      let payload = await regularPayout.createBasePayload(
        userID, currency, amount, transactionCode, name, config
      );

      payload = await regularPayout.enhancePayload(
        payload, currency, config, inputHandler
      );

      logger.info(`Payout request:\n${JSON.stringify(payload, null, 2)}`);

      const encryptedPayload = encryptDecryptPayout(
        "encrypt", payload, config.merchantAPI, config.secretKey
      );

      logger.info(`Encrypted Payload: ${encryptedPayload}`);

      logger.info("Payload encrypted successfully");

      const result = await utils.retryWithBackoff(async () => {
        const response = await fetch(`${config.BASE_URL}/api/v1/payout/${config.merchantCode}`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "User-Agent": "PayoutSystem/2.0"
          },
          body: JSON.stringify({ key: encryptedPayload }),
          timeout: CONFIG.REQUEST_TIMEOUT
        });

        const resultText = await response.text();
        
        let parsedResult;
        try {
          parsedResult = JSON.parse(resultText);
        } catch (e) {
          throw new Error(`Invalid JSON response: ${resultText}`);
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${parsedResult.message || response.statusText}`);
        }

        return parsedResult;
      });

      if (result.encrypted_data) {
        try {
          const decrypted = encryptDecrypt("decrypt", result.encrypted_data, config.merchantAPI, config.secretKey);
          logger.info("🔓 Decrypted Response:", decrypted);
        } catch (decryptError) {
          logger.warn("⚠️ Failed to decrypt response:", decryptError.message);
        }
      }

      return { success: true, data: result };

    } catch (error) {
      logger.error(`❌ Regular Payout Error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

class PayoutOrchestrator {
  constructor() {
    this.inputHandler = new PayoutInput();
  }

  async execute() {
    const startTime = Date.now();
    
    try {
      logger.info("======== PAYOUT REQUEST ========");

      const currency = await this.inputHandler.ask(
        `Masukkan Currency (${CONFIG.SUPPORTED_CURRENCIES.join('/')}): `,
        validators.currency
      );

      const amount = await this.inputHandler.ask(
        "Masukkan Amount: ",
        validators.amount
      );

      const userID = randomInt(100, 999);
      const transactionCode = utils.generateTransactionCode();
      const name = await getRandomName();
      
      logger.info(`Currency: ${currency}`);
      logger.info(`Amount: ${amount}`);
      logger.info(`Transaction Code: ${transactionCode}`);
      logger.info(`User ID: ${userID}`);
      logger.info(`Account Name: ${name}`);

      const config = getPayoutConfig(currency);
      if (!config) {
        throw new Error(`❌ Configuration not found for currency: ${currency}`);
      }

      let result;
      if (config.isExternal) {
        result = await PMIPayout.send(config, amount);
      } else {
        result = await regularPayout.send(
          userID, currency, amount, transactionCode, name, config, this.inputHandler
        );
      }

      const duration = (Date.now() - startTime) / 1000;
      
      logger.info("======== PAYOUT COMPLETED ========");
      logger.info(`Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
      logger.info(`Duration: ${duration.toFixed(2)}s`);
      
      if (!result.success) {
        logger.error(`Error: ${result.error}`);
      }

      return result;

    } catch (error) {
      logger.error("❌ Payout execution failed:", error.message);
      return { success: false, error: error.message };
    } finally {
      this.inputHandler.close();
    }
  }
}

// Error handling dan graceful shutdown
process.on('SIGINT', () => {
  logger.info('👋 Gracefully shutting down...');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

async function sendPayout() {
  const orchestrator = new PayoutOrchestrator();
  return orchestrator.execute();
}

export { 
  PayoutOrchestrator, 
  PMIPayout, 
  regularPayout, 
  sendPayout,
  CONFIG,
  validators
};


sendPayout().catch(error => {
  logger.error('💥 Fatal error:', error);
  process.exit(1);
});
