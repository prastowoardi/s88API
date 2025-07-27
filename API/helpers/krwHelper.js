import fetch from "node-fetch";
import logger from "../logger.js";
import { encryptDecrypt } from "./utils.js";
import { getRandomName } from "./payoutHelper.js";

function randomBankAccountNumber() {
    let acc = "";
    for (let i = 0; i < 10; i++) {
        acc += Math.floor(Math.random() * 10);
    }
    return acc;
}

export async function createKrwCustomer(config) {
    const createCustomerURL = `${config.BASE_URL}/api/${config.merchantCode}/v4/create-customer`;
    const encryptedMerchantCode = encryptDecrypt("encrypt", config.merchantCode, config.merchantAPI, config.secretKey);

    const accountNumber = randomBankAccountNumber();
    const timestamp = Date.now();

    const name = await getRandomName();
    const nameParts = name.trim().split(" ");
    const givenName = nameParts[0];
    const lastName = nameParts[1] || "Test";
    const accountHolderName = givenName;

    const customerPayload = {
        // fullnameKo: "임한설",
        // phoneNumber: "",
        // phoneCountryCode: "KR",
        // idNumber: "",
        // idType: "FOREIGN_RESIDENT_CARD",
        // dateOfBirth: "",
        // address: {
        //     address1: "Teheran-ro, Gangnam-Gu",
        //     address2: "",
        //     city: "",
        //     countryCode: "KR",
        //     state: "",
        //     province: "",
        //     zipCode: ""
        // },
        partnerType: "INDIVIDUAL",
        fullname: name,
        givenNames: givenName,
        lastName: lastName,
        email: `test${timestamp}@test.com`,
        bankInformation: {
            bankAccountNumber: "103010100985",
            bankCode: "SUHYUP",
            dateOfBirth: "910507",
            accountHolderName: "TZINMANN GABRIEL MONTGOMERY"
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
        logger.info(`Request Payload: ${JSON.stringify(customerPayload, null, 2)}`);
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
