import { shell } from "electron";
import type { ChatMessage } from "./aiProviders";

/**
 * Nexus Luma never sends SMS itself — there's no Twilio/Telnyx/Plivo in
 * this build. Instead, the AI (Claude/OpenAI) drafts the message text,
 * and the human sends it themselves, either by copying it or by handing
 * it to the OS's default messaging app via the `sms:` URI scheme (Messages
 * on macOS; whatever's registered as the SMS handler on Windows, e.g.
 * Phone Link — if nothing is registered there, the copy button still works).
 */

export type LeadContext = {
  fullName: string;
  offer: string;
  status: string;
  businessName: string;
  notes: string;
  purchased: boolean;
};

function systemPromptFor(lead: LeadContext) {
  return [
    "You draft short, natural, friendly SMS text messages for a small business's CRM.",
    "You are NOT sending this message — you are only drafting it for a human to review and send themselves.",
    "Keep it under 320 characters, texting tone (not an email), no markdown, no signature block.",
    "Never guarantee results, never make legal claims, never promise specific financial outcomes.",
    "",
    "LEAD CONTEXT:",
    `Name: ${lead.fullName || "unknown"}`,
    `Offer: ${lead.offer || "unspecified"}`,
    `Pipeline status: ${lead.status || "unspecified"}`,
    `Business: ${lead.businessName || "n/a"}`,
    `Already purchased: ${lead.purchased ? "yes" : "no"}`,
    `Notes: ${lead.notes || "none"}`,
  ].join("\n");
}

export async function draftText(input: {
  lead: LeadContext;
  instruction: string;
  history: ChatMessage[];
}): Promise<{ draft: string } | { error: string }> {
  const { getActiveProvider } = await import("./aiProviders");
  const provider = getActiveProvider();
  if (!provider) {
    return { error: "No AI provider configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY." };
  }

  const draft = await provider.chat({
    system: systemPromptFor(input.lead),
    messages: [...input.history, { role: "user", content: input.instruction }],
    maxTokens: 300,
  });

  return { draft };
}

export function openInMessagesApp(phone: string, body: string) {
  if (!phone) return { success: false, reason: "This lead has no phone number on file." };
  const digits = phone.replace(/[^\d+]/g, "");
  const uri = `sms:${digits}${process.platform === "darwin" ? "&" : "?"}body=${encodeURIComponent(body)}`;
  shell.openExternal(uri);
  return { success: true };
}
