import fetch from "node-fetch";

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
}) {
  const orderId = transactionNo;
  const sysOrderId = systemOrderId || Date.now().toString().slice(0, 5);
  const closeAt = closeTime || new Date().toISOString();

  let payload;

  if (transactionType === 1) {
    // Deposit
    payload = {
      systemOrderId: sysOrderId,
      orderId: orderId,
      amount: Number(amount),
      actualAmount: Number(amount),
      status: status,
      closeTime: closeAt,
      remark: remark,
      utr: utr,
    };
  } else if (transactionType === 2) {
    // Withdraw
    payload = {
      systemOrderId: sysOrderId,
      orderId: orderId,
      amount: Number(amount),
      actualAmount: Number(amount),
      status: status,
      closeTime: closeAt,
      remark: remark || "",
      utr: status === 0 ? utr : null, // kalau gagal utr null
      note: note || null,
    };
  } else {
    throw new Error(`Unsupported transactionType: ${transactionType}`);
  }

  let callbackUrl;
  if (transactionType === 1) {
    callbackUrl = `${process.env.BASE_URL}/api/v2/payxyz/deposit/notification`;
  } else if (transactionType === 2) {
    callbackUrl = `${process.env.BASE_URL}/api/v2/payxyz/payout/notification`;
  }

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
