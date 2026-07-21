import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { readSettings } from "./localStore";

/**
 * Nexus Luma standardizes on exactly two AI providers for every AI-driven
 * feature (SYLUS and the lead-qualification textbot): Anthropic and OpenAI.
 * No other AI vendor is wired in anywhere in this app.
 *
 * Both providers implement the same narrow interface, so SYLUS/textbot
 * code never branches on which one is active — it just calls `chat()`.
 * The active provider is chosen by (in priority order): explicit per-call
 * override → user setting (Settings → SYLUS) → AI_PROVIDER env var →
 * whichever of the two API keys is actually present.
 */

export type ChatMessage = { role: "user" | "assistant"; content: string };

export interface AiProvider {
  readonly name: "anthropic" | "openai";
  chat(input: { system: string; messages: ChatMessage[]; maxTokens?: number }): Promise<string>;
}

class AnthropicProvider implements AiProvider {
  readonly name = "anthropic" as const;
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async chat({ system, messages, maxTokens = 1024 }: Parameters<AiProvider["chat"]>[0]) {
    const response = await this.client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock && "text" in textBlock ? textBlock.text : "";
  }
}

class OpenAiProvider implements AiProvider {
  readonly name = "openai" as const;
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async chat({ system, messages, maxTokens = 1024 }: Parameters<AiProvider["chat"]>[0]) {
    const response = await this.client.chat.completions.create({
      model: "gpt-4.1",
      max_tokens: maxTokens,
      messages: [{ role: "system", content: system }, ...messages],
    });
    return response.choices[0]?.message?.content ?? "";
  }
}

export function getAvailableProviders(): Array<"anthropic" | "openai"> {
  const available: Array<"anthropic" | "openai"> = [];
  if (process.env.ANTHROPIC_API_KEY) available.push("anthropic");
  if (process.env.OPENAI_API_KEY) available.push("openai");
  return available;
}

export function getActiveProvider(): AiProvider | null {
  const settings = readSettings();
  const preferred = settings.aiProvider ?? (process.env.AI_PROVIDER as "anthropic" | "openai" | undefined);
  const available = getAvailableProviders();

  const chosen = (preferred && available.includes(preferred) ? preferred : available[0]) ?? null;
  if (!chosen) return null;

  if (chosen === "anthropic") return new AnthropicProvider(process.env.ANTHROPIC_API_KEY!);
  return new OpenAiProvider(process.env.OPENAI_API_KEY!);
}
