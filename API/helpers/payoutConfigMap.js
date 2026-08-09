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
    const config = payoutConfigMap[currency];
    if (!config) {
        console.error(`Config untuk currency '${currency}' tidak ditemukan.`);
        throw new Error(`❌ Config untuk currency '${currency}' tidak ditemukan.`);
    }
    return { ...config };
}
