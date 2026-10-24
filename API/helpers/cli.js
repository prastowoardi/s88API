import inquirer from "inquirer";
import fs from "fs";

/**
 * Unified CLI Prompt Helper
 * Mengunifikasi seluruh prompt CLI di aplikasi menjadi satu antarmuka terstandar.
 * Menggantikan readline, readline-sync, dan pemanggilan langsung inquirer yang tersebar.
 */

/**
 * Pertanyaan teks biasa
 * @param {string} message 
 * @param {string} [defaultValue=""] 
 * @returns {Promise<string>}
 */
export async function ask(message, defaultValue = "") {
  const cleanMsg = message.trim();
  const { answer } = await inquirer.prompt([
    {
      type: "input",
      name: "answer",
      message: cleanMsg,
      default: defaultValue || undefined,
    },
  ]);
  return typeof answer === "string" ? answer.trim() : String(answer ?? "");
}

/**
 * Pertanyaan bilangan bulat (integer)
 * @param {string} message 
 * @param {number} [defaultValue] 
 * @returns {Promise<number>}
 */
export async function askInt(message, defaultValue) {
  const cleanMsg = message.trim();
  const { answer } = await inquirer.prompt([
    {
      type: "input",
      name: "answer",
      message: cleanMsg,
      default: defaultValue !== undefined ? String(defaultValue) : undefined,
      validate: (val) => {
        const num = parseInt(val, 10);
        return isNaN(num) ? "Mohon masukkan angka bulat yang valid!" : true;
      },
    },
  ]);
  return parseInt(answer, 10);
}

/**
 * Pertanyaan bilangan desimal (float)
 * @param {string} message 
 * @param {number} [defaultValue] 
 * @returns {Promise<number>}
 */
export async function askFloat(message, defaultValue) {
  const cleanMsg = message.trim();
  const { answer } = await inquirer.prompt([
    {
      type: "input",
      name: "answer",
      message: cleanMsg,
      default: defaultValue !== undefined ? String(defaultValue) : undefined,
      validate: (val) => {
        const num = parseFloat(val);
        return isNaN(num) ? "Mohon masukkan angka desimal yang valid!" : true;
      },
    },
  ]);
  return parseFloat(answer);
}

/**
 * Pertanyaan konfirmasi Ya / Tidak
 * @param {string} message 
 * @param {boolean} [defaultVal=false] 
 * @returns {Promise<boolean>}
 */
export async function askYesNo(message, defaultVal = false) {
  const cleanMsg = message.trim();
  const { answer } = await inquirer.prompt([
    {
      type: "confirm",
      name: "answer",
      message: cleanMsg,
      default: defaultVal,
    },
  ]);
  return Boolean(answer);
}

/**
 * Pertanyaan memilih dari daftar (list)
 * @param {string} message 
 * @param {Array<string|{name: string, value: any}>} choices 
 * @returns {Promise<any>}
 */
export async function select(message, choices) {
  const cleanMsg = message.trim();
  const { answer } = await inquirer.prompt([
    {
      type: "list",
      name: "answer",
      message: cleanMsg,
      choices,
      loop: false,
    },
  ]);
  return answer;
}

/**
 * Pertanyaan input rahasia / password
 * @param {string} message 
 * @returns {Promise<string>}
 */
export async function askPassword(message) {
  const cleanMsg = message.trim();
  const { answer } = await inquirer.prompt([
    {
      type: "password",
      name: "answer",
      message: cleanMsg,
      mask: "*",
    },
  ]);
  return answer;
}

/**
 * Helper kompatibilitas synchronous untuk file lama yang belum di-async
 */
export const sync = {
  question: (msg) => {
    process.stdout.write(msg);
    const buf = Buffer.alloc(1024);
    let bytesRead = 0;
    try {
      bytesRead = fs.readSync(0, buf, 0, 1024, null);
    } catch {
      return "";
    }
    return buf.toString("utf8", 0, bytesRead).trim();
  },
};

export { inquirer };

export default {
  ask,
  askInt,
  askFloat,
  askYesNo,
  select,
  askPassword,
  sync,
  inquirer,
};
