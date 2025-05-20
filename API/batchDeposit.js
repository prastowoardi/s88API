import fetch from "node-fetch";
import readlineSync from "readline-sync";
import { encryptDecrypt } from "./helpers/utils.js";
import {
  BASE_URL, CALLBACK_URL,
  SECRET_KEY_INR, SECRET_KEY_VND, SECRET_KEY_BDT, SECRET_KEY_MMK,
  DEPOSIT_METHOD_INR, DEPOSIT_METHOD_VND, DEPOSIT_METHOD_BDT, DEPOSIT_METHOD_MMK,
  MERCHANT_CODE_INR, MERCHANT_CODE_VND, MERCHANT_CODE_BDT, MERCHANT_CODE_MMK,
  MERCHANT_API_KEY_INR, MERCHANT_API_KEY_VND, MERCHANT_API_KEY_BDT, MERCHANT_API_KEY_MMK
} from "../API/Config/config.js";

import { randomPhoneNumber } from "./helpers/payoutHelper.js";
import { generateUTR } from "./helpers/depositHelper.js";
import { sendCallback } from "./helpers/callbackHelper.js";

let lastTransactionNumber = 0;

// === Submit UTR ===
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
    const result = JSON.parse(responseText);
    // console.log(`✅ Submit UTR (${transactionCode}):`, result);
  } catch (err) {
    console.error(`❌ Submit UTR Error (${transactionCode}):`, err);
  }
}

// === Main Deposit ===
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
      bankCodeOptions: ["acbbank", "bidv", "mbbank"]
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
    console.error("❌ Invalid currency:", currency);
    return;
  }

  try {
    const timestamp = lastTransactionNumber;
    const callback_url = CALLBACK_URL;

    let payload = `callback_url=${callback_url}&merchant_api_key=${config.merchantAPI}&merchant_code=${config.merchantCode}&transaction_code=${transactionCode}&transaction_timestamp=${timestamp}&transaction_amount=${amount}&user_id=0&currency_code=${currency}&payment_code=${config.depositMethod}`;

    let bankCode = "";
    if (config.bankCodeOptions) {
      bankCode = config.bankCodeOptions[Math.floor(Math.random() * config.bankCodeOptions.length)];
    }

    if (bankCode) {
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
        console.log(`✅ Deposit (${transactionCode}):`, resultDP.message);
      
        let utr = generateUTR(currency);
      
        if (["INR", "BDT"].includes(currency)) {
          await submitUTR(currency, transactionCode);
        }
      
        const transactionNo = resultDP.transaction_no;
      
        if (transactionNo) {
          try {
            await sendCallback({
              transactionNo,
              amount,
              utr,
              status: 0,
              transactionType: 1
            });
            console.log(`✅ Callback success for transaction_no ${transactionNo}`);
          } catch (err) {
            console.error(`❌ Callback failed for ${transactionCode}:`, err.message || err);
          }
        } else {
          console.warn(`⚠️ transaction_no tidak ditemukan untuk ${transactionCode}`);
        }
      } else {
        console.error(`❌ Deposit failed for ${transactionCode}:`, resultDP);
      }
  } catch (err) {
    console.error(`❌ Deposit Error:`, err);
  }
}

// === Generate transaction codes ===
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

// === Batch Execution parallel ===
async function batchDeposit() {
  const availableCurrencies = ["INR", "BDT", "VND", "MMK"];
  const input = readlineSync.question(`Pilih currency (${availableCurrencies.join("/")}, atau 'ALL'): `).toUpperCase();

  let currenciesToProcess = [];

  if (input === "ALL") {
    currenciesToProcess = availableCurrencies;
  } else if (availableCurrencies.includes(input)) {
    currenciesToProcess = [input];
  } else {
    console.error("❌ Currency tidak valid.");
    return;
  }

  const jumlah = readlineSync.questionInt("Berapa Transaksi: ");
  const amount = readlineSync.questionInt("Amount: ");

  const tasks = [];

  for (const currency of currenciesToProcess) {
    const transactionCodes = generateTransactionCodes(jumlah);
    for (const transactionCode of transactionCodes) {
      tasks.push(sendDeposit({ currency, amount, transactionCode }));
    }
  }

  await Promise.all(tasks);

  console.log("\n✅ Sukses submit deposit!");
}

batchDeposit();
