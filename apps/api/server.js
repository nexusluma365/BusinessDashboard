import http from "node:http";
import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { google } from "googleapis";

const port = Number(process.env.PORT || 8080);
const dataDir = process.env.DATA_DIR || "/tmp/syrus-data";
const webhookLeadsFile = path.join(dataDir, "webhook-leads.json");
const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

const headerAliases = {
  firstName: ["first name", "firstname", "first"],
  lastName: ["last name", "lastname", "last"],
  fullName: ["name", "full name", "customer name", "lead name"],
  email: ["email", "email address", "lead email"],
  phone: ["phone", "phone number", "mobile"],
  businessName: ["business name", "business", "company"],
  website: ["website", "site", "url", "page url", "last page"],
  offer: ["offer"],
  product: ["product", "product purchased", "product viewed", "product name", "download product"],
  source: ["source", "lead source", "traffic source"],
  campaign: ["campaign", "google ads campaign", "utm campaign", "utm_campaign"],
  utmSource: ["utm source", "utm_source"],
  utmMedium: ["utm medium", "utm_medium"],
  submittedAt: ["submitted at", "submission date", "date", "created", "created at", "first seen", "timestamp"],
  paymentAmount: ["payment amount", "amount", "price", "order total"],
  paymentStatus: ["payment status", "order status", "payment successful at"],
  status: ["status", "lead status", "pipeline status", "current status", "event type", "last event"],
  notes: ["notes", "note", "internal notes"],
};
const purchasedAliases = ["purchased", "customer", "has purchased", "paid", "payment successful at"];
const truthy = new Set(["yes", "y", "true", "1", "paid", "customer", "purchased", "completed", "won"]);
const paidSignals = ["paid", "purchased", "succeeded", "success", "completed", "complete", "payment_successful"];

http
  .createServer(async (req, res) => {
    if (req.method === "OPTIONS") return send(res, 204, null);

    try {
      const url = new URL(req.url || "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true, service: "syrus-api" });
      if (req.method === "GET" && url.pathname === "/api/google/status") return send(res, 200, googleStatus());
      if (req.method === "GET" && url.pathname === "/api/leads") return send(res, 200, await listLeads());
      if (req.method === "GET" && url.pathname === "/api/ai/providers") return send(res, 200, availableProviders());
      if (req.method === "GET" && url.pathname === "/api/syrus/live-updates") return send(res, 200, await liveUpdates());
      if (req.method === "GET" && url.pathname === "/api/syrus/voice-status") return send(res, 200, voiceStatus());

      if (req.method === "POST" && url.pathname === "/api/syrus/ask") return send(res, 200, await askSyrus(await readBody(req)));
      if (req.method === "POST" && url.pathname === "/api/lead-assistant/reply") return send(res, 200, await replyToLead(await readBody(req)));
      if (req.method === "POST" && url.pathname === "/api/email/send") return send(res, 200, await sendEmail(await readBody(req)));
      if (req.method === "POST" && url.pathname === "/api/leads/ingest") return send(res, 200, await ingestLead(req, await readBody(req)));

      return send(res, 404, { error: "Not found" });
    } catch (error) {
      return send(res, 500, { error: error instanceof Error ? error.message : "Server error" });
    }
  })
  .listen(port, () => {
    console.log(`SYRUS API listening on ${port}`);
  });

function googleStatus() {
  const configs = leadSheetConfigs();
  const methods = googleReadMethods();
  return {
    configured: Boolean(configs.length),
    connected: Boolean(configs.length && methods.length),
    methods: methods.map((method) => method.name),
    sheets: configs.map((sheet) => ({ offer: sheet.offer, spreadsheetId: sheet.spreadsheetId, sheetName: sheet.sheetName })),
  };
}

async function listLeads() {
  const webhookLeads = await readWebhookLeads();
  const configs = leadSheetConfigs();
  if (!configs.length) {
    return { source: webhookLeads.length ? "webhook" : "not_configured", leads: webhookLeads, columnsMissing: [] };
  }

  const methods = googleReadMethods();
  const results = await Promise.allSettled(configs.map((config, index) => listOneSheetWithFallback(config, index, methods)));
  const fulfilled = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
  const sheetErrors = results.flatMap((result, index) =>
    result.status === "rejected"
      ? [
          {
            offer: configs[index].offer,
            spreadsheetId: configs[index].spreadsheetId,
            sheetName: configs[index].sheetName,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          },
        ]
      : []
  );
  const sheetLeads = fulfilled.flatMap((result) => result.leads);
  const leads = mergeLeads([...webhookLeads, ...sheetLeads]);
  const columnsFound = Array.from(new Set(fulfilled.flatMap((result) => result.columnsFound)));
  const columnsMissing = Object.keys(headerAliases).filter((key) => !columnsFound.includes(key));
  const scanSources = Array.from(new Set(fulfilled.map((result) => result.source)));
  return {
    source: webhookLeads.length ? "webhook_google_sheets" : "google_sheets",
    leads,
    columnsFound,
    columnsMissing,
    sheetErrors,
    scanSources,
    sheetResults: fulfilled.map((result) => ({
      offer: result.offer,
      sheetName: result.sheetName,
      spreadsheetId: result.spreadsheetId,
      source: result.source,
      rows: result.rows,
      leads: result.leads.length,
    })),
  };
}

async function ingestLead(req, body) {
  const expectedToken = process.env.LEAD_INGEST_TOKEN;
  const providedToken = req.headers["x-syrus-ingest-token"] || body.ingestToken;
  if (expectedToken && providedToken !== expectedToken) {
    return { success: false, error: "Unauthorized lead ingest request." };
  }
  if (!expectedToken && process.env.NODE_ENV === "production") {
    return { success: false, error: "Lead ingest token is Not Available yet. Set LEAD_INGEST_TOKEN in Railway." };
  }

  const incoming = Array.isArray(body.leads) ? body.leads : [body.lead || body.row || body];
  const leads = incoming.map((item, index) => mapWebhookLead(item, body, index)).filter((lead) => lead.email || lead.phone || lead.fullName);
  if (!leads.length) return { success: false, error: "No usable lead data was received." };

  const saved = mergeLeads([...(await readWebhookLeads()), ...leads]);
  await writeWebhookLeads(saved);
  return { success: true, received: leads.length, stored: saved.length };
}

function mapWebhookLead(item, body, index) {
  const source = item && typeof item === "object" ? item : {};
  const raw = source.raw && typeof source.raw === "object" ? source.raw : source;
  const headerRow = Object.keys(raw);
  const row = headerRow.map((header) => raw[header]);
  const columnIndex = buildColumnIndex(headerRow);
  const config = {
    offer: source.offer || body.offer || "Not Available yet",
    spreadsheetId: source.spreadsheetId || body.spreadsheetId || "",
    sheetName: source.sheetName || body.sheetName || "",
  };
  const lead = mapLead(headerRow, row, columnIndex, index, config, 900 + index);
  const fallbackName = String(source.name || source.fullName || rawValue(raw, ["name", "full name", "customer name", "lead name"])).trim();
  const [fallbackFirst, ...fallbackLast] = fallbackName.split(/\s+/);
  return {
    ...lead,
    id: stableLeadId(source, lead),
    rowNumber: Number(source.rowNumber || source.sourceRowNumber || Date.now() + index),
    sourceRowNumber: Number(source.sourceRowNumber || source.rowNumber || 0),
    firstName: source.firstName || lead.firstName || fallbackFirst || "",
    lastName: source.lastName || lead.lastName || fallbackLast.join(" "),
    fullName: source.fullName || lead.fullName || fallbackName || [source.firstName || lead.firstName || fallbackFirst, source.lastName || lead.lastName || fallbackLast.join(" ")].filter(Boolean).join(" "),
    email: source.email || lead.email || rawValue(raw, ["email", "email address"]) || "",
    phone: source.phone || lead.phone || rawValue(raw, ["phone", "phone number", "mobile"]) || "",
    businessName: source.businessName || lead.businessName || "",
    website: source.website || lead.website || rawValue(raw, ["website", "site", "url", "page url"]) || "",
    offer: source.offer || lead.offer || body.offer || "Not Available yet",
    product: source.product || lead.product || "",
    source: source.source || lead.source || "Google Apps Script",
    campaign: source.campaign || lead.campaign || "",
    utmSource: source.utmSource || lead.utmSource || "",
    utmMedium: source.utmMedium || lead.utmMedium || "",
    submittedAt: source.submittedAt || source.createdAt || lead.submittedAt || new Date().toISOString(),
    purchased: Boolean(source.purchased) || lead.purchased,
    paymentAmount: source.paymentAmount || lead.paymentAmount || "",
    paymentStatus: source.paymentStatus || lead.paymentStatus || "",
    status: source.status || lead.status || source.currentStatus || rawValue(raw, ["current status", "status", "lead status"]) || "New",
    notes: source.notes || lead.notes || "",
    sheetOffer: source.sheetOffer || body.offer || lead.sheetOffer,
    sheetName: source.sheetName || body.sheetName || lead.sheetName,
    spreadsheetId: source.spreadsheetId || body.spreadsheetId || lead.spreadsheetId,
    raw,
  };
}

function rawValue(raw, aliases) {
  const normalizedAliases = aliases.map(normalizeHeader);
  const key = Object.keys(raw).find((candidate) => normalizedAliases.includes(normalizeHeader(candidate)));
  return key ? String(raw[key] || "").trim() : "";
}

function stableLeadId(source, lead) {
  const key = [source.id, source.sessionId, lead.email, lead.phone, lead.submittedAt, lead.offer].filter(Boolean).join("|");
  return crypto.createHash("sha256").update(key || JSON.stringify(source)).digest("hex").slice(0, 16);
}

function mergeLeads(leads) {
  const merged = new Map();
  for (const lead of leads) {
    const key = lead.id || stableLeadId(lead.raw || {}, lead);
    merged.set(key, { ...lead, id: key });
  }
  return Array.from(merged.values()).sort((a, b) => String(a.submittedAt || "").localeCompare(String(b.submittedAt || "")));
}

async function readWebhookLeads() {
  try {
    return JSON.parse(await readFile(webhookLeadsFile, "utf8"));
  } catch {
    return [];
  }
}

async function writeWebhookLeads(leads) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(webhookLeadsFile, JSON.stringify(leads.slice(-5000), null, 2));
}

function googleReadMethods() {
  const methods = [];

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    methods.push({
      name: "service_account",
      read: async (config, sheetIndex) => {
        const auth = google.auth.fromJSON(JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON));
        auth.scopes = ["https://www.googleapis.com/auth/spreadsheets.readonly"];
        const sheets = google.sheets({ version: "v4", auth });
        return listOneSheet(sheets, config, sheetIndex, "service_account");
      },
    });
  }

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) {
    methods.push({
      name: "owner_oauth",
      read: async (config, sheetIndex) => {
        const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
        auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
        const sheets = google.sheets({ version: "v4", auth });
        return listOneSheet(sheets, config, sheetIndex, "owner_oauth");
      },
    });
  }

  methods.push({ name: "public_csv", read: listOneSheetPublicCsv });
  return methods;
}

async function listOneSheetWithFallback(config, sheetIndex, methods) {
  const errors = [];
  for (const method of methods) {
    try {
      return await method.read(config, sheetIndex);
    } catch (error) {
      errors.push(`${method.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(errors.join(" | ") || "No Google Sheets read method is configured.");
}

async function listOneSheet(sheets, config, sheetIndex, source = "google_sheets_api") {
  const response = await sheets.spreadsheets.values.get({ spreadsheetId: config.spreadsheetId, range: config.sheetName });
  const rows = response.data.values || [];
  return rowsToLeads(rows, config, sheetIndex, source);
}

async function listOneSheetPublicCsv(config, sheetIndex) {
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(config.spreadsheetId)}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(config.sheetName)}`;
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Public CSV read failed (${response.status}). Check link sharing or OAuth scope.`);
  }

  const csv = await response.text();
  const rows = parseCsv(csv);
  return rowsToLeads(rows, config, sheetIndex, "public_csv");
}

function rowsToLeads(rows, config, sheetIndex, source) {
  if (!rows.length) return { offer: config.offer, spreadsheetId: config.spreadsheetId, sheetName: config.sheetName, source, rows: 0, leads: [], columnsFound: [] };

  const [headerRow, ...dataRows] = rows;
  const columnIndex = buildColumnIndex(headerRow);
  const leads = dataRows
    .filter((row) => row.some((value) => String(value || "").trim()))
    .map((row, index) => mapLead(headerRow, row, columnIndex, index, config, sheetIndex));

  const columnsFound = Object.keys(columnIndex);
  return { offer: config.offer, spreadsheetId: config.spreadsheetId, sheetName: config.sheetName, source, rows: dataRows.length, leads, columnsFound };
}

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cellValue) => String(cellValue || "").trim())) rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  row.push(value);
  if (row.some((cellValue) => String(cellValue || "").trim())) rows.push(row);
  return rows;
}

function buildColumnIndex(headerRow) {
  const normalized = headerRow.map(normalizeHeader);
  const index = {};
  for (const [field, aliases] of Object.entries(headerAliases)) {
    const foundAt = normalized.findIndex((header) => aliases.includes(header));
    if (foundAt !== -1) index[field] = foundAt;
  }
  const purchasedAt = normalized.findIndex((header) => purchasedAliases.includes(header));
  if (purchasedAt !== -1) index.purchased = purchasedAt;
  return index;
}

function mapLead(headerRow, row, columnIndex, index, config, sheetIndex) {
  const raw = {};
  headerRow.forEach((header, cellIndex) => {
    raw[header] = cell(row, cellIndex);
  });
  const sheetName = cell(row, columnIndex.fullName);
  const [fallbackFirst, ...fallbackLast] = sheetName.split(/\s+/).filter(Boolean);
  const firstName = cell(row, columnIndex.firstName) || fallbackFirst || "";
  const lastName = cell(row, columnIndex.lastName) || fallbackLast.join(" ");
  const paymentStatus = cell(row, columnIndex.paymentStatus).toLowerCase();
  const purchasedRaw = cell(row, columnIndex.purchased).toLowerCase();
  const status = cell(row, columnIndex.status);
  const sourceRowNumber = index + 2;
  const purchased = isPaidSignal(paymentStatus) || isPaidSignal(purchasedRaw) || isPaidSignal(status);
  return {
    rowNumber: sheetIndex * 100_000 + sourceRowNumber,
    sourceRowNumber,
    firstName,
    lastName,
    fullName: sheetName || [firstName, lastName].filter(Boolean).join(" "),
    email: cell(row, columnIndex.email),
    phone: cell(row, columnIndex.phone),
    businessName: cell(row, columnIndex.businessName),
    website: cell(row, columnIndex.website),
    offer: cell(row, columnIndex.offer) || config.offer,
    product: cell(row, columnIndex.product),
    source: cell(row, columnIndex.source),
    campaign: cell(row, columnIndex.campaign),
    utmSource: cell(row, columnIndex.utmSource),
    utmMedium: cell(row, columnIndex.utmMedium),
    submittedAt: cell(row, columnIndex.submittedAt),
    purchased,
    paymentAmount: cell(row, columnIndex.paymentAmount),
    paymentStatus: cell(row, columnIndex.paymentStatus),
    status,
    notes: cell(row, columnIndex.notes),
    sheetOffer: config.offer,
    sheetName: config.sheetName,
    spreadsheetId: config.spreadsheetId,
    raw,
  };
}

function isPaidSignal(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || ["no", "false", "0", "unpaid", "failed", "abandoned"].includes(normalized)) return false;
  if (truthy.has(normalized) || paidSignals.includes(normalized)) return true;
  return /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|paid|purchase|success|complete/.test(normalized);
}

function leadSheetConfigs() {
  if (process.env.GOOGLE_LEAD_SHEETS_JSON) {
    return JSON.parse(process.env.GOOGLE_LEAD_SHEETS_JSON)
      .filter((sheet) => sheet.spreadsheetId)
      .map((sheet) => ({
        offer: sheet.offer,
        spreadsheetId: String(sheet.spreadsheetId).trim(),
        sheetName: String(sheet.sheetName || "Sheet1").trim(),
      }));
  }

  const configs = [
    { offer: "Web Design", spreadsheetId: process.env.GOOGLE_WEB_DESIGN_SPREADSHEET_ID, sheetName: process.env.GOOGLE_WEB_DESIGN_SHEET_NAME },
    { offer: "Digital Products", spreadsheetId: process.env.GOOGLE_DIGITAL_PRODUCTS_SPREADSHEET_ID, sheetName: process.env.GOOGLE_DIGITAL_PRODUCTS_SHEET_NAME },
    { offer: "Credit Repair", spreadsheetId: process.env.GOOGLE_CREDIT_REPAIR_SPREADSHEET_ID, sheetName: process.env.GOOGLE_CREDIT_REPAIR_SHEET_NAME },
    { offer: "Web Design", spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID, sheetName: process.env.GOOGLE_SHEET_NAME },
  ];

  return configs
    .filter((sheet) => sheet.spreadsheetId)
    .map((sheet) => ({
      offer: sheet.offer,
      spreadsheetId: String(sheet.spreadsheetId).trim(),
      sheetName: String(sheet.sheetName || "Sheet1").trim(),
    }));
}

async function liveUpdates() {
  const result = await listLeads();
  const leads = result.leads || [];
  if (!leads.length) {
    return {
      source: result.source,
      updates: [
        { label: "Lead data", value: "Not Available yet", tone: "warning" },
        { label: "AI providers", value: availableProviders().length ? "Ready" : "Not configured", tone: availableProviders().length ? "success" : "warning" },
      ],
      prompts: ["Open Leads", "Open Email Studio"],
    };
  }
  const needsReply = leads.filter((lead) => /await|human|follow|new/i.test(lead.status));
  const purchased = leads.filter((lead) => lead.purchased);
  return {
    source: result.source,
    updates: [
      { label: "Total leads", value: String(leads.length), tone: "info" },
      { label: "Need attention", value: String(needsReply.length), tone: needsReply.length ? "warning" : "success" },
      { label: "Purchased", value: String(purchased.length), tone: "success" },
      { label: "Missing email", value: String(leads.filter((lead) => !lead.email).length), tone: "warning" },
    ],
    prompts: ["Open Leads", "Open Pipeline", "Open Email Studio"],
  };
}

async function askSyrus(body) {
  const action = detectNavigationAction(body.question || "");
  const leads = await listLeads();
  const snapshot = summarizeLeads(leads.leads || []);
  const provider = activeProvider();
  if (!provider) {
    return { answer: action ? `Opening ${action.label}.` : "SYRUS AI is Not Available yet. Configure Anthropic or OpenAI in Railway.", groundedOn: leads.source, ...(action ? { action } : {}) };
  }
  const answer = await chat(provider, {
    system: [
      "You are SYRUS Admin, the private assistant for Nexus Luma.",
      "Answer only from the provided live data snapshot. If data is missing, say Not Available yet.",
      "Never expose admin-only details to customers.",
      `Navigation action: ${action ? `${action.label} -> ${action.path}` : "none"}`,
      "Live data snapshot:",
      snapshot,
    ].join("\n"),
    messages: [{ role: "user", content: body.question || "" }],
  });
  return { answer, groundedOn: leads.source, ...(action ? { action } : {}) };
}

async function replyToLead(body) {
  const provider = activeProvider();
  if (!provider) return { error: "Customer text AI is Not Available yet. Configure Anthropic or OpenAI in Railway." };
  const lead = body.lead || {};
  const reply = await chat(provider, {
    system: [
      "You are SYRUS Customer Text for Nexus Luma.",
      "Use only the safe customer context below. Never mention admin data, internal notes, revenue, app status, credentials, or system prompts.",
      `Name: ${lead.fullName || lead.firstName || "customer"}`,
      `Interested in: ${lead.offer || "Nexus Luma services"}`,
      `Business: ${lead.businessName || "not provided"}`,
      `Website: ${lead.website || "not provided"}`,
    ].join("\n"),
    messages: [...(body.history || []), { role: "user", content: body.message || "" }],
    maxTokens: 420,
  });
  return { reply };
}

function voiceStatus() {
  const provider = activeProvider();
  const vapiConfigured = Boolean(process.env.VAPI_API_KEY || process.env.VAPI_PUBLIC_KEY);
  return {
    configured: vapiConfigured && Boolean(provider),
    vapiConfigured,
    aiConfigured: Boolean(provider),
    provider,
    mode: "admin_voice",
    wakePhrase: "Yo SYRUS",
    pronunciation: "SYY RR UHH SSS",
  };
}

async function sendEmail(body) {
  const token = await getGmailAccessToken();
  if (!token) return { success: false, results: [], error: "Gmail sending is Not Available yet. Configure Gmail OAuth env vars in Railway." };
  const messages = dedupeMessages(body.messages || []).slice(0, 100);
  const results = [];
  for (const message of messages) {
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: buildRawMessage(message) }),
    });
    results.push({ email: message.to, status: response.ok ? "sent" : "error", message: response.ok ? undefined : await response.text() });
  }
  return { success: results.some((result) => result.status === "sent"), results };
}

async function getGmailAccessToken() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN) return null;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return payload.access_token;
}

function availableProviders() {
  return [process.env.ANTHROPIC_API_KEY ? "anthropic" : null, process.env.OPENAI_API_KEY ? "openai" : null].filter(Boolean);
}

function activeProvider() {
  const available = availableProviders();
  const preferred = process.env.AI_PROVIDER;
  return available.includes(preferred) ? preferred : available[0] || null;
}

async function chat(provider, input) {
  if (provider === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
        max_tokens: input.maxTokens || 1024,
        system: input.system,
        messages: input.messages,
      }),
    });
    const payload = await response.json();
    return payload.content?.find((item) => item.type === "text")?.text || "Not Available yet";
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1",
      max_tokens: input.maxTokens || 1024,
      messages: [{ role: "system", content: input.system }, ...input.messages],
    }),
  });
  const payload = await response.json();
  return payload.choices?.[0]?.message?.content || "Not Available yet";
}

function summarizeLeads(leads) {
  if (!leads.length) return "Not Available yet. No live leads were returned.";
  const purchased = leads.filter((lead) => lead.purchased);
  return [
    `Total leads: ${leads.length}`,
    `Converted customers: ${purchased.length}`,
    "Recent leads:",
    ...leads.slice(-20).reverse().map((lead) => `- ${lead.fullName || "Not Available yet"} | ${lead.offer || "Not Available yet"} | ${lead.email || "Not Available yet"} | purchased: ${lead.purchased ? "yes" : "no"}`),
  ].join("\n");
}

function detectNavigationAction(question) {
  const normalized = question.toLowerCase();
  if (!/\b(open|go to|show|take me to|pull up|navigate)\b/.test(normalized)) return null;
  const routes = [
    { label: "Dashboard", path: "/", keywords: ["dashboard", "home", "overview"] },
    { label: "Leads", path: "/leads", keywords: ["leads", "lead list", "orders", "order list"] },
    { label: "Pipeline", path: "/pipeline", keywords: ["pipeline", "customers"] },
    { label: "Conversations", path: "/conversations", keywords: ["conversation", "conversations", "texts", "messages", "sms"] },
    { label: "Email Studio", path: "/email-studio", keywords: ["email", "email studio", "email template", "templates"] },
    { label: "Notifications", path: "/notifications", keywords: ["notifications", "alerts", "updates"] },
  ];
  const route = routes.find((item) => item.keywords.some((keyword) => normalized.includes(keyword)));
  return route ? { type: "navigate", path: route.path, label: route.label } : null;
}

function dedupeMessages(messages) {
  const seen = new Set();
  return messages.filter((message) => {
    const email = String(message.to || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seen.has(email)) return false;
    seen.add(email);
    return true;
  });
}

function buildRawMessage(message) {
  const lines = [
    `To: ${sanitizeHeaderLine(message.to)}`,
    `Subject: ${encodeHeaderValue(message.subject || "Nexus Luma")}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(message.html || "", "utf-8").toString("base64"),
  ];
  return Buffer.from(lines.join("\r\n")).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function send(res, status, payload) {
  res.writeHead(status, jsonHeaders);
  res.end(payload === null ? "" : JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) reject(new Error("Request body too large."));
    });
    req.on("end", () => resolve(body ? JSON.parse(body) : {}));
    req.on("error", reject);
  });
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ");
}

function cell(row, index) {
  if (index === undefined) return "";
  return String(row[index] || "").trim();
}

function sanitizeHeaderLine(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function encodeHeaderValue(value) {
  const sanitized = sanitizeHeaderLine(value);
  if (/^[\x20-\x7E]*$/.test(sanitized)) return sanitized;
  return `=?UTF-8?B?${Buffer.from(sanitized, "utf8").toString("base64")}?=`;
}
