import fetch from "node-fetch";
import logger from "../logger.js";
import { encryptDecrypt } from "./utils.js";

function randomBankAccountNumber() {
    let acc = "";
    for (let i = 0; i < 10; i++) {
        acc += Math.floor(Math.random() * 10);
    }
    return acc;
}
export async function createKrwCustomer(config) {
    const createCustomerURL = `${config.BASE_URL}/${config.merchantCode}/v4/create-customer`;
    const encryptedMerchantCode = encryptDecrypt("encrypt", config.merchantCode, config.merchantAPI, config.secretKey);

    const accountNumber = randomBankAccountNumber();
    const timestamp = Date.now();

    const customerPayload = {
        partnerType: "INDIVIDUAL",
        fullname: "Hanseol LIM 12",
        givenNames: "Hanseol 12",
        lastName: "Lim 12",
        fullnameKo: "임한설",
        phoneNumber: "",
        phoneCountryCode: "KR",
        email: `test${timestamp}@test.com`,
        idNumber: "",
        idType: "FOREIGN_RESIDENT_CARD",
        dateOfBirth: "",
        address: {
            address1: "Teheran-ro, Gangnam-Gu",
            address2: "",
            city: "",
            countryCode: "KR",
            state: "",
            province: "",
            zipCode: ""
        },
        bankInformation: {
            bankAccountNumber: accountNumber,
            bankCode: "IBK",
            dateOfBirth: "961120",
            accountHolderName: "test12"
        }
    };

    try {
        const res = await fetch(createCustomerURL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Encrypted-MerchantCode": encryptedMerchantCode
            },
            body: JSON.stringify(customerPayload)
        });

        const text = await res.text();
        if (!res.ok) {
            logger.error(`❌ create-customer gagal dengan status ${res.status}`);
            logger.error(`Response: ${text}`);
            return null;
        }

        const result = JSON.parse(text);
        logger.info(`Create User ID: ${JSON.stringify(result, null, 2)}`);
        return result;
    } catch (error) {
        logger.error(`❌ Error saat create-customer KRW: ${error}`);
        return null;
    }
}
