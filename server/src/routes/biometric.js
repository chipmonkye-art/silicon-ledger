import { Router } from "express";
import crypto from "crypto";
import sql from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

// POST /api/v2/auth/biometric/challenge — generate a nonce for signing
router.post("/challenge", authMiddleware, async (req, res) => {
  const { userId } = req.user;
  const challenge = crypto.randomBytes(32).toString("hex");

  await sql`
    INSERT INTO auth_challenges (user_id, challenge)
    VALUES (${userId}, ${challenge})
  `;

  res.json({ challenge });
});

// POST /api/v2/auth/biometric/register — store device public key
router.post("/register", authMiddleware, async (req, res) => {
  const { userId } = req.user;
  const { credential_id, public_key, device_name, platform } = req.body;

  if (!credential_id || !public_key || !platform) {
    return res.status(422).json({ message: "credential_id, public_key, platform required" });
  }

  // Deactivate old credentials for same device
  await sql`
    DELETE FROM biometric_credentials
    WHERE user_id = ${userId} AND credential_id = ${credential_id}
  `;

  const [cred] = await sql`
    INSERT INTO biometric_credentials (user_id, credential_id, public_key, device_name, platform)
    VALUES (${userId}, ${credential_id}, ${public_key}, ${device_name || null}, ${platform})
    ON CONFLICT (credential_id) DO UPDATE SET
      public_key = EXCLUDED.public_key,
      device_name = EXCLUDED.device_name,
      last_used_at = now()
    RETURNING id, credential_id, device_name, platform
  `;

  res.json({ credential: cred, message: "Biometric key registered" });
});

// POST /api/v2/auth/biometric/verify — verify signed challenge
router.post("/verify", async (req, res) => {
  const { credential_id, signature, signed_challenge } = req.body;

  if (!credential_id || !signature || !signed_challenge) {
    return res.status(422).json({ message: "credential_id, signature, signed_challenge required" });
  }

  // Find the credential and verify the nonce
  const [cred] = await sql`
    SELECT bc.*, ac.challenge, ac.id AS challenge_id
    FROM biometric_credentials bc
    JOIN auth_challenges ac ON ac.user_id = bc.user_id AND ac.used = false
    WHERE bc.credential_id = ${credential_id}
      AND ac.challenge = ${signed_challenge}
      AND ac.expires_at > now()
    ORDER BY ac.created_at DESC
    LIMIT 1
  `;

  if (!cred) {
    return res.status(401).json({ message: "Invalid or expired challenge" });
  }

  // Verify signature using RSA/ECDSA verification
  // In production: crypto.verify() with the stored public key
  const valid = crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    crypto.createHmac("sha256", cred.public_key).update(signed_challenge).digest(),
  );

  if (!valid) {
    return res.status(401).json({ message: "Signature verification failed" });
  }

  // Mark challenge as used
  await sql`
    UPDATE auth_challenges SET used = true WHERE id = ${cred.challenge_id}
  `;

  // Update last used
  await sql`
    UPDATE biometric_credentials SET last_used_at = now()
    WHERE id = ${cred.id}
  `;

  // Issue short-lived session token
  const sessionToken = crypto.randomBytes(32).toString("hex");
  // In production: create a proper JWT with jose
  // For now, return the user ID and token

  res.json({
    verified: true,
    userId: cred.user_id,
    session_token: sessionToken,
    message: "Biometric verification successful",
  });
});

// GET /api/v2/auth/biometric/credentials — list registered devices
router.get("/credentials", authMiddleware, async (req, res) => {
  const { userId } = req.user;

  const credentials = await sql`
    SELECT id, credential_id, device_name, platform, last_used_at, created_at
    FROM biometric_credentials
    WHERE user_id = ${userId}
    ORDER BY last_used_at DESC NULLS LAST
  `;

  res.json({ credentials });
});

// DELETE /api/v2/auth/biometric/credentials/:id — remove a device
router.delete("/credentials/:id", authMiddleware, async (req, res) => {
  const { userId } = req.user;

  const [cred] = await sql`
    DELETE FROM biometric_credentials
    WHERE id = ${req.params.id} AND user_id = ${userId}
    RETURNING id
  `;

  if (!cred) return res.status(404).json({ message: "Credential not found" });
  res.json({ message: "Credential removed" });
});

export default router;
