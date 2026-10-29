import * as Config from "../Config/config.js";

const defaultConfig = {
    BASE_URL: Config.BASE_URL,
    callbackURL: Config.CALLBACK_URL,
};

const currencyFlags = {
    INR: {},
    VND: { requiresBankCode: true },
    BDT: { requiresBankCode: true },
    MMK: { requiresBankCode: true },
    BRL: { requiresBankCode: true },
    IDR: { requiresBankCode: true, cardNumber: false },
    THB: { requiresBankCode: true, cardNumber: true },
    MXN: { requiresBankCode: true },
    KRW: { requiresBankCode: false, cardNumber: true },
    PHP: { requiresBankCode: true },
    JPY: { requiresBankCode: false },
    HKD: {},
    KHR: { requiresBankCode: true },
    MYR: { requiresBankCode: true },
    PKR: { requiresBankCode: true },
    NPR: { requiresBankCode: false },
    USDT: { requiresBankCode: true },
    TWD: { requiresBankCode: true },
};

/**
 * Mendapatkan daftar seluruh currency yang tersedia (kombinasi flag default + process.env)
 */
export function getAvailableCurrencies() {
    const list = new Set();
    for (const key of Object.keys(process.env)) {
        const match = key.match(/^MERCHANT_CODE_([A-Za-z0-9]+)$/i);
        if (match) list.add(match[1].toUpperCase());
    }
    if (process.env.CURRENCY && process.env.CURRENCY.trim()) {
        list.add(process.env.CURRENCY.trim().toUpperCase());
    }
    if (list.size === 0) {
        return Object.keys(currencyFlags);
    }
    return Array.from(list);
}

export function getCurrencyConfig(currency) {
    if (!currency) {
        throw new Error("Currency parameter is required.");
    }
    const curr = currency.toUpperCase();
    // Jika tidak ada di flags, default ke { requiresBankCode: true }
    const flags = currencyFlags[curr] || { requiresBankCode: true };

    const merchantCode = process.env[`MERCHANT_CODE_${curr}`] || process.env.MERCHANT_CODE || Config[`MERCHANT_CODE_${curr}`];
    const depositMethod = process.env[`DEPOSIT_METHOD_${curr}`] || process.env.DEPOSIT_METHOD || Config[`DEPOSIT_METHOD_${curr}`];
    const secretKey = process.env[`SECRET_KEY_${curr}`] || process.env.SECRET_KEY || Config[`SECRET_KEY_${curr}`];
    const merchantAPI = process.env[`MERCHANT_API_KEY_${curr}`] || process.env.MERCHANT_API_KEY || Config[`MERCHANT_API_KEY_${curr}`];

    if (!merchantCode) {
        const available = getAvailableCurrencies();
        const info = available.length > 0 ? ` Currency yang tersedia: ${available.join(", ")}` : "";
        throw new Error(`❌ Currency '${curr}' tidak didukung di environment ini.${info}`);
    }

    return {
        BASE_URL: process.env.BASE_URL || Config.BASE_URL,
        callbackURL: process.env.CALLBACK_URL || Config.CALLBACK_URL,
        merchantCode,
        depositMethod,
        secretKey,
        merchantAPI,
        apiKey: merchantAPI,
        ...flags,
        currency: curr,
    };
}

/**
 * Dynamic Proxy currencyConfigMap:
 * Mendukung akses langsung untuk currency apa pun yang ada di environment tanpa perlu didefinisikan manual.
 */
export const currencyConfigMap = new Proxy({}, {
    get(target, prop) {
        if (typeof prop === "string" && prop === prop.toUpperCase()) {
            try {
                return getCurrencyConfig(prop);
            } catch {
                return undefined;
            }
        }
        return target[prop];
    },
    ownKeys() {
        return getAvailableCurrencies();
    },
    getOwnPropertyDescriptor(target, prop) {
        return {
            enumerable: true,
            configurable: true,
            value: this.get(target, prop),
        };
    }
});
