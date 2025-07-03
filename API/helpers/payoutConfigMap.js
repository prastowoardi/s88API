import {
  BASE_URL, CALLBACK_URL, PMI_WD_URL,
  PAYOUT_METHOD_INR, MERCHANT_CODE_INR, MERCHANT_API_KEY_INR, SECRET_KEY_INR,
  PAYOUT_METHOD_VND, MERCHANT_CODE_VND, MERCHANT_API_KEY_VND, SECRET_KEY_VND,
  PAYOUT_METHOD_PMI, SECRET_KEY_PMI, MERCHANT_API_KEY_PMI, PMI_AUTHORIZATION,
  PAYOUT_METHOD_BDT, MERCHANT_CODE_BDT, MERCHANT_API_KEY_BDT, SECRET_KEY_BDT,
  PAYOUT_METHOD_MMK, MERCHANT_CODE_MMK, MERCHANT_API_KEY_MMK, SECRET_KEY_MMK,
} from "../Config/config.js";

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
    INR: {
        BASE_URL,
        merchantCode: MERCHANT_CODE_INR,
        payoutMethod: PAYOUT_METHOD_INR,
        secretKey: SECRET_KEY_INR,
        merchantAPI: MERCHANT_API_KEY_INR,
        callbackURL: CALLBACK_URL,
        requiresIFSC: true,
    },
    VND: {
        BASE_URL,
        merchantCode: MERCHANT_CODE_VND,
        payoutMethod: PAYOUT_METHOD_VND,
        secretKey: SECRET_KEY_VND,
        merchantAPI: MERCHANT_API_KEY_VND,
        callbackURL: CALLBACK_URL,
        requiresBankCode: true,
    },
    BDT: {
        BASE_URL,
        callbackURL: CALLBACK_URL,
        merchantCode: MERCHANT_CODE_BDT,
        secretKey: SECRET_KEY_BDT,
        merchantAPI: MERCHANT_API_KEY_BDT,
        payoutMethod: PAYOUT_METHOD_BDT,
    },
    MMK: {
        BASE_URL,
        callbackURL: CALLBACK_URL,
        merchantCode: MERCHANT_CODE_MMK,
        secretKey: SECRET_KEY_MMK,
        merchantAPI: MERCHANT_API_KEY_MMK,
        payoutMethod: PAYOUT_METHOD_MMK,
    }
};

export function getPayoutConfig(currency) {
  const config = payoutConfigMap[currency];
  if (!config) throw new Error(`❌ Config untuk payout currency '${currency}' tidak ditemukan.`);
  return config;
}
