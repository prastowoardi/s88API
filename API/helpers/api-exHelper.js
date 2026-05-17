import fetch from "node-fetch";
import logger from "../logger.js";
import { generateEmail } from "./utils.js";
import { randomPhoneNumber } from "./depositHelper.js";

function getCurrentCurrency() {
    return (process.env.CURRENCY || "IDR").toUpperCase();
}

function getHeaders(token = null) {
    const currency = getCurrentCurrency();
    const apiKey = process.env[`MERCHANT_API_KEY_${currency}`] || process.env.MERCHANT_API_KEY_IDR;
    const secretToken = process.env.SECRET_TOKEN;

    const headers = {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "secret-token": secretToken
    };

    if (token) {
        headers["Authorization"] = token;
    }
    return headers;
}

async function userGenerate() {
    try {
        const user = await generateEmail();
        const name = user?.name || "TES";
        const email = user?.email || "example@mail.com";
        return { name, email };
    } catch (e) {
        return { name: "TES", email: "example@mail.com" };
    }
}

export async function runAuthentication() {
    logger.info("======== 🔐 API AUTHENTICATION ========");
    const baseUrl = process.env.BASE_URL;
    
    try {
        const res = await fetch(`${baseUrl}/api/auth/generate-token`, {
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
            logger.info(`Token: ${result.data.token}`);
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
    const baseUrl = process.env.BASE_URL;
    const currency = getCurrentCurrency();
    const userData = await userGenerate();

    let paymentChannel = "QRIS"; 
    if (currency === "IDR") {
        paymentChannel = "qris";
    }

    const payload = {
        no_transaction: transactionCode,
        amount: Number(amount),
        payment_channel: paymentChannel,
        currency_code: currency,
        fullname: userData.name,
        email: userData.email,
        phone_number: await randomPhoneNumber("idr")
    };

    try {
        const res = await fetch(`${baseUrl}/api/payment/generate-qris`, {
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
    const baseUrl = process.env.BASE_URL;
    const currency = getCurrentCurrency();
    const userData = await userGenerate();

    const payload = {
        no_transaction: transactionCode,
        amount: Number(amount),
        payment_channel: channel || "VABNI",
        currency_code: currency,
        fullname: userData.name,
        email: userData.email,
        phone_number: await randomPhoneNumber("idr")
    };

    try {
        const res = await fetch(`${baseUrl}/api/payment/generate-va`, {
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
    const baseUrl = process.env.BASE_URL;
    const currency = getCurrentCurrency();

    let channelType = "domestic_transfer";

    const payload = {
        no_reference: transactionCode,
        amount: Number(amount),
        channel: channelType,
        currency_code: currency,
        bank_id: bankId || "2",
        account_holder_name: "Ujang",
        account_number: accountNumber || "12340995811",
        description: "testing"
    };

    try {
        const res = await fetch(`${baseUrl}/api/withdrawal-balance`, {
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

export async function runInquiryDeposit(token, transactionCode) {
    logger.info("======== 🔍 INQUIRY TRANSACTION STATUS ========");
    const baseUrl = process.env.BASE_URL;

    const payload = { no_transaction: transactionCode };

    try {
        const res = await fetch(`${baseUrl}/api/inquiry-transaction`, {
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
    const baseUrl = process.env.BASE_URL;

    try {
        const res = await fetch(`${baseUrl}/api/get-balance`, {
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
    const baseUrl = process.env.BASE_URL;

    const payload = { no_partner_reference: partnerReference };

    try {
        const res = await fetch(`${baseUrl}/api/inquiry-money-out`, {
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
    const baseUrl = process.env.BASE_URL;

    try {
        const res = await fetch(`${baseUrl}/api/list-banks`, {
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