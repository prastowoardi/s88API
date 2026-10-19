import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import logger from "../logger.js";
import { fileURLToPath } from 'url';
import { randomPhoneNumber, generateCustomUTR } from "./common.js";

export { randomPhoneNumber, generateCustomUTR };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ifscDataPath = path.resolve(__dirname, '../src/banks.json');

export async function getRandomIFSC() {
  try {
    await fs.access(ifscDataPath);
    const data = await fs.readFile(ifscDataPath, 'utf8');
    const ifscData = JSON.parse(data);

    if (!ifscData.NTDRESP || !Array.isArray(ifscData.NTDRESP.BANKLIST)) {
        throw new Error("Format data banks.json tidak valid!");
    }

    const bankList = ifscData.NTDRESP.BANKLIST;
    if (bankList.length === 0) {
        throw new Error("Data bank kosong!");
    }

    let validBank = null;

    while (!validBank) {
      const randomBank = bankList[Math.floor(Math.random() * bankList.length)];
      
      if (randomBank.MIFSCCODE && randomBank.MIFSCCODE.trim() !== "") {
        validBank = randomBank;
        // console.log(`✅ Bank: ${validBank.BANKNAME} (${validBank.BANKCODE})`);
        // console.log(`✅ IFSC Code: ${validBank.MIFSCCODE}`);
      }
    }

    return validBank.MIFSCCODE;
  } catch (error) {
    logger.error(`❌ Error saat membaca IFSC data: ${error.message}`);
    return null;
  }
}

export async function getValidIFSC(currency, maxRetries = 3) {
  let attempts = 0;
  while (attempts < maxRetries) {
    const ifscCode = await getRandomIFSC(currency);
    if (ifscCode) {
      const isValid = await validateIFSC(ifscCode);
      if (isValid) return ifscCode;
    }
    logger.warn(`⚠️ Percobaan ${attempts + 1} gagal mendapatkan IFSC. Mencoba lagi...`);
    attempts++;
  }
  logger.error("⚠️ Tidak dapat mendapatkan IFSC yang valid. Menggunakan default IFSC.");
  return "HDFC0000001";
}

export async function validateIFSC(ifscCode) {
  try {
    const response = await fetch(`https://ifsc.razorpay.com/${ifscCode}`);
    
    if (!response.ok) {
      logger.error(`❌ Validasi IFSC gagal: ${response.statusText}`);
      return false;
    }

    let data;
    const textResponse = await response.text();

    try {
      data = JSON.parse(textResponse);
    } catch (error) {
      logger.error('❌ Gagal parse respons API:', error.message);
      data = textResponse;
    }

    if (data && data.IFSC && data.BANKCODE && data.BANK) {
      // console.log("API Response:", JSON.stringify({
      //   ifsc_status: `${ifscCode} Valid!`,
      //   response: data
      // }, null, 2));

      return true;
    } else {
      logger.error(`❌ IFSC Code ${ifscCode} tidak valid. Respons tidak lengkap.`);
      return false;
    }
  } catch (error) {
    logger.error(`❌ Error saat memvalidasi IFSC Code: ${error.message}`);
    return false;
  }
}
