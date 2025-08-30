import readline from 'readline';
import logger from "../../logger.js";
import dotenv from 'dotenv';
import { randomInt } from "crypto";
import { encryptDecrypt, getRandomIP, getRandomName } from "../../helpers/utils.js";
import { sendToTelegram } from "../../helpers/bot/utils.js";
import { randomPhoneNumber, randomMyanmarPhoneNumber, randomCardNumber } from "../../helpers/depositHelper.js";
import { getCurrencyConfig } from "../../helpers/depositConfigMap.js";
import querystring from "querystring";
import { text } from 'stream/consumers';

dotenv.config();
const name = await getRandomName();
const accountNumber = randomCardNumber();


const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise(resolve => rl.question(question, answer => resolve(answer)));
}

const name = await getRandomName();
const accountNumber = randomCardNumber();

            const bankCode = await this.getBankCode(config);
            const phone = this.getPhoneNumber(currency, bankCode);

            const transactionData = {
                transactionCode,
                timestamp,
                amount,
                userID,
                currency,
                ip,
                bankCode,
                phone
            };

            const userInfo = { name, accountNumber };

            const payload = this.buildPayload(config, transactionData, userInfo);
            const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);
            const paymentURL = this.generatePaymentURL(config, encrypted);

            this.logResults(payload, paymentURL);

        } catch (error) {
            logger.error(`❌ Error: ${error.message}`);
        } finally {
            this.close();
        }
    }
}

class SimpleDepositV2 {
    static async execute() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        const ask = (question) => new Promise(resolve => 
            rl.question(question, answer => resolve(answer))
        );

        try {
            const userID = randomInt(100, 999);
            const timestamp = Math.floor(Date.now() / 1000).toString();

            const currencyInput = await ask("Masukkan Currency (INR/VND/BDT/MMK/KRW,THB): ");
            const currency = currencyInput.toUpperCase();

            if (!SUPPORTED_CURRENCIES.includes(currency)) {
                throw new Error(`"${currency}" Not supported yet! Supported: ${SUPPORTED_CURRENCIES.join(", ")}`);
            }

            const amountInput = await ask("Masukkan Amount: ");
            const amount = amountInput.trim();

            if (!amount || isNaN(amount) || Number(amount) <= 0) {
                throw new Error("Amount must be a positive number");
            }

            logger.info(`Currency: ${currency}`);
            logger.info(`Amount: ${amount}`);

            const transactionCode = `TEST-DP-${timestamp}`;
            const config = getCurrencyConfig(currency);
            const ip = getRandomIP();
            const name = await getRandomName();
            const accountNumber = randomCardNumber();

            let bankCode = "";
            let phone = "";

            if (config.requiresBankCode) {
                const bankCodeInput = await ask("Masukkan Bank Code: ");
                if (!/^[a-z0-9A-Z]+$/.test(bankCodeInput)) {
                    throw new Error("Bank Code must contain only letters and numbers");
                }
                bankCode = bankCodeInput;
            } else if (config.bankCodeOptions) {
                bankCode = config.bankCodeOptions[Math.floor(Math.random() * config.bankCodeOptions.length)];
            }

            if (PHONE_CURRENCIES.includes(currency)) {
                phone = randomPhoneNumber(currency.toLowerCase());
            } else if (currency === "MMK" && bankCode === "WAVEPAY") {
                phone = randomMyanmarPhoneNumber();
                logger.info(`Phone Number WavePay: ${phone}`);
            }

            const payloadParts = [
                `merchant_api_key=${config.merchantAPI}`,
                `merchant_code=${config.merchantCode}`,
                `transaction_code=${transactionCode}`,
                `transaction_timestamp=${timestamp}`,
                `transaction_amount=${amount}`,
                `user_id=${userID}`,
                `currency_code=${currency}`,
                `payment_code=${config.depositMethod}`,
                `callback_url=${config.callbackURL}`,
                `ip_address=${ip}`
            ];

  if (bankCode) payload += `&bank_code=${bankCode}`;
  if (phone) payload += `&phone=${phone}`;
  // if (currency === "VND") {
  //         payload += "&random_bank_code=OBT";
  // }

  if (currency === "THB") {
      payload += `&depositor_name=${name}`;
      payload += `&depositor_account_number=${accountNumber}`
  }
  const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);

  logger.info("======== DEPOSIT V2 REQUEST ========");
  logger.info(`Request Payload : ${payload}\n`);
  logger.info(`PayURL : ${config.BASE_URL}/${config.merchantCode}/v2/dopayment?key=${encrypted}`);
  logger.info("======== REQUEST DONE ========\n\n");

  rl.close();
}

// const depositService = new DepositV2Service();
// depositService.depositV2();

// Alternative execution (uncomment to use simple approach)
SimpleDepositV2.execute();