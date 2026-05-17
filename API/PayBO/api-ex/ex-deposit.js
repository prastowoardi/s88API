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

function generateTrxCode() {
    return `TEST-POSTMAN-${Math.floor(Date.now() / 1000)}`;
}

async function startPayboCLI() {
    logger.info("🚀 GEMPITA CUSTOM API (API EX)");
    logger.info("========================================================");

    const token = await runAuthentication();
    if (!token) {
        logger.error("🛑 Proses dihentikan karena gagal mengonfirmasi token.");
        return;
    }

    const menus = [
        "Generate QRIS Payment",
        "Generate Virtual Account",
        "Create Withdrawal (Money Out)",
        "Inquiry Status Transaction (Pay In)",
        "Inquiry Status Withdrawal (Money Out)",
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
                const amountInput = readlineSync.question("Masukkan Amount QRIS (Default 31881): ");
                if (amountInput === null) handleGracefulStop();
                const amount = Number(amountInput || 31881);
                await runGenerateQRIS(token, amount, transactionCode);
                break;
            }
            case 1: {
                const amountInput = readlineSync.question("Masukkan Amount VA (Default 31881): ");
                if (amountInput === null) handleGracefulStop();
                const amount = Number(amountInput || 31881);

                const channelInput = readlineSync.question("Masukkan Channel (Default VABNI): ");
                if (channelInput === null) handleGracefulStop();
                const channel = channelInput.toUpperCase() || "VABNI";

                await runGenerateVA(token, amount, channel, transactionCode);
                break;
            }
            case 2: {
                const amountInput = readlineSync.question("Masukkan Amount Withdrawal (Default 10000): ");
                if (amountInput === null) handleGracefulStop();
                const amount = Number(amountInput || 10000);

                const bankIdInput = readlineSync.question("Masukkan Bank ID (Default 3): ");
                if (bankIdInput === null) handleGracefulStop();
                const bankId = bankIdInput || "3";

                const accNumInput = readlineSync.question("Masukkan Account Number (Default 123132123): ");
                if (accNumInput === null) handleGracefulStop();
                const accNum = accNumInput || "123132123";

                await runCreateWithdrawal(token, amount, bankId, accNum, transactionCode);
                break;
            }
            case 3: {
                const targetTrx = readlineSync.question("Masukkan Nomor Transaksi Pay-In: ");
                if (targetTrx === null) handleGracefulStop();
                if (targetTrx.trim()) await runInquiryTransaction(token, targetTrx.trim());
                break;
            }
            case 4: {
                const targetRef = readlineSync.question("Masukkan No Partner Reference: ");
                if (targetRef === null) handleGracefulStop();
                if (targetRef.trim()) await runInquiryWithdrawal(token, targetRef.trim());
                break;
            }
            case 5: {
                await runGetBalance(token);
                break;
            }
            case 6: {
                await runListBanks(token);
                break;
            }
        }
        console.log("\n");
    }
}

startPayboCLI();