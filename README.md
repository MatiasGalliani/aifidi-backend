# Brevo Mini Backend (Node + Express)

Backend mínimo para recibir el formulario y crear/actualizar contactos en Brevo (upsert), ideal para Railway.

## Rutas
- `GET /health` → { status: "ok" }
- `POST /api/brevo/subscribe` → espera JSON:
  ```json
  {
    "email": "mail@dominio.com",
    "attributes": {
      "NOME": "Mario",
      "COGNOME": "Rossi",
      "EMAIL": "mail@dominio.com",
      "SCOPO_RICHIESTA": "Finanziamenti...",
      "IMPORTO_RICHIESTO": "10000",
      "CITTA_RESIDENZA": "Milano"
    },
    "listIds": [4],     // opcional si usas BREVO_LIST_ID en el backend
    "honeypot": ""      // opcional, si tiene valor se rechaza
  }
