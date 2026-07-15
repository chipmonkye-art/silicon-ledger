import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware, workspaceScope } from "../middleware/auth.js";
import { requireHmac } from "../middleware/hmac.js";

const router = Router();

// HMAC-protected endpoint for nightly cron refresh (called by scheduler)
router.post("/cron/refresh", requireHmac, async (_req, res) => {
  try {
    // Fetch latest rates from Open Exchange Rates or similar
    // For now, use a simple fallback that sets common pairs
    const baseRates = {
      USD: 1, EUR: 0.92, GBP: 0.79, JPY: 149.5,
      CAD: 1.36, AUD: 1.52, CHF: 0.88, CNY: 7.24,
      INR: 83.1, MXN: 17.2, BRL: 4.95, KRW: 1320,
    };

    let updated = 0;
    for (const [quote, rate] of Object.entries(baseRates)) {
      if (quote === "USD") continue;
      await sql`
        INSERT INTO fx_rates (quote_currency, base_currency, rate, updated_at)
        VALUES (${quote}, 'USD', ${rate}, now())
        ON CONFLICT (quote_currency, base_currency)
        DO UPDATE SET rate = ${rate}, updated_at = now()
      `;
      updated++;
    }

    res.json({ message: "FX rates refreshed", pairs_updated: updated });
  } catch (err) {
    console.error("FX cron error:", err);
    res.status(500).json({ message: "FX refresh failed" });
  }
});

// Authenticated routes for reading/managing rates
router.use(authMiddleware, workspaceScope);

router.get("/", async (req, res) => {
  const rates = await sql`SELECT * FROM fx_rates ORDER BY base_currency, quote_currency`;
  res.json({ rates });
});

router.get("/:quote/:base", async (req, res) => {
  const { quote, base } = req.params;
  const [rate] = await sql`
    SELECT * FROM fx_rates WHERE quote_currency = ${quote} AND base_currency = ${base}
  `;
  if (!rate) return res.status(404).json({ message: "Exchange rate not found" });
  res.json({ rate });
});

router.put("/:quote/:base", async (req, res) => {
  const { quote, base } = req.params;
  const { rate } = req.body;
  if (rate == null || rate <= 0) return res.status(422).json({ message: "rate must be a positive number" });

  const [updated] = await sql`
    INSERT INTO fx_rates (quote_currency, base_currency, rate, updated_at)
    VALUES (${quote}, ${base}, ${rate}, now())
    ON CONFLICT (quote_currency, base_currency)
    DO UPDATE SET rate = ${rate}, updated_at = now()
    RETURNING *
  `;
  res.json({ rate: updated });
});

export default router;
