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
  singhapay_staging: { file: ".env_singhaStag", label: "Singhapay Staging" },
  singhapay: { file: ".env_singhapay", label: "Singhapay Production" },
  PayBO_staging: { file: ".paybo_staging", label: "PayBO Staging" },
  PayBO_production: { file: ".paybo_production", label: "PayBO Production" },
  PayBO_ezyplus: { file: ".paybo_ezyplus", label: "PayBO Ezyplus" },
  PayBO_wandpay: { file: ".paybo_wandpay", label: "PayBO Wandpay" },
  PayBO_swftx: { file: ".paybo_swftx", label: "PayBO Swftx" },
  PayBO_rangoon: { file: ".paybo_rangoon", label: "PayBO Rangoon" },
  PayBO_bajix: { file: ".paybo_bajix", label: "PayBO Bajix" },
  PayBO_dreampay: { file: ".paybo_dreampay", label: "PayBO Dreampay" },
  PayBO_erfolgpay: { file: ".paybo_erfolgpay", label: "PayBO Erfolgpay" },
  PayBO_commspay: { file: ".paybo_commspay", label: "PayBO Commspay" },
  PayBO_demo: { file: ".paybo_demo", label: "PayBO Demo" },
  PayBO_apollo: { file: ".paybo_apollo", label: "PayBO Apollo" },
  PayBO_apollo_INR: { file: ".paybo_apollo_inr", label: "PayBO Apollo INR" },
  PayBO_xcpay: { file: ".paybo_xcpay", label: "PayBO XCPay" },
  PayBO_tiger: { file: ".paybo_tiger", label: "PayBO Tiger2378" },
  PayBO_next8: { file: ".paybo_next8", label: "PayBO Next8" }
};

// Script Actions
const SCRIPT_ACTIONS = {
  // S88 Scripts
  depositV2: { path: "API/S88/trx-deposit/depositV2.js", label: "Deposit V2", type: "S88/Singhapay" },
  deposit: { path: "API/S88/trx-deposit/deposit.js", label: "Deposit V3", type: "S88/Singhapay" },
  depositV4: { path: "API/S88/trx-deposit/depositV4.js", label: "Deposit V4", type: "S88/Singhapay" },
  payout: { path: "API/S88/trx-payout/payout.js", label: "Payout", type: "S88/Singhapay" },
  manualINR: { path: "API/S88/trx-payout/manualINR.js", label: "Manual Withdraw INR", type: "S88/Singhapay" },
  manualVND: { path: "API/S88/trx-payout/manualVND.js", label: "Manual Withdraw VND", type: "S88/Singhapay" },
  batchDeposit: { path: "API/S88/trx-deposit/batchDeposit.js", label: "Batch Deposit", type: "S88/Singhapay" },
  batchDepositV2: { path: "API/S88/trx-deposit/batchDepositV2.js", label: "Batch Deposit V2", type: "S88/Singhapay" },
  batchWithdraw: { path: "API/S88/trx-payout/batchWithdraw.js", label: "Batch Withdraw", type: "S88/Singhapay" },

  // PayBO Scripts
  payboDepositV2: { path: "API/PayBO/trx-deposit/paybo-depositV2.js", label: "PayBO Deposit V2", type: "PayBO" },
  payboDeposit: { path: "API/PayBO/trx-deposit/paybo-deposit.js", label: "PayBO Deposit V3", type: "PayBO" },
  payboDepositV4: { path: "API/PayBO/trx-deposit/paybo-depositV4.js", label: "PayBO Deposit V4", type: "PayBO" },
  payboDepositV5: { path: "API/PayBO/trx-deposit/paybo-depositV5.js", label: "PayBO Deposit V5", type: "PayBO" },
  payboPayout: { path: "API/PayBO/trx-payout/paybo-payout.js", label: "PayBO Withdraw", type: "PayBO" },
  payboPayoutV5: { path: "API/PayBO/trx-payout/paybo-payoutV5.js", label: "PayBO Withdraw V5", type: "PayBO" },
  payboBatchDeposit: { path: "API/PayBO/trx-deposit/paybo-batchDeposit.js", label: "PayBO Batch Deposit", type: "PayBO" },
  payboBatchDepositV5: { path: "API/PayBO/trx-deposit/paybo-batchDepositV5.js", label: "PayBO Batch Deposit V5", type: "PayBO" },
  payboBatchPayout: { path: "API/PayBO/trx-payout/paybo-batchPayout.js", label: "PayBO Batch Withdraw", type: "PayBO" },
  payboBatchPayoutV5: { path: "API/PayBO/trx-payout/paybo-batchPayoutV5.js", label: "PayBO Batch Withdraw V5", type: "PayBO" },
  
  // Other Scripts
  callback: { path: "API/manualCallback.js", label: "Manual Callback", type: "Other" },
  checkStatus: { path: "API/PayBO/additional/check-wd-status-v5.js", label: "Check WD Status V5", type: "PayBO" },
  depositEncrypt: { path: "API/encrypt_decrypt/depositEncrypt.js", label: "Deposit Encrypt", type: "Other" },
  payoutEncrypt: { path: "API/encrypt_decrypt/payoutEncrypt.js", label: "Withdraw Encrypt", type: "Other" },
};

// Handle Ctrl+C globally
process.on('SIGINT', () => {
  process.exit(0);
});

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

async function selectEnvironment() {
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
      loop: false,
    },
  ]);

  return environment;
}

async function selectScriptType() {
  const scriptTypes = [...new Set(Object.values(SCRIPT_ACTIONS).map(s => s.type))];
  
  const scriptTypeChoices = [
    ...scriptTypes.map((type, index) => ({
      name: `${index + 1}. ${type}`,
      value: type,
      short: type
    })),
    new inquirer.Separator(),
    { name: "← Kembali", value: "BACK" }
  ];
  
  const { scriptType } = await inquirer.prompt([
    {
      type: "list",
      name: "scriptType",
      message: "Pilih Jenis Script:",
      choices: scriptTypeChoices,
      loop: false,
    },
  ]);

  return scriptType;
}

async function selectAction(scriptType) {
  const actionChoices = [
    ...Object.entries(SCRIPT_ACTIONS)
      .filter(([_, config]) => config.type === scriptType)
      .map(([key, config], index) => ({
        name: `${index + 1}. ${config.label}`,
        value: key,
        short: config.label
      })),
    new inquirer.Separator(),
    { name: "← Kembali", value: "BACK" }
  ];

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "Pilih Action:",
      choices: actionChoices,
      loop: false,
    },
  ]);

  return action;
}

async function selectCurrency() {
  const { currencyInput } = await inquirer.prompt([
    {
      type: "input",
      name: "currencyInput",
      message: "Masukkan Currency (atau ketik 'back' untuk kembali):",
      validate: (val) => {
        if (!val) return "Currency tidak boleh kosong";
        if (val.toLowerCase() === 'back') return true;
        if (!/^[A-Za-z]+$/.test(val)) return "Gunakan huruf saja, misal: INR";
        return true;
      },
    },
  ]);

  if (currencyInput.toLowerCase() === 'back') {
    return 'BACK';
  }

  return currencyInput.toUpperCase();
}

async function selectMerchant(merchantNames) {
  if (merchantNames.length === 1) {
    return merchantNames[0];
  }

  const merchantChoices = [
    ...merchantNames.map((name, index) => ({
      name: `${index + 1}. ${name}`,
      value: name,
      short: name
    })),
    new inquirer.Separator(),
    { name: "← Kembali", value: "BACK" }
  ];

  const { merchantChoice } = await inquirer.prompt([
    {
      type: "list",
      name: "merchantChoice",
      message: "Pilih merchant:",
      choices: merchantChoices,
      loop: false,
    },
  ]);

  return merchantChoice;
}

async function main() {
  while (true) {
    // Step 1: Select Environment
    const environment = await selectEnvironment();
    
    const envConfig = ENV_CONFIGS[environment];
    const envPath = path.join(__dirname, envConfig.file);

    if (!fs.existsSync(envPath)) {
      console.error(`❌ File ${envConfig.file} tidak ditemukan.`);
      continue;
    }

    // Load .env
    const envVariables = dotenv.parse(fs.readFileSync(envPath));
    for (const [k, v] of Object.entries(envVariables)) {
      process.env[k] = v;
    }
    process.env.NODE_ENV = environment;

    // Step 2: Select Script Type
    while (true) {
      const scriptType = await selectScriptType();
      if (scriptType === 'BACK') break;

      // Step 3: Select Action
      while (true) {
        const action = await selectAction(scriptType);
        if (action === 'BACK') break;

        const scriptConfig = SCRIPT_ACTIONS[action];

        const needsCurrency = [
          "deposit", "depositV2", "depositV4", "payout", "batchDeposit", "batchDepositV2", "batchWithdraw",
          "payboDeposit", "payboDepositV2", "payboDepositV4", "payboDepositV5",
          "payboPayout", "payboPayoutV5",
          "payboBatchDeposit", "payboBatchDepositV5", "payboBatchPayout", "payboBatchPayoutV5"
        ].includes(action);

        let currency = null;
        let selectedMerchant = null;

        if (needsCurrency) {
          // Step 4: Input Currency
          while (true) {
            currency = await selectCurrency();
            if (currency === 'BACK') break;

            const merchants = parseMerchantsFromEnv(envPath, currency);
            const merchantNames = Object.keys(merchants);

            if (merchantNames.length === 0) {
              console.error(`❌ Tidak ada merchant untuk ${currency} di ${envConfig.label}\n`);
              continue;
            }

            // Step 5: Select Merchant
            selectedMerchant = await selectMerchant(merchantNames);
            if (selectedMerchant === 'BACK') continue;

            // Inject merchant vars to `process.env`
            const chosenVars = merchants[selectedMerchant];
            for (const [k, v] of Object.entries(chosenVars)) {
              process.env[k] = v;
            }

            process.env.CURRENCY = currency;
            process.env.CURRENT_MERCHANT = selectedMerchant;

            break; // Exit currency loop
          }

          if (currency === 'BACK') continue; // Go back to action selection
        }

        // Run the script
        const scriptPath = path.join(__dirname, scriptConfig.path);

        if (!fs.existsSync(scriptPath)) {
          console.error(`❌ File script ${scriptPath} tidak ditemukan.`);
          continue;
        }

        console.log(`\n▶️ Menjalankan ${scriptConfig.label}...`);
        console.log(`   Environment     : ${envConfig.label}`);
        if (currency) {
          console.log("   Currency        : " + currency);
          console.log("   Merchant        : " + selectedMerchant);
          console.log("   Merchant Code   : " + (process.env["MERCHANT_CODE_" + currency] || 'Not set'));

          const depositActions = [
            "deposit", "depositV2", "depositV4", "batchDeposit", "batchDepositV2",
            "payboDeposit", "payboDepositV2", "payboDepositV4", "payboDepositV5",
            "payboBatchDeposit", "payboBatchDepositV5"
          ];

          const payoutActions = [
            "payout", "manualINR", "manualVND", "batchWithdraw",
            "payboPayout", "payboPayoutV5", "payboBatchPayout"
          ];

          if (depositActions.includes(action)) {
            console.log("   Deposit Method  : " + (process.env["DEPOSIT_METHOD_" + currency] || 'Not set'));
          } else if (payoutActions.includes(action)) {
            console.log("   Payout Method   : " + (process.env["PAYOUT_METHOD_" + currency] || 'Not set'));
          }
        }
        console.log(`   Base URL        : ${process.env.BASE_URL || 'Not set'}`);
        console.log(`   Callback URL    : ${CALLBACK_URL || 'Not set'}`);
        console.log(`   Script          : ${scriptConfig.path}\n`);

        const child = spawn("node", [scriptPath], {
          stdio: "inherit",
          env: process.env,
          shell: true,
        });

        await new Promise((resolve, reject) => {
          child.on("error", (err) => {
            console.error(`❌ Error menjalankan script: ${err.message}`);
            resolve();
          });

          child.on("close", (code) => {
            if (code !== 0) {
              console.log(`\n⚠️  Script selesai dengan kode: ${code}`);
            }
            resolve();
          });
        });

        process.exit(0);
      }
    }
  }
}

main().catch((err) => {
  if (err.isTtyError) {
    console.error("❌ Prompt tidak bisa di-render di environment ini");
  } else {
    console.error("❌ Error:", err.message);
  }
  process.exit(1);
});