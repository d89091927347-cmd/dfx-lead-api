import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// =====================
// Health check
// =====================
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// =====================
// Send message to Telegram
// =====================
async function sendTelegramMessage(text) {
  if (!BOT_TOKEN) {
    throw new Error("BOT_TOKEN is missing");
  }
  if (!CHAT_ID) {
    throw new Error("CHAT_ID is missing");
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  const rawText = await response.text();

  // ЛОГИРУЕМ ВСЁ, ЧТО ОТВЕТИЛ TELEGRAM
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
    console.error("❌ Telegram returned non-JSON");
    console.error(rawText);
    throw new Error("Telegram invalid JSON");
  }

  if (!json.ok) {
    console.error("❌ Telegram ok:false");
    console.error(json);
    throw new Error("Telegram ok:false");
  }

  return true;
}

// =====================
// Lead endpoint
// =====================
app.post("/lead", async (req, res) => {
  try {
    const {
      name = "—",
      contact = "—",
      stage = "—",
      timeline = "—",
      details = "—",
      source = "—",
    } = req.body || {};

    const message = `
<b>🆕 Новая заявка — инженерный аудит</b>

<b>Имя:</b> ${name}
<b>Контакт:</b> ${contact}

<b>Стадия:</b> ${stage}
<b>Сроки:</b> ${timeline}

<b>Комментарий:</b>
${details}

<b>Источник:</b> ${source}
    `.trim();

    await sendTelegramMessage(message);

    res.json({ ok: true });
  } catch (error) {
    console.error("🔥 Lead processing error:");
    console.error(error.message);

    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

// =====================
// Start server
// =====================
app.listen(PORT, () => {
  console.log(`🚀 Lead API running on port ${PORT}`);
});
