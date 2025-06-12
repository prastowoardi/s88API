export function generateUTR(currency) {
  if (currency === "INR") {
    return Math.floor(100000000000 + Math.random() * 900000000000).toString();
  } else if (currency === "BDT") {
    return Math.floor(1000000 + Math.random() * 900000).toString();
  }
  return "";
}

export function randomPhoneNumber() {
    const prefixes = ['017', '018', '019', '016', '015'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const number = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    return prefix + number;
}

export function randomMyanmarPhoneNumber() {
    return '09' + Math.floor(100000000 + Math.random() * 900000000);
}
