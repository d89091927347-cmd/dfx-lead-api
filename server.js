// server.js
import express from "express";
import fetch from "node-fetch";

const app = express();

// =====================
// Config
// =====================
const PORT = process.env.PORT || 10000;
const BOT_TOKEN = process.env.BOT_TOKEN; // example: 123456789:AA....
const CHAT_ID = process.env.CHAT_ID;     // example: -1001234567890

// Разрешаем запросы только с твоего сайта (можно расширить список)
const ALLOWED_ORIGINS = new Set([
  "https://engineering.dfxcapital.ru",
  "http://engineering.dfxcapital.ru",
]);

// =====================
// CORS (без библиотек)
// =====================
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Если запрос пришёл с разрешённого домена — разрешаем CORS
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  // Разрешаем нужные заголовки/методы
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");

  // Preflight
  if (req.method === "OPTIONS") return res.sendStatus(204);

  next();
});

// =====================
// Body parser
// =====================
app.use(express.json({ limit: "200kb" }));

// =====================
// Health check
// =====================
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "dfx-lead-api" });
});

// =====================
// Telegram sender
// =====================
async function sendTelegramMessage(text) {
  if (!BOT_TOKEN) throw new Error("BOT_TOKEN is missing");
  if (!CHAT_ID) throw new Error("CHAT_ID is missing");

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  const rawText = await response.text();

  if (!response.ok) {
    console.error("❌ Telegram HTTP error");
    console.error("Status:", response.status);
    console.error("Response:", rawText);
    throw new Error(`Telegram HTTP ${response.status}`);
  }

  let json;
  try {
    json = JSON.parse(rawText);
  } catch (e) {
    console.error("❌ Telegram returned non-JSON:", rawText);
    throw new Error("Telegram invalid JSON");
  }

  if (!json.ok) {
    console.error("❌ Telegram ok:false:", json);
    throw new Error("Telegram ok:false");
  }

  return true;
}

// =====================
// Helpers: normalize fields from different form names
// =====================
function pickFirst(obj, keys, fallback = "—") {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return fallback;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// =====================
// Lead endpoint
// =====================
app.post("/lead", async (req, res) => {
  try {
    const body = req.body || {};

    // Сохраняем в лог, чтобы видеть реальные ключи, которые прилетают
    console.log("📩 /lead body:", body);

    // Поддержка разных имён полей с фронта
    const objectType = pickFirst(body, ["objectType", "type", "object", "projectType", "tip", "tip_obekta"]);
    const stage = pickFirst(body, ["stage", "projectStage", "stage_project", "stadiya", "stadiya_proekta"]);
    const timeline = pickFirst(body, ["timeline", "deadline", "term", "sroki", "time", "due"]);
    const details = pickFirst(body, ["details", "concern", "problem", "comment", "message", "whatWorries", "worries"]);
    const contact = pickFirst(body, ["contact", "phone", "tel", "telegram", "email"]);

    // Источник — либо из body, либо берём из origin/referer
    const sourceRaw =
      pickFirst(body, ["source"], "") ||
      req.get("origin") ||
      req.get("referer") ||
      "—";

    // Безопасно для HTML parse_mode
    const msg = `
<b>🆕 Новая заявка — инженерный аудит</b>

<b>Тип объекта:</b> ${escapeHtml(objectType)}
<b>Стадия:</b> ${escapeHtml(stage)}
<b>Сроки:</b> ${escapeHtml(timeline)}

<b>Что беспокоит:</b>
${escapeHtml(details)}

<b>Контакт:</b> ${escapeHtml(contact)}

<b>Источник:</b> ${escapeHtml(sourceRaw)}
    `.trim();

    await sendTelegramMessage(msg);

    res.json({ ok: true });
  } catch (error) {
    console.error("🔥 Lead processing error:", error);

    res.status(500).json({
      ok: false,
      error: error?.message || "Unknown error",
    });
  }
});

// =====================
// Start server
// =====================
app.listen(PORT, () => {
  console.log(`🚀 Lead API running on port ${PORT}`);
});
