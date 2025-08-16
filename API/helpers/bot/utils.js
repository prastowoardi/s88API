import fetch from "node-fetch";

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "7059617421:AAEbqRinAt25hecSPaWGQ1B_dEa_2ZO4AzE";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "-4822701679";

if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
  console.warn("[sendToTelegram] Missing TG_BOT_TOKEN or TELEGRAM_CHAT_ID env vars.");
}

/**
 * Escape a string for Telegram MarkdownV2.
 * Ref: https://core.telegram.org/bots/api#markdownv2-style
 */
export function escapeMarkdownV2(text = "") {
  return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

function chunkText(text, limit = 4000) {
  const chunks = [];
  for (let i = 0; i < text.length; i += limit) {
    chunks.push(text.slice(i, i + limit));
  }
  return chunks;
}

async function sendMessageRaw({ text, parse_mode }) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode,
      disable_web_page_preview: true
    })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Telegram API Error: ${JSON.stringify(data)}`);
  }

  return data;
}

async function sendDocumentRaw({ filename = "message.txt", content }) {
  const form = new FormData();
  form.append("chat_id", TELEGRAM_CHAT_ID);
  form.append("document", new Blob([content], { type: "text/plain" }), filename);

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument`, {
    method: "POST",
    body: form
  });
  return res;
}

/**
 * sendToTelegram(messageOrOptions)
 * - If called with a string, it will escape as MarkdownV2 and send (auto-chunk).
 * - If called with an object, you can customize:
 *   {
 *     text: "your message",        // required if object form
 *     markdown: true,              // default true
 *     code: false,                 // wrap in ``` code block
 *     filename: "payload.json",    // if provided, fallback as file
 *     raw: false,                  // if true, send as plain text
 *   }
 */
export async function sendToTelegram(messageOrOptions) {
  try {
    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
      console.warn("[sendToTelegram] Missing TG env vars; skipping send.");
      return;
    }

    let opts = {};
    if (typeof messageOrOptions === "string") {
      opts = { text: messageOrOptions, markdown: true, code: false, raw: false };
    } else if (typeof messageOrOptions === "object" && messageOrOptions !== null) {
      const {
        text,
        markdown = true,
        code = false,
        filename = null,
        raw = false
      } = messageOrOptions;
      opts = { text: String(text ?? ""), markdown, code, filename, raw };
    } else {
      console.warn("[sendToTelegram] Invalid argument; expected string or options object.");
      return;
    }

    const { text, markdown, code, filename, raw } = opts;

    // Prepare text
    let toSend = text;

    // If code block
    const hasBackticks = toSend.includes("```");
    if (markdown && code) {
      if (hasBackticks) {
        toSend = toSend.replace(/```/g, "\\`\\`\\`");
      }
      toSend = "```\n" + toSend + "\n```";
    } else if (markdown && !raw) {
      toSend = escapeMarkdownV2(toSend);
    }

    const parse_mode = (!raw && markdown) ? "MarkdownV2" : undefined;

    // Chunk and send
    const parts = chunkText(toSend, 4000);
    for (const part of parts) {
      const res = await sendMessageRaw({ text: part, parse_mode });
      if (!res.ok) {
        const body = await res.text();
        console.error("[sendToTelegram] sendMessage failed:", body);
        if (filename) {
          await sendDocumentRaw({ filename, content: text });
        } else {
          await sendMessageRaw({ text, parse_mode: undefined });
        }
        break;
      }
    }
  } catch (err) {
    console.error("[sendToTelegram] Error:", err);
  }
}
