import {
    BASE_URL, CALLBACK_URL, PMI_WD_URL,
    PAYOUT_METHOD_PMI, SECRET_KEY_PMI, MERCHANT_API_KEY_PMI, PMI_AUTHORIZATION,
    PAYOUT_METHOD_INR, MERCHANT_CODE_INR, MERCHANT_API_KEY_INR, SECRET_KEY_INR,
    PAYOUT_METHOD_VND, MERCHANT_CODE_VND, MERCHANT_API_KEY_VND, SECRET_KEY_VND,
    PAYOUT_METHOD_BDT, MERCHANT_CODE_BDT, MERCHANT_API_KEY_BDT, SECRET_KEY_BDT,
    PAYOUT_METHOD_MMK, MERCHANT_CODE_MMK, MERCHANT_API_KEY_MMK, SECRET_KEY_MMK,
    PAYOUT_METHOD_BRL, MERCHANT_CODE_BRL, MERCHANT_API_KEY_BRL, SECRET_KEY_BRL,
    PAYOUT_METHOD_IDR, MERCHANT_CODE_IDR, MERCHANT_API_KEY_IDR, SECRET_KEY_IDR,
    PAYOUT_METHOD_THB, MERCHANT_CODE_THB, MERCHANT_API_KEY_THB, SECRET_KEY_THB,
    PAYOUT_METHOD_MXN, MERCHANT_CODE_MXN, MERCHANT_API_KEY_MXN, SECRET_KEY_MXN,
    PAYOUT_METHOD_KRW, MERCHANT_CODE_KRW, MERCHANT_API_KEY_KRW, SECRET_KEY_KRW,
    PAYOUT_METHOD_PHP, MERCHANT_CODE_PHP, MERCHANT_API_KEY_PHP, SECRET_KEY_PHP,
    PAYOUT_METHOD_HKD, MERCHANT_CODE_HKD, MERCHANT_API_KEY_HKD, SECRET_KEY_HKD,
    PAYOUT_METHOD_MYR, MERCHANT_CODE_MYR, MERCHANT_API_KEY_MYR, SECRET_KEY_MYR,
    PAYOUT_METHOD_USDT, MERCHANT_CODE_USDT, MERCHANT_API_KEY_USDT, SECRET_KEY_USDT
} from "../Config/config.js";

const defaultInternalConfig = {
    BASE_URL,
    callbackURL: CALLBACK_URL,
};

const internalCurrencies = {
  INR: {
    merchantCode: MERCHANT_CODE_INR,
    payoutMethod: PAYOUT_METHOD_INR,
    secretKey: SECRET_KEY_INR,
    merchantAPI: MERCHANT_API_KEY_INR,
    requiresIFSC: true,
  },
  VND: {
    merchantCode: MERCHANT_CODE_VND,
    payoutMethod: PAYOUT_METHOD_VND,
    secretKey: SECRET_KEY_VND,
    merchantAPI: MERCHANT_API_KEY_VND,
    requiresBankCode: true,
  },
  BDT: {
    merchantCode: MERCHANT_CODE_BDT,
    payoutMethod: PAYOUT_METHOD_BDT,
    secretKey: SECRET_KEY_BDT,
    merchantAPI: MERCHANT_API_KEY_BDT,
    requiresBankCode: true,
  },
  MMK: {
    merchantCode: MERCHANT_CODE_MMK,
    payoutMethod: PAYOUT_METHOD_MMK,
    secretKey: SECRET_KEY_MMK,
    merchantAPI: MERCHANT_API_KEY_MMK,
    requiresBankCode: true,
  },
  BRL: {
    merchantCode: MERCHANT_CODE_BRL,
    payoutMethod: PAYOUT_METHOD_BRL,
    secretKey: SECRET_KEY_BRL,
    merchantAPI: MERCHANT_API_KEY_BRL,
    requiresBankCode: true,
  },
  IDR: {
    merchantCode: MERCHANT_CODE_IDR,
    payoutMethod: PAYOUT_METHOD_IDR,
    secretKey: SECRET_KEY_IDR,
    merchantAPI: MERCHANT_API_KEY_IDR,
    requiresBankCode: true,
  },
  THB: {
    merchantCode: MERCHANT_CODE_THB,
    payoutMethod: PAYOUT_METHOD_THB,
    secretKey: SECRET_KEY_THB,
    merchantAPI: MERCHANT_API_KEY_THB,
    requiresBankCode: true,
  },
  MXN: {
    merchantCode: MERCHANT_CODE_MXN,
    payoutMethod: PAYOUT_METHOD_MXN,
    secretKey: SECRET_KEY_MXN,
    merchantAPI: MERCHANT_API_KEY_MXN,
    requiresBankCode: true,
  },
  KRW: {
    merchantCode: MERCHANT_CODE_KRW,
    payoutMethod: PAYOUT_METHOD_KRW,
    secretKey: SECRET_KEY_KRW,
    merchantAPI: MERCHANT_API_KEY_KRW,
    requiresBankCode: true,
  },
  PHP: {
      merchantCode: MERCHANT_CODE_PHP,
      payoutMethod: PAYOUT_METHOD_PHP,
      secretKey: SECRET_KEY_PHP,
      merchantAPI: MERCHANT_API_KEY_PHP,
      requiresBankCode: true,
  },
  HKD: {
      merchantCode: MERCHANT_CODE_HKD,
      payoutMethod: PAYOUT_METHOD_HKD,
      secretKey: SECRET_KEY_HKD,
      merchantAPI: MERCHANT_API_KEY_HKD,
      requiresBankCode: true,
  },
  MYR: {
      merchantCode: MERCHANT_CODE_MYR,
      payoutMethod: PAYOUT_METHOD_MYR,
      secretKey: SECRET_KEY_MYR,
      merchantAPI: MERCHANT_API_KEY_MYR,
      requiresBankCode: true,
  },
  USDT: {
      merchantCode: MERCHANT_CODE_USDT,
      payoutMethod: PAYOUT_METHOD_USDT,
      secretKey: SECRET_KEY_USDT,
      merchantAPI: MERCHANT_API_KEY_USDT,
      requiresBankCode: false,
  }
};

export const payoutConfigMap = {
  PMI: {
    isExternal: true,
    BASE_URL: PMI_WD_URL,
    callbackURL: CALLBACK_URL,
    merchantAPI: MERCHANT_API_KEY_PMI,
    payoutMethod: PAYOUT_METHOD_PMI,
    secretKey: SECRET_KEY_PMI,
    authorization: PMI_AUTHORIZATION,
  },

  ...Object.entries(internalCurrencies).reduce((acc, [currency, cfg]) => {
    acc[currency] = { ...defaultInternalConfig, ...cfg };
    return acc;
  }, {})
};

export function getPayoutConfig(currency) {
  const config = internalCurrencies[currency];
  if (!config) {
    console.error(`Config untuk currency '${currency}' tidak ditemukan.`);
    throw new Error(`❌ Config untuk currency '${currency}' tidak ditemukan.`);
  }

  return {
    ...defaultInternalConfig,
    ...config,
  };
}
