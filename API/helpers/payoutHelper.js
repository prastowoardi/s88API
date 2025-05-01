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

export async function getRandomName() {
  try {
    const response = await fetch('https://random-data-api.com/api/users/random_user');
    const data = await response.json();
    return `${data.first_name} ${data.last_name}`;
  } catch (error) {
    console.error("❌ Gagal mengambil random user:", error.message);
    return null;
  }
}

export function randomPhoneNumber() {
  const prefixes = ['017', '018', '019', '016', '015'];
  const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const randomNumber = Math.floor(Math.random() * 100000000);
  return randomPrefix + randomNumber.toString().padStart(6, '0');
}
