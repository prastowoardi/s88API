import fetch from "node-fetch";
import logger from "../logger.js";
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
  currency = null,
}) {
  if (!BASE_URL) {
    throw new Error("BASE_URL belum di-set di config");
  }

  if (!currency) {
    throw new Error("Parameter 'currency' wajib diisi ('INR', 'VND', dll)");
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

  logger.info(`➡️ Sending callback to ${callbackUrl}`);
  logger.info(`Payload : ${JSON.stringify(payload, null, 2)}`);

  try {
    const response = await fetch(callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`Callback failed: ${response.status} ${responseText}`);
    }

    try {
      return JSON.parse(responseText);
    } catch {
      return responseText;
    }
  } catch (error) {
    console.error(`❌ Error sending callback for ${transactionNo}:`, error);
    throw error;
  }
}
