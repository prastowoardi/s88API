import fs from "fs";

/**
 * Mendeteksi semua currency yang didukung dari file environment (.env).
 * Membaca key MERCHANT_CODE_<CURRENCY>= yang aktif (tidak dikomentari).
 *
 * @param {string} envFilePath Path file .env
 * @returns {string[]} Array kode currency unik (huruf kapital)
 */
export function getCurrenciesFromEnvFile(envFilePath) {
    if (!envFilePath || !fs.existsSync(envFilePath)) return [];
    try {
        const content = fs.readFileSync(envFilePath, "utf-8");
        const currencies = new Set();
        const lines = content.split(/\r?\n/);

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("#") || trimmed.startsWith(";")) continue;
            
            const match = trimmed.match(/^MERCHANT_CODE_([A-Za-z0-9]+)\s*=/i);
            if (match) {
                currencies.add(match[1].toUpperCase());
            }
        }
        return Array.from(currencies);
    } catch {
        return [];
    }
}

/**
 * Mendeteksi semua currency yang didukung dari process.env saat ini.
 * Memeriksa semua key dengan format MERCHANT_CODE_<CURRENCY>.
 *
 * @returns {string[]} Array kode currency unik (huruf kapital)
 */
export function getCurrenciesFromProcessEnv() {
    const currencies = new Set();
    for (const key of Object.keys(process.env)) {
        const match = key.match(/^MERCHANT_CODE_([A-Za-z0-9]+)$/i);
        if (match) {
            currencies.add(match[1].toUpperCase());
        }
    }
    if (process.env.CURRENCY && process.env.CURRENCY.trim()) {
        currencies.add(process.env.CURRENCY.trim().toUpperCase());
    }
    return Array.from(currencies);
}

/**
 * Mengambil daftar currency yang didukung.
 * Jika envPath diberikan, membaca dari file tersebut; jika tidak, membaca dari process.env.
 *
 * @param {string|null} envPath 
 * @returns {string[]}
 */
export function getSupportedCurrencies(envPath = null) {
    if (envPath) {
        const fromFile = getCurrenciesFromEnvFile(envPath);
        if (fromFile.length > 0) return fromFile;
    }
    return getCurrenciesFromProcessEnv();
}

/**
 * Memeriksa apakah suatu currency didukung oleh environment aktif.
 *
 * @param {string} currency Kode currency (misal: "INR", "VND", "IDR")
 * @param {string[]|null} supportedList Daftar currency opsional untuk validasi
 * @returns {boolean}
 */
export function isCurrencySupported(currency, supportedList = null) {
    if (!currency) return false;
    const upper = currency.trim().toUpperCase();
    const list = supportedList || getCurrenciesFromProcessEnv();
    if (list.length === 0) return true; // Tidak ada filter jika env kosong
    if (list.includes(upper)) return true;
    // Fallback: periksa langsung jika process.env memiliki kredensial
    return Boolean(process.env[`MERCHANT_CODE_${upper}`] || (process.env.CURRENCY === upper && process.env.MERCHANT_CODE));
}

/**
 * Memvalidasi currency. Melemparkan Error jika tidak valid atau tidak didukung di env aktif.
 *
 * @param {string} currency 
 * @param {string[]|null} supportedList 
 * @returns {string} Kode currency dalam huruf kapital
 */
export function validateCurrency(currency, supportedList = null) {
    if (!currency || !currency.trim()) {
        throw new Error("Parameter 'currency' wajib diisi!");
    }
    const upper = currency.trim().toUpperCase();
    const list = supportedList || getCurrenciesFromProcessEnv();

    if (list.length > 0 && !isCurrencySupported(upper, list)) {
        throw new Error(`❌ Currency '${upper}' tidak didukung di environment aktif. Didukung: ${list.join(", ")}`);
    }

    return upper;
}
