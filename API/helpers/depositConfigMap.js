import {
  BASE_URL,
  CALLBACK_URL,
  MERCHANT_CODE_INR, SECRET_KEY_INR, MERCHANT_API_KEY_INR, DEPOSIT_METHOD_INR,
  MERCHANT_CODE_VND, SECRET_KEY_VND, MERCHANT_API_KEY_VND, DEPOSIT_METHOD_VND,
  MERCHANT_CODE_BDT, SECRET_KEY_BDT, MERCHANT_API_KEY_BDT, DEPOSIT_METHOD_BDT,
  MERCHANT_CODE_MMK, SECRET_KEY_MMK, MERCHANT_API_KEY_MMK, DEPOSIT_METHOD_MMK,
  MERCHANT_CODE_BRL, SECRET_KEY_BRL, MERCHANT_API_KEY_BRL, DEPOSIT_METHOD_BRL,
  MERCHANT_CODE_IDR, SECRET_KEY_IDR, MERCHANT_API_KEY_IDR, DEPOSIT_METHOD_IDR,
  MERCHANT_CODE_THB, SECRET_KEY_THB, MERCHANT_API_KEY_THB, DEPOSIT_METHOD_THB,
  MERCHANT_CODE_MXN, SECRET_KEY_MXN, MERCHANT_API_KEY_MXN, DEPOSIT_METHOD_MXN,
  MERCHANT_CODE_KRW, SECRET_KEY_KRW, MERCHANT_API_KEY_KRW, DEPOSIT_METHOD_KRW,
  MERCHANT_CODE_PHP, SECRET_KEY_PHP, MERCHANT_API_KEY_PHP, DEPOSIT_METHOD_PHP
} from "../Config/config.js";

const defaultConfig = {
  BASE_URL,
  callbackURL: CALLBACK_URL,
};

export const currencyConfigMap = {
  INR: {
    merchantCode: MERCHANT_CODE_INR,
    depositMethod: DEPOSIT_METHOD_INR,
    secretKey: SECRET_KEY_INR,
    merchantAPI: MERCHANT_API_KEY_INR,
  },
  VND: {
    merchantCode: MERCHANT_CODE_VND,
    depositMethod: DEPOSIT_METHOD_VND,
    secretKey: SECRET_KEY_VND,
    merchantAPI: MERCHANT_API_KEY_VND,
    requiresBankCode: true,
  },
  BDT: {
    merchantCode: MERCHANT_CODE_BDT,
    depositMethod: DEPOSIT_METHOD_BDT,
    secretKey: SECRET_KEY_BDT,
    merchantAPI: MERCHANT_API_KEY_BDT,
    bankCodeOptions: ["1002", "1001", "1004", "1003"],
  },
  MMK: {
    merchantCode: MERCHANT_CODE_MMK,
    depositMethod: DEPOSIT_METHOD_MMK,
    secretKey: SECRET_KEY_MMK,
    merchantAPI: MERCHANT_API_KEY_MMK,
    requiresBankCode: true,
  },
  BRL: {
    merchantCode: MERCHANT_CODE_BRL,
    depositMethod: DEPOSIT_METHOD_BRL,
    secretKey: SECRET_KEY_BRL,
    merchantAPI: MERCHANT_API_KEY_BRL,
    requiresBankCode: true,
  },
  IDR: {
    merchantCode: MERCHANT_CODE_IDR,
    depositMethod: DEPOSIT_METHOD_IDR,
    secretKey: SECRET_KEY_IDR,
    merchantAPI: MERCHANT_API_KEY_IDR,
    bankCodeOptions: ["BCA", "DANA", "OVO", "GOPAY", "MANDIRI", "BNI"],
  },
  THB: {
    merchantCode: MERCHANT_CODE_THB,
    depositMethod: DEPOSIT_METHOD_THB,
    secretKey: SECRET_KEY_THB,
    merchantAPI: MERCHANT_API_KEY_THB,
    bankCodeOptions: ["BBL", "GSB", "KTB", "SCBEASY"],
    cardNumber: true,
  },
  MXN: {
    merchantCode: MERCHANT_CODE_MXN,
    depositMethod: DEPOSIT_METHOD_MXN,
    secretKey: SECRET_KEY_MXN,
    merchantAPI: MERCHANT_API_KEY_MXN,
    requiresBankCode: true,
  },
  KRW: {
    merchantCode: MERCHANT_CODE_KRW,
    depositMethod: DEPOSIT_METHOD_KRW,
    secretKey: SECRET_KEY_KRW,
    merchantAPI: MERCHANT_API_KEY_KRW,
    requiresBankCode: false,
  },
  PHP: {
    merchantCode: MERCHANT_CODE_PHP,
    depositMethod: DEPOSIT_METHOD_PHP,
    secretKey: SECRET_KEY_PHP,
    merchantAPI: MERCHANT_API_KEY_PHP,
    requiresBankCode: true,
  }
};

for (const currency in currencyConfigMap) {
  currencyConfigMap[currency] = { ...defaultConfig, ...currencyConfigMap[currency] };
}

export function getCurrencyConfig(currency) {
  const config = currencyConfigMap[currency];
  if (!config) {
    console.error(`Config untuk currency '${currency}' tidak ditemukan.`);
    throw new Error(`❌ Config untuk currency '${currency}' tidak ditemukan.`);
  }
  // console.log(`Currency Config for ${currency}:`, config);
  return config;
}
