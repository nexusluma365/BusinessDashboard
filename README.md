# SYRUS

SYRUS is the Nexus Luma macOS command center. It combines live lead tracking, customer pipeline management, customer conversations, email sending, notifications, and the private SYRUS AI assistant in one desktop app.

## Purpose

SYRUS gives Nexus Luma one secure place to run daily customer operations. The macOS app handles the premium frontend experience, while the Railway API can run the backend work for Google Sheets, Gmail, OpenAI, Anthropic, and VAPI configuration.

## Architecture

- `apps/desktop`: Electron, React, and TypeScript macOS app.
- `apps/api`: Railway-ready Node API.
- `NEXUS_LUMA_API_BASE_URL`: when set in the desktop app, Electron routes backend calls to Railway.
- Local Electron services remain available for development when no Railway URL is configured.

The renderer never receives raw API keys, OAuth tokens, or service account data.

## Features

- **Dashboard**: Shows live lead/customer metrics from Google Sheets. If no live data is connected, it shows `Not Available yet`.
- **Leads**: Lists live Google Sheets leads, searchable by name, email, business, and offer.
- **Pipeline**: Shows converted customers and lets Nexus Luma track `Not yet`, `In Process`, `Completed`, and completion-by dates.
- **Conversations**: Customer-safe chat workspace for leads with phone numbers.
- **Email Studio**: Builds email-safe templates, personalizes with lead merge fields, previews desktop/mobile layouts, exports HTML, and sends through Gmail.
- **Notifications**: Header bell and timeline for real app notifications. Empty state remains quiet until there are real notifications.
- **SYRUS Voice**: Admin-only assistant that can read live app data, provide updates, and open app tabs.
- **SYRUS Customer Text**: Separate customer-facing AI lane. It receives only sanitized lead context and never admin data.

## Railway Setup

Deploy the repo to Railway using the included `railway.json`.

Required Railway variables for live data:

```text
GOOGLE_SERVICE_ACCOUNT_JSON=
GOOGLE_WEB_DESIGN_SPREADSHEET_ID=
GOOGLE_WEB_DESIGN_SHEET_NAME=Sheet1
GOOGLE_DIGITAL_PRODUCTS_SPREADSHEET_ID=
GOOGLE_DIGITAL_PRODUCTS_SHEET_NAME=Sheet1
GOOGLE_CREDIT_REPAIR_SPREADSHEET_ID=
GOOGLE_CREDIT_REPAIR_SHEET_NAME=Sheet1
```

Each spreadsheet is merged into one lead list. If a sheet does not have an
`Offer` column, SYRUS automatically labels rows from that sheet as `Web Design`,
`Digital Products`, or `Credit Repair`.

You can also use one JSON env var instead:

```text
GOOGLE_LEAD_SHEETS_JSON=[{"offer":"Web Design","spreadsheetId":"...","sheetName":"Sheet1"},{"offer":"Digital Products","spreadsheetId":"...","sheetName":"Sheet1"},{"offer":"Credit Repair","spreadsheetId":"...","sheetName":"Sheet1"}]
```

Required Railway variables for Gmail sending:

```text
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
```

AI and voice variables:

```text
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-6
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1
AI_PROVIDER=anthropic
VAPI_API_KEY=
VAPI_PUBLIC_KEY=
VAPI_ASSISTANT_ID=
```

After Railway is deployed, set this for the macOS app:

```text
NEXUS_LUMA_API_BASE_URL=https://your-syrus-api.up.railway.app
```

## Local Development

Install dependencies:

```bash
pnpm install
```

Run the macOS app:

```bash
NEXUS_LUMA_ENABLE_SIMULATED_USB_KEY=true pnpm --filter syrus electron:dev
```

Run the Railway API locally:

```bash
pnpm --filter syrus-api start
```

Demo unlock PIN for local development:

```text
0000
```

## Validation

```bash
pnpm --filter syrus typecheck
pnpm --filter syrus build
pnpm --filter syrus-api typecheck
```

Package the Mac app:

```bash
pnpm --filter syrus dist:mac
```

## Security Boundaries

- Admin SYRUS voice can access command-center data.
- Customer text assistant cannot access admin data, revenue, notes, app status, credentials, or internal prompts.
- API keys and Google service account credentials belong on Railway.
- Desktop production builds should use `NEXUS_LUMA_API_BASE_URL` instead of local secrets.
