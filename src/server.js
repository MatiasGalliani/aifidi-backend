import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";

dotenv.config();

// ====== Config ======
const {
  PORT = 3000,
  ALLOWED_ORIGIN = "",
  NODE_ENV = "production",

  ZOHO_REGION = "com", // eu | com | in | au | jp
  ZOHO_CLIENT_ID,
  ZOHO_CLIENT_SECRET,
  ZOHO_REFRESH_TOKEN,

  DEFAULT_LEAD_SOURCE = "Landing Website",
} = process.env;

const REGION_DOMAINS = {
  eu: { accounts: "https://accounts.zoho.eu", api: "https://www.zohoapis.eu" },
  com: { accounts: "https://accounts.zoho.com", api: "https://www.zohoapis.com" },
  in: { accounts: "https://accounts.zoho.in", api: "https://www.zohoapis.in" },
  au: { accounts: "https://accounts.zoho.com.au", api: "https://www.zohoapis.com.au" },
  jp: { accounts: "https://accounts.zoho.jp", api: "https://www.zohoapis.jp" },
};

const DOMAINS = REGION_DOMAINS[ZOHO_REGION] || REGION_DOMAINS.eu;

if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_REFRESH_TOKEN) {
  console.error("Faltan variables ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET o ZOHO_REFRESH_TOKEN");
  process.exit(1);
}

// ====== App ======
const app = express();
app.set("trust proxy", true);
app.use(helmet());
app.use(express.json({ limit: "200kb" }));

// ====== CORS ======
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (!ALLOWED_ORIGIN) return cb(null, true);
    if (origin === ALLOWED_ORIGIN) return cb(null, true);
    if (origin === "https://www.aifidi.it") return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  },
  methods: ["POST", "GET", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  maxAge: 600,
};
app.use(cors(corsOptions));

// ====== Rate limit básico ======
const windowMs = 60 * 1000;
const maxPerWindow = 30;
const hits = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip || req.headers["x-forwarded-for"] || req.connection?.remoteAddress;
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

// cache de access token en memoria
let tokenCache = { access_token: null, expires_at: 0 };

async function getZohoAccessToken() {
  const now = Date.now();
  if (tokenCache.access_token && now < tokenCache.expires_at - 15_000) {
    return tokenCache.access_token;
  }
  const params = new URLSearchParams({
    refresh_token: ZOHO_REFRESH_TOKEN,
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    grant_type: "refresh_token",
  });
  const resp = await fetch(`${DOMAINS.accounts}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Zoho token error: ${resp.status} ${text}`);
  }
  const data = await resp.json();
  tokenCache = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in ? data.expires_in * 1000 : 3_000_000),
  };
  return tokenCache.access_token;
}

// Mapeo básico de atributos comunes para Contacts (case-insensitive)
const FIELD_MAP = {
  EMAIL: "Email",
  EMAIL_ADDRESS: "Email",
  FIRSTNAME: "First_Name",
  FIRST_NAME: "First_Name",
  LASTNAME: "Last_Name",
  LAST_NAME: "Last_Name",
  NAME: "Last_Name",      // si solo mandan "name", lo ponemos como Last_Name
  COMPANY: "Account_Name",  // En Contacts, la empresa va en Account_Name
  PHONE: "Phone",
  MOBILE: "Mobile",
  SOURCE: "Lead_Source",
  LEAD_SOURCE: "Lead_Source",
  CITY: "Mailing_City",
  STATE: "Mailing_State",
  COUNTRY: "Mailing_Country",
  ZIP: "Mailing_Zip",
  POSTAL_CODE: "Mailing_Zip",
  NOTE: "Description",
  MESSAGE: "Description",
};

// Convierte attributes a campos Zoho Contact; lo no mapeado se adjunta en Description (JSON)
function buildZohoContact(email, attributes = {}) {
  const out = {};
  const descExtra = {};
  // Campos mínimos recomendados
  out.Email = email;

  // Fuente por defecto
  if (DEFAULT_LEAD_SOURCE) out.Lead_Source = DEFAULT_LEAD_SOURCE;

  // Mapeo
  for (const [k, v] of Object.entries(attributes || {})) {
    if (v == null) continue;
    const key = String(k).trim();
    const upper = key.toUpperCase();
    const apiField = FIELD_MAP[upper];
    if (apiField) {
      if (apiField === "Description") {
        out.Description = [out.Description, String(v)].filter(Boolean).join("\n");
      } else {
        out[apiField] = v;
      }
    } else {
      // acumular para Description
      descExtra[key] = v;
    }
  }

  // Si nos mandaron un "full name", intentar partirlo
  if (!out.Last_Name && (attributes?.name || attributes?.NAME)) {
    const full = String(attributes.name || attributes.NAME).trim();
    const [first, ...rest] = full.split(/\s+/);
    if (!out.First_Name) out.First_Name = first;
    if (!out.Last_Name) out.Last_Name = rest.join(" ") || first;
  }

  // Si no hay Account_Name, Zoho lo permite en Contacts, pero conviene algo
  if (!out.Account_Name) out.Account_Name = attributes?.company || attributes?.COMPANY || "—";

  if (Object.keys(descExtra).length > 0) {
    const json = JSON.stringify(descExtra);
    out.Description = [out.Description, `\n[extra]\n${json}`].filter(Boolean).join("");
  }

  return out;
}

// ====== Rutas ======
app.get("/health", (req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

app.get("/zoho/callback", (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.status(400).send(String(error));
  // store/use `code` immediately on the server to exchange for tokens
  res.send(`Auth code received. Copy this server log and close this tab.`);
  console.log("ZOHO AUTH CODE:", code, "STATE:", state);
});

app.options("/api/zoho/contact", (req, res) => res.status(200).end());
app.options("/api/zoho/lead", (req, res) => res.status(200).end());

app.post("/api/zoho/contact", rateLimit, async (req, res) => {
  try {
    const { email, attributes = {}, honeypot } = req.body || {};

    // Anti-bot
    if (honeypot && String(honeypot).trim() !== "") {
      return res.status(400).json({ error: "Bad request" });
    }

    // Validaciones
    if (!email || !emailRegex.test(String(email))) {
      return res.status(400).json({ error: "Email inválido" });
    }
    if (typeof attributes !== "object" || Array.isArray(attributes)) {
      return res.status(400).json({ error: "attributes debe ser un objeto" });
    }

    // Construir record para Zoho
    const record = buildZohoContact(email, attributes);

    // Access token
    const accessToken = await getZohoAccessToken();

    // Intento UPSERT por Email
    const upsertUrl = `${DOMAINS.api}/crm/v2/Contacts/upsert`;
    const payload = {
      data: [record],
      duplicate_check_fields: ["Email"],
      trigger: ["workflow"], // dispara workflows/reglas si las tienes
    };

    let r = await fetch(upsertUrl, {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    // Si el access token expiró justo ahora, reintentar una vez
    if (r.status === 401) {
      tokenCache = { access_token: null, expires_at: 0 };
      const newToken = await getZohoAccessToken();
      r = await fetch(upsertUrl, {
        method: "POST",
        headers: {
          Authorization: `Zoho-oauthtoken ${newToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
    }

    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    if (r.ok) {
      // Zoho responde con detalles por registro: status, code, details.id, action (insert/update)
      const details = json?.data?.[0] || {};
      const action = details?.action || details?.code || "ok";
      return res.status(200).json({ ok: true, action, zoho: details });
    }

    // Error de Zoho
    return res.status(r.status || 502).json({
      error: "Zoho contact upsert failed",
      detail: json,
    });
  } catch (e) {
    console.error("Internal error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ====== Lead endpoint (alias for contact) ======
app.post("/api/zoho/lead", rateLimit, async (req, res) => {
  try {
    const { email, attributes = {}, honeypot } = req.body || {};

    // Anti-bot
    if (honeypot && String(honeypot).trim() !== "") {
      return res.status(400).json({ error: "Bad request" });
    }

    // Validaciones
    if (!email || !emailRegex.test(String(email))) {
      return res.status(400).json({ error: "Email inválido" });
    }
    if (typeof attributes !== "object" || Array.isArray(attributes)) {
      return res.status(400).json({ error: "attributes debe ser un objeto" });
    }

    // Construir record para Zoho
    const record = buildZohoContact(email, attributes);

    // Access token
    const accessToken = await getZohoAccessToken();

    // Intento UPSERT por Email
    const upsertUrl = `${DOMAINS.api}/crm/v2/Contacts/upsert`;
    const payload = {
      data: [record],
      duplicate_check_fields: ["Email"],
      trigger: ["workflow"], // dispara workflows/reglas si las tienes
    };

    let r = await fetch(upsertUrl, {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    // Si el access token expiró justo ahora, reintentar una vez
    if (r.status === 401) {
      tokenCache = { access_token: null, expires_at: 0 };
      const newToken = await getZohoAccessToken();
      r = await fetch(upsertUrl, {
        method: "POST",
        headers: {
          Authorization: `Zoho-oauthtoken ${newToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
    }

    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    if (r.ok) {
      // Zoho responde con detalles por registro: status, code, details.id, action (insert/update)
      const details = json?.data?.[0] || {};
      const action = details?.action || details?.code || "ok";
      return res.status(200).json({ ok: true, action, zoho: details });
    }

    // Error de Zoho
    return res.status(r.status || 502).json({
      error: "Zoho lead upsert failed",
      detail: json,
    });
  } catch (e) {
    console.error("Internal error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ====== Arranque ======
app.listen(PORT, () => {
  console.log(`Zoho mini backend escuchando en :${PORT} (${NODE_ENV})`);
});