import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ====== НАСТРОЙКИ ======
const PORT = process.env.PORT || 10000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// Разрешённые домены (добавь сюда, если появятся ещё)
const ALLOWED_ORIGINS = new Set([
  "https://engineering.dfxcapital.ru",
  "http://engineering.dfxcapital.ru",
]);

// ====== CORS без пакета cors ======
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  }

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  next();
});

// ====== Health ======
app.get("/health", (req, res) => res.json({ ok: true }));

// ====== Telegram sender ======
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

  const raw = await response.text();

  if (!response.ok) {
    // ВАЖНО: логируем реальную причину
    console.error("❌ Telegram HTTP error:", response.status, raw);
    throw new Error(`Telegram HTTP ${response.status}`);
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    console.error("❌ Telegram returned non-JSON:", raw);
    throw new Error("Telegram invalid JSON");
  }

  if (!json.ok) {
    console.error("❌ Telegram ok:false:", json);
    throw new Error("Telegram ok:false");
  }

  return true;
}

// ====== Helpers ======
const clean = (v) => {
  if (v === undefined || v === null) return "";
  return String(v).trim();
};

// Собираем красивое сообщение БЕЗ пустых строк
function buildMessage(data) {
  // Поддержка разных названий полей (чтобы форма могла меняться без поломок)
  const objectType = clean(data.objectType || data.type || data.object || "");
  const stage = clean(data.stage || "");
  const timing = clean(data.timing || data.timeline || "");
  const concern = clean(data.concern || data.details || "");
  const contact = clean(data.contact || "");
  const name = clean(data.name || "");
  const source = clean(data.source || "");

  const lines = [];
  lines.push("<b>🆕 Новая заявка — инженерный аудит</b>");

  if (objectType) lines.push(`\n<b>Тип объекта:</b> ${objectType}`);
  if (name) lines.push(`<b>Имя:</b> ${name}`);
  if (contact) lines.push(`<b>Контакт:</b> ${contact}`);

  if (stage) lines.push(`\n<b>Стадия:</b> ${stage}`);
  if (timing) lines.push(`<b>Сроки:</b> ${timing}`);

  if (concern) lines.push(`\n<b>Что беспокоит:</b>\n${concern}`);

  if (source) lines.push(`\n<b>Источник:</b> ${source}`);

  return lines.join("\n");
}

// ====== Lead endpoint ======
app.post("/lead", (req, res) => {
  // 1) СРАЗУ отвечаем сайту успехом (чтобы не было “не доставлено”)
  res.status(200).json({ ok: true });

  // 2) Дальше делаем работу в фоне
  try {
    const payload = req.body || {};
    const msg = buildMessage(payload);

    sendTelegramMessage(msg).catch((err) => {
      console.error("🔥 Telegram send failed:", err?.message || err);
      console.error("RAW payload:", JSON.stringify(payload));
    });
  } catch (err) {
    console.error("🔥 Lead build/send error:", err?.message || err);
    console.error("RAW body:", req.body);
  }
});

// ====== Start ======
app.listen(PORT, () => {
  console.log(`🚀 Lead API running on port ${PORT}`);
});
