export function generateUTR(currency) {
  if (currency === "INR") {
    return Math.floor(100000000000 + Math.random() * 900000000000).toString();
  } else if (currency === "BDT") {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
  return "";
}
