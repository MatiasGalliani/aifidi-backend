import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// ====== Config ======
const {
  PORT = 3000,
  BREVO_API_KEY,
  BREVO_LIST_ID,             // opcional si querés fijar la lista desde el backend
  ALLOWED_ORIGIN = "",       // ej: https://tu-landing.com
  NODE_ENV = "production",
} = process.env;

if (!BREVO_API_KEY) {
  console.error("Falta BREVO_API_KEY en variables de entorno");
  process.exit(1);
}

// ====== App ======
const app = express();
app.set("trust proxy", true); // para obtener IP real detrás de proxy (Railway)

app.use(helmet());
app.use(express.json({ limit: "200kb" }));

// CORS (si tenés front en otro dominio)
const corsOptions = {
  origin: (origin, cb) => {
    if (!ALLOWED_ORIGIN || !origin) return cb(null, true); // permitir en dev/local
    if (origin === ALLOWED_ORIGIN) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  },
  methods: ["POST", "GET", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  maxAge: 600,
};
app.use(cors(corsOptions));

// ====== Rate limit MUY básico en memoria ======
const windowMs = 60 * 1000;     // 1 min
const maxPerWindow = 30;         // 30 req/min por IP
const hits = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress;
  const now = Date.now();
  const rec = hits.get(ip) || { count: 0, start: now };
  if (now - rec.start > windowMs) {
    rec.count = 0;
    rec.start = now;
  }
  rec.count++;
  hits.set(ip, rec);
  if (rec.count > maxPerWindow) {
    return res.status(429).json({ error: "Too many requests" });
  }
  next();
}

// ====== Utils ======
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function pickListIds(bodyListIds) {
  if (Array.isArray(bodyListIds) && bodyListIds.length > 0) return bodyListIds;
  if (BREVO_LIST_ID) return [Number(BREVO_LIST_ID)];
  return undefined; // Brevo permite omitir listIds si solo quieres upsert sin lista
}

// ====== Rutas ======
app.get("/health", (req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

app.post("/api/brevo/subscribe", rateLimit, async (req, res) => {
  try {
    const {
      email,
      attributes = {},
      listIds: bodyListIds,
      honeypot, // opcional: si viene con valor, rechazamos
    } = req.body || {};

    // Anti-bot honeypot
    if (honeypot && String(honeypot).trim() !== "") {
      return res.status(400).json({ error: "Bad request" });
    }

    // Validaciones mínimas
    if (!email || !emailRegex.test(String(email))) {
      return res.status(400).json({ error: "Email inválido" });
    }

    // Asegurar que los atributos son un objeto plano
    if (typeof attributes !== "object" || Array.isArray(attributes)) {
      return res.status(400).json({ error: "attributes debe ser un objeto" });
    }

    // Forzar EMAIL en attributes si nos lo mandan
    if (!attributes.EMAIL) attributes.EMAIL = email;

    // Determinar lista destino (del body o del env)
    const listIds = pickListIds(bodyListIds);

    // Payload a Brevo (POST upsert)
    const brevoBody = {
      email,
      attributes,
      updateEnabled: true,
      ...(listIds ? { listIds } : {}),
    };

    const r = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": BREVO_API_KEY,
        "accept": "application/json",
      },
      body: JSON.stringify(brevoBody),
    });

    if (r.ok) {
      return res.status(200).json({ ok: true });
    }

    // Si falla, intentamos leer el error
    const err = await r.json().catch(() => ({}));

    // Si ya existe el contacto o similar, hacemos PUT para actualizar
    const isDuplicate =
      r.status === 400 &&
      (err?.code === "duplicate_parameter" ||
        (err?.message || "").toLowerCase().includes("already exists"));

    if (isDuplicate) {
      const putBody = {
        attributes,
        ...(listIds ? { listIds } : {}),
      };

      const put = await fetch(
        `https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "api-key": BREVO_API_KEY,
            "accept": "application/json",
          },
          body: JSON.stringify(putBody),
        }
      );

      if (put.ok) {
        return res.status(200).json({ ok: true, updated: true });
      }

      const e2 = await put.text().catch(() => "");
      return res.status(502).json({ error: "Brevo update failed", detail: e2 });
    }

    // Otro error
    return res.status(r.status || 502).json({
      error: "Brevo create failed",
      detail: err || (await r.text().catch(() => "")),
    });
  } catch (e) {
    console.error("Internal error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ====== Arranque ======
app.listen(PORT, () => {
  console.log(`Brevo mini backend escuchando en :${PORT} (${NODE_ENV})`);
});