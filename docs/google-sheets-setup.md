# Google Sheets setup

Nexus Luma reads leads directly from a Google Sheet you already have. In
production, the Railway API should read the sheet through a Google service
account. In local desktop development, the app can also use Google OAuth.

## 1. Create a Google Cloud OAuth client (one-time, ~5 minutes)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create
   a project (or reuse one).
2. **APIs & Services → Library** → enable Google Sheets API.
3. **APIs & Services → OAuth consent screen** → choose **External** (or
   **Internal** if you're on a Google Workspace domain) → fill in the app
   name ("Nexus Luma Command Center") and your email → add your own Google
   account as a **test user**.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   → Application type: **Desktop app** → name it anything.
5. Copy the generated **Client ID** and **Client Secret** into
   `apps/desktop/.env`:
   ```
   GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=xxxxx
   ```

No redirect URI needs to be registered — the app opens a random local port
on `127.0.0.1` for the OAuth loopback and Google's desktop-app client type
allows any loopback port automatically.

## 2. Connect your account in the app

1. Launch the app → go to **Leads**.
2. Click **Connect Google Account** → your system browser opens Google's
   consent screen → approve access → the tab confirms "connected" and you
   return to the app.
3. Paste your spreadsheet's ID (the long string in its URL, between `/d/`
   and `/edit`) and the tab name (defaults to `Sheet1`) → **Save & sync**.

The account must have at least read access to the spreadsheet — if it's
owned by someone else, have them share it with your Google account first.

## 3. Column mapping

Nexus Luma reads your sheet's **header row** and matches column names
case-insensitively — you don't need to rename anything. Recognized headers
(any of these spellings work):

| Field | Recognized headers |
|---|---|
| First name | First Name, FirstName, First |
| Last name | Last Name, LastName, Last |
| Email | Email, Email Address |
| Phone | Phone, Phone Number, Mobile |
| Business | Business Name, Business, Company |
| Website | Website, Site, URL |
| Offer | Offer |
| Product | Product, Product Purchased, Product Viewed |
| Source | Source, Lead Source, Traffic Source |
| Campaign | Campaign, Google Ads Campaign |
| UTM source/medium | UTM Source, UTM Medium |
| Submitted date | Submitted At, Submission Date, Date, Created, Timestamp |
| **Purchased** | Purchased, Customer, Has Purchased, Paid — or inferred from Payment Status |
| Payment amount | Payment Amount, Amount, Price, Order Total |
| Payment status | Payment Status, Order Status |
| Pipeline status | Status, Lead Status, Pipeline Status |
| Notes | Notes, Note, Internal Notes |

A lead is treated as **purchased** if either the "Purchased" column contains
a truthy value (`Yes`, `Y`, `True`, `1`, `Paid`) or the "Payment Status"
column contains a completed-sale value (`Paid`, `Completed`, `Won`,
`Customer`).

If a column your sheet has isn't recognized, it's still preserved in the
lead's raw data — it just won't show up as a dedicated field yet. Tell me
your actual header names and I'll extend the mapping.

## 4. Multiple offers / multiple tabs

Right now the app reads one tab. If your leads are split across tabs (one
per offer), the simplest fix on your end is a summary tab that pulls from
the others with `IMPORTRANGE`/`QUERY`, or tell me and I'll add multi-tab
support so the app reads and merges several tabs itself.
