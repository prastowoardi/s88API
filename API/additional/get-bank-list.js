import logger from "../logger.js";
import { ask, select, askYesNo } from "../helpers/cli.js";
import { getBankList } from "../helpers/bankListHelper.js";
import { getSupportedCurrencies } from "../helpers/currencyHelper.js";

async function main() {
  logger.info("======== GET BANK CODES (BANK LIST) ========");

  let currency = process.env.CURRENCY;
  if (!currency) {
    const supported = getSupportedCurrencies();
    const promptMsg = supported.length > 0 ? `Masukkan Currency (${supported.join(", ")}): ` : "Masukkan Currency (misal: VND, INR, BDT, IDR, dll): ";
    currency = (await ask(promptMsg)).toUpperCase();
  }

  while (true) {
    try {
      const typeChoice = await select("Pilih Tipe Transaksi:", [
        { name: "1. payment (Deposit)", value: "payment" },
        { name: "2. payout (Withdraw)", value: "payout" },
      ]);

      const result = await getBankList({
        currency,
        type: typeChoice,
      });

      console.log("\n------------------ HASIL ------------------");
      logger.info(`HTTP Status: ${result.status}`);

      if (result.payloadBeforeEncrypt) {
        console.log(`Payload (Before Encrypt) : ${result.payloadBeforeEncrypt}`);
      }
      if (result.payloadAfterEncrypt) {
        console.log(`Payload (After Encrypt)  : ${result.payloadAfterEncrypt}`);
      }

      console.log(`\nInformasi Permintaan:`);
      console.log(`Merchant Code : ${result.merchantCode}`);
      console.log(`Currency      : ${result.currency}`);
      console.log(`Type          : ${result.type}`);
      console.log(`URL           : ${result.url}`);

      const resData = result.data;

      if (result.success && result.banks.length > 0) {
        console.log(`\n✅ Ditemukan ${result.banks.length} bank code(s):`);
        console.log("------------------------------------------------------------");
        console.log(
          "CODE".padEnd(20) + " | " + "NAME"
        );
        console.log("------------------------------------------------------------");
        for (const bank of result.banks) {
          const code = String(bank.code ?? "-").padEnd(20);
          const name = String(bank.name ?? "-");
          console.log(`${code} | ${name}`);
        }
        console.log("------------------------------------------------------------");
      } else if (result.success && result.banks.length === 0) {
        logger.info(`ℹ️ Tidak ada bank yang tersedia untuk ${result.currency} (${result.type}).`);
      } else {
        logger.error(`❌ Gagal mengambil bank list: ${resData?.message || `HTTP ${result.status}`}`);
      }

      console.log("\nRaw Response:");
      console.log(JSON.stringify(resData, null, 2));
      console.log("-------------------------------------------\n");

    } catch (err) {
      logger.error(`❌ Error saat request bank list: ${err.message}`);
    }

    const checkAgain = await askYesNo("Mau cek bank list currency / tipe lain?", false);
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
