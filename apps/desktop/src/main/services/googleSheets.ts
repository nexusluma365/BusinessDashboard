import { google } from "googleapis";
import { getAuthorizedClient } from "./googleAuth";
import { readSettings } from "./localStore";

export type SheetLead = {
  rowNumber: number;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  businessName: string;
  website: string;
  offer: string;
  product: string;
  source: string;
  campaign: string;
  utmSource: string;
  utmMedium: string;
  submittedAt: string;
  purchased: boolean;
  paymentAmount: string;
  paymentStatus: string;
  status: string;
  notes: string;
  raw: Record<string, string>;
};

/**
 * Maps a sheet's header row to lead fields. Matching is case-insensitive
 * and tolerant of spacing/punctuation, so "First Name", "first_name", and
 * "FirstName" all resolve the same way. Users don't need to rename their
 * existing columns to match this app.
 */
const HEADER_ALIASES: Record<keyof Omit<SheetLead, "rowNumber" | "fullName" | "purchased" | "raw">, string[]> = {
  firstName: ["first name", "firstname", "first"],
  lastName: ["last name", "lastname", "last"],
  email: ["email", "email address"],
  phone: ["phone", "phone number", "mobile"],
  businessName: ["business name", "business", "company"],
  website: ["website", "site", "url"],
  offer: ["offer"],
  product: ["product", "product purchased", "product viewed"],
  source: ["source", "lead source", "traffic source"],
  campaign: ["campaign", "google ads campaign"],
  utmSource: ["utm source", "utm_source"],
  utmMedium: ["utm medium", "utm_medium"],
  submittedAt: ["submitted at", "submission date", "date", "created", "timestamp"],
  paymentAmount: ["payment amount", "amount", "price", "order total"],
  paymentStatus: ["payment status", "order status"],
  status: ["status", "lead status", "pipeline status"],
  notes: ["notes", "note", "internal notes"],
};

const PURCHASED_ALIASES = ["purchased", "customer", "has purchased", "paid"];
const TRUTHY = new Set(["yes", "y", "true", "1", "paid", "customer", "purchased", "completed", "won"]);

function normalizeHeader(h: string) {
  return h.trim().toLowerCase().replace(/[_\-]/g, " ").replace(/\s+/g, " ");
}

function buildColumnIndex(headerRow: string[]) {
  const normalized = headerRow.map(normalizeHeader);
  const index: Partial<Record<string, number>> = {};

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const foundAt = normalized.findIndex((h) => aliases.includes(h));
    if (foundAt !== -1) index[field] = foundAt;
  }

  const purchasedAt = normalized.findIndex((h) => PURCHASED_ALIASES.includes(h));
  if (purchasedAt !== -1) index["purchased"] = purchasedAt;

  return index;
}

function cell(row: string[], index: number | undefined) {
  if (index === undefined) return "";
  return (row[index] ?? "").trim();
}

export async function fetchLeadsFromSheet(): Promise<{
  source: "google_sheets";
  leads: SheetLead[];
  columnsFound: string[];
  columnsMissing: string[];
}> {
  const client = await getAuthorizedClient();
  if (!client) throw new Error("Google account not connected.");

  const settings = readSettings();
  if (!settings.googleSpreadsheetId) throw new Error("No spreadsheet configured yet.");

  const sheets = google.sheets({ version: "v4", auth: client });
  const range = `${settings.googleSheetName ?? "Sheet1"}`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: settings.googleSpreadsheetId,
    range,
  });

  const rows = res.data.values ?? [];
  if (rows.length === 0) return { source: "google_sheets", leads: [], columnsFound: [], columnsMissing: Object.keys(HEADER_ALIASES) };

  const [headerRow, ...dataRows] = rows;
  const columnIndex = buildColumnIndex(headerRow as string[]);

  const leads: SheetLead[] = dataRows
    .filter((row) => row.some((v) => String(v ?? "").trim() !== ""))
    .map((row, i) => {
      const raw: Record<string, string> = {};
      (headerRow as string[]).forEach((h, idx) => (raw[h] = cell(row as string[], idx)));

      const firstName = cell(row as string[], columnIndex.firstName);
      const lastName = cell(row as string[], columnIndex.lastName);
      const purchasedRaw = cell(row as string[], columnIndex.purchased).toLowerCase();
      const paymentStatus = cell(row as string[], columnIndex.paymentStatus).toLowerCase();

      return {
        rowNumber: i + 2, // +1 for header, +1 for 1-indexing
        firstName,
        lastName,
        fullName: [firstName, lastName].filter(Boolean).join(" "),
        email: cell(row as string[], columnIndex.email),
        phone: cell(row as string[], columnIndex.phone),
        businessName: cell(row as string[], columnIndex.businessName),
        website: cell(row as string[], columnIndex.website),
        offer: cell(row as string[], columnIndex.offer),
        product: cell(row as string[], columnIndex.product),
        source: cell(row as string[], columnIndex.source),
        campaign: cell(row as string[], columnIndex.campaign),
        utmSource: cell(row as string[], columnIndex.utmSource),
        utmMedium: cell(row as string[], columnIndex.utmMedium),
        submittedAt: cell(row as string[], columnIndex.submittedAt),
        purchased: TRUTHY.has(purchasedRaw) || TRUTHY.has(paymentStatus),
        paymentAmount: cell(row as string[], columnIndex.paymentAmount),
        paymentStatus: cell(row as string[], columnIndex.paymentStatus),
        status: cell(row as string[], columnIndex.status),
        notes: cell(row as string[], columnIndex.notes),
        raw,
      };
    });

  const columnsFound = Object.keys(columnIndex);
  const columnsMissing = Object.keys(HEADER_ALIASES).filter((k) => !columnsFound.includes(k));

  return { source: "google_sheets", leads, columnsFound, columnsMissing };
}
