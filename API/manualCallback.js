import readlineSync from "readline-sync";
import { generateCustomUTR } from "./helpers/payoutHelper.js";
import { sendCallback } from "./helpers/callbackHelper.js";

function getTransactionTypeFromPrefix(transactionNo) {
  const prefix = transactionNo.slice(0, 2).toUpperCase();

  if (prefix === "DP") return 1; // Deposit
  if (prefix === "WD") return 2; // Withdraw

  console.warn(`⚠️ Tidak dikenal prefix "${prefix}". Default ke Withdraw.`);
  return 2;
}

async function inputAndSendCallbacks() {
  const total = readlineSync.questionInt("Berapa jumlah transaksi yang ingin diinput? ");

  const transactions = [];

  for (let i = 0; i < total; i++) {
    console.log(`\n🔸 Transaksi ke-${i + 1}`);

    const transactionNo = readlineSync.question("Transaction No (contoh: DP123456, WD123456): ");
    const amount = readlineSync.questionFloat("Amount: ");

    const status = Math.random() < 0.8 ? 0 : 1;
    const transactionType = getTransactionTypeFromPrefix(transactionNo);

    const systemOrderId = Math.random().toString(36).substring(2, 10);

    transactions.push({
      transactionNo,
      amount,
      transactionType,
      status,
      systemOrderId,
    });
  }

  console.log(`\n🚀 Mengirim ${transactions.length} callback secara paralel...\n`);

  const promises = transactions.map(tx => {
    return sendCallback({
      ...tx,
      utr: tx.status === 0 ? generateCustomUTR() : null,
      closeTime: new Date().toISOString(),
    })
      .then(response => {
        console.log(`✅ Callback sukses untuk ${tx.transactionNo}:`, response);
      })
      .catch(error => {
        console.error(`❌ Gagal kirim callback untuk ${tx.transactionNo}:`, error.message);
      });
  });

  await Promise.all(promises);

  console.log("\n🎉 Semua callback selesai diproses.");
}

inputAndSendCallbacks();
