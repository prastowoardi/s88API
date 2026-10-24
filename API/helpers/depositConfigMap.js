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

const currencyConfigMap = Object.fromEntries(
    Object.entries(currencyFlags).map(([currency, flags]) => [
        currency,
        {
            ...defaultConfig,
            merchantCode: Config[`MERCHANT_CODE_${currency}`],
            depositMethod: Config[`DEPOSIT_METHOD_${currency}`],
            secretKey: Config[`SECRET_KEY_${currency}`],
            merchantAPI: Config[`MERCHANT_API_KEY_${currency}`],
            ...flags,
        },
    ])
);

export function getCurrencyConfig(currency) {
    if (!currency) {
        throw new Error("Currency parameter is required.");
    }
    const curr = currency.toUpperCase();
    const flags = currencyFlags[curr];
    if (!flags) {
        console.error(`Config untuk currency '${currency}' tidak ditemukan.`);
        throw new Error(`❌ Config untuk currency '${currency}' tidak ditemukan.`);
    }

    const merchantCode = process.env[`MERCHANT_CODE_${curr}`] || process.env.MERCHANT_CODE || Config[`MERCHANT_CODE_${curr}`];
    const depositMethod = process.env[`DEPOSIT_METHOD_${curr}`] || process.env.DEPOSIT_METHOD || Config[`DEPOSIT_METHOD_${curr}`];
    const secretKey = process.env[`SECRET_KEY_${curr}`] || process.env.SECRET_KEY || Config[`SECRET_KEY_${curr}`];
    const merchantAPI = process.env[`MERCHANT_API_KEY_${curr}`] || process.env.MERCHANT_API_KEY || Config[`MERCHANT_API_KEY_${curr}`];

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
