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
  staging:             { file: ".env_staging",       label: "Seapay Staging"       },
  production:          { file: ".env_production",    label: "Seapay Production"    },
  singhapay_staging:   { file: ".env_singhaStag",    label: "Singhapay Staging"    },
  singhapay:           { file: ".env_singhapay",     label: "Singhapay Production" },
  PayBO_staging:       { file: ".paybo_staging",     label: "PayBO Staging"        },
  PayBO_production:    { file: ".paybo_production",  label: "PayBO Production"     },
  PayBO_ezyplus:       { file: ".paybo_ezyplus",     label: "PayBO Ezyplus"        },
  PayBO_wandpay:       { file: ".paybo_wandpay",     label: "PayBO Wandpay"        },
  PayBO_swftx:         { file: ".paybo_swftx",       label: "PayBO Swftx"          },
  PayBO_rangoon:       { file: ".paybo_rangoon",     label: "PayBO Rangoon"        },
  PayBO_bajix:         { file: ".paybo_bajix",       label: "PayBO Bajix"          },
  PayBO_dreampay:      { file: ".paybo_dreampay",    label: "PayBO Dreampay"       },
  PayBO_erfolgpay:     { file: ".paybo_erfolgpay",   label: "PayBO Erfolgpay"      },
  PayBO_commspay:      { file: ".paybo_commspay",    label: "PayBO Commspay"       },
  PayBO_demo:          { file: ".paybo_demo",        label: "PayBO Demo"           },
  PayBO_apollo:        { file: ".paybo_apollo",      label: "PayBO Apollo"         },
  PayBO_apollo_INR:    { file: ".paybo_apollo_inr",  label: "PayBO Apollo INR"     },
  PayBO_xcpay:         { file: ".paybo_xcpay",       label: "PayBO XCPay"          },
  PayBO_tiger:         { file: ".paybo_tiger",       label: "PayBO Tiger2378"      },
  PayBO_next8:         { file: ".paybo_next8",       label: "PayBO Next8"          },
  PayBO_cosmospay:     { file: ".paybo_cosmospay",   label: "PayBO Cosmospay"      },
  PayBO_snappay:       { file: ".paybo_snappay",     label: "PayBO Snappay"        },
};


// Script Actions
const SCRIPT_ACTIONS = {
  // S88 / Singhapay
  depositV2:       { path: "API/S88/trx-deposit/depositV2.js",         label: "Deposit V2",           type: "S88/Singhapay", kind: "deposit"  },
  depositV3:       { path: "API/S88/trx-deposit/deposit.js",           label: "Deposit V3",           type: "S88/Singhapay", kind: "deposit"  },
  depositV4:       { path: "API/S88/trx-deposit/depositV4.js",         label: "Deposit V4",           type: "S88/Singhapay", kind: "deposit"  },
  payout:          { path: "API/S88/trx-payout/payout.js",             label: "Payout",               type: "S88/Singhapay", kind: "payout"   },
  batchDepositV2:  { path: "API/S88/trx-deposit/batchDepositV2.js",    label: "Batch Deposit V2",     type: "S88/Singhapay", kind: "deposit"  },
  batchDepositV3:  { path: "API/S88/trx-deposit/batchDeposit.js",      label: "Batch Deposit V3",     type: "S88/Singhapay", kind: "deposit"  },
  batchDepositV4:  { path: "API/S88/trx-deposit/batchDepositV4.js",    label: "Batch Deposit V4",     type: "S88/Singhapay", kind: "deposit"  },
  batchWithdraw:   { path: "API/S88/trx-payout/batchWithdraw.js",      label: "Batch Withdraw",       type: "S88/Singhapay", kind: "payout"   },
  manualINR:       { path: "API/S88/trx-payout/manualINR.js",          label: "Manual Withdraw INR",  type: "S88/Singhapay", kind: "payout"   },
  manualVND:       { path: "API/S88/trx-payout/manualVND.js",          label: "Manual Withdraw VND",  type: "S88/Singhapay", kind: "payout"   },

  // PayBO
  payboDepositV2:       { path: "API/PayBO/trx-deposit/paybo-depositV2.js",     label: "PayBO Deposit V2",        type: "PayBO", kind: "deposit" },
  payboDepositV3:       { path: "API/PayBO/trx-deposit/paybo-deposit.js",       label: "PayBO Deposit V3",        type: "PayBO", kind: "deposit" },
  payboDepositV4:       { path: "API/PayBO/trx-deposit/paybo-depositV4.js",     label: "PayBO Deposit V4",        type: "PayBO", kind: "deposit" },
  payboDepositV5:       { path: "API/PayBO/trx-deposit/paybo-depositV5.js",     label: "PayBO Deposit V5",        type: "PayBO", kind: "deposit" },
  payboPayout:          { path: "API/PayBO/trx-payout/paybo-payout.js",         label: "PayBO Withdraw",          type: "PayBO", kind: "payout"  },
  payboPayoutV5:        { path: "API/PayBO/trx-payout/paybo-payoutV5.js",       label: "PayBO Withdraw V5",       type: "PayBO", kind: "payout"  },
  payboBatchDepositV3:  { path: "API/PayBO/trx-deposit/paybo-batchDeposit.js",  label: "PayBO Batch Deposit V3",  type: "PayBO", kind: "deposit" },
  payboBatchDepositV4:  { path: "API/PayBO/trx-deposit/paybo-batchDepositV4.js",label: "PayBO Batch Deposit V4",  type: "PayBO", kind: "deposit" },
  payboBatchDepositV5:  { path: "API/PayBO/trx-deposit/paybo-batchDepositV5.js",label: "PayBO Batch Deposit V5",  type: "PayBO", kind: "deposit" },
  payboBatchPayout:     { path: "API/PayBO/trx-payout/paybo-batchPayout.js",    label: "PayBO Batch Withdraw",    type: "PayBO", kind: "payout"  },
  payboBatchPayoutV5:   { path: "API/PayBO/trx-payout/paybo-batchPayoutV5.js",  label: "PayBO Batch Withdraw V5", type: "PayBO", kind: "payout"  },

  // Other
  callback:        { path: "API/manualCallback.js",                          label: "Manual Callback",   type: "Other", kind: null },
  checkStatus:     { path: "API/PayBO/additional/check-wd-status-v5.js",     label: "Check WD Status V5",type: "PayBO", kind: null },
  depositEncrypt:  { path: "API/encrypt_decrypt/depositEncrypt.js",          label: "Deposit Encrypt",   type: "Other", kind: null },
  payoutEncrypt:   { path: "API/encrypt_decrypt/payoutEncrypt.js",           label: "Withdraw Encrypt",  type: "Other", kind: null },
};

// Actions that need currency + merchant selection
const NEEDS_CURRENCY = new Set(
  Object.entries(SCRIPT_ACTIONS)
    .filter(([, v]) => v.kind !== null)
    .map(([k]) => k)
);

process.on("SIGINT", () => process.exit(0));

function toChoices(entries, back = true) {
  const choices = entries.map(([value, label], i) => ({
    name: `${i + 1}. ${label}`,
    value,
    short: label,
  }));
  if (back) choices.push(new inquirer.Separator(), { name: "← Kembali", value: "BACK" });
  return choices;
}

async function prompt(type, name, message, choices, extra = {}) {
  const { [name]: answer } = await inquirer.prompt([
    { type, name, message, choices, loop: false, ...extra },
  ]);
  return answer;
}

function parseMerchantsFromEnv(envFilePath, currency) {
  const lines = fs.readFileSync(envFilePath, "utf-8").split(/\r?\n/);
  let currentMerchant = null;
  const merchants = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("#") || trimmed.startsWith(";")) {
      currentMerchant = trimmed.replace(/^[#;]\s*/, "").replace(/\s+Merchant$/i, "").trim();
      continue;
    }

    if (trimmed.includes("=") && currentMerchant) {
      const [key, ...valParts] = trimmed.split("=");
      const cleanKey = key.trim();
      if (cleanKey.toUpperCase().includes(`_${currency}`)) {
        merchants[currentMerchant] ??= {};
        merchants[currentMerchant][cleanKey] = valParts.join("=").trim();
      }
    }
  }

  return Object.fromEntries(
    Object.entries(merchants).filter(([, vars]) =>
      Object.keys(vars).some(k => k.includes(`MERCHANT_CODE_${currency}`)) &&
      Object.keys(vars).some(k => k.includes(`SECRET_KEY_${currency}`))
    )
  );
}

function loadEnv(envPath, environment) {
  const vars = dotenv.parse(fs.readFileSync(envPath));
  for (const [k, v] of Object.entries(vars)) process.env[k] = v;
  process.env.NODE_ENV = environment;
}

function injectMerchantVars(vars) {
  for (const [k, v] of Object.entries(vars)) process.env[k] = v;
}

function runScript(scriptPath) {
  return new Promise((resolve) => {
    const child = spawn("node", [scriptPath], {
      stdio: "inherit",
      env: process.env,
      shell: true,
    });
    child.on("error", (err) => { console.error(`❌ Error: ${err.message}`); resolve(); });
    child.on("close", (code) => {
      if (code !== 0) console.log(`\n⚠️  Script selesai dengan kode: ${code}`);
      resolve();
    });
  });
}

function printRunSummary(envConfig, scriptConfig, currency, selectedMerchant, action) {
  console.log(`\n▶️ Menjalankan ${scriptConfig.label}...`);
  console.log(`   Environment     : ${envConfig.label}`);
  if (currency) {
    const { kind } = scriptConfig;
    const method = kind === "deposit"
      ? process.env[`DEPOSIT_METHOD_${currency}`]
      : kind === "payout"
        ? process.env[`PAYOUT_METHOD_${currency}`]
        : null;

    console.log(`   Currency        : ${currency}`);
    console.log(`   Merchant        : ${selectedMerchant}`);
    console.log(`   Merchant Code   : ${process.env[`MERCHANT_CODE_${currency}`] ?? "Not set"}`);
    if (method !== null) {
      console.log(`   ${kind === "deposit" ? "Deposit" : "Payout"} Method   : ${method ?? "Not set"}`);
    }
  }
  console.log(`   Base URL        : ${process.env.BASE_URL ?? "Not set"}`);
  console.log(`   Callback URL    : ${CALLBACK_URL ?? "Not set"}`);
  console.log(`   Script          : ${scriptConfig.path}\n`);
}

async function selectEnvironment() {
  return prompt("list", "environment", "Pilih Environment:",
    toChoices(Object.entries(ENV_CONFIGS).map(([k, v]) => [k, v.label]), false)
  );
}

async function selectScriptType() {
  const types = [...new Set(Object.values(SCRIPT_ACTIONS).map(s => s.type))];
  return prompt("list", "scriptType", "Pilih Jenis Script:",
    toChoices(types.map(t => [t, t]))
  );
}

async function selectAction(scriptType) {
  return prompt("list", "action", "Pilih Action:",
    toChoices(
      Object.entries(SCRIPT_ACTIONS)
        .filter(([, v]) => v.type === scriptType)
        .map(([k, v]) => [k, v.label])
    )
  );
}

async function selectCurrency() {
  const { currencyInput } = await inquirer.prompt([{
    type: "input",
    name: "currencyInput",
    message: "Masukkan Currency (atau ketik 'back' untuk kembali):",
    validate: (val) => {
      if (!val) return "Currency tidak boleh kosong";
      if (val.toLowerCase() === "back") return true;
      if (!/^[A-Za-z]+$/.test(val)) return "Gunakan huruf saja, misal: INR";
      return true;
    },
  }]);
  return currencyInput.toLowerCase() === "back" ? "BACK" : currencyInput.toUpperCase();
}

async function selectMerchant(merchantNames) {
  if (merchantNames.length === 1) return merchantNames[0];
  return prompt("list", "merchantChoice", "Pilih merchant:",
    toChoices(merchantNames.map(n => [n, n]))
  );
}

async function main() {
  while (true) {
    const environment = await selectEnvironment();
    const envConfig = ENV_CONFIGS[environment];
    const envPath = path.join(__dirname, envConfig.file);

    if (!fs.existsSync(envPath)) {
      console.error(`❌ File ${envConfig.file} tidak ditemukan.`);
      continue;
    }

    loadEnv(envPath, environment);

    // Script type loop
    while (true) {
      const scriptType = await selectScriptType();
      if (scriptType === "BACK") break;

      // Action loop
      while (true) {
        const action = await selectAction(scriptType);
        if (action === "BACK") break;

        const scriptConfig = SCRIPT_ACTIONS[action];
        let currency = null;
        let selectedMerchant = null;

        if (NEEDS_CURRENCY.has(action)) {
          // Currency + merchant loop
          let resolved = false;
          while (!resolved) {
            currency = await selectCurrency();
            if (currency === "BACK") break;

            const merchants = parseMerchantsFromEnv(envPath, currency);
            const merchantNames = Object.keys(merchants);

            if (merchantNames.length === 0) {
              console.error(`❌ Tidak ada merchant untuk ${currency} di ${envConfig.label}\n`);
              continue;
            }

            selectedMerchant = await selectMerchant(merchantNames);
            if (selectedMerchant === "BACK") continue;

            injectMerchantVars(merchants[selectedMerchant]);
            process.env.CURRENCY = currency;
            process.env.CURRENT_MERCHANT = selectedMerchant;
            resolved = true;
          }

          if (!resolved) continue; // back to action loop
        }

        const scriptPath = path.join(__dirname, scriptConfig.path);
        if (!fs.existsSync(scriptPath)) {
          console.error(`❌ Script tidak ditemukan: ${scriptPath}`);
          continue;
        }

        printRunSummary(envConfig, scriptConfig, currency, selectedMerchant, action);
        await runScript(scriptPath);
        process.exit(0);
      }
    }
  }
}

main().catch((err) => {
  console.error(err.isTtyError
    ? "❌ Prompt tidak bisa di-render di environment ini"
    : `❌ Error: ${err.message}`
  );
  process.exit(1);
});