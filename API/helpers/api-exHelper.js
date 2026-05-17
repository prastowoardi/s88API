import fetch from "node-fetch";
import logger from "../logger.js";
import { BASE_URL, MERCHANT_API_KEY_IDR, SECRET_TOKEN } from "../Config/config.js";

function getCurrentCurrency() {
    return (process.env.CURRENCY || "IDR").toUpperCase();
}

function getHeaders(token = null) {
    const headers = {
        "Content-Type": "application/json",
        "x-api-key": MERCHANT_API_KEY_IDR,
        "secret-token": SECRET_TOKEN
    };

    if (token) {
        headers["Authorization"] = token;
    }
    return headers;
}

export async function runAuthentication() {
    logger.info("======== 🔐 PAYBO AUTHENTICATION ========");
    
    try {
        const res = await fetch(`${BASE_URL}/api/auth/generate-token`, {
            method: "POST",
            headers: getHeaders()
        });

        const responseBody = await res.text();
        if (!res.ok) {
            logger.error(`❌ Auth Failed [HTTP ${res.status}]: ${responseBody}`);
            return null;
        }

        const result = JSON.parse(responseBody);
        if (result?.data?.token) {
            logger.info(`Token: ${result.data.token}`)
            logger.info("✅ Token successfully generated!");
            return `Bearer ${result.data.token}`;
        }

        logger.error("❌ Token tidak ditemukan dalam respons body.");
        return null;
    } catch (err) {
        logger.error(`❌ Authentication Error: ${err.message}`);
        return null;
    }
}

export async function runGenerateQRIS(token, amount, transactionCode) {
    logger.info("======== 📱 GENERATE QRIS PAYMENT ========");
    const currency = getCurrentCurrency();

    let paymentChannel = "VABNI"; 
    if (currency === "IDR") {
        paymentChannel = "VABNI";
    }

    const payload = {
        no_transaction: transactionCode,
        amount: Number(amount),
        payment_channel: paymentChannel,
        currency_code: currency,
        fullname: "TES",
        email: "example@mail.com",
        phone_number: "081234567891"
    };

    try {
        const res = await fetch(`${BASE_URL}/api/payment/generate-qris`, {
            method: "POST",
            headers: getHeaders(token),
            body: JSON.stringify(payload)
        });

        const responseBody = await res.text();
        logger.info(`Response Status: ${res.status}`);
        
        const result = JSON.parse(responseBody);
        logger.info(`QRIS Response:\n${JSON.stringify(result, null, 2)}`);
        return result;
    } catch (err) {
        logger.error(`❌ QRIS Error: ${err.message}`);
    }
}

export async function runGenerateVA(token, amount, channel, transactionCode) {
    logger.info("======== 💳 GENERATE VIRTUAL ACCOUNT ========");
    const currency = getCurrentCurrency();

    const payload = {
        no_transaction: transactionCode,
        amount: Number(amount),
        payment_channel: channel || "VABNI",
        currency_code: currency,
        fullname: "TES",
        email: "example@mail.com",
        phone_number: "081234567891"
    };

    try {
        const res = await fetch(`${BASE_URL}/api/payment/generate-va`, {
            method: "POST",
            headers: getHeaders(token),
            body: JSON.stringify(payload)
        });

        const responseBody = await res.text();
        logger.info(`Response Status: ${res.status}`);
        
        const result = JSON.parse(responseBody);
        logger.info(`VA Response:\n${JSON.stringify(result, null, 2)}`);
        return result;
    } catch (err) {
        logger.error(`❌ VA Error: ${err.message}`);
    }
}

export async function runCreateWithdrawal(token, amount, bankId, accountNumber, transactionCode) {
    logger.info("======== 💸 CREATE WITHDRAWAL ========");
    const currency = getCurrentCurrency();

    let channelType = "domestic_transfer";

    const payload = {
        no_transaction: transactionCode,
        amount: Number(amount),
        channel: channelType,
        currency_code: currency,
        bank_id: bankId || "3",
        account_holder_name: "SUCCESS",
        account_number: accountNumber || "123132123"
    };

    try {
        const res = await fetch(`${BASE_URL}/api/withdrawal-balance`, {
            method: "POST",
            headers: getHeaders(token),
            body: JSON.stringify(payload)
        });

        const responseBody = await res.text();
        logger.info(`Response Status: ${res.status}`);
        
        const result = JSON.parse(responseBody);
        logger.info(`Withdrawal Response:\n${JSON.stringify(result, null, 2)}`);
        return result;
    } catch (err) {
        logger.error(`❌ Withdrawal Error: ${err.message}`);
    }
}

export async function runInquiryTransaction(token, transactionCode) {
    logger.info("======== 🔍 INQUIRY TRANSACTION STATUS ========");

    const payload = { no_transaction: transactionCode };

    try {
        const res = await fetch(`${BASE_URL}/api/inquiry-transaction`, {
            method: "POST",
            headers: getHeaders(token),
            body: JSON.stringify(payload)
        });

        const responseBody = await res.text();
        logger.info(`Response Status: ${res.status}`);
        
        const result = JSON.parse(responseBody);
        logger.info(`Inquiry Transaction Response:\n${JSON.stringify(result, null, 2)}`);
        return result;
    } catch (err) {
        logger.error(`❌ Inquiry Transaction Error: ${err.message}`);
    }
}

export async function runGetBalance(token) {
    logger.info("======== 💰 GET BALANCE ========");

    try {
        const res = await fetch(`${BASE_URL}/api/get-balance`, {
            method: "POST",
            headers: getHeaders(token),
            body: "" 
        });

        const responseBody = await res.text();
        logger.info(`Response Status: ${res.status}`);
        
        const result = JSON.parse(responseBody);
        logger.info(`Balance Response:\n${JSON.stringify(result, null, 2)}`);
        return result;
    } catch (err) {
        logger.error(`❌ Get Balance Error: ${err.message}`);
    }
}

export async function runInquiryWithdrawal(token, partnerReference) {
    logger.info("======== 🔍 INQUIRY WITHDRAWAL STATUS ========");

    const payload = { no_partner_reference: partnerReference };

    try {
        const res = await fetch(`${BASE_URL}/api/inquiry-money-out`, {
            method: "POST",
            headers: getHeaders(token),
            body: JSON.stringify(payload)
        });

        const responseBody = await res.text();
        logger.info(`Response Status: ${res.status}`);
        
        const result = JSON.parse(responseBody);
        logger.info(`Inquiry Withdrawal Response:\n${JSON.stringify(result, null, 2)}`);
        return result;
    } catch (err) {
        logger.error(`❌ Inquiry Withdrawal Error: ${err.message}`);
    }
}

export async function runListBanks(token) {
    logger.info("======== 🏦 LIST BANKS (GET) ========");

    try {
        const res = await fetch(`${BASE_URL}/api/list-banks`, {
            method: "GET",
            headers: getHeaders(token)
        });

        const responseBody = await res.text();
        logger.info(`Response Status: ${res.status}`);
        
        const result = JSON.parse(responseBody);
        logger.info(`List Banks Response:\n${JSON.stringify(result, null, 2)}`);
        return result;
    } catch (err) {
        logger.error(`❌ List Bank Error: ${err.message}`);
    }
}