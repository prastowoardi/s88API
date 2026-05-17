import readlineSync from "readline-sync";
import readline from "readline";
import logger from "../../logger.js";
import { 
    runAuthentication, 
    runGenerateQRIS, 
    runGenerateVA, 
    runCreateWithdrawal, 
    runInquiryTransaction, 
    runGetBalance, 
    runInquiryWithdrawal, 
    runListBanks 
} from "../../helpers/api-exHelper.js";

const handleGracefulStop = () => {
    console.log("\n");
    logger.info("👋 Menutup session secara aman. Keluar dari PayBO API Ex Runner.");
    process.exit(0);
};

if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.on("keypress", (str, key) => {
        if (key.ctrl && key.name === "c") {
            handleGracefulStop();
        }
    });
}

process.on("SIGINT", handleGracefulStop);
process.on("SIGTERM", handleGracefulStop);

readlineSync.setDefaultOptions({
    cancel: true,
    keepLoop: false
});

function generateTrxCode(type = "DP") {
    return `TEST-${type.toUpperCase()}-API-Ex-${Math.floor(Date.now() / 1000)}`;
}

async function apiEx() {
    logger.info("🚀 GEMPITA CUSTOM API (API EX)");
    logger.info("========================================================");

    let token = await runAuthentication();
    if (!token) {
        logger.error("🛑 Proses dihentikan karena gagal mengonfirmasi token.");
        return;
    }

    const menus = [
        "🔄 Regenerate Token (Refresh Auth)",
        "Generate QRIS Payment",
        "Generate Virtual Account",
        "Create Withdrawal (Pay-Out)",
        "Inquiry Status Pay-In",
        "Inquiry Status Pay-Out",
        "Check Balance",
        "List Supported Banks"
    ];

    while (true) {
        const index = readlineSync.keyInSelect(menus, "Pilih endpoint API Ex yang ingin di-hit:");
        
        if (index === -1) {
            handleGracefulStop();
            break;
        }

        const transactionCode = generateTrxCode();

        switch (index) {
            case 0: {
                const newToken = await runAuthentication();
                if (newToken) {
                    token = newToken;
                    logger.info("✅ Session token has been successfully refreshed!");
                } else {
                    logger.error("❌ Failed to refresh token. Keeping the old token.");
                }
                break;
            }
            case 1: {
                const transactionCode = generateTrxCode("DP");
                const amountInput = readlineSync.question("Masukkan Amount Pay-In (Default 10.000): ");
                if (amountInput === null) handleGracefulStop();
                const amount = Number(amountInput || 10000);
                await runGenerateQRIS(token, amount, transactionCode);
                break;
            }
            case 2: {
                const amountInput = readlineSync.question("Masukkan Amount VA: ");
                if (amountInput === null) handleGracefulStop();
                const amount = Number(amountInput);

                const channelInput = readlineSync.question("Masukkan Channel (Default QRIS): ");
                if (channelInput === null) handleGracefulStop();
                const channel = channelInput.toUpperCase() || "qris";

                await runGenerateVA(token, amount, channel, transactionCode);
                break;
            }
            case 3: {
                const transactionCode = generateTrxCode("WD");
                const amountInput = readlineSync.question("Masukkan Amount Pay-Out (Default 10.000): ");
                if (amountInput === null) handleGracefulStop();
                const amount = Number(amountInput || 10000);

                const bankIdInput = readlineSync.question("Masukkan Bank ID (Default 3): ");
                if (bankIdInput === null) handleGracefulStop();
                const bankId = bankIdInput || "3";

                const accNumInput = readlineSync.question("Masukkan Account Number (Default 123132123): ");
                if (accNumInput === null) handleGracefulStop();
                const accNum = accNumInput || "123132123";

                const accNameInput = readlineSync.question("Masukkan Account Name (Default Ujang): ");
                if (accNameInput === null) handleGracefulStop();
                const accName = accNameInput || "Ujang";

                await runCreateWithdrawal(token, amount, bankId, accNum, accName, transactionCode);
                break;
            }
            case 4: {
                const targetTrx = readlineSync.question("Masukkan Nomor Transaksi Pay-In: ");
                if (targetTrx === null) handleGracefulStop();
                if (targetTrx.trim()) await runInquiryTransaction(token, targetTrx.trim());
                break;
            }
            case 5: {
                const targetRef = readlineSync.question("Masukkan Nomor Transaksi Pay-Out: ");
                if (targetRef === null) handleGracefulStop();
                if (targetRef.trim()) await runInquiryWithdrawal(token, targetRef.trim());
                break;
            }
            case 6: {
                await runGetBalance(token);
                break;
            }
            case 7: {
                await runListBanks(token);
                break;
            }
        }
        console.log("\n");
    }
}

apiEx();