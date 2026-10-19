/**
 * Shared utility functions
 * Extract common utilities to avoid duplication
 */

import { randomInt } from "crypto";
import { faker } from "@faker-js/faker";

/**
 * Generate random phone number per currency
 * Consolidated from depositHelper and payoutHelper
 */
export function randomPhoneNumber(currency = "default") {
  const formats = {
    bdt: { prefixes: ['017', '018', '019', '016', '015'], digits: 8, pad: 7 },
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
    inr: { prefixes: ['919', '918', '917'], digits: 7, pad: 6 },
    pkr: { prefixes: ['0300', '0312', '0333', '0345'], digits: 7, pad: 7 },
    myr: { prefixes: ['01'], digits: 8, pad: 8 },
    default: { prefixes: ['017', '018', '019', '016', '015'], digits: 6, pad: 6 }
  };

  const format = formats[currency.toLowerCase()] || formats.default;

  if (typeof format.custom === "function") {
    return format.custom();
  }

  const prefix = format.prefixes[Math.floor(Math.random() * format.prefixes.length)];
  const number = Math.floor(Math.random() * Math.pow(10, format.digits))
    .toString()
    .padStart(format.pad, '0');

  return prefix + number;
}

/**
 * Generate UTR based on currency
 * Consolidated from depositHelper
 */
export function generateUTR(currency) {
  if (currency === "INR") {
    return Math.floor(100000000000 + Math.random() * 900000000000).toString();
  } else if (currency === "BDT") {
    return Math.floor(1000000 + Math.random() * 900000).toString();
  } else if (currency === "MMK") {
    return Math.floor(10000 + Math.random() * 90000).toString();
  }
  return "";
}

/**
 * Generate random Myanmar phone number
 * Consolidated from depositHelper
 */
export function randomMyanmarPhoneNumber() {
  return '09' + Math.floor(100000000 + Math.random() * 900000000);
}

/**
 * Generate random 16-digit card number (no leading zero)
 * Consolidated from depositHelper
 */
export function randomCardNumber() {
  let cardNumber = "";
  cardNumber += randomInt(1, 10).toString();
  for (let i = 1; i < 16; i++) {
    cardNumber += randomInt(0, 10).toString();
  }
  return Number(cardNumber);
}

/**
 * Generate random amount within range
 * Consolidated from depositHelper
 */
export function randomAmount(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate custom UTR (4 letters + 10 digits)
 * Consolidated from payoutHelper
 */
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

/**
 * Generate random user data
 */
export function randomUserData() {
  return {
    username: faker.internet.userName(),
    email: faker.internet.email(),
    phone: randomPhoneNumber(),
    fullName: faker.person.fullName(),
  };
}

/**
 * Format amount to currency
 */
export function formatAmount(amount, currency = "IDR") {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: currency,
  }).format(amount);
}

/**
 * Validate phone number format
 * Requires minimum 7 digits
 */
export function isValidPhoneNumber(phone) {
  const phoneRegex = /^(\+|00)?[1-9]\d{6,14}$/;
  return phoneRegex.test(phone.replace(/[\s\-()]/g, ""));
}

/**
 * Validate email format
 */
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Sleep utility for delays
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry async operation with exponential backoff
 */
export async function retryOperation(operation, maxRetries = 3, baseDelay = 1000) {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch (error) {
    return fallback;
  }
}

/**
 * Sanitize object for logging (remove sensitive data)
 */
export function sanitizeForLog(obj, sensitiveKeys = ["password", "apiKey", "secret", "token"]) {
  if (!obj || typeof obj !== "object") return obj;

  const sanitized = { ...obj };

  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive.toLowerCase()))) {
      sanitized[key] = "***REDACTED***";
    } else if (typeof sanitized[key] === "object") {
      sanitized[key] = sanitizeForLog(sanitized[key], sensitiveKeys);
    }
  }

  return sanitized;
}

export default {
  randomPhoneNumber,
  generateUTR,
  randomMyanmarPhoneNumber,
  randomCardNumber,
  randomAmount,
  generateCustomUTR,
  randomUserData,
  formatAmount,
  isValidPhoneNumber,
  isValidEmail,
  sleep,
  retryOperation,
  safeJsonParse,
  sanitizeForLog,
};
