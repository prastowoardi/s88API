#!/usr/bin/env node
/**
 * server.js — Express backend untuk S88 API WebView
 * Menangani: enkripsi payload, load .env per environment, generate random data
 * Hit API ke payment gateway dilakukan langsung dari browser (client-side fetch)
 *
 * Jalankan: node server.js
 * Default port: 3000 (ubah via env PORT=xxxx)
 */

import express from "express";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { randomInt } from "crypto";
import { createServer } from "http";
import { WebSocketServer } from "ws";

import { encryptDecrypt, encryptDecryptPayout, signVerify, getRandomIP, getRandomName, getAccountNumber } from "./API/helpers/utils.js";
import { randomPhoneNumber, randomMyanmarPhoneNumber, randomCardNumber } from "./API/helpers/depositHelper.js";
import { getValidIFSC } from "./API/helpers/payoutHelper.js";
import { localCurrency } from "./API/helpers/currencyConfigMap.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

const PORT = process.env.PORT || 3000;
const CALLBACK_URL = "https://webhook.prastowoardi616.workers.dev/webhook";

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── ENV Configs ─────────────────────────────────────────────────────────────
const ENV_CONFIGS = {
    staging: { file: ".env_staging", label: "Seapay Staging", type: "staging" },
    singhapay_staging: { file: ".env_singhaStag", label: "Singhapay Staging", type: "staging" },
    PayBO_staging: { file: ".paybo_staging", label: "PayBO Staging", type: "staging" },
    production: { file: ".env_production", label: "Seapay Production", type: "production" },
    singhapay: { file: ".env_singhapay", label: "Singhapay Production", type: "production" },
    PayBO_production: { file: ".paybo_production", label: "PayBO Production", type: "production" },
    PayBO_ezyplus: { file: ".paybo_ezyplus", label: "PayBO Ezyplus", type: "production" },
    PayBO_wandpay: { file: ".paybo_wandpay", label: "PayBO Wandpay", type: "production" },
    PayBO_swftx: { file: ".paybo_swftx", label: "PayBO Swftx", type: "production" },
    PayBO_rangoon: { file: ".paybo_rangoon", label: "PayBO Rangoon", type: "production" },
    PayBO_bajix: { file: ".paybo_bajix", label: "PayBO Bajix", type: "production" },
    PayBO_erfolgpay: { file: ".paybo_erfolgpay", label: "PayBO Erfolgpay", type: "production" },
    PayBO_commspay: { file: ".paybo_commspay", label: "PayBO Commspay", type: "production" },
    PayBO_dreampay: { file: ".paybo_dreampay", label: "PayBO Dreampay", type: "production" },
    PayBO_demo: { file: ".paybo_demo", label: "PayBO Demo", type: "production" },
    PayBO_apollo: { file: ".paybo_apollo", label: "PayBO Apollo", type: "production" },
    PayBO_apollo_INR: { file: ".paybo_apollo_inr", label: "PayBO Apollo INR", type: "production" },
    PayBO_xcpay: { file: ".paybo_xcpay", label: "PayBO XCPay", type: "production" },
    PayBO_tiger: { file: ".paybo_tiger", label: "PayBO Tiger2378", type: "production" },
    PayBO_next8: { file: ".paybo_next8", label: "PayBO Next8", type: "production" },
    PayBO_cosmospay: { file: ".paybo_cosmospay", label: "PayBO Cosmospay", type: "production" },
    PayBO_snappay: { file: ".paybo_snappay", label: "PayBO Snappay", type: "production" },
};

// ─── Helper: parse merchants dari env file ───────────────────────────────────
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
        } else if (trimmed && trimmed.includes("=") && !trimmed.startsWith("#")) {
            const [key, ...valParts] = trimmed.split("=");
            const cleanKey = key.trim();
            if (cleanKey.toUpperCase().includes(`_${currency}`) && currentMerchant) {
                if (!merchants[currentMerchant]) merchants[currentMerchant] = {};
                merchants[currentMerchant][cleanKey] = valParts.join("=").trim();
            }
        }
    }

    const valid = {};
    for (const [name, vars] of Object.entries(merchants)) {
        const hasCode = Object.keys(vars).some(k => k.includes(`MERCHANT_CODE_${currency}`));
        const hasKey = Object.keys(vars).some(k => k.includes(`SECRET_KEY_${currency}`));
        if (hasCode && hasKey) valid[name] = vars;
    }
    return valid;
}

// ─── Helper: load env file → return parsed vars ───────────────────────────────
function loadEnvFile(envKey) {
    const cfg = ENV_CONFIGS[envKey];
    if (!cfg) throw new Error(`Unknown environment: ${envKey}`);
    const envPath = path.join(__dirname, cfg.file);
    if (!fs.existsSync(envPath)) throw new Error(`File ${cfg.file} tidak ditemukan`);
    return dotenv.parse(fs.readFileSync(envPath));
}

// ─── Helper: build config dari env vars ──────────────────────────────────────
function buildCurrencyConfig(envVars, currency, merchantVars = {}) {
    const merged = { ...envVars, ...merchantVars };
    return {
        baseUrl: merged.BASE_URL || merged[`BASE_URL_${currency}`] || "",
        merchantCode: merged[`MERCHANT_CODE_${currency}`] || "",
        merchantAPI: merged[`MERCHANT_API_KEY_${currency}`] || "",
        secretKey: merged[`SECRET_KEY_${currency}`] || "",
        depMethod: merged[`DEPOSIT_METHOD_${currency}`] || "",
        payMethod: merged[`PAYOUT_METHOD_${currency}`] || "",
        callbackURL: CALLBACK_URL,
    };
}

// ─── WebSocket: broadcast log ke semua klien ─────────────────────────────────
function broadcast(type, data) {
    const msg = JSON.stringify({ type, ...data, ts: Date.now() });
    wss.clients.forEach(client => {
        if (client.readyState === 1) client.send(msg);
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// API Routes
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/envs — daftar semua environment
app.get("/api/envs", (_req, res) => {
    res.json(ENV_CONFIGS);
});

// POST /api/merchants — daftar merchant per env + currency
app.post("/api/merchants", (req, res) => {
    try {
        const { envKey, currency } = req.body;
        const envPath = path.join(__dirname, ENV_CONFIGS[envKey].file);
        const merchants = parseMerchantsFromEnv(envPath, currency.toUpperCase());
        res.json({ merchants: Object.keys(merchants) });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// POST /api/env-vars — ambil env vars untuk env + currency + merchant tertentu
app.post("/api/env-vars", (req, res) => {
    try {
        const { envKey, currency, merchant } = req.body;
        const curr = currency.toUpperCase();
        const envPath = path.join(__dirname, ENV_CONFIGS[envKey].file);
        const envVars = loadEnvFile(envKey);
        const merchants = parseMerchantsFromEnv(envPath, curr);
        const merchantVars = merchant ? (merchants[merchant] || {}) : {};
        const config = buildCurrencyConfig(envVars, curr, merchantVars);
        res.json({ config });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// POST /api/deposit/prepare — build + encrypt deposit payload (V2/V3/V4)
app.post("/api/deposit/prepare", async (req, res) => {
    try {
        const {
            envKey, currency, merchant, amount,
            bankCode, depositorBank, txCode, redirectUrl, version
        } = req.body;

        const curr = currency.toUpperCase();
        const envPath = path.join(__dirname, ENV_CONFIGS[envKey].file);
        const envVars = loadEnvFile(envKey);
        const merchants = parseMerchantsFromEnv(envPath, curr);
        const merchantVars = merchant ? (merchants[merchant] || {}) : {};
        const cfg = buildCurrencyConfig(envVars, curr, merchantVars);

        if (!cfg.merchantCode || !cfg.merchantAPI || !cfg.secretKey) {
            return res.status(400).json({ error: "Konfigurasi merchant tidak lengkap (merchantCode / merchantAPI / secretKey kosong)" });
        }

        const timestamp = Math.floor(Date.now() / 1000).toString();
        const txc = txCode || `TEST-DP-${version?.toUpperCase() || "V2"}-${timestamp}`;
        const userID = randomInt(100, 999);
        const locale = localCurrency[curr] || "en";
        const name = await getRandomName(locale, true);
        const ip = getRandomIP();
        const cardNumber = randomCardNumber();

        // Phone
        let phone = "";
        const PHONE_CURRENCIES = ["INR", "BDT"];
        if (PHONE_CURRENCIES.includes(curr)) {
            phone = randomPhoneNumber(curr.toLowerCase());
        } else if (curr === "MMK" && bankCode === "WAVEPAY") {
            phone = randomMyanmarPhoneNumber();
        }

        const payload = {
            merchant_api_key: cfg.merchantAPI,
            merchant_code: cfg.merchantCode,
            transaction_code: txc,
            transaction_timestamp: timestamp,
            transaction_amount: amount,
            user_id: String(userID),
            currency_code: curr,
            payment_code: cfg.depMethod,
            ip_address: ip,
            ...(bankCode && { bank_code: bankCode }),
            ...(phone && { phone }),
            redirect_url: redirectUrl || "https://kaskus.id",
            callback_url: cfg.callbackURL,
        };

        // THB extras
        if (curr === "THB" && depositorBank) {
            payload.depositor_bank = depositorBank;
            payload.depositor_name = name;
            payload.depositor_account_number = cardNumber;
        }

        const qs = Object.entries(payload)
            .map(([k, v]) => {
                const skipEncode = ["depositor_name", "callback_url", "ip_address", "redirect_url", "email"];
                return skipEncode.includes(k) ? `${k}=${v}` : `${k}=${encodeURIComponent(v)}`;
            })
            .join("&");

        const encrypted = encryptDecrypt("encrypt", qs, cfg.merchantAPI, cfg.secretKey);
        const paymentUrl = `${cfg.baseUrl}/${cfg.merchantCode}/v2/dopayment?key=${encrypted}`;

        broadcast("log", {
            action: `deposit_${version || "v2"}`,
            env: ENV_CONFIGS[envKey].label,
            currency: curr,
            merchant,
            txCode: txc,
            amount,
        });

        res.json({ payload, qs, encrypted, paymentUrl, txCode: txc, userID, name, ip });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/deposit/prepare-v5 — build + sign deposit payload V5 (PayBO)
app.post("/api/deposit/prepare-v5", async (req, res) => {
    try {
        const { envKey, currency, merchant, amount, bankCode, txCode } = req.body;
        const curr = currency.toUpperCase();
        const envPath = path.join(__dirname, ENV_CONFIGS[envKey].file);
        const envVars = loadEnvFile(envKey);
        const merchants = parseMerchantsFromEnv(envPath, curr);
        const merchantVars = merchant ? (merchants[merchant] || {}) : {};
        const cfg = buildCurrencyConfig(envVars, curr, merchantVars);

        const timestamp = Math.floor(Date.now() / 1000).toString();
        const txc = txCode || `TEST-DP-V5-${timestamp}`;
        const userID = randomInt(100, 999);
        const ip = getRandomIP();
        const phone = randomPhoneNumber(curr.toLowerCase());
        const locale = localCurrency[curr] || "en";
        const name = await getRandomName(locale, true);

        const payload = {
            merchant_code: cfg.merchantCode,
            transaction_code: txc,
            transaction_timestamp: timestamp,
            transaction_amount: String(amount),
            user_id: String(userID),
            currency_code: curr,
            payment_code: cfg.depMethod,
            ip_address: ip,
            cust_name: name,
            ...(phone && { cust_phone: phone }),
            ...(bankCode && { bank_code: bankCode }),
            callback_url: cfg.callbackURL,
        };

        const payloadStr = JSON.stringify(payload);
        const signature = signVerify("sign", payloadStr, cfg.secretKey);
        const encryptedMC = encryptDecrypt("encrypt", cfg.merchantCode, cfg.merchantAPI, cfg.secretKey);
        const depositUrl = `${cfg.baseUrl}/api/${cfg.merchantCode}/v5/deposit`;

        broadcast("log", {
            action: "deposit_v5",
            env: ENV_CONFIGS[envKey].label,
            currency: curr,
            merchant,
            txCode: txc,
            amount,
        });

        res.json({ payload, payloadStr, signature, encryptedMC, depositUrl, txCode: txc });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/payout/prepare — build + encrypt payout payload (regular / V5)
app.post("/api/payout/prepare", async (req, res) => {
    try {
        const { envKey, currency, merchant, amount, bankCode, accountName, txCode, version } = req.body;
        const curr = currency.toUpperCase();
        const envPath = path.join(__dirname, ENV_CONFIGS[envKey].file);
        const envVars = loadEnvFile(envKey);
        const merchants = parseMerchantsFromEnv(envPath, curr);
        const merchantVars = merchant ? (merchants[merchant] || {}) : {};
        const cfg = buildCurrencyConfig(envVars, curr, merchantVars);

        if (!cfg.merchantCode || !cfg.merchantAPI || !cfg.secretKey) {
            return res.status(400).json({ error: "Konfigurasi merchant tidak lengkap" });
        }

        const timestamp = Math.floor(Date.now() / 1000).toString();
        const txc = txCode || `TEST-WD-${timestamp}-${randomInt(1000, 9999)}`;
        const userID = randomInt(100, 999);
        const name = accountName || await getRandomName();
        const ip = getRandomIP();

        let bankAccountNumber = getAccountNumber(6);

        // INR: butuh IFSC
        let ifscCode = null;
        if (curr === "INR") {
            try {
                ifscCode = await getValidIFSC();
            } catch (_) {
                ifscCode = "HDFC0001234";
            }
        }

        const payload = {
            merchant_code: cfg.merchantCode,
            transaction_code: txc,
            transaction_timestamp: timestamp,
            transaction_amount: Number(amount),
            user_id: String(userID),
            currency_code: curr,
            payout_code: cfg.payMethod,
            callback_url: cfg.callbackURL,
            account_name: name,
            ip_address: ip,
            bank_account_number: bankAccountNumber,
            ...(bankCode && { bank_code: bankCode }),
            ...(ifscCode && { ifsc_code: ifscCode }),
        };

        let encrypted, payoutUrl, signature;

        if (version === "v5") {
            const payloadStr = JSON.stringify(payload);
            signature = signVerify("sign", payload, cfg.secretKey);
            payoutUrl = `${cfg.baseUrl}/api/${cfg.merchantCode}/v5/payout`;
            broadcast("log", { action: "payout_v5", env: ENV_CONFIGS[envKey].label, currency: curr, merchant, txCode: txc, amount });
            return res.json({ payload, payloadStr, signature, payoutUrl, txCode: txc, version: "v5" });
        }

        encrypted = encryptDecryptPayout("encrypt", payload, cfg.merchantAPI, cfg.secretKey);
        payoutUrl = `${cfg.baseUrl}/api/v1/payout/${cfg.merchantCode}`;

        broadcast("log", { action: "payout_regular", env: ENV_CONFIGS[envKey].label, currency: curr, merchant, txCode: txc, amount });
        res.json({ payload, encrypted, payoutUrl, txCode: txc, version: "regular" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/batch/deposit — build batch deposit payloads
app.post("/api/batch/deposit", async (req, res) => {
    try {
        const { envKey, currency, merchant, entries, version } = req.body;
        const curr = currency.toUpperCase();
        const envPath = path.join(__dirname, ENV_CONFIGS[envKey].file);
        const envVars = loadEnvFile(envKey);
        const merchants = parseMerchantsFromEnv(envPath, curr);
        const merchantVars = merchant ? (merchants[merchant] || {}) : {};
        const cfg = buildCurrencyConfig(envVars, curr, merchantVars);

        const results = await Promise.all(entries.map(async (entry, i) => {
            const timestamp = Math.floor(Date.now() / 1000).toString();
            const txc = `TEST-BATCH-DP-${i + 1}-${timestamp}`;
            const ip = getRandomIP();
            const locale = localCurrency[curr] || "en";
            const name = await getRandomName(locale, true);
            const phone = randomPhoneNumber(curr.toLowerCase());

            const payload = {
                merchant_api_key: cfg.merchantAPI,
                merchant_code: cfg.merchantCode,
                transaction_code: txc,
                transaction_timestamp: timestamp,
                transaction_amount: entry.amount,
                user_id: String(randomInt(100, 999)),
                currency_code: curr,
                payment_code: cfg.depMethod,
                ip_address: ip,
                ...(entry.bank_code && { bank_code: entry.bank_code }),
                ...(phone && { phone }),
                redirect_url: "https://kaskus.id",
                callback_url: CALLBACK_URL,
            };

            const qs = Object.entries(payload)
                .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
                .join("&");

            const encrypted = encryptDecrypt("encrypt", qs, cfg.merchantAPI, cfg.secretKey);
            const paymentUrl = `${cfg.baseUrl}/${cfg.merchantCode}/v${version === "v4" ? "4" : version === "v5" ? "5" : "3"}/dopayment?key=${encrypted}`;

            return { txCode: txc, payload, qs, encrypted, paymentUrl, name };
        }));

        broadcast("log", { action: `batch_deposit_${version}`, env: ENV_CONFIGS[envKey].label, currency: curr, merchant, count: entries.length });
        res.json({ results, count: results.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/batch/payout — build batch payout payloads
app.post("/api/batch/payout", async (req, res) => {
    try {
        const { envKey, currency, merchant, entries, version } = req.body;
        const curr = currency.toUpperCase();
        const envPath = path.join(__dirname, ENV_CONFIGS[envKey].file);
        const envVars = loadEnvFile(envKey);
        const merchants = parseMerchantsFromEnv(envPath, curr);
        const merchantVars = merchant ? (merchants[merchant] || {}) : {};
        const cfg = buildCurrencyConfig(envVars, curr, merchantVars);

        const results = await Promise.all(entries.map(async (entry, i) => {
            const timestamp = Math.floor(Date.now() / 1000).toString();
            const txc = `TEST-BATCH-WD-${i + 1}-${timestamp}`;
            const name = await getRandomName();
            const ip = getRandomIP();

            const payload = {
                merchant_code: cfg.merchantCode,
                transaction_code: txc,
                transaction_timestamp: timestamp,
                transaction_amount: Number(entry.amount),
                user_id: String(randomInt(100, 999)),
                currency_code: curr,
                payout_code: cfg.payMethod,
                callback_url: CALLBACK_URL,
                account_name: name,
                ip_address: ip,
                bank_account_number: getAccountNumber(6),
                ...(entry.bank_code && { bank_code: entry.bank_code }),
            };

            let encrypted, payoutUrl;
            if (version === "v5") {
                const sig = signVerify("sign", payload, cfg.secretKey);
                payoutUrl = `${cfg.baseUrl}/api/${cfg.merchantCode}/v5/payout`;
                return { txCode: txc, payload, signature: sig, payoutUrl, name };
            }
            encrypted = encryptDecryptPayout("encrypt", payload, cfg.merchantAPI, cfg.secretKey);
            payoutUrl = `${cfg.baseUrl}/api/v1/payout/${cfg.merchantCode}`;
            return { txCode: txc, payload, encrypted, payoutUrl, name };
        }));

        broadcast("log", { action: `batch_payout_${version}`, env: ENV_CONFIGS[envKey].label, currency: curr, merchant, count: entries.length });
        res.json({ results, count: results.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/encrypt — encrypt/decrypt arbitrary string
app.post("/api/encrypt", (req, res) => {
    try {
        const { action, data, apiKey, secretKey } = req.body;
        if (!["encrypt", "decrypt"].includes(action)) return res.status(400).json({ error: "action harus 'encrypt' atau 'decrypt'" });
        const result = encryptDecrypt(action, data, apiKey, secretKey);
        res.json({ result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/sign — HMAC sign payload (V5)
app.post("/api/sign", (req, res) => {
    try {
        const { data, secretKey } = req.body;
        const payload = typeof data === "string" ? data : JSON.stringify(data);
        const signature = signVerify("sign", payload, secretKey);
        res.json({ signature });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/check-wd-status — sign & build check WD status V5
app.post("/api/check-wd-status", (req, res) => {
    try {
        const { envKey, currency, merchant, requestNo } = req.body;
        const curr = currency.toUpperCase();
        const envVars = loadEnvFile(envKey);
        const envPath = path.join(__dirname, ENV_CONFIGS[envKey].file);
        const merchants = parseMerchantsFromEnv(envPath, curr);
        const merchantVars = merchant ? (merchants[merchant] || {}) : {};
        const cfg = buildCurrencyConfig(envVars, curr, merchantVars);

        const req2 = { request_no: requestNo };
        const signature = signVerify("sign", req2, cfg.secretKey);
        const url = `${cfg.baseUrl}/api/${cfg.merchantCode}/v5/checkWDRequestStatus`;

        res.json({ url, payload: req2, signature, headers: { "Content-Type": "application/json", sign: signature } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/random-name — generate random name
app.get("/api/random-name", async (req, res) => {
    try {
        const locale = req.query.locale || "en";
        const name = await getRandomName(locale, false);
        res.json({ name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/random-txcode — generate TX code
app.get("/api/random-txcode", (req, res) => {
    const prefix = req.query.prefix || "TEST-DP";
    const ts = Math.floor(Date.now() / 1000);
    const rand = randomInt(1000, 9999);
    res.json({ txCode: `${prefix}-${ts}-${rand}` });
});

// ─── WebSocket: ping keepalive ────────────────────────────────────────────────
wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "connected", ts: Date.now() }));
    ws.on("message", (msg) => {
        try {
            const data = JSON.parse(msg.toString());
            if (data.type === "ping") ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
        } catch (_) { }
    });
});

// ─── SPA fallback ─────────────────────────────────────────────────────────────
app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ─── Start ────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
    console.log(`\n🚀 Payment API WebView berjalan di http://localhost:${PORT}`);
    console.log(`   CLI lama tetap bisa dijalankan dengan: node index.js\n`);
});
