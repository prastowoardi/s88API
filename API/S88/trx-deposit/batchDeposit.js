import fetch from "node-fetch";
import readlineSync from "readline-sync";
import logger from "../../logger.js";
import { encryptDecrypt } from "../../helpers/utils.js";
import {
  BASE_URL, CALLBACK_URL,
  SECRET_KEY_INR, SECRET_KEY_VND, SECRET_KEY_BDT, SECRET_KEY_MMK,
  DEPOSIT_METHOD_INR, DEPOSIT_METHOD_VND, DEPOSIT_METHOD_BDT, DEPOSIT_METHOD_MMK,
  MERCHANT_CODE_INR, MERCHANT_CODE_VND, MERCHANT_CODE_BDT, MERCHANT_CODE_MMK,
  MERCHANT_API_KEY_INR, MERCHANT_API_KEY_VND, MERCHANT_API_KEY_BDT, MERCHANT_API_KEY_MMK
} from "../../Config/config.js";

import { randomPhoneNumber } from "../../helpers/payoutHelper.js";
import { generateUTR, randomAmount } from "../../helpers/depositHelper.js";
import { sendCallback } from "../../helpers/callbackHelper.js";

let lastTransactionNumber = 0;

async function submitUTR(currency, transactionCode) {
  const utr = generateUTR(currency);
  const config = currency === "INR"
    ? { merchantCode: MERCHANT_CODE_INR, secretKey: SECRET_KEY_INR, merchantAPI: MERCHANT_API_KEY_INR }
    : { merchantCode: MERCHANT_CODE_BDT, secretKey: SECRET_KEY_BDT, merchantAPI: MERCHANT_API_KEY_BDT };

  const payloadString = `transaction_code=${transactionCode}&utr=${utr}`;
  const encryptedPayload = encryptDecrypt("encrypt", payloadString, config.merchantAPI, config.secretKey);

  try {
    const response = await fetch(`${BASE_URL}/api/${config.merchantCode}/v3/submit-utr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: encryptedPayload })
    });

    const responseText = await response.text();
    
    try {
      JSON.parse(responseText);
    } catch (e) {
      logger.warn(`⚠️ Invalid JSON response in submitUTR (${transactionCode}):`, responseText);
    }  
  } catch (err) {
    logger.error(`❌ Submit UTR Error (${transactionCode}):`, err);
  }
}

async function sendDeposit({ currency, amount, transactionCode }) {
  const currencyConfig = {
    INR: {
      merchantCode: MERCHANT_CODE_INR,
      depositMethod: DEPOSIT_METHOD_INR,
      secretKey: SECRET_KEY_INR,
      merchantAPI: MERCHANT_API_KEY_INR
    },
    VND: {
      merchantCode: MERCHANT_CODE_VND,
      depositMethod: DEPOSIT_METHOD_VND,
      secretKey: SECRET_KEY_VND,
      merchantAPI: MERCHANT_API_KEY_VND,
      bankCodeOptions: ["acbbank", "bidv", "mbbank", "tpbank", "vpbank"]
    },
    BDT: {
      merchantCode: MERCHANT_CODE_BDT,
      depositMethod: DEPOSIT_METHOD_BDT,
      secretKey: SECRET_KEY_BDT,
      merchantAPI: MERCHANT_API_KEY_BDT,
      bankCodeOptions: ["1002", "1001", "1004", "1003"]
    },
    MMK: {
      merchantCode: MERCHANT_CODE_MMK,
      depositMethod: DEPOSIT_METHOD_MMK,
      secretKey: SECRET_KEY_MMK,
      merchantAPI: MERCHANT_API_KEY_MMK,
      requiresBankCode: true
    }
  };

  const config = currencyConfig[currency];
  if (!config) {
    logger.error("❌ Invalid currency:", currency);
    return;
  }

  try {
    const timestamp = lastTransactionNumber;
    let payload = `callback_url=${CALLBACK_URL}&merchant_api_key=${config.merchantAPI}&merchant_code=${config.merchantCode}&transaction_code=${transactionCode}&transaction_timestamp=${timestamp}&transaction_amount=${amount}&user_id=0&currency_code=${currency}&payment_code=${config.depositMethod}`;
    
    // if (currency === "VND") {
    //   payload += "&random_bank_code=OBT";
    // }

    if (config.bankCodeOptions) {
      const bankCode = config.bankCodeOptions[Math.floor(Math.random() * config.bankCodeOptions.length)];
      payload += `&bank_code=${bankCode}`;
    }

    if (currency === "BDT") {
      const phone = randomPhoneNumber();
      payload += `&phone=${phone}`;
    }

    const encrypted = encryptDecrypt("encrypt", payload, config.merchantAPI, config.secretKey);

    const response = await fetch(`${BASE_URL}/api/${config.merchantCode}/v3/dopayment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: encrypted })
    });

    const responseBody = await response.text();
    const resultDP = JSON.parse(responseBody);

    if (resultDP.status === "success") {
      const transactionNo = resultDP.transaction_no;
      const utr = generateUTR(currency);
      logger.info(`✅ ${transactionNo} | Amount: ${amount} (${currency})| Success: ${result.message}`);

      if (["INR", "BDT"].includes(currency)) {
        await submitUTR(currency, transactionCode);
      }

      if (transactionNo) {
        await sendCallback({
          transactionNo,
          amount,
          utr,
          status: 0,
          transactionType: 1,
          currency
        });
        logger.info(`✅ Callback success for transaction_no ${transactionNo}`);
      } else {
        logger.warn(`⚠️ transaction_no tidak ditemukan untuk ${transactionCode}`);
      }
    } else {
      logger.error(`❌ Deposit failed for ${transactionCode}:`, resultDP);
      logger.info(`Payload: ${payload}`);
    }
  } catch (err) {
    logger.error(`❌ Deposit Error (${transactionCode}):`, err);
  }
}

function generateTransactionCodes(count) {
  if (lastTransactionNumber === 0) {
    lastTransactionNumber = Math.floor(Date.now() / 1000);
  }

  const codes = [];
  for (let i = 1; i <= count; i++) {
    lastTransactionNumber += 1;
    codes.push(`TEST-DP-${lastTransactionNumber}`);
  }
  return codes;
}

async function batchDeposit() {
    logger.info("======== Batch Deposit Request ========");
    const availableCurrencies = ["INR", "BDT", "VND", "MMK"];
    const input = readlineSync.question(`Pilih currency (${availableCurrencies.join("/")}, atau 'ALL'): `).toUpperCase();

    let currenciesToProcess = [];

    if (input === "ALL") {
      currenciesToProcess = availableCurrencies;
    } else if (availableCurrencies.includes(input)) {
      currenciesToProcess = [input];
    } else {
      logger.error("❌ Currency tidak valid.");
      return;
    }

    const jumlah = readlineSync.questionInt("Berapa Transaksi: ");
    let min, max, fixedAmount;
        if (jumlah === 1) {
            fixedAmount = readlineSync.questionInt("Masukkan amount: ");
        } else {
            min = readlineSync.questionInt("Masukkan minimum amount: ");
            max = readlineSync.questionInt("Masukkan maximum amount: ");
        }
        
    const tasks = [];

    for (const currency of currenciesToProcess) {
      const transactionCodes = generateTransactionCodes(jumlah);
      for (const transactionCode of transactionCodes) {
        const amount = jumlah === 1 ? fixedAmount : randomAmount(min, max);
        tasks.push(sendDeposit({ currency, amount, transactionCode }));
      }
    }

    await Promise.all(tasks);
    logger.info("======== REQUEST DONE ========\n\n");
}

batchDeposit();
