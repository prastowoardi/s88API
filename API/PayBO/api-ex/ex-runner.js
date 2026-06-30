import inquirer from "inquirer";
import readline from "readline";
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
    logger.info("👋 Menutup session secara aman. Keluar dari Gempita API Ex Runner.");
    process.exit(0);
};

process.on("SIGINT", handleGracefulStop);
process.on("SIGTERM", handleGracefulStop);

const ENV_FILES = {
    PayBO_staging: ".paybo_staging",
    gempita_staging: ".staging_gempita",
    PayBO_snappay: ".paybo_snappay",
};

async function asyncKeyInSelect(choices, message) {
    return new Promise((resolve) => {
        console.log(message);
        choices.forEach((label, i) => {
            console.log(`  ${i + 1}. ${label}`);
        });
        console.log(`  0. Keluar`);
        process.stdout.write("> ");

        const stdin = process.stdin;
        const wasRaw = stdin.isRaw;
        readline.emitKeypressEvents(stdin);
        if (stdin.isTTY) stdin.setRawMode(true);
        stdin.resume();

        const cleanup = () => {
            stdin.removeListener("keypress", onKeypress);
            if (stdin.isTTY) stdin.setRawMode(wasRaw || false);
            stdin.pause();
        };

        const onKeypress = (str, key) => {
            // Ctrl+C tetap bisa keluar paksa
            if (key && key.ctrl && key.name === "c") {
                cleanup();
                process.emit("SIGINT");
                return;
            }

            if (!str) return;

            // Angka 1-9 langsung pilih, tanpa Enter
            if (/^[1-9]$/.test(str)) {
                const index = Number(str) - 1;
                if (index < choices.length) {
                    console.log(str);
                    cleanup();
                    resolve(index);
                    return;
                }
            }

            // 0 atau Esc untuk batal
            if (str === "0" || (key && key.name === "escape")) {
                console.log(str === "0" ? "0" : "");
                cleanup();
                resolve(-1);
                return;
            }
        };

        stdin.on("keypress", onKeypress);
    });
}

async function promptInput(name, message, defaultValue) {
    const { [name]: answer } = await inquirer.prompt([
        { type: "input", name, message, default: defaultValue },
    ]);
    return answer;
}

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
            const merchantIndex = await asyncKeyInSelect(merchantNames, `Pilih Merchant untuk Currency ${currency}:`);
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

    const menuLabels = [
        "Regenerate Token (Refresh Auth)",
        "Generate QRIS Payment",
        "Generate Virtual Account",
        "Create Withdrawal (Pay-Out)",
        "Inquiry Status Pay-In",
        "Inquiry Status Pay-Out",
        "Check Balance",
        "List Supported Banks",
    ];

    try {
        while (true) {
            const index = await asyncKeyInSelect(menuLabels, "Pilih endpoint API Ex yang ingin di-hit:");

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
                    const amountInput = await promptInput("amount", "Masukkan Amount Pay-In:", "10000");
                    const amount = Number(amountInput || 10000);
                    await runGenerateQRIS(token, amount, transactionCode);
                    break;
                }
                case 2: {
                    const transactionCode = generateTrxCode("DP");
                    const amountInput = await promptInput("amount", "Masukkan Amount VA:");
                    const amount = Number(amountInput);

                    const channelInput = await promptInput("channel", "Masukkan Channel:", "QRIS");
                    const channel = (channelInput || "QRIS").toUpperCase();

                    await runGenerateVA(token, amount, channel, transactionCode);
                    break;
                }
                case 3: {
                    const transactionCode = generateTrxCode("WD");
                    const amountInput = await promptInput("amount", "Masukkan Amount Pay-Out:", "10000");
                    const amount = Number(amountInput || 10000);

                    const bankIdInput = await promptInput("bankId", "Masukkan Bank ID:", "2");
                    const bankId = bankIdInput || "2";

                    const accNumInput = await promptInput("accNum", "Masukkan Account Number:", "12340995811");
                    const accNum = accNumInput || "12340995811";

                    const accNameInput = await promptInput("accName", "Masukkan Account Name:", "Ujang");
                    const accName = accNameInput || "Ujang";

                    await runCreateWithdrawal(token, amount, bankId, accNum, accName, transactionCode);
                    break;
                }
                case 4: {
                    const targetTrx = await promptInput("targetTrx", "Masukkan Nomor Transaksi Pay-In:");
                    if (targetTrx.trim()) await runInquiryDeposit(token, targetTrx.trim());
                    break;
                }
                case 5: {
                    const targetRef = await promptInput("targetRef", "Masukkan No Transaksi Pay-Out:");
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