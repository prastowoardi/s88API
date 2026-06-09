import readlineSync from "readline-sync";
import logger from "../API/logger.js";
import { generateCustomUTR } from "./helpers/payoutHelper.js";
import { sendCallback } from "./helpers/callbackHelper.js";

function getTransactionTypeFromPrefix(transactionNo) {
  const prefix = transactionNo.slice(0, 2).toUpperCase();

  if (prefix === "DP") return 1; // Deposit
  if (prefix === "WD") return 2; // Withdraw

  logger.warn(`⚠️ Prefix "${prefix}" tidak dikenal. Default ke Withdraw.`);
  return 2;
}

function inputCurrency() {
  const supportedCurrencies = ["INR", "VND"];
  let currency = readlineSync.question("Currency (INR/VND): ").toUpperCase();

  while (!supportedCurrencies.includes(currency)) {
    logger.info(`❌ Currency tidak valid. Hanya mendukung: ${supportedCurrencies.join(", ")}`);
    currency = readlineSync.question("Currency (INR/VND): ").toUpperCase();
  }

  return currency;
}

async function inputAndSendCallbacks() {
  logger.info("======== SEND CALLBACK ========");
  const currency = inputCurrency();
  const total = readlineSync.questionInt("Berapa jumlah transaksi yang ingin diinput? ");

  const transactions = [];

  for (let i = 0; i < total; i++) {

    let transactionNo = "";
    while (true) {
      transactionNo = readlineSync.question(`Transaction No (${i + 1}): `).toUpperCase();
      if (/^(DP|WD)\d+$/i.test(transactionNo)) {
        break;
      }
      logger.warn("⚠️ Format Transaction No tidak sesuai. Silakan coba lagi.");
    }

    const amount = readlineSync.questionFloat(`Amount Transaction (${i + 1}): `);
    const status = Math.random() < 0.8 ? 0 : 1;
    const transactionType = getTransactionTypeFromPrefix(transactionNo);
    const systemOrderId = Math.floor(Math.random() * 100000).toString();

    transactions.push({
      transactionNo,
      amount,
      transactionType,
      status,
      systemOrderId,
      currency,
    });
  }

  const repeatCount = readlineSync.questionInt("Mau kirim berapa kali callback untuk setiap transaksi? ") || 1;

  logger.info(`🚀 Mengirim ${transactions.length * repeatCount} callback secara paralel...\n`);

  const promises = transactions.flatMap((tx) => {
    return Array.from({ length: repeatCount }).map((_, index) => {
      const payload = {
        ...tx,
        utr: tx.status === 0 ? generateCustomUTR() : null,
        closeTime: new Date().toISOString(),
      };

      // logger.info(`\n📦 [Hit ke-${index + 1}] Payload untuk ${tx.transactionNo}:\n${JSON.stringify(payload, null, 2)}`);

      return sendCallback(payload)
        .then(() => {
          logger.info(`✅ [Hit ke-${index + 1}] Callback sent for ${tx.transactionNo}: ${tx.status === 0 ? "SUCCESS" : "FAILED"}`);
        })
        .catch(error => {
          logger.error(`❌ [Hit ke-${index + 1}] Gagal kirim callback untuk ${tx.transactionNo}: ${error.message}`);
        });
    });
  });

  await Promise.all(promises);
  logger.info("🎉 Semua callback selesai diproses.\n\n");
}

try {
  await inputAndSendCallbacks();
} catch (err) {
  logger.error("❌ Terjadi error saat menjalankan script:", err);
}
