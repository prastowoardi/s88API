import readlineSync from "readline-sync";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import logger from "../../logger.js";
import { 
    runAuthentication, 
    runGenerateQRIS, 
    runGenerateVA, 
    runCreateWithdrawal, 
    runInquiryDeposit, 
    runGetBalance, 
    runInquiryWithdrawal, 
    runListBanks 
} from "../../helpers/api-exHelper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const handleGracefulStop = () => {
    console.log("\n");
    logger.info("👋 Menutup session secara aman. Keluar dari PayBO API Ex Runner.");
    process.exit(0);
};

process.on("SIGINT", handleGracefulStop);
process.on("SIGTERM", handleGracefulStop);

readlineSync.setDefaultOptions({
    cancel: true,
    keepLoop: false,
    prompt: "> ",
    throwOnCancel: true
});

const ENV_FILES = {
    PayBO_staging: ".paybo_staging",
    PayBO_production: ".paybo_production",
    PayBO_ezyplus: ".paybo_ezyplus",
    PayBO_wandpay: ".paybo_wandpay",
    PayBO_swftx: ".paybo_swftx",
    PayBO_rangoon: ".paybo_rangoon",
    PayBO_bajix: ".paybo_bajix",
    PayBO_dreampay: ".paybo_dreampay",
    PayBO_erfolgpay: ".paybo_erfolgpay",
    PayBO_commspay: ".paybo_commspay",
    PayBO_demo: ".paybo_demo",
    PayBO_apollo: ".paybo_apollo",
    PayBO_apollo_INR: ".paybo_apollo_inr",
    PayBO_xcpay: ".paybo_xcpay",
    PayBO_tiger: ".paybo_tiger",
    PayBO_next8: ".paybo_next8",
    PayBO_cosmospay: ".paybo_cosmospay",
    PayBO_snappay: ".paybo_snappay"
};

function getMerchantNames(envFilePath, currency = "IDR") {
    if (!fs.existsSync(envFilePath)) return [];
    const lines = fs.readFileSync(envFilePath, "utf-8").split(/\r?\n/);
    
    const merchants = {};
    let currentMerchant = null;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith(";") || trimmed.startsWith("#")) {
            const commentContent = trimmed.replace(/^[;#]\s*/, "").trim();
            if (commentContent.toUpperCase() !== currency.toUpperCase()) {
                currentMerchant = commentContent;
            } else {
                currentMerchant = null;
            }
            continue;
        }

        if (trimmed.includes("=") && currentMerchant) {
            const [key] = trimmed.split("=");
            if (key.trim().toUpperCase().includes(`_${currency.toUpperCase()}`)) {
                merchants[currentMerchant] = true;
            }
        }
    }

    return Object.keys(merchants);
}

function extractSelectedMerchantVars(envFilePath, targetMerchant, currency = "IDR") {
    if (!fs.existsSync(envFilePath)) return {};
    const lines = fs.readFileSync(envFilePath, "utf-8").split(/\r?\n/);
    
    let currentMerchant = null;
    const resultVars = {};

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith(";") || trimmed.startsWith("#")) {
            currentMerchant = trimmed.replace(/^[;#]\s*/, "").trim();
            continue;
        }

        if (trimmed.includes("=")) {
            const [key, ...valParts] = trimmed.split("=");
            const cleanKey = key.trim();
            const cleanVal = valParts.join("=").trim();

            if (currentMerchant === targetMerchant) {
                if (cleanKey.toUpperCase().includes(`_${currency}`) || cleanKey === "SECRET_TOKEN") {
                    resultVars[cleanKey] = cleanVal;
                }
            }
        }
    }

    return resultVars;
}

function generateTrxCode(type = "DP") {
    return `TEST-${type.toUpperCase()}-API-Ex-${Math.floor(Date.now() / 1000)}`;
}

async function apiEx() {
    logger.info("🚀 GEMPITA CUSTOM API (API EX)");
    logger.info("========================================================");

    const activeEnv = process.env.NODE_ENV || "PayBO_staging";
    const envFileName = ENV_FILES[activeEnv] || ".paybo_staging";
    const envPath = path.resolve(__dirname, "../../../", envFileName);

    const currency = (process.env.CURRENCY || "IDR").toUpperCase();
    const merchantNames = getMerchantNames(envPath, currency);

    if (merchantNames.length > 0) {
        let selectedMerchant = "";

        if (merchantNames.length === 1) {
            selectedMerchant = merchantNames[0];
        } else {
            const merchantIndex = readlineSync.keyInSelect(merchantNames, `Pilih Merchant untuk Currency ${currency}:`);
            if (merchantIndex === -1) {
                handleGracefulStop();
                return;
            }
            selectedMerchant = merchantNames[merchantIndex];
        }

        const merchantVars = extractSelectedMerchantVars(envPath, selectedMerchant, currency);
        
        delete process.env.PAYBO_X_API_KEY;
        delete process.env.PAYBO_SECRET_TOKEN;
        delete process.env.MERCHANT_API_KEY_IDR;
        delete process.env.SECRET_TOKEN;
        delete process.env[`MERCHANT_CODE_${currency}`];
        delete process.env[`SECRET_KEY_${currency}`];
        delete process.env[`MERCHANT_API_KEY_${currency}`];

        for (const [key, value] of Object.entries(merchantVars)) {
            process.env[key] = value;
            if (key === `MERCHANT_API_KEY_${currency}`) {
                process.env.MERCHANT_API_KEY_IDR = value;
                process.env.PAYBO_X_API_KEY = value;
            }
            if (key === "SECRET_TOKEN") {
                process.env.SECRET_TOKEN = value;
                process.env.PAYBO_SECRET_TOKEN = value;
            }
        }
        logger.info(`Menggunakan konfigurasi Merchant: ${selectedMerchant}`);

        if (!merchantVars["SECRET_TOKEN"]) {
            logger.warn(`⚠️ Warning: SECRET_TOKEN tidak ditemukan untuk merchant [${selectedMerchant}]!`);
        }
    }

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

    try {
        while (true) {
            const index = readlineSync.keyInSelect(menus, "Pilih endpoint API Ex yang ingin di-hit:");
            
            if (index === -1) {
                handleGracefulStop();
                break;
            }

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
                    const amount = Number(amountInput || 10000);
                    await runGenerateQRIS(token, amount, transactionCode);
                    break;
                }
                case 2: {
                    const transactionCode = generateTrxCode("DP");
                    const amountInput = readlineSync.question("Masukkan Amount VA: ");
                    const amount = Number(amountInput);

                    const channelInput = readlineSync.question("Masukkan Channel (Default QRIS): ");
                    const channel = channelInput.toUpperCase() || "QRIS";

                    await runGenerateVA(token, amount, channel, transactionCode);
                    break;
                }
                case 3: {
                    const transactionCode = generateTrxCode("WD");
                    const amountInput = readlineSync.question("Masukkan Amount Pay-Out (Default 10.000): ");
                    const amount = Number(amountInput || 10000);

                    const bankIdInput = readlineSync.question("Masukkan Bank ID (Default 2): ");
                    const bankId = bankIdInput || "2";

                    const accNumInput = readlineSync.question("Masukkan Account Number (Default 12340995811): ");
                    const accNum = accNumInput || "12340995811";

                    const accNameInput = readlineSync.question("Masukkan Account Name (Default Ujang): ");
                    const accName = accNameInput || "Ujang";

                    await runCreateWithdrawal(token, amount, bankId, accNum, accName, transactionCode);
                    break;
                }
                case 4: {
                    const targetTrx = readlineSync.question("Masukkan Nomor Transaksi Pay-In: ");
                    if (targetTrx.trim()) await runInquiryDeposit(token, targetTrx.trim());
                    break;
                }
                case 5: {
                    const targetRef = readlineSync.question("Masukkan No Partner Reference: ");
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
    } catch (err) {
        logger.error(`🛑 Terjadi kesalahan sistem internal: ${err.message}`);
        console.error(err);
        handleGracefulStop();
    }
}

apiEx();