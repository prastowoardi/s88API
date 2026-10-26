import logger from "../../logger.js";
import { ask, askYesNo } from "../../helpers/cli.js";
import { checkTransactionStatus } from "../../helpers/s88Helper.js";

async function main() {
  logger.info("======== S88 CHECK TRANSACTION STATUS ========");

  let currency = process.env.CURRENCY;
  if (!currency) {
    currency = await ask("Masukkan Currency (misal: INR, VND, IDR, dll): ");
  }

  while (true) {
    const transactionCode = await ask("Masukkan Transaction Code (misal: TEST-DP-xxxx / TEST-WD-xxxx): ");

    if (!transactionCode) {
      logger.warn("⚠️ Transaction Code tidak boleh kosong!");
      continue;
    }

    try {
      const result = await checkTransactionStatus({
        transactionCode,
        currency,
      });

      console.log("\n------------------ HASIL ------------------");
      logger.info(`HTTP Status: ${result.status}`);

      if (result.payloadBeforeEncrypt) {
        console.log(`Payload (Before Encrypt) : ${result.payloadBeforeEncrypt}`);
      }
      if (result.payloadAfterEncrypt) {
        console.log(`Payload (After Encrypt)  : ${result.payloadAfterEncrypt}`);
      }

      const resData = result.data;

      if (resData && resData.success) {
        logger.info(`✅ Pesan: ${resData.message || "Sukses"}`);
        
        const list = Array.isArray(resData.data) ? resData.data : [resData.data].filter(Boolean);

        if (list.length === 0) {
          logger.warn("⚠️ Data transaksi kosong.");
        } else {
          list.forEach((tx, idx) => {
            console.log(`\n--- Transaksi #${idx + 1} ---`);
            console.log(`Transaction Code    : ${tx.transaction_code || "-"}`);
            console.log(`Transaction No      : ${tx.transaction_no || "-"}`);
            console.log(`Status              : ${(tx.status || "-").toUpperCase()}`);
            console.log(`Amount              : ${tx.amount || "-"}`);
            console.log(`Actual Amount       : ${tx.transaction_actual_amount || "-"}`);
            console.log(`Request Amount      : ${tx.transaction_request_amount || "-"}`);
            console.log(`Transaction Fee     : ${tx.transaction_fee || "-"}`);
            console.log(`Currency            : ${tx.currency_code || "-"}`);
            console.log(`Datetime            : ${tx.datetime || "-"}`);
          });
        }
      } else {
        logger.error(`❌ Gagal mengambil status transaksi: ${resData?.message || "Terjadi kesalahan"}`);
      }

      console.log("\nRaw Response:");
      console.log(JSON.stringify(resData, null, 2));
      console.log("-------------------------------------------\n");

    } catch (err) {
      logger.error(`❌ Error saat request status: ${err.message}`);
    }

    const checkAgain = await askYesNo("Mau cek transaksi lain?", false);
    if (!checkAgain) break;
  }

  logger.info("======== REQUEST DONE ========\n");
  process.exit(0);
}

main().catch((err) => {
  logger.error(`❌ Fatal Error: ${err.message}`);
  process.exit(1);
});
