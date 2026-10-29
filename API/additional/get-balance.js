import logger from "../logger.js";
import { ask, askYesNo } from "../helpers/cli.js";
import { getBalance } from "../helpers/s88Helper.js";
import { getSupportedCurrencies } from "../helpers/currencyHelper.js";

async function main() {
  logger.info("======== GET MERCHANT BALANCE ========");

  let currency = process.env.CURRENCY;
  if (!currency) {
    const supported = getSupportedCurrencies();
    const promptMsg = supported.length > 0 ? `Masukkan Currency (${supported.join(", ")}): ` : "Masukkan Currency (misal: INR, VND, IDR, BRL, THB, dll): ";
    currency = (await ask(promptMsg)).toUpperCase();
  }

  while (true) {
    try {
      const result = await getBalance({ currency });

      console.log("\n------------------ HASIL ------------------");
      logger.info(`HTTP Status: ${result.status}`);

      if (result.payloadBeforeEncrypt) {
        console.log(`Payload (Before Encrypt) : ${result.payloadBeforeEncrypt}`);
      }
      if (result.payloadAfterEncrypt) {
        console.log(`Payload (After Encrypt)  : ${result.payloadAfterEncrypt}`);
      }

      const resData = result.data;

      if (result.status === 200 && resData) {
        const currencyName = resData.currency_name || resData.currency || currency;
        const currencyCode = resData.currency_code || currency;
        const total = resData.balance ?? resData.total_balance ?? "-";
        const available = resData.available_balance ?? "-";
        const frozen = resData.frozen_balance ?? "-";
        const hold = resData.hold_balance ?? null;

        console.log(`\nAccount Details:`);
        console.log(`Merchant Code     : ${result.merchantCode}`);
        console.log(`Currency Name     : ${currencyName}`);
        console.log(`Currency Code     : ${currencyCode}`);
        console.log(`Total Balance     : ${total}`);
        console.log(`Available Balance : ${available}`);
        console.log(`Frozen Balance    : ${frozen}`);
        if (hold !== null && hold !== undefined) {
          console.log(`Hold Balance      : ${hold}`);
        }
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

    currency = (await ask("Masukkan Currency: ")).toUpperCase();
  }

  logger.info("======== REQUEST DONE ========\n");
  process.exit(0);
}

main().catch((err) => {
  logger.error(`❌ Fatal Error: ${err.message}`);
  process.exit(1);
});
