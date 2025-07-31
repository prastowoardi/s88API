export function generateUTR(currency) {
  if (currency === "INR") {
    return Math.floor(100000000000 + Math.random() * 900000000000).toString();
  } else if (currency === "BDT") {
    return Math.floor(1000000 + Math.random() * 900000).toString();
  }
  return "";
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
    inr: { prefixes: ['919', '918', '917'], digits: 7, pad: 6 },
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

export function randomMyanmarPhoneNumber() {
    return '09' + Math.floor(100000000 + Math.random() * 900000000);
}

export function randomCardNumber() {
    return Math.floor(1000000000000000 + Math.random() * 9000000000000000);
}

export function randomAmount(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}