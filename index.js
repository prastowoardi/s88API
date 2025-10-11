#!/usr/bin/env node
import inquirer from "inquirer";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { CALLBACK_URL } from "./API/Config/config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Environment Configurations
const ENV_CONFIGS = {
  staging: { file: ".env_staging", label: "Seapay Staging" },
  production: { file: ".env_production", label: "Seapay Production" },
  singhapay_staging: { file: ".env_singhapay_staging", label: "Singhapay Staging" },
  singhapay: { file: ".env_singhapay", label: "Singhapay Production" },
  PayBO_staging: { file: ".paybo_staging", label: "PayBO Staging" },
  PayBO_production: { file: ".paybo_production", label: "PayBO Production" },
  PayBO_ezyplus: { file: ".paybo_ezyplus", label: "PayBO Ezyplus" },
  PayBO_wandpay: { file: ".paybo_wandpay", label: "PayBO Wandpay" },
  PayBO_swftx: { file: ".paybo_swftx", label: "PayBO Swftx" },
  PayBO_bajix: { file: ".paybo_bajix", label: "PayBO Bajix" },
  PayBO_dreampay: { file: ".paybo_dreampay", label: "PayBO Dreampay" },
  PayBO_erfolgpay: { file: ".paybo_erfolgpay", label: "PayBO Erfolgpay" },
  PayBO_commspay: { file: ".paybo_commspay", label: "PayBO Commspay" },
  PayBO_demo: { file: ".paybo_demo", label: "PayBO Demo" },
  PayBO_apollo: { file: ".paybo_apollo", label: "PayBO Apollo" },
  PayBO_xcpay: { file: ".paybo_xcpay", label: "PayBO XCPay" },
};

// Script Actions
const SCRIPT_ACTIONS = {
  // S88 Scripts
  deposit: { path: "API/S88/trx-deposit/deposit.js", label: "Deposit V3", type: "S88" },
  depositV2: { path: "API/S88/trx-deposit/depositV2.js", label: "Deposit V2", type: "S88" },
  depositV4: { path: "API/S88/trx-deposit/depositV4.js", label: "Deposit V4", type: "S88" },
  payout: { path: "API/S88/trx-payout/payout.js", label: "Withdraw", type: "S88" },
  manualINR: { path: "API/S88/trx-payout/manualINR.js", label: "Manual Withdraw INR", type: "S88" },
  manualVND: { path: "API/S88/trx-payout/manualVND.js", label: "Manual Withdraw VND", type: "S88" },
  batchDeposit: { path: "API/S88/trx-deposit/batchDeposit.js", label: "Batch Deposit", type: "S88" },
  batchDepositV2: { path: "API/S88/trx-deposit/batchDepositV2.js", label: "Batch Deposit V2", type: "S88" },
  batchWithdraw: { path: "API/S88/trx-payout/batchWithdraw.js", label: "Batch Withdraw", type: "S88" },

  // PayBO Scripts
  payboDepositV2: { path: "API/PayBO/trx-deposit/paybo-depositV2.js", label: "PayBO Deposit V2", type: "PayBO" },
  payboDeposit: { path: "API/PayBO/trx-deposit/paybo-deposit.js", label: "PayBO Deposit V3", type: "PayBO" },
  payboDepositV4: { path: "API/PayBO/trx-deposit/paybo-depositV4.js", label: "PayBO Deposit V4", type: "PayBO" },
  payboDepositV5: { path: "API/PayBO/trx-deposit/paybo-depositV5.js", label: "PayBO Deposit V5", type: "PayBO" },
  payboBatchDeposit: { path: "API/PayBO/trx-deposit/paybo-batchDeposit.js", label: "PayBO Batch Deposit", type: "PayBO" },
  payboBatchDepositV5: { path: "API/PayBO/trx-deposit/paybo-batchDepositV5.js", label: "PayBO Batch Deposit V5", type: "PayBO" },
  payboPayout: { path: "API/PayBO/trx-payout/paybo-payout.js", label: "PayBO Withdraw", type: "PayBO" },
  payboPayoutV5: { path: "API/PayBO/trx-payout/paybo-payoutV5.js", label: "PayBO Withdraw V5", type: "PayBO" },
  payboBatchPayout: { path: "API/PayBO/trx-payout/paybo-batchPayout.js", label: "PayBO Batch Withdraw", type: "PayBO" },
  
  // Other Scripts
  callback: { path: "API/manualCallback.js", label: "Manual Callback", type: "Other" },
  checkStatus: { path: "API/PayBO/additional/check-wd-status-v5.js", label: "Check WD Status V5", type: "PayBO" },
  depositEncrypt: { path: "API/encrypt_decrypt/depositEncrypt.js", label: "Deposit Encrypt", type: "Other" },
  payoutEncrypt: { path: "API/encrypt_decrypt/payoutEncrypt.js", label: "Withdraw Encrypt", type: "Other" },
};

async function main() {
  // Select Environment
  const envChoices = Object.entries(ENV_CONFIGS).map(([key, config], index) => ({
    name: `${index + 1}. ${config.label}`,
    value: key,
    short: config.label
  }));

  const { environment } = await inquirer.prompt([
    {
      type: "list",
      name: "environment",
      message: "Pilih Environment:",
      choices: envChoices,
    },
  ]);

  const envConfig = ENV_CONFIGS[environment];
  const envPath = path.join(__dirname, envConfig.file);

  if (!fs.existsSync(envPath)) {
    console.error(`❌ File ${envConfig.file} tidak ditemukan.`);
    process.exit(1);
  }

  // Load .env
  const envVariables = dotenv.parse(fs.readFileSync(envPath));
  for (const [k, v] of Object.entries(envVariables)) {
    process.env[k] = v;
  }
  process.env.NODE_ENV = environment;

  // Select Script Type
  const scriptTypes = [...new Set(Object.values(SCRIPT_ACTIONS).map(s => s.type))];
  
  const scriptTypeChoices = scriptTypes.map((type, index) => ({
    name: `${index + 1}. ${type}`,
    value: type,
    short: type
  }));
  
  const { scriptType } = await inquirer.prompt([
    {
      type: "list",
      name: "scriptType",
      message: "Pilih Jenis Script:",
      choices: scriptTypeChoices,
    },
  ]);

  const actionChoices = Object.entries(SCRIPT_ACTIONS)
    .filter(([_, config]) => config.type === scriptType)
    .map(([key, config], index) => ({
      name: `${index + 1}. ${config.label}`,
      value: key,
      short: config.label
    }));

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "Pilih Action:",
      choices: actionChoices,
    },
  ]);

  const scriptConfig = SCRIPT_ACTIONS[action];

  const needsCurrency = [
    "deposit", "depositV2", "depositV4", "payout", "batchDeposit", "batchDepositV2", "batchWithdraw",
    "payboDeposit", "payboDepositV2", "payboDepositV4", "payboDepositV5",
    "payboPayout", "payboPayoutV5",
    "payboBatchDeposit", "payboBatchDepositV5", "payboBatchPayout"
  ].includes(action);

  let currency = null;
  let selectedMerchant = null;

  function parseMerchantsFromEnv(envFilePath, currency) {
    const content = fs.readFileSync(envFilePath, "utf-8");
    const lines = content.split(/\r?\n/);

    let currentMerchant = null;
    const merchants = {};

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith("#") || trimmed.startsWith(";")) {
        const name = trimmed.replace(/^[#;]\s*/, "").replace(/\s+Merchant$/i, "").trim();
        currentMerchant = name;
      } 
      else if (trimmed && trimmed.includes("=") && !trimmed.startsWith("#") && !trimmed.startsWith(";")) {
        const [key, ...valParts] = trimmed.split("=");
        const cleanKey = key.trim();
        
        if (cleanKey.toUpperCase().includes(`_${currency}`) && currentMerchant) {
          if (!merchants[currentMerchant]) {
            merchants[currentMerchant] = {};
          }
          
          const value = valParts.join("=").trim();
          merchants[currentMerchant][cleanKey] = value;
        }
      }
    }

    const validMerchants = {};
    for (const [merchantName, vars] of Object.entries(merchants)) {
      const hasMerchantCode = Object.keys(vars).some(k => k.includes(`MERCHANT_CODE_${currency}`));
      const hasSecretKey = Object.keys(vars).some(k => k.includes(`SECRET_KEY_${currency}`));
      
      if (hasMerchantCode && hasSecretKey) {
        validMerchants[merchantName] = vars;
      }
    }

    return validMerchants;
  }

  if (needsCurrency) {
    const { currencyInput } = await inquirer.prompt([
      {
        type: "input",
        name: "currencyInput",
        message: "Masukkan Currency :",
        validate: (val) => (val && /^[A-Za-z]+$/.test(val) ? true : "Gunakan huruf saja, misal: INR"),
      },
    ]);

    currency = currencyInput.toUpperCase();

    const merchants = parseMerchantsFromEnv(envPath, currency);
    const merchantNames = Object.keys(merchants);

    if (merchantNames.length === 0) {
      console.error(`❌ Tidak ada merchant untuk ${currency} di ${envConfig.label}`);
      process.exit(1);
    }

    if (merchantNames.length === 0) {
      console.error(`❌ Tidak ada merchant untuk ${currency} di ${envConfig.label}`);
      process.exit(1);
    }

    if (merchantNames.length > 1) {
      const merchantChoices = merchantNames.map((name, index) => ({
        name: `${index + 1}. ${name}`,
        value: name,
        short: name
      }));

      const { merchantChoice } = await inquirer.prompt([
        {
          type: "list",
          name: "merchantChoice",
          message: `Pilih merchant untuk ${currency}:`,
          choices: merchantChoices,
        },
      ]);
      selectedMerchant = merchantChoice;
    } else {
      selectedMerchant = merchantNames[0];
    }

    // Inject merchant vars to `process.env`
    const chosenVars = merchants[selectedMerchant];
    for (const [k, v] of Object.entries(chosenVars)) {
      process.env[k] = v;
    }

    process.env.CURRENCY = currency;
    process.env.CURRENT_MERCHANT = selectedMerchant;
  }


  // Run the script
  const scriptPath = path.join(__dirname, scriptConfig.path);

  if (!fs.existsSync(scriptPath)) {
    console.error(`❌ File script ${scriptPath} tidak ditemukan.`);
    process.exit(1);
  }

  console.log(`\n▶️ Menjalankan ${scriptConfig.label}...`);
  console.log(`   Environment : ${environment}`);
  if (currency) {
    console.log(`   Currency    : ${currency}`);
    console.log(`   Merchant    : ${selectedMerchant}`);
  }
  console.log(`   Base URL    : ${process.env.BASE_URL || 'Not set'}`);
  console.log(`   Callback URL: ${CALLBACK_URL || 'Not set'}`);
  console.log(`   Script      : ${scriptConfig.path}\n`);

  const child = spawn("node", [scriptPath], {
    stdio: "inherit",
    env: process.env,
    shell: true,
  });

  child.on("error", (err) => {
    console.error(`❌ Error menjalankan script: ${err.message}`);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});

