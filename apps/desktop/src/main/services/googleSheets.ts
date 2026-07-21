import { google } from "googleapis";
import { getAuthorizedClient } from "./googleAuth";
import { readSettings, type LeadSheetConfig } from "./localStore";

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
  sheetOffer: string;
  sheetName: string;
  spreadsheetId: string;
  sourceRowNumber: number;
  raw: Record<string, string>;
};

/**
 * Maps a sheet's header row to lead fields. Matching is case-insensitive
 * and tolerant of spacing/punctuation, so "First Name", "first_name", and
 * "FirstName" all resolve the same way. Users don't need to rename their
 * existing columns to match this app.
 */
const HEADER_ALIASES: Record<keyof Omit<SheetLead, "rowNumber" | "fullName" | "purchased" | "raw" | "sheetOffer" | "sheetName" | "spreadsheetId" | "sourceRowNumber"> | "fullName", string[]> = {
  firstName: ["first name", "firstname", "first"],
  lastName: ["last name", "lastname", "last"],
  fullName: ["name", "full name", "customer name", "lead name"],
  email: ["email", "email address", "lead email"],
  phone: ["phone", "phone number", "mobile", "lead phone"],
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

const PURCHASED_ALIASES = ["purchased", "customer", "has purchased", "paid", "payment successful at"];
const TRUTHY = new Set(["yes", "y", "true", "1", "paid", "customer", "purchased", "completed", "won"]);
const PAID_SIGNALS = ["paid", "purchased", "succeeded", "success", "completed", "complete", "payment_successful"];

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

function isPaidSignal(value: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || ["no", "false", "0", "unpaid", "failed", "abandoned"].includes(normalized)) return false;
  if (TRUTHY.has(normalized) || PAID_SIGNALS.includes(normalized)) return true;
  return /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|paid|purchase|success|complete/.test(normalized);
}

export async function fetchLeadsFromSheet(): Promise<{
  source: "google_sheets";
  leads: SheetLead[];
  columnsFound: string[];
  columnsMissing: string[];
  sheetErrors: SheetError[];
}> {
  const client = await getAuthorizedClient();
  if (!client) throw new Error("Google account not connected.");

  const settings = readSettings();
  const configuredSheets = normalizeLeadSheets(settings.googleLeadSheets, settings.googleSpreadsheetId, settings.googleSheetName);
  if (!configuredSheets.length) throw new Error("No lead spreadsheets configured yet.");

  const sheets = google.sheets({ version: "v4", auth: client });

  const results = await Promise.allSettled(configuredSheets.map((sheet, sheetIndex) => fetchOneSheet(sheets, sheet, sheetIndex)));
  const fulfilled = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
  const sheetErrors = results.flatMap((result, index) =>
    result.status === "rejected"
      ? [
          {
            offer: configuredSheets[index].offer,
            spreadsheetId: configuredSheets[index].spreadsheetId,
            sheetName: configuredSheets[index].sheetName || "Sheet1",
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          },
        ]
      : []
  );
  const leads = fulfilled.flatMap((result) => result.leads);
  const columnsFound = Array.from(new Set(fulfilled.flatMap((result) => result.columnsFound)));
  const columnsMissing = Object.keys(HEADER_ALIASES).filter((k) => !columnsFound.includes(k));

  return { source: "google_sheets", leads, columnsFound, columnsMissing, sheetErrors };
}

export type SheetError = {
  offer: string;
  spreadsheetId: string;
  sheetName: string;
  error: string;
};

async function fetchOneSheet(
  sheets: ReturnType<typeof google.sheets>,
  config: LeadSheetConfig,
  sheetIndex: number
) {
  const range = `${config.sheetName || "Sheet1"}`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range,
  });

  const rows = res.data.values ?? [];
  if (rows.length === 0) return { leads: [] as SheetLead[], columnsFound: [] };

  const [headerRow, ...dataRows] = rows;
  const columnIndex = buildColumnIndex(headerRow as string[]);

  const leads: SheetLead[] = dataRows
    .filter((row) => row.some((v) => String(v ?? "").trim() !== ""))
    .map((row, i) => {
      const sourceRowNumber = i + 2;
      const raw: Record<string, string> = {};
      (headerRow as string[]).forEach((h, idx) => (raw[h] = cell(row as string[], idx)));

      const sheetName = cell(row as string[], columnIndex.fullName);
      const [fallbackFirst, ...fallbackLast] = sheetName.split(/\s+/).filter(Boolean);
      const firstName = cell(row as string[], columnIndex.firstName) || fallbackFirst || "";
      const lastName = cell(row as string[], columnIndex.lastName) || fallbackLast.join(" ");
      const purchasedRaw = cell(row as string[], columnIndex.purchased).toLowerCase();
      const paymentStatus = cell(row as string[], columnIndex.paymentStatus).toLowerCase();
      const offer = cell(row as string[], columnIndex.offer) || config.offer;
      const status = cell(row as string[], columnIndex.status);

      return {
        rowNumber: sheetIndex * 100_000 + sourceRowNumber,
        sourceRowNumber,
        firstName,
        lastName,
        fullName: sheetName || [firstName, lastName].filter(Boolean).join(" "),
        email: cell(row as string[], columnIndex.email),
        phone: cell(row as string[], columnIndex.phone),
        businessName: cell(row as string[], columnIndex.businessName),
        website: cell(row as string[], columnIndex.website),
        offer,
        product: cell(row as string[], columnIndex.product),
        source: cell(row as string[], columnIndex.source),
        campaign: cell(row as string[], columnIndex.campaign),
        utmSource: cell(row as string[], columnIndex.utmSource),
        utmMedium: cell(row as string[], columnIndex.utmMedium),
        submittedAt: cell(row as string[], columnIndex.submittedAt),
        purchased: isPaidSignal(purchasedRaw) || isPaidSignal(paymentStatus) || isPaidSignal(status),
        paymentAmount: cell(row as string[], columnIndex.paymentAmount),
        paymentStatus: cell(row as string[], columnIndex.paymentStatus),
        status,
        notes: cell(row as string[], columnIndex.notes),
        sheetOffer: config.offer,
        sheetName: config.sheetName || "Sheet1",
        spreadsheetId: config.spreadsheetId,
        raw,
      };
    });

  return { leads, columnsFound: Object.keys(columnIndex) };
}

export function normalizeLeadSheets(
  googleLeadSheets: LeadSheetConfig[] | undefined,
  legacySpreadsheetId?: string,
  legacySheetName?: string
) {
  const configured = (googleLeadSheets ?? []).filter((sheet) => sheet.spreadsheetId.trim());
  if (configured.length) {
    return configured.map((sheet) => ({
      ...sheet,
      spreadsheetId: sheet.spreadsheetId.trim(),
      sheetName: sheet.sheetName?.trim() || "Sheet1",
    }));
  }
  return legacySpreadsheetId?.trim()
    ? [{ offer: "Web Design" as const, spreadsheetId: legacySpreadsheetId.trim(), sheetName: legacySheetName?.trim() || "Sheet1" }]
    : [];
}
