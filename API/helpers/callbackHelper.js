import fetch from "node-fetch";
import { BASE_URL } from "../Config/config.js";

export async function sendCallback({
  transactionNo,
  amount,
  utr,
  status,          // 0 = SUCCESS, 1 = FAILED
  transactionType, // 1 = deposit, 2 = withdraw
  systemOrderId = null,
  closeTime = null,
  remark = null,
  note = null,
  currency = "INR", // default INR
}) {
  if (!BASE_URL) {
    throw new Error("BASE_URL belum di-set di config");
  }

  const orderId = transactionNo;
  const sysOrderId = systemOrderId || Date.now().toString().slice(0, 5);
  const closeAt = closeTime || new Date().toISOString();

  let payload;

  if (transactionType === 1) {
    payload = {
      systemOrderId: sysOrderId,
      orderId,
      amount: Number(amount),
      actualAmount: Number(amount),
      status,
      closeTime: closeAt,
      remark,
      utr,
    };
  } else if (transactionType === 2) {
    payload = {
      systemOrderId: sysOrderId,
      orderId,
      amount: Number(amount),
      actualAmount: Number(amount),
      status,
      closeTime: closeAt,
      remark: remark || "",
      utr: status === 0 ? utr : null,
      note: note || null,
    };
  } else {
    throw new Error(`Unsupported transactionType: ${transactionType}`);
  }

  const pathPrefix = {
    INR: "payxyz",
    VND: "paybo-vnd",
  }[currency.toUpperCase()];

  if (!pathPrefix) {
    throw new Error(`Unsupported currency: ${currency}`);
  }

  const callbackUrl =
    transactionType === 1
      ? `${BASE_URL}/api/v2/${pathPrefix}/deposit/notification`
      : `${BASE_URL}/api/v2/${pathPrefix}/payout/notification`;

  console.log("➡️ Sending callback to", callbackUrl);
  console.log("Payload:", payload);

  try {
    const response = await fetch(callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Callback failed: ${response.status} ${text}`);
    }

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch (error) {
    console.error("❌ Error sending callback:", error);
    throw error;
  }
}
