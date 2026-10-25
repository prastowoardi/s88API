import logger from "../../logger.js";
import { ask, askYesNo } from "../../helpers/cli.js";
import { getBalance } from "../../helpers/s88Helper.js";

async function main() {
  logger.info("======== S88 GET MERCHANT BALANCE ========");

  let currency = process.env.CURRENCY;
  if (!currency) {
    currency = await ask("Masukkan Currency (misal: INR, VND, IDR, dll): ");
  }

  while (true) {
    try {
      const result = await getBalance({ currency });

      console.log("\n------------------ HASIL ------------------");
      logger.info(`HTTP Status: ${result.status}`);

      const resData = result.data;

      if (result.status === 200 && resData) {
        const currencyName = resData.currency_name || resData.currency || currency;
        const currencyCode = resData.currency_code || currency;
        const total = resData.balance ?? resData.total_balance ?? "-";
        const frozen = resData.frozen_balance ?? "-";
        const available = resData.available_balance ?? "-";

        console.log(`\nAccount Details:`);
        console.log(`Merchant Code     : ${result.merchantCode}`);
        console.log(`Currency Name     : ${currencyName}`);
        console.log(`Currency Code     : ${currencyCode}`);
        console.log(`Total Balance     : ${total}`);
        console.log(`Frozen Balance    : ${frozen}`);
        console.log(`Available Balance : ${available}`);
      } else {
        logger.error(`❌ Gagal mengambil balance: ${resData?.message || `HTTP ${result.status}`}`);
      }

      console.log("\nRaw Response:");
      console.log(JSON.stringify(resData, null, 2));
      console.log("-------------------------------------------\n");

    } catch (err) {
      logger.error(`❌ Error saat request balance: ${err.message}`);
    }

    const checkAgain = await askYesNo("Mau cek balance currency lain?", false);
    if (!checkAgain) break;
    currency = await ask("Masukkan Currency: ");
  }

  logger.info("======== REQUEST DONE ========\n");
  process.exit(0);
}

main().catch((err) => {
  logger.error(`❌ Fatal Error: ${err.message}`);
  process.exit(1);
});
