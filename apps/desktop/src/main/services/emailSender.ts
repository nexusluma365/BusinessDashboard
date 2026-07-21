import { google } from "googleapis";
import { getAuthorizedClient } from "./googleAuth";

const SEND_BATCH_LIMIT = 100;
const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailMessageInput = {
  to: string;
  subject: string;
  html: string;
};

export type EmailSendResult = {
  email: string;
  status: "sent" | "error";
  message?: string;
};

export async function sendEmailMessages(input: { messages: EmailMessageInput[] }): Promise<{
  success: boolean;
  results: EmailSendResult[];
  error?: string;
}> {
  const client = await getAuthorizedClient();
  if (!client) {
    return {
      success: false,
      results: [],
      error: "Google account is not connected. Connect Google, then reconnect if Gmail send permission was added after your first sign-in.",
    };
  }

  const messages = dedupeMessages(input.messages).slice(0, SEND_BATCH_LIMIT);
  if (!messages.length) {
    return { success: false, results: [], error: "Add at least one valid recipient email." };
  }

  const gmail = google.gmail({ version: "v1", auth: client });
  const profile = await gmail.users.getProfile({ userId: "me" }).catch(() => null);
  const fromEmail = profile?.data.emailAddress ?? "";
  const results: EmailSendResult[] = [];

  for (const message of messages) {
    try {
      await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: buildRawMessage({ ...message, fromEmail }),
        },
      });
      results.push({ email: message.to, status: "sent" });
    } catch (err) {
      results.push({ email: message.to, status: "error", message: friendlySendError(err) });
    }
  }

  return {
    success: results.some((result) => result.status === "sent"),
    results,
  };
}

function dedupeMessages(messages: EmailMessageInput[]) {
  const seen = new Set<string>();
  return messages.filter((message) => {
    const email = message.to.trim().toLowerCase();
    if (!VALID_EMAIL.test(email) || seen.has(email)) return false;
    seen.add(email);
    return true;
  });
}

function buildRawMessage({
  to,
  subject,
  html,
  fromEmail,
}: EmailMessageInput & { fromEmail: string }) {
  const lines = [
    fromEmail ? `From: ${sanitizeHeaderLine(fromEmail)}` : "",
    `To: ${sanitizeHeaderLine(to)}`,
    `Subject: ${encodeHeaderValue(subject || "Nexus Luma")}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    ...chunkBase64(Buffer.from(html, "utf-8").toString("base64")),
  ].filter(Boolean);

  return Buffer.from(lines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function chunkBase64(value: string, size = 76) {
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += size) {
    chunks.push(value.slice(i, i + size));
  }
  return chunks;
}

function sanitizeHeaderLine(value: string) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function encodeHeaderValue(value: string) {
  const sanitized = sanitizeHeaderLine(value);
  if (/^[\x20-\x7E]*$/.test(sanitized)) return sanitized;
  return `=?UTF-8?B?${Buffer.from(sanitized, "utf8").toString("base64")}?=`;
}

function friendlySendError(error: unknown) {
  const message = error instanceof Error ? error.message : "Failed to send email.";
  if (/insufficient.*scope|permission|unauthorized|forbidden/i.test(message)) {
    return "Gmail send permission is missing. Disconnect and reconnect Google so the app can request Gmail send access.";
  }
  return message;
}
