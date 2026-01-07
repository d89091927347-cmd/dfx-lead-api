import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

/* =========================
   Health check
========================= */
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/* =========================
   Telegram sender
========================= */
async function sendTelegramMessage(text) {
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

  if (!response.ok) {
    const t = await response.text();
    throw new Error(`Telegram error ${response.status}: ${t}`);
  }
}

/* =========================
   Lead endpoint
========================= */
app.post("/lead", async (req, res) => {
  try {
    const {
      objectType,
      name,
      contact,
      stage,
      timing,
      concern,
      comment,
      source,
    } = req.body || {};

    // helper — добавляет строку только если есть значение
    const line = (label, value) =>
      value && String(value).trim()
        ? `<b>${label}</b> ${value}\n`
        : "";

    let message = `<b>🆕 Новая заявка — инженерный аудит</b>\n\n`;

    message += line("Тип объекта:", objectType);
    message += line("Имя:", name);
    message += line("Контакт:", contact);
    message += "\n";

    message += line("Стадия:", stage);
    message += line("Сроки:", timing);
    message += "\n";

    message += line("Что беспокоит:", concern);
    message += line("Комментарий:", comment);
    message += "\n";

    message += line("Источник:", source);

    // убираем лишние пустые строки
    message = message.replace(/\n{3,}/g, "\n\n").trim();

    await sendTelegramMessage(message);

    res.json({ ok: true });
  } catch (err) {
    console.error("Lead error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* =========================
   Start server
========================= */
app.listen(PORT, () => {
  console.log(`🚀 dfx-lead-api running on ${PORT}`);
});
