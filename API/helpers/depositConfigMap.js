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
    const config = currencyConfigMap[currency];
    if (!config) {
        console.error(`Config untuk currency '${currency}' tidak ditemukan.`);
        throw new Error(`❌ Config untuk currency '${currency}' tidak ditemukan.`);
    }
    return { ...config, currency };
}
