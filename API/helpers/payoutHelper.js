import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';

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
    console.error(`❌ Error saat membaca IFSC data: ${error.message}`);
    return null;
  }
}

export async function getValidIFSC(currency, maxRetries = 5) {
  let attempts = 0;
  while (attempts < maxRetries) {
    const ifscCode = await getRandomIFSC(currency);
    if (ifscCode) {
      const isValid = await validateIFSC(ifscCode);
      if (isValid) return ifscCode;
    }
    console.warn(`⚠️ Percobaan ${attempts + 1} gagal mendapatkan IFSC. Mencoba lagi...`);
    attempts++;
  }
  console.error("❌ Gagal mendapatkan IFSC setelah beberapa percobaan.");
  return null;
}

export async function validateIFSC(ifscCode) {
  try {
    const response = await fetch(`https://ifsc-prod-p1.rubikpay.com/${ifscCode}`);
    
    if (!response.ok) {
      console.error(`❌ Validasi IFSC gagal: ${response.statusText}`);
      return false;
    }

    let data;
    const textResponse = await response.text();

    try {
      data = JSON.parse(textResponse);
    } catch (error) {
      console.error('❌ Gagal parse respons API:', error.message);
      data = textResponse;
    }

    if (data && data.IFSC && data.BANKCODE && data.BANK) {
      console.log("API Response:", JSON.stringify({
        ifsc_status: `${ifscCode} Valid!`,
        response: data
      }, null, 2));

      return true;
    } else {
      console.error(`❌ IFSC Code ${ifscCode} tidak valid. Respons tidak lengkap.`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error saat memvalidasi IFSC Code: ${error.message}`);
    return false;
  }
}

export function randomPhoneNumber(currency = "default") {
  const formats = {
    bdt: { prefixes: ['017', '018', '019', '016', '015'], digits: 6, pad: 6 },
    brl: {
      custom: () => {
        const ddd = ['11', '21', '31', '41'];
        const area = ddd[Math.floor(Math.random() * ddd.length)];
        const number = Math.floor(900000000 + Math.random() * 99999999).toString();
        return `+55${area}${number}`;
      }
    },
    vnd: { prefixes: ['090', '091', '092', '093'], digits: 7, pad: 7 },
    thb: { prefixes: ['08'], digits: 8, pad: 7 },
    idr: { prefixes: ['081', '085', '088'], digits: 9, pad: 9 },
    inr: { prefixes: ['919', '918', '917'], digits: 8, pad: 8 },
    default: { prefixes: ['017', '018', '019', '016', '015'], digits: 6, pad: 6 }
  };

  const format = formats[currency.toLowerCase()] || formats.default;

  // Custom formatter (ex. BRL)
  if (typeof format.custom === "function") {
    return format.custom();
  }

  const prefix = format.prefixes[Math.floor(Math.random() * format.prefixes.length)];
  const number = Math.floor(Math.random() * Math.pow(10, format.digits))
    .toString()
    .padStart(format.pad, '0');

  return prefix + number;
}

export function generateCustomUTR() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';

  let result = '';
  for (let i = 0; i < 4; i++) {
    result += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  for (let i = 0; i < 10; i++) {
    result += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }
  return result;
}
