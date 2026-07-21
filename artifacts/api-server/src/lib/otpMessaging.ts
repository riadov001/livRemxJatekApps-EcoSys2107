// OTP messaging with multi-provider fallback chain.
//
// SMS/WhatsApp order:
//   1. Infobip SMS
//   2. Twilio SMS        (env secrets: TWILIO_ACCOUNT_SID + TWILIO_AUTH_KEY)
//   3. Infobip WhatsApp  (fallback)
//   4. Twilio WhatsApp   (fallback)
//
// Email: Resend (RESEND_API_KEY + RESEND_FROM_EMAIL)
//
// Each provider is skipped silently when not configured. The first successful
// send wins; failures are logged and the chain continues. If every provider
// fails, throws an aggregated error.

import twilio from "twilio";

export type OtpChannel =
  | "infobip-whatsapp"
  | "infobip-sms"
  | "twilio-whatsapp"
  | "twilio-sms"
  | "resend-email";

export interface SendOtpResult {
  channel: OtpChannel;
  attempts: AttemptLog[];
}

export interface AttemptLog {
  channel: OtpChannel | "skipped";
  ok: boolean;
  reason?: string;
}

// ─── Infobip ──────────────────────────────────────────────────────────────────
function infobipBaseHost(): string | undefined {
  const raw = process.env.INFOBIP_BASE_URL || process.env.INFOBIP_URL;
  if (!raw) return undefined;
  return raw.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function infobipConfigured(): boolean {
  return !!(process.env.INFOBIP_API_KEY && infobipBaseHost());
}

async function sendInfobipSms(to: string, body: string): Promise<void> {
  const apiKey = process.env.INFOBIP_API_KEY!;
  const baseUrl = infobipBaseHost()!;
  const sender = process.env.INFOBIP_SENDER || "Jatek";
  const url = `https://${baseUrl}/sms/2/text/advanced`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `App ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      messages: [{ from: sender, destinations: [{ to }], text: body }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Infobip SMS ${res.status}: ${err.slice(0, 200)}`);
  }
}

async function sendInfobipWhatsapp(to: string, body: string): Promise<void> {
  const apiKey = process.env.INFOBIP_API_KEY!;
  const baseUrl = infobipBaseHost()!;
  const from = process.env.INFOBIP_WA_SENDER;
  if (!from) throw new Error("INFOBIP_WA_SENDER not set");

  const url = `https://${baseUrl}/whatsapp/1/message/text`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `App ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ from, to, content: { text: body } }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Infobip WhatsApp ${res.status}: ${err.slice(0, 200)}`);
  }
}

// ─── Twilio ───────────────────────────────────────────────────────────────────
// Reads credentials directly from environment secrets.
// Falls back to the Replit connector as a secondary option.
// Twilio credentials can come in two flavours:
//   1. Account SID + Auth Token   → twilio(accountSid, authToken)
//   2. Account SID + API Key SID + API Key Secret  → twilio(apiKeySid, apiKeySecret, { accountSid })
//
// Environment secrets mapping:
//   TWILIO_ACCOUNT_SID  → Account SID (AC...)
//   TWILIO_AUTH_KEY     → Auth Token OR API Key SID (SK...)
//   TWILIO_API_KEY_SID  → API Key SID (SK...) — used when TWILIO_AUTH_KEY is actually an API Key
//   TWILIO_API_KEY_SECRET → API Key Secret
//   TWILIO_FROM_NUMBER  → Sender number

interface TwilioCredentials {
  accountSid: string;
  authToken?: string;      // set when using Auth Token auth
  apiKeySid?: string;      // set when using API Key auth
  apiKeySecret?: string;   // set when using API Key auth
  phoneNumber: string | undefined;
  messagingServiceSid: string | undefined;
  useApiKey: boolean;
}

async function getTwilioCredentials(): Promise<TwilioCredentials> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const rawAuthKey = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_KEY;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const phoneNumber = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!accountSid) {
    throw new Error("TWILIO_ACCOUNT_SID not set");
  }
  if (!accountSid.startsWith("AC")) {
    throw new Error(
      `TWILIO_ACCOUNT_SID is invalid — expected "AC..." prefix, got "${accountSid.slice(0, 4)}..."`,
    );
  }

  // If we have a dedicated API Key SID + Secret, prefer that
  if (apiKeySid && apiKeySecret && apiKeySid.startsWith("SK")) {
    return {
      accountSid,
      apiKeySid,
      apiKeySecret,
      phoneNumber,
      messagingServiceSid,
      useApiKey: true,
    };
  }

  // TWILIO_AUTH_KEY might actually be an API Key SID (SK...) — detect and handle it
  if (rawAuthKey?.startsWith("SK")) {
    // rawAuthKey is an API Key SID — we need the secret
    const secret = apiKeySecret;
    if (!secret) {
      throw new Error(
        "TWILIO_AUTH_KEY looks like an API Key SID (SK...) but TWILIO_API_KEY_SECRET is not set",
      );
    }
    return {
      accountSid,
      apiKeySid: rawAuthKey,
      apiKeySecret: secret,
      phoneNumber,
      messagingServiceSid,
      useApiKey: true,
    };
  }

  // Standard Auth Token
  if (rawAuthKey) {
    return {
      accountSid,
      authToken: rawAuthKey,
      phoneNumber,
      messagingServiceSid,
      useApiKey: false,
    };
  }

  throw new Error(
    "Twilio credentials incomplete — set TWILIO_ACCOUNT_SID + TWILIO_AUTH_KEY (or TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET)",
  );
}

async function getTwilioClient() {
  const creds = await getTwilioCredentials();
  if (creds.useApiKey) {
    // API Key authentication: twilio(apiKeySid, apiKeySecret, { accountSid })
    return twilio(creds.apiKeySid!, creds.apiKeySecret!, { accountSid: creds.accountSid });
  }
  // Auth Token authentication
  return twilio(creds.accountSid, creds.authToken!);
}

// When using API Key auth fails, retry with Auth Token if available.
// This handles the case where TWILIO_API_KEY_SID is set but incorrect,
// while TWILIO_AUTH_KEY holds the actual working Auth Token.
async function getTwilioClientWithFallback() {
  const creds = await getTwilioCredentials();
  if (!creds.useApiKey) {
    return twilio(creds.accountSid, creds.authToken!);
  }

  // Primary: API Key
  const apiKeyClient = twilio(creds.apiKeySid!, creds.apiKeySecret!, { accountSid: creds.accountSid });

  // Pre-validate by fetching account info — if 401, fall back to Auth Token
  try {
    await apiKeyClient.api.v2010.accounts(creds.accountSid).fetch();
    return apiKeyClient;
  } catch (e: any) {
    const isAuthError = e?.status === 401 || e?.code === 20003 || /authenticate/i.test(e?.message ?? "");
    if (!isAuthError) return apiKeyClient; // non-auth error, let the actual call surface it

    // Try Auth Token fallback
    const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_KEY;
    if (authToken && !authToken.startsWith("SK")) {
      console.warn("[Twilio] API Key auth failed — retrying with Auth Token");
      return twilio(creds.accountSid, authToken);
    }
    throw e; // no fallback available
  }
}

async function twilioConfigured(): Promise<boolean> {
  try {
    await getTwilioCredentials();
    return true;
  } catch {
    return false;
  }
}

async function sendTwilioSms(to: string, body: string): Promise<void> {
  const client = await getTwilioClientWithFallback();
  const { phoneNumber, messagingServiceSid } = await getTwilioCredentials();
  const from = process.env.TWILIO_SMS_FROM || phoneNumber;
  if (messagingServiceSid) {
    await client.messages.create({ to, body, messagingServiceSid });
    return;
  }
  if (!from) throw new Error("Twilio SMS sender not configured (set TWILIO_FROM_NUMBER)");
  await client.messages.create({ to, from, body });
}

async function sendTwilioWhatsapp(to: string, body: string): Promise<void> {
  const client = await getTwilioClientWithFallback();
  const from = process.env.TWILIO_WA_FROM || "whatsapp:+14155238886";
  await client.messages.create({
    to: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
    from: from.startsWith("whatsapp:") ? from : `whatsapp:${from}`,
    body,
  });
}

// ─── Resend (email OTP) ───────────────────────────────────────────────────────
// RESEND_EMAIL_FROM is accepted as an alias for RESEND_FROM_EMAIL.
function getResendApiKey(): string | undefined {
  return process.env.RESEND_API_KEY;
}
function getResendFromEmail(): string | undefined {
  return process.env.RESEND_FROM_EMAIL || process.env.RESEND_EMAIL_FROM;
}
function resendConfigured(): boolean {
  return !!(getResendApiKey() && getResendFromEmail());
}

async function sendResendEmail(to: string, otp: string, fullBody: string): Promise<void> {
  const apiKey = getResendApiKey()!;
  const from = getResendFromEmail()!;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Votre code de vérification Jatek",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff">
          <h2 style="color:#E91E63;margin:0 0 8px">Jatek</h2>
          <p style="color:#374151;margin:0 0 24px">Voici votre code de vérification :</p>
          <div style="font-size:36px;font-weight:700;letter-spacing:10px;color:#0A1B3D;
                      background:#F3F4F6;border-radius:8px;padding:16px 24px;
                      text-align:center;margin:0 0 24px">${otp}</div>
          <p style="color:#6B7280;font-size:13px;margin:0">
            Ce code est valable 5 minutes.<br>Ne le communiquez à personne.
          </p>
        </div>`,
      text: fullBody,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend ${res.status}: ${err.slice(0, 300)}`);
  }
}

// ─── Public: email OTP ────────────────────────────────────────────────────────
export async function sendOtpEmail(
  email: string,
  otp: string,
  body: string
): Promise<SendOtpResult> {
  const attempts: AttemptLog[] = [];

  if (!resendConfigured()) {
    attempts.push({ channel: "resend-email", ok: false, reason: "not configured" });
    const summary = attempts.map((a) => `${a.channel}=${a.reason}`).join(" | ");
    throw new Error(`Email OTP provider not configured: ${summary}`);
  }

  try {
    await sendResendEmail(email, otp, body);
    attempts.push({ channel: "resend-email", ok: true });
    console.info(`[OTP] sent via resend-email to ${email}`);
    return { channel: "resend-email", attempts };
  } catch (err: any) {
    const reason = err?.message ?? String(err);
    attempts.push({ channel: "resend-email", ok: false, reason });
    console.warn(`[OTP] resend-email failed for ${email}: ${reason}`);
    const summary = attempts.map((a) => `${a.channel}=${a.ok ? "ok" : a.reason}`).join(" | ");
    throw new Error(`Email OTP delivery failed: ${summary}`);
  }
}

// ─── Public: WhatsApp/SMS OTP ─────────────────────────────────────────────────
// WhatsApp is tried first (preferred channel), SMS is fallback.
export async function sendOtpMessage(
  to: string,
  body: string
): Promise<SendOtpResult> {
  const attempts: AttemptLog[] = [];
  const infobipReady = infobipConfigured();
  const twilioReady = await twilioConfigured();

  type Step = { channel: OtpChannel; available: boolean; fn: () => Promise<void> };
  const steps: Step[] = [
    // ── WhatsApp (preferred) ────────────────────────────────────────────────
    {
      channel: "infobip-whatsapp",
      available: infobipReady && !!process.env.INFOBIP_WA_SENDER,
      fn: () => sendInfobipWhatsapp(to, body),
    },
    {
      channel: "twilio-whatsapp",
      available: twilioReady,
      fn: () => sendTwilioWhatsapp(to, body),
    },
    // ── SMS (fallback only) ─────────────────────────────────────────────────
    {
      channel: "infobip-sms",
      available: infobipReady,
      fn: () => sendInfobipSms(to, body),
    },
    {
      channel: "twilio-sms",
      available: twilioReady,
      fn: () => sendTwilioSms(to, body),
    },
  ];

  for (const step of steps) {
    if (!step.available) {
      attempts.push({ channel: step.channel, ok: false, reason: "not configured" });
      continue;
    }
    try {
      await step.fn();
      attempts.push({ channel: step.channel, ok: true });
      console.info(`[OTP] sent via ${step.channel} to ${to}`);
      return { channel: step.channel, attempts };
    } catch (err: any) {
      const reason = err?.message ?? String(err);
      attempts.push({ channel: step.channel, ok: false, reason });
      console.warn(`[OTP] ${step.channel} failed for ${to}: ${reason}`);
    }
  }

  const summary = attempts
    .map((a) => `${a.channel}=${a.ok ? "ok" : a.reason}`)
    .join(" | ");
  throw new Error(`All OTP providers failed: ${summary}`);
}

export async function anyOtpProviderConfigured(): Promise<boolean> {
  if (infobipConfigured()) return true;
  if (resendConfigured()) return true;
  return await twilioConfigured();
}
