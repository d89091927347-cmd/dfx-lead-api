import express from "express";

const app = express();
app.use(express.json({ limit: "100kb" }));

const PORT = process.env.PORT || 10000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

/* =======================
   CORS (без библиотек)
======================= */
const ALLOWED_ORIGINS = new Set([
  "https://engineering.dfxcapital.ru",
  "http://engineering.dfxcapital.ru",
  "https://dfxcapital.ru",
  "http://dfxcapital.ru",
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

/* =======================
   Helpers
======================= */
const esc = (v) =>
  String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const pick = (obj, keys) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return "—";
};

function normalizeLead(body = {}) {
  return {
    objectType: pick(body, ["objectType", "type"]),
    stage: pick(body, ["stage"]),
    timeline: pick(body, ["timing", "timeline", "terms"]),
    concern: pick(body, ["concern", "concerns", "problem"]),
    comment: pick(body, ["details", "comment", "message"]),
    contact: pick(body, ["contact", "phone", "tel"]),
    name: pick(body, ["name"]),
    source: body.source || "",
  };
}

/* =======================
   Telegram
======================= */
async function sendTelegram(html) {
  if (!BOT_TOKEN) throw new Error("BOT_TOKEN missing");
  if (!CHAT_ID) throw new Error("CHAT_ID missing");

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

  const text = await r.text();

  if (!r.ok) {
    console.error("Telegram error:", text);
    throw new Error(`Telegram HTTP ${r.status}`);
  }

  const json = JSON.parse(text);
  if (!json.ok) throw new Error("Telegram ok:false");
}

/* =======================
   Routes
======================= */
app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/lead", async (req, res) => {
  try {
    const lead = normalizeLead(req.body);

    const source =
      lead.source ||
      req.headers.origin ||
      "—";

    const message = `
<b>🆕 Новая заявка — инженерный аудит</b>

<b>Тип объекта:</b> ${esc(lead.objectType)}
<b>Имя:</b> ${esc(lead.name)}
<b>Контакт:</b> ${esc(lead.contact)}

<b>Стадия:</b> ${esc(lead.stage)}
<b>Сроки:</b> ${esc(lead.timeline)}

<b>Что беспокоит:</b>
${esc(lead.concern)}

<b>Комментарий:</b>
${esc(lead.comment)}

<b>Источник:</b> ${esc(source)}
`.trim();

    await sendTelegram(message);

    res.json({ ok: true });
  } catch (e) {
    console.error("Lead error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* =======================
   Start
======================= */
app.listen(PORT, () => {
  console.log(`🚀 Lead API running on port ${PORT}`);
});
