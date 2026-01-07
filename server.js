import express from "express";

const app = express();
app.use(express.json({ limit: "200kb" }));

const PORT = process.env.PORT || 10000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// ===== CORS (без cors-пакета) =====
const ALLOWED_ORIGINS = new Set([
  "https://engineering.dfxcapital.ru",
  "https://dfxcapital.ru",
  "http://engineering.dfxcapital.ru",
  "http://dfxcapital.ru",
]);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );
}

app.use((req, res, next) => {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

// ===== Utils =====
const pickFirst = (obj, keys, fallback = "—") => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return fallback;
};

const escapeHtml = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const limit = (s, n) => {
  const str = String(s);
  return str.length > n ? str.slice(0, n) + "…" : str;
};

// ===== Health =====
app.get("/health", (req, res) => res.json({ ok: true }));

// ===== Telegram =====
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
    console.error("❌ Telegram HTTP error", response.status, rawText);
    throw new Error(`Telegram HTTP ${response.status}`);
  }

  let json;
  try {
    json = JSON.parse(rawText);
  } catch {
    console.error("❌ Telegram returned non-JSON", rawText);
    throw new Error("Telegram invalid JSON");
  }

  if (!json.ok) {
    console.error("❌ Telegram ok:false", json);
    throw new Error("Telegram ok:false");
  }

  return true;
}

// ===== Lead endpoint =====
app.post("/lead", async (req, res) => {
  try {
    const body = req.body || {};

    // Вытаскиваем поля максимально “живуче” (под разные name/id)
    const objectType = pickFirst(body, [
      "objectType",
      "type",
      "objType",
      "tip",
      "tipObekta",
      "object",
    ]);

    const stage = pickFirst(body, ["stage", "projectStage", "stadiya", "stadia"]);

    const timeline = pickFirst(body, [
      "timeline",
      "sroki",
      "time",
      "deadline",
      "term",
      "terms",
    ]);

    const concerns = pickFirst(body, [
      "details",
      "concerns",
      "whatBothers",
      "comment",
      "message",
      "desc",
      "problem",
    ]);

    const contact = pickFirst(body, ["contact", "phone", "email", "tg", "telegram"]);

    const name = pickFirst(body, ["name", "fio", "clientName"]);

    // Источник: берём из body, если есть, иначе из заголовков
    const source =
      pickFirst(body, ["source"], "") ||
      req.headers.origin ||
      req.headers.referer ||
      "—";

    // Чистим/ограничиваем, чтобы Telegram HTML не ломался
    const msg = [
      "<b>🆕 Новая заявка — инженерный аудит</b>",
      "",
      `<b>Тип объекта:</b> ${escapeHtml(limit(objectType, 120))}`,
      `<b>Имя:</b> ${escapeHtml(limit(name, 120))}`,
      `<b>Контакт:</b> ${escapeHtml(limit(contact, 200))}`,
      "",
      `<b>Стадия:</b> ${escapeHtml(limit(stage, 120))}`,
      `<b>Сроки:</b> ${escapeHtml(limit(timeline, 120))}`,
      "",
      `<b>Что беспокоит:</b>`,
      escapeHtml(limit(concerns, 2000)),
      "",
      `<b>Источник:</b> ${escapeHtml(limit(source, 300))}`,
    ].join("\n");

    await sendTelegramMessage(msg);
    res.json({ ok: true });
  } catch (error) {
    console.error("🔥 Lead processing error:", error);
    res.status(500).json({ ok: false, error: error.message || "Server error" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Lead API running on port ${PORT}`);
});
