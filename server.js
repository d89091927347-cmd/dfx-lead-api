import express from "express";

const app = express();
app.use(express.json({ limit: "100kb" }));

// =====================
// CORS (без зависимостей)
// =====================
const ALLOWED_ORIGINS = new Set([
  "https://engineering.dfxcapital.ru",
  "http://engineering.dfxcapital.ru",
  "https://dfxcapital.ru",
  "http://dfxcapital.ru",
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Если запрос с сайта (browser) — добавляем CORS только для разрешённых доменов
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  // preflight
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

const PORT = process.env.PORT || 10000;
const BOT_TOKEN = process.env.BOT_TOKEN; // ВАЖНО: тут должен быть токен вида 123456:ABC..., НЕ @username
const CHAT_ID = process.env.CHAT_ID;     // канал: @channelusername или числовой id (часто -100....)

// =====================
// Helpers
// =====================
function escHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function pick(obj, keys) {
  for (const k of keys) {
    const val = obj?.[k];
    if (val !== undefined && val !== null && String(val).trim() !== "") return String(val).trim();
  }
  return "";
}

function normalizeLead(body = {}) {
  // Маппим разные возможные имена полей из формы к “нормальным”
  const objectType = pick(body, [
    "objectType", "object_type", "type", "Тип объекта", "tip", "obj", "Тип",
  ]);

  const name = pick(body, [
    "name", "Name", "Имя", "fio", "fullName",
  ]);

  const contact = pick(body, [
    "contact", "phone", "tel", "telegram", "email", "Контакт", "Контакт для связи",
  ]);

  const stage = pick(body, [
    "stage", "projectStage", "project_stage", "Стадия проекта", "Стадия",
  ]);

  const timeline = pick(body, [
    "timeline", "terms", "Сроки", "сроки", "deadline",
  ]);

  const concerns = pick(body, [
    "concerns", "problem", "Что беспокоит", "whatBothers", "worries",
  ]);

  const details = pick(body, [
    "details", "comment", "Комментарий", "message", "описание",
  ]);

  const source = pick(body, [
    "source", "url", "page", "Источник",
  ]) || (body?._source || "");

  return {
    objectType,
    name,
    contact,
    stage,
    timeline,
    concerns,
    details,
    source,
    raw: body,
  };
}

async function sendTelegramMessage(html) {
  if (!BOT_TOKEN) throw new Error("BOT_TOKEN is missing");
  if (!CHAT_ID) throw new Error("CHAT_ID is missing");

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  const raw = await r.text();
  if (!r.ok) {
    console.error("Telegram HTTP error:", r.status, raw);
    throw new Error(`Telegram HTTP ${r.status}`);
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    console.error("Telegram returned non-JSON:", raw);
    throw new Error("Telegram invalid JSON");
  }

  if (!json.ok) {
    console.error("Telegram ok:false:", json);
    throw new Error("Telegram ok:false");
  }

  return true;
}

// =====================
// Routes
// =====================
app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/lead", async (req, res) => {
  try {
    const lead = normalizeLead(req.body || {});

    // Фолбэк: если source не пришёл — попробуем взять origin
    const source = lead.source || req.headers.origin || "—";

    const lines = [
      `<b>🆕 Новая заявка — инженерный аудит</b>`,
      ``,
      `<b>Тип объекта:</b> ${escHtml(lead.objectType || "—")}`,
      `<b>Имя:</b> ${escHtml(lead.name || "—")}`,
      `<b>Контакт:</b> ${escHtml(lead.contact || "—")}`,
      ``,
      `<b>Стадия:</b> ${escHtml(lead.stage || "—")}`,
      `<b>Сроки:</b> ${escHtml(lead.timeline || "—")}`,
      ``,
      `<b>Что беспокоит:</b>`,
      `${escHtml(lead.concerns || "—")}`,
      ``,
      `<b>Комментарий:</b>`,
      `${escHtml(lead.details || "—")}`,
      ``,
      `<b>Источник:</b> ${escHtml(source)}`,
      ``,
      `<b>RAW (для отладки):</b>`,
      `<pre>${escHtml(JSON.stringify(lead.raw, null, 2))}</pre>`,
    ];

    const msg = lines.join("\n");

    await sendTelegramMessage(msg);
    return res.json({ ok: true });
  } catch (e) {
    console.error("Lead processing error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "unknown_error" });
  }
});

// =====================
// Start
// =====================
app.listen(PORT, () => {
  console.log(`🚀 Lead API running on port ${PORT}`);
});
