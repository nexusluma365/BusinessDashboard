import type { SheetLead } from "@/lib/bridge";

export function leadId(lead: SheetLead) {
  return [
    lead.spreadsheetId || "source",
    lead.sheetName || "sheet",
    lead.sourceRowNumber || lead.rowNumber,
    lead.email || lead.phone || lead.fullName || "lead",
  ]
    .map((part) => encodeURIComponent(String(part)))
    .join(":");
}

export function findLeadById(leads: SheetLead[], id: string | null | undefined) {
  if (!id) return null;
  const decoded = decodeURIComponent(id);
  return leads.find((lead) => leadId(lead) === id || leadId(lead) === decoded) ?? null;
}

export function parseLeadIds(value: string | null) {
  return (value || "")
    .split(",")
    .map((id) => id.trim())
    .filter((id, index, ids) => id && ids.indexOf(id) === index);
}
