# AI providers — SYRUS voice + customer text separation

Nexus Luma uses **Anthropic (Claude)** and **OpenAI** for reasoning. SYRUS
has two separate lanes:

- **SYRUS Voice**: private command-center voice assistant. It sits in the
  corner of the app, uses the wake phrase `Yo SYRUS`, and SYRUS is pronounced
  `SYY RR UHH SSS`. It can read app/lead summaries, provide live updates, and
  open app tabs.
- **Lead Text**: lead/customer-facing text assistant. It lives in its own tab,
  receives only
  sanitized customer context and cannot access admin data, lead lists,
  revenue, internal notes, system prompts, credentials, or app status.

Voice mode is a third transport lane for the admin assistant. It is designed
for **VAPI + OpenAI/Anthropic reasoning**, but customer chat does not use the
admin voice lane.

## Getting keys

- Anthropic: console.anthropic.com → API Keys → create a key.
- OpenAI: platform.openai.com → API Keys → create a key.

Put them in `apps/desktop/.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
AI_PROVIDER=anthropic
VAPI_API_KEY=...
VAPI_PUBLIC_KEY=...
VAPI_ASSISTANT_ID=...
```

You only need **one** of the Anthropic/OpenAI keys for text reasoning to work.
If both are set, `AI_PROVIDER`
picks the default, and it's also changeable at runtime from
**Settings → SYLUS** (stored locally, no restart needed).

## What each one is used for today (Phase 1/2 groundwork)

- **Admin voice / reasoning** (private SYRUS answers): either provider,
  via a shared `chat()` interface — `claude-sonnet-4-6` on Anthropic,
  `gpt-4.1` on OpenAI.
- **Customer text / reasoning**: either provider, but through the separate
  `lead-assistant:reply` IPC lane with sanitized context only.
- **Grounding**: before admin SYLUS calls either model, the app pulls your actual
  lead data (from the connected Google Sheet) into the prompt as a data
  snapshot, and instructs the model to answer only from that snapshot —
  this is what stops SYLUS from inventing lead counts or names.
- **Voice readiness**: the app checks for VAPI plus an active reasoning
  provider, but live audio calling is still kept separate from Lead Text.

## Coming in later phases

- **Typed tool-calling** (`getNewLeads`, `getUnansweredLeads`, etc. from the
  original spec) replacing today's single data-snapshot approach, so SYLUS
  can take read/draft/confirmation-gated actions instead of just answering
  questions.
- **Full VAPI voice session wiring** for live speech input/output on the
  admin side.
- **Textbot qualification flows** (Web Design / Digital Products / Credit
  Repair question trees) built on top of the customer-safe lane.

No customer-facing code should call `sylus:ask`. Customer text replies must go
through `lead-assistant:reply` so admin context cannot leak into lead chats.
