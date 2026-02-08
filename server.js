import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();

const PORT = process.env.PORT || 8080;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  process.env.ALLOWED_ORIGIN ||
  "http://localhost:5173"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// --- middlewares ---
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // curl/postman
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked: ${origin}`));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  }),
);

app.use(express.json({ limit: "200kb" }));

// --- helpers ---
function requiredEnvOk() {
  return Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
}

function cleanStr(v) {
  return String(v ?? "").trim();
}

function validateLead(body) {
  const name = cleanStr(body.name);
  const contact = cleanStr(body.contact);
  const type = cleanStr(body.type);
  const location = cleanStr(body.location);
  const needs = cleanStr(body.needs);
  const timeline = cleanStr(body.timeline);
  const website = cleanStr(body.website); // honeypot

  const errors = [];
  if (website) errors.push("Spam.");
  if (name.length < 2) errors.push("name");
  if (contact.length < 5) errors.push("contact");
  if (location.length < 2) errors.push("location");
  if (needs.length < 10) errors.push("needs");
  if (!type) errors.push("type");
  if (!timeline) errors.push("timeline");

  return {
    ok: errors.length === 0,
    errors,
    data: { name, contact, type, location, needs, timeline, website },
  };
}

function formatTelegramMessage(d) {
  const dt = new Intl.DateTimeFormat("uk-UA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  return (
    `🟣 Заявка на консультацію “Управителька”\n` +
    `🕒 ${dt}\n\n` +
    `👤 Клієнт: ${d.name}\n` +
    `📞 Контакт: ${d.contact}\n\n` +
    `🏠 Тип: ${d.type}\n` +
    `📍 Локація: ${d.location}\n` +
    `⏱️ Старт: ${d.timeline}\n\n` +
    `📝 Запит:\n${d.needs}\n`
  );
}

async function sendToTelegram(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      disable_web_page_preview: true,
    }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.ok) {
    const desc = data?.description || `HTTP ${resp.status}`;
    throw new Error(`Telegram error: ${desc}`);
  }
  return data;
}

// --- routes ---
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    status: "up",
    telegramConfigured: requiredEnvOk(),
    allowedOrigins: ALLOWED_ORIGINS,
  });
});

app.post("/api/lead", async (req, res) => {
  const v = validateLead(req.body || {});
  if (!v.ok) {
    return res.status(400).json({
      ok: false,
      message: "Некоректні дані форми.",
      fields: v.errors,
    });
  }

  if (!requiredEnvOk()) {
    return res.status(500).json({
      ok: false,
      message:
        "Telegram не налаштовано на сервері (немає TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID).",
    });
  }

  try {
    const msg = formatTelegramMessage(v.data);
    await sendToTelegram(msg);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: e?.message || "Помилка відправки в Telegram",
    });
  }
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
});
