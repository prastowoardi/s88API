import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ifscDataPath = path.resolve(__dirname, '../src/banks.json');

export async function getRandomIFSC(currency) {
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

    const randomBank = bankList[Math.floor(Math.random() * bankList.length)];

    if (!randomBank.MIFSCCODE) {
        throw new Error(`Bank ${randomBank.BANKNAME} tidak memiliki IFSC yang valid.`);
    }

    if (currency === "INR") {
        console.log(`✅ Bank: ${randomBank.BANKNAME} (${randomBank.BANKCODE})`);
        console.log(`✅ IFSC Code: ${randomBank.MIFSCCODE}`);
    }

    return randomBank.MIFSCCODE;
  } catch (error) {
    console.error(`❌ Error saat membaca IFSC data: ${error.message}`);
    return null;
  }
}

export async function getValidIFSC(currency, maxRetries = 3) {
  let attempts = 0;
  while (attempts < maxRetries) {
    const ifscCode = await getRandomIFSC(currency);
    if (ifscCode) return ifscCode;
    console.warn(`⚠️ Percobaan ${attempts + 1} gagal mendapatkan IFSC. Mencoba lagi...`);
    attempts++;
  }
  console.error("❌ Gagal mendapatkan IFSC setelah beberapa percobaan.");
  return null;
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
