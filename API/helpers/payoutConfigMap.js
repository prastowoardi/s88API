import * as Config from "../Config/config.js";

const defaultInternalConfig = {
    BASE_URL: Config.BASE_URL,
    callbackURL: Config.CALLBACK_URL,
};

const currencyFlags = {
    INR: { requiresIFSC: true },
    VND: { requiresBankCode: true },
    BDT: { requiresBankCode: true },
    MMK: { requiresBankCode: true },
    BRL: { requiresBankCode: true },
    IDR: { requiresBankCode: true },
    THB: { requiresBankCode: true },
    MXN: { requiresBankCode: true },
    KRW: { requiresBankCode: true },
    PHP: { requiresBankCode: true },
    HKD: { requiresBankCode: true },
    MYR: { requiresBankCode: true },
    JPY: { requiresBankCode: true },
    PKR: { requiresBankCode: true },
    NPR: { requiresBankCode: true },
    USDT: { requiresBankCode: false },
};

const internalCurrencies = Object.fromEntries(
    Object.entries(currencyFlags).map(([currency, flags]) => [
        currency,
        {
            merchantCode: Config[`MERCHANT_CODE_${currency}`],
            payoutMethod: Config[`PAYOUT_METHOD_${currency}`],
            secretKey: Config[`SECRET_KEY_${currency}`],
            merchantAPI: Config[`MERCHANT_API_KEY_${currency}`],
            ...flags,
        },
    ])
);

export const payoutConfigMap = Object.fromEntries(
    Object.entries(internalCurrencies).map(([currency, config]) => [
        currency,
        { ...defaultInternalConfig, ...config },
    ])
);

export function getPayoutConfig(currency) {
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
    const payoutMethod = process.env[`PAYOUT_METHOD_${curr}`] || process.env.PAYOUT_METHOD || Config[`PAYOUT_METHOD_${curr}`];
    const secretKey = process.env[`SECRET_KEY_${curr}`] || process.env.SECRET_KEY || Config[`SECRET_KEY_${curr}`];
    const merchantAPI = process.env[`MERCHANT_API_KEY_${curr}`] || process.env.MERCHANT_API_KEY || Config[`MERCHANT_API_KEY_${curr}`];

    return {
        BASE_URL: process.env.BASE_URL || Config.BASE_URL,
        callbackURL: process.env.CALLBACK_URL || Config.CALLBACK_URL,
        merchantCode,
        payoutMethod,
        secretKey,
        merchantAPI,
        apiKey: merchantAPI,
        ...flags,
        currency: curr,
    };
}
