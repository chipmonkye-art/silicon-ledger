import { useCallback, useState } from "react";
import { apiFetch } from "./client";
import { useAuthStore } from "./stores";

export interface BiometricCredential {
  id: string;
  credential_id: string;
  device_name: string | null;
  platform: string;
  last_used_at: string | null;
  created_at: string;
}

type Platform = "ios" | "android" | "web";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "web";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "web";
}

export function useBiometric() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);

  // Check if WebAuthn is available (Web) or we're on a native platform
  const checkAvailability = useCallback(async () => {
    if (detectPlatform() !== "web") {
      setAvailable(true);
      return true;
    }
    const avail = typeof window !== "undefined" &&
      typeof window.PublicKeyCredential !== "undefined";
    setAvailable(avail);
    return avail;
  }, []);

  // Enroll a new biometric credential
  const enroll = useCallback(async (deviceName?: string) => {
    setEnrolling(true);
    try {
      const platform = detectPlatform();
      const { challenge } = await apiFetch<{ challenge: string }>(
        "/api/v2/auth/biometric/challenge",
        { method: "POST" },
      );

      // WebAuthn credential creation
      let credentialId: string;
      let publicKey: string;

      if (platform === "web" && typeof window.PublicKeyCredential !== "undefined") {
        const cred = await navigator.credentials.create({
          publicKey: {
            challenge: new Uint8Array(challenge.match(/.{1,2}/g)!.map((b) => parseInt(b, 16))),
            rp: { name: "Silicon Accounting" },
            user: {
              id: new Uint8Array(16),
              name: "user",
              displayName: "User",
            },
            pubKeyCredParams: [{ alg: -7, type: "public-key" }],
            authenticatorSelection: {
              authenticatorAttachment: "platform",
              userVerification: "required",
            },
            timeout: 30000,
          },
        }) as PublicKeyCredential;

        credentialId = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
        const pubKey = cred.response as AuthenticatorAttestationResponse;
        publicKey = btoa(String.fromCharCode(...new Uint8Array(pubKey.getPublicKey()!)));
      } else {
        // Fallback for native: use device-generated keypair
        const keyPair = await generateDeviceKeyPair();
        credentialId = keyPair.credentialId;
        publicKey = keyPair.publicKey;
      }

      await apiFetch("/api/v2/auth/biometric/register", {
        method: "POST",
        body: JSON.stringify({
          credential_id: credentialId,
          public_key: publicKey,
          device_name: deviceName || navigator.platform || "Unknown Device",
          platform,
        }),
      });

      return true;
    } finally {
      setEnrolling(false);
    }
  }, []);

  // Authenticate via biometric
  const authenticate = useCallback(async (): Promise<boolean> => {
    setAuthenticating(true);
    try {
      const platform = detectPlatform();
      const { challenge } = await apiFetch<{ challenge: string }>(
        "/api/v2/auth/biometric/challenge",
        { method: "POST" },
      );

      let credentialId: string;
      let signature: string;

      if (platform === "web" && typeof window.PublicKeyCredential !== "undefined") {
        // Get credentials list to find registered ids
        const { credentials } = await apiFetch<{ credentials: BiometricCredential[] }>(
          "/api/v2/auth/biometric/credentials",
        );
        if (credentials.length === 0) throw new Error("No biometric credentials registered");

        const cred = await navigator.credentials.get({
          publicKey: {
            challenge: new Uint8Array(challenge.match(/.{1,2}/g)!.map((b) => parseInt(b, 16))),
            allowCredentials: credentials.map((c) => ({
              id: new Uint8Array(atob(c.credential_id).split("").map((s) => s.charCodeAt(0))),
              type: "public-key" as const,
            })),
            userVerification: "required",
            timeout: 30000,
          },
        }) as PublicKeyCredential;

        credentialId = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));

        const attResp = cred.response as AuthenticatorAssertionResponse;
        const sigBytes = new Uint8Array(attResp.signature);
        signature = Array.from(sigBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
      } else {
        // Native fallback
        const stored = localStorage.getItem("silicon-biometric-key");
        if (!stored) throw new Error("No biometric key registered");
        const keyData = JSON.parse(stored);
        credentialId = keyData.credentialId;
        signature = await nativeSign(challenge, keyData.privateKey);
      }

      const result = await apiFetch<{ verified: boolean; userId: string; session_token: string }>(
        "/api/v2/auth/biometric/verify",
        {
          method: "POST",
          body: JSON.stringify({ credential_id: credentialId, signature, signed_challenge: challenge }),
        },
      );

      if (result.verified) {
        useAuthStore.getState().setSession(result.session_token, result.userId);
      }

      return result.verified;
    } finally {
      setAuthenticating(false);
    }
  }, []);

  return {
    available,
    enrolling,
    authenticating,
    checkAvailability,
    enroll,
    authenticate,
  };
}

// ── Native key helpers (fallback for environments without WebAuthn) ──

async function generateDeviceKeyPair(): Promise<{ credentialId: string; publicKey: string }> {
  const key = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );

  const publicKeyJwk = await crypto.subtle.exportKey("jwk", key.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", key.privateKey);

  const credentialId = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));

  localStorage.setItem("silicon-biometric-key", JSON.stringify({
    credentialId,
    privateKey: privateKeyJwk,
    platform: detectPlatform(),
  }));

  return { credentialId, publicKey: JSON.stringify(publicKeyJwk) };
}

async function nativeSign(challenge: string, privateKeyJwk: JsonWebKey): Promise<string> {
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const enc = new TextEncoder();
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    enc.encode(challenge),
  );

  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
