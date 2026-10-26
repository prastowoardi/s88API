import logger from "../../logger.js";
import { ask, select, askYesNo } from "../../helpers/cli.js";
import { getTransactionList, getDefaultDateRangeUTC8 } from "../../helpers/s88Helper.js";

async function main() {
  logger.info("======== S88 GET TRANSACTION LIST ========");

  let currency = process.env.CURRENCY;
  if (!currency) {
    currency = await ask("Masukkan Currency (misal: INR, VND, IDR, dll): ");
  }

  // Default start_date: waktu saat request (MM/DD/YYYY HH:mm UTC+8)
  // Default end_date: akhir hari saat request (MM/DD/YYYY 23:59 UTC+8)
  const { startDate: defaultStart, endDate: defaultEnd } = getDefaultDateRangeUTC8();

  console.log(`\nℹ️ Rentang tanggal maksimal 3 hari dalam format MM/DD/YYYY HH:mm (UTC+8)`);
  const startDate = await ask(`Masukkan start_date (default saat ini: ${defaultStart}): `, defaultStart);
  const endDate = await ask(`Masukkan end_date (default akhir hari: ${defaultEnd}): `, defaultEnd);

  const statusChoices = [
    { name: "1. ALL (Semua status)", value: "ALL" },
    { name: "2. pending", value: "pending" },
    { name: "3. completed", value: "completed" },
    { name: "4. failed", value: "failed" },
    { name: "5. processing", value: "processing" },
  ];

  const statusChoice = await select("Pilih filter status:", statusChoices);
  const statusFilter = statusChoice === "ALL" ? null : statusChoice;

  let currentPage = 1;

  while (true) {
    try {
      const result = await getTransactionList({
        startDate,
        endDate,
        status: statusFilter,
        page: currentPage,
        currency,
      });

      console.log("\n------------------ HASIL ------------------");
      logger.info(`HTTP Status : ${result.status}`);
      logger.info(`Endpoint    : ${result.url}`);
      logger.info(`Page        : ${currentPage}`);

      if (result.payloadBeforeEncrypt) {
        console.log(`Payload (Before Encrypt) : ${result.payloadBeforeEncrypt}`);
      }
      if (result.payloadAfterEncrypt) {
        console.log(`Payload (After Encrypt)  : ${result.payloadAfterEncrypt}`);
      }

      const resData = result.data;

      if (resData && (resData.success === true || result.status === 200)) {
        logger.info(`✅ Status Request: Berhasil`);

        if (resData.current_page) {
          console.log(`Halaman     : ${resData.current_page} (Per halaman: ${resData.per_page || "-"})`);
          if (resData.from !== undefined && resData.to !== undefined) {
            console.log(`Menampilkan : Data ke-${resData.from} s/d ${resData.to}`);
          }
        }

        // Ambil data transaksi (baik berupa array maupun object map)
        let list = [];
        if (Array.isArray(resData.data)) {
          list = resData.data;
        } else if (resData.data && typeof resData.data === "object") {
          list = Object.values(resData.data).filter((item) => item && typeof item === "object");
        }

        if (list.length === 0) {
          logger.warn("⚠️ Tidak ada transaksi yang ditemukan untuk kriteria ini.");
        } else {
          // console.log(`Total Transaksi Ditemukan: ${list.length}`);
          list.forEach((tx, idx) => {
            console.log(`\n[${idx + 1}] Transaction Code : ${tx.transaction_code || "-"}`);
            console.log(`    Transaction No   : ${tx.transaction_no || "-"}`);
            console.log(`    Status           : ${(tx.status || "-").toUpperCase()}`);
            console.log(`    Amount           : ${tx.amount || "-"}`);
            console.log(`    Fee              : ${tx.transaction_fee || "-"}`);
            console.log(`    Currency         : ${tx.currency_code || "-"}`);
            console.log(`    Method           : ${tx.method_name || "-"}`);
            console.log(`    Created At       : ${tx.created_at || "-"}`);
            console.log(`    Updated At       : ${tx.updated_at || "-"}`);
          });
        }

        // Tampilkan informasi navigasi pagination jika ada
        if (resData.next_page_url) {
          const nextAction = await askYesNo(`Tersedia halaman berikutnya. Mau buka halaman ${currentPage + 1}?`, true);
          if (nextAction) {
            currentPage++;
            continue;
          }
        }
      } else {
        logger.error(`❌ Gagal mengambil transaction list: ${resData?.message || `HTTP ${result.status}`}`);
      }

      console.log("\nRaw Response:");
      console.log(JSON.stringify(resData, null, 2));
      console.log("-------------------------------------------\n");

    } catch (err) {
      logger.error(`❌ Error saat request transaction list: ${err.message}`);
    }

    const checkOtherPage = await askYesNo("Mau cek halaman lain?", false);
    if (checkOtherPage) {
      const pageInput = await ask("Masukkan nomor halaman: ", String(currentPage + 1));
      currentPage = parseInt(pageInput, 10) || 1;
      continue;
    }

    break;
  }

  logger.info("======== REQUEST DONE ========\n");
  process.exit(0);
}

main().catch((err) => {
  logger.error(`❌ Fatal Error: ${err.message}`);
  process.exit(1);
});
