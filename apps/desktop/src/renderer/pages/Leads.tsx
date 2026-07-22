import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Search, RefreshCw, Link2, CheckCircle2, Circle, ExternalLink, Mail, MessageSquareText, UserCheck } from "lucide-react";
import Header from "@/components/Header";
import type { LeadSheetConfig, SheetLead } from "@/lib/bridge";
import { leadId } from "@/lib/leadIdentity";

const defaultLeadSheets: LeadSheetConfig[] = [
  { offer: "Web Design", spreadsheetName: "Nexus Luma INQ", spreadsheetId: "", sheetName: "Appointment Booking" },
  { offer: "High Income Skills", spreadsheetName: "High Income Skills", spreadsheetId: "", sheetName: "Q1" },
  { offer: "Credit Repair", spreadsheetName: "The Credit Project", spreadsheetId: "", sheetName: "2026 Data" },
];
const pipelineStorageKey = "nexus-luma-customer-pipeline";
type PipelineMeta = Record<string, { isCustomer?: boolean; status: "Queue" | "Work In Process" | "Completed"; completionBy: string }>;

export default function Leads() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [offerFilter, setOfferFilter] = useState<string>("All");
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [pipelineMeta, setPipelineMeta] = useState<PipelineMeta>(() => loadPipelineMeta());
  const [leadSheetsInput, setLeadSheetsInput] = useState<LeadSheetConfig[]>(defaultLeadSheets);

  const googleStatus = useQuery({
    queryKey: ["google-status"],
    queryFn: () => window.nexusLuma.google.status(),
  });

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => window.nexusLuma.settings.get(),
  });

  useEffect(() => {
    if (!settings.data) return;
    if (settings.data.googleLeadSheets?.length) {
      setLeadSheetsInput(mergeLeadSheets(settings.data.googleLeadSheets));
      return;
    }
    if (settings.data.googleSpreadsheetId) {
      setLeadSheetsInput(
        mergeLeadSheets([{ offer: "Web Design", spreadsheetName: "Nexus Luma INQ", spreadsheetId: settings.data.googleSpreadsheetId, sheetName: settings.data.googleSheetName || "Appointment Booking" }])
      );
    }
  }, [settings.data]);

  const leadsQuery = useQuery({
    queryKey: ["leads"],
    queryFn: () => window.nexusLuma.leads.list(),
    refetchInterval: 900_000,
  });

  const leads = leadsQuery.data?.leads ?? [];
  const offers = Array.from(new Set(leads.map((l) => l.offer).filter(Boolean)));

  const filtered = leads.filter((l) => {
    const matchesOffer = offerFilter === "All" || l.offer === offerFilter;
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      l.fullName.toLowerCase().includes(q) ||
      l.email.toLowerCase().includes(q) ||
      l.businessName.toLowerCase().includes(q);
    return matchesOffer && matchesSearch;
  });
  const filteredRows = useMemo(() => new Set(filtered.map((lead) => leadId(lead))), [filtered]);
  const selectedRowSet = useMemo(() => new Set(selectedRows), [selectedRows]);
  const selectedLeads = useMemo(() => leads.filter((lead) => selectedRowSet.has(leadId(lead))), [leads, selectedRowSet]);
  const selectableFiltered = filtered.filter((lead) => lead.email || lead.phone);
  const allFilteredSelected = selectableFiltered.length > 0 && selectableFiltered.every((lead) => selectedRowSet.has(leadId(lead)));
  const selectedWithEmail = selectedLeads.filter((lead) => isEmail(lead.email));
  const selectedWithPhone = selectedLeads.filter((lead) => lead.phone.trim());

  const purchasedCount = leads.filter((l) => l.purchased).length;

  async function connectGoogle() {
    const result = await window.nexusLuma.google.connect();
    if (result.success) {
      queryClient.invalidateQueries({ queryKey: ["google-status"] });
    }
  }

  async function saveSpreadsheet() {
    await window.nexusLuma.settings.set({
      googleLeadSheets: leadSheetsInput.map((sheet) => ({
        offer: sheet.offer,
        spreadsheetName: sheet.spreadsheetName?.trim() || defaultSpreadsheetName(sheet.offer),
        spreadsheetId: sheet.spreadsheetId.trim(),
        sheetName: sheet.sheetName?.trim() || "Sheet1",
      })),
    });
    queryClient.invalidateQueries({ queryKey: ["settings"] });
    queryClient.invalidateQueries({ queryKey: ["leads"] });
  }

  const configuredLeadSheets = settings.data?.googleLeadSheets?.length
    ? settings.data.googleLeadSheets
    : settings.data?.googleSpreadsheetId
      ? [{ offer: "Web Design" as const, spreadsheetName: "Nexus Luma INQ", spreadsheetId: settings.data.googleSpreadsheetId, sheetName: settings.data.googleSheetName || "Appointment Booking" }]
      : [];
  const needsSetup =
    googleStatus.data && (!googleStatus.data.connected || configuredLeadSheets.length < defaultLeadSheets.length);

  const summaryCards = [
    { label: "New leads", value: leads.filter((l) => /new/i.test(l.status)).length, color: "bg-[#7898ef]" },
    { label: "Awaiting response", value: leads.filter((l) => /await|human|follow/i.test(l.status)).length, color: "bg-[#f5a066]" },
    { label: "Qualified leads", value: leads.filter((l) => /qualified|booked/i.test(l.status)).length, color: "bg-[#ffe58c]" },
    { label: "Purchased leads", value: purchasedCount, color: "bg-[#65e89a]" },
  ];

  return (
    <div className="premium-page flex flex-col h-full">
      <Header
        title="Leads CRM"
        subtitle={
          isLiveLeadSource(leadsQuery.data?.source)
            ? `${leads.length} leads · ${purchasedCount} purchased · synced from Google Sheets`
            : leadsQuery.data?.source === "not_configured"
              ? "Not Available yet — connect Google Sheets below to see real leads"
              : leadsQuery.data?.source === "error"
                ? `Couldn't read the sheet: ${leadsQuery.data.error}`
                : "Loading…"
        }
      />

      <div className="flex-1 overflow-y-auto px-7 pb-7 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {summaryCards.map((card) => (
            <div key={card.label} className="premium-card overflow-hidden min-h-[106px]">
              <div className={`${card.color} h-9 px-4 flex items-center text-[#151218] text-sm font-medium`}>{card.label}</div>
              <div className="px-4 py-4 flex items-end gap-4">
                <span className="text-[30px] leading-none font-semibold">{card.value}</span>
                <span className="text-[11px] text-text-muted mb-0.5">live</span>
              </div>
            </div>
          ))}
        </div>

        {needsSetup && (
          <div className="panel p-5 space-y-4 border-status-info/30">
            <div className="flex items-center gap-2 text-status-info">
              <Link2 size={16} />
              <h3 className="font-medium text-sm">Connect your Google Sheet</h3>
            </div>

            {!googleStatus.data?.configured ? (
              <p className="text-sm text-text-secondary">
                Set <code className="text-accent-gold">GOOGLE_CLIENT_ID</code> and{" "}
                <code className="text-accent-gold">GOOGLE_CLIENT_SECRET</code> in your <code>.env</code> first
                (see <code>docs/google-sheets-setup.md</code>), then restart the app.
              </p>
            ) : !googleStatus.data.connected ? (
              <div className="flex items-center gap-3">
                <p className="text-sm text-text-secondary flex-1">
                  Sign in with the Google account that owns your leads spreadsheet.
                </p>
                <button
                  onClick={connectGoogle}
                  className="bg-accent-gold text-bg-primary text-sm font-medium rounded-lg px-4 py-2 hover:brightness-110 transition shrink-0"
                >
                  Connect Google Account
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-[150px_1fr_140px] gap-3 text-xs text-text-muted">
                  <span>Offer</span>
                  <span>Spreadsheet ID</span>
                  <span>Tab name</span>
                </div>
                {leadSheetsInput.map((sheet, index) => (
                  <div key={sheet.offer} className="grid grid-cols-1 gap-3 sm:grid-cols-[150px_1fr_140px] sm:items-center">
                    <div className="text-sm font-medium">{sheet.offer}</div>
                    <input
                      value={sheet.spreadsheetId}
                      onChange={(e) => updateLeadSheetInput(index, { spreadsheetId: e.target.value })}
                      placeholder="from the sheet's URL"
                      className="w-full bg-bg-panel border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent-gold"
                    />
                    <input
                      value={sheet.sheetName || "Sheet1"}
                      onChange={(e) => updateLeadSheetInput(index, { sheetName: e.target.value })}
                      className="w-full bg-bg-panel border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent-gold"
                    />
                  </div>
                ))}
                <button
                  onClick={saveSpreadsheet}
                  className="bg-accent-gold text-bg-primary text-sm font-medium rounded-lg px-4 py-2 hover:brightness-110 transition"
                >
                  Save all sheets & sync
                </button>
              </div>
            )}
          </div>
        )}

        {Boolean(leadsQuery.data?.sheetErrors?.length) && (
          <div className="panel border-status-warning/40 p-5">
            <div className="text-sm font-medium text-status-warning">Some lead sheets need attention</div>
            <div className="mt-3 space-y-2">
              {leadsQuery.data?.sheetErrors?.map((sheet) => (
                <div key={`${sheet.offer}-${sheet.spreadsheetId}-${sheet.sheetName}`} className="rounded-card border border-border bg-bg-panel px-3 py-2 text-xs text-text-secondary">
                  <span className="font-medium text-text-primary">{sheet.spreadsheetName || sheet.offer}</span>
                  <span className="text-text-muted"> · tab: {sheet.sheetName}</span>
                  <div className="mt-1 break-words">{sheet.error}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 premium-input rounded-card px-4 h-12 w-64">
            <Search size={14} className="text-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search leads…"
              className="bg-transparent outline-none text-sm placeholder:text-text-muted w-full"
            />
          </div>

          <select
            value={offerFilter}
            onChange={(e) => setOfferFilter(e.target.value)}
            className="premium-input rounded-card px-3 h-12 text-sm outline-none"
          >
            <option value="All">All offers</option>
            {offers.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>

          <button
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["leads"] });
              leadsQuery.refetch();
            }}
            className="flex items-center gap-2 premium-input rounded-card px-4 h-12 text-sm hover:bg-bg-panelHover transition-colors"
          >
            <RefreshCw size={14} className={leadsQuery.isFetching ? "animate-spin" : ""} />
            Refresh
          </button>

          {selectedRows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-bg-panel px-3 py-2">
              <span className="text-xs text-text-secondary">{selectedRows.length} selected</span>
              <button
                onClick={() => openEmailForRows(selectedWithEmail)}
                disabled={selectedWithEmail.length === 0}
                className="flex h-8 items-center gap-1.5 rounded-lg bg-accent-gold px-3 text-xs font-semibold text-white shadow-glow transition hover:opacity-95 disabled:cursor-not-allowed disabled:bg-bg-panelHover disabled:text-text-muted disabled:shadow-none"
              >
                <Mail size={13} /> Email selected
              </button>
              <button
                onClick={() => openTextForLead(selectedWithPhone[0])}
                disabled={selectedWithPhone.length === 0}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-bg-secondary px-3 text-xs font-medium text-text-secondary transition hover:bg-bg-panelHover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-45"
              >
                <MessageSquareText size={13} /> Text first phone
              </button>
              <button onClick={() => setSelectedRows([])} className="h-8 rounded-lg px-2 text-xs text-text-muted hover:text-text-primary">
                Clear
              </button>
            </div>
          )}

          <span className="text-xs text-text-muted ml-auto">{filtered.length} shown</span>
        </div>

        <div className="premium-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted bg-bg-panel">
                <th className="px-4 py-4 font-medium w-10">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleFilteredSelection}
                    className="accent-status-info"
                    aria-label="Select all filtered leads"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Lead</th>
                <th className="px-4 py-3 font-medium">Offer</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Purchased</th>
                <th className="px-4 py-3 font-medium">Work</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => (
                <tr key={leadId(lead)} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedRowSet.has(leadId(lead))}
                      onChange={() => toggleLead(lead)}
                      className="accent-status-info"
                      aria-label={`Select ${lead.fullName || lead.email || "lead"}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{lead.fullName || "Not Available yet"}</div>
                    <div className="text-xs text-text-muted">{lead.businessName || "Not Available yet"}</div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{lead.offer || "Not Available yet"}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    <div>{lead.email || "Not Available yet"}</div>
                    <div className="text-xs text-text-muted">{lead.phone || "Not Available yet"}</div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    <div>{lead.spreadsheetName || lead.sheetOffer || lead.offer || "Not Available yet"}</div>
                    <div className="text-xs text-text-muted">
                      {lead.sheetName || "Not Available yet"} · Row {lead.sourceRowNumber || "Not Available yet"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {lead.status ? (
                      <span className="badge bg-[#242034] text-[#ffe58c]">{lead.status}</span>
                    ) : (
                      <span className="text-text-muted text-xs">Not Available yet</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {lead.purchased ? (
                      <span className="flex items-center gap-1.5 text-accent-gold text-xs font-medium">
                        <CheckCircle2 size={14} /> Yes{lead.paymentAmount ? ` · $${lead.paymentAmount}` : ""}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-text-muted text-xs">
                        <Circle size={14} /> No
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => openEmailForLead(lead)}
                        disabled={!isEmail(lead.email)}
                        className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-bg-panel px-2.5 text-xs text-text-secondary transition hover:bg-bg-panelHover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                        title={isEmail(lead.email) ? "Email this lead" : "No email on file"}
                      >
                        <Mail size={13} /> Email
                      </button>
                      <button
                        onClick={() => openTextForLead(lead)}
                        disabled={!lead.phone.trim()}
                        className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-bg-panel px-2.5 text-xs text-text-secondary transition hover:bg-bg-panelHover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                        title={lead.phone.trim() ? "Text this lead" : "No phone on file"}
                      >
                        <MessageSquareText size={13} /> Text
                      </button>
                      <button
                        onClick={() => markAsCustomer(lead)}
                        className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition ${
                          pipelineMeta[leadId(lead)]?.isCustomer || lead.purchased
                            ? "border-status-success/30 bg-status-success/10 text-status-success"
                            : "border-border bg-bg-panel text-text-secondary hover:bg-bg-panelHover hover:text-text-primary"
                        }`}
                        title="Add this lead to the customer pipeline"
                      >
                        <UserCheck size={13} /> Customer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-text-muted text-sm">
                    {leads.length === 0 ? "Not Available yet. Connect Google Sheets to load live leads." : "No leads match your filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {isLiveLeadSource(leadsQuery.data?.source) && configuredLeadSheets.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {configuredLeadSheets.map((sheet) => (
              <a
                key={`${sheet.offer}-${sheet.spreadsheetId}`}
                href={`https://docs.google.com/spreadsheets/d/${sheet.spreadsheetId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-accent-gold transition-colors"
              >
                <ExternalLink size={12} /> Open {sheet.offer}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  function updateLeadSheetInput(index: number, patch: Partial<LeadSheetConfig>) {
    setLeadSheetsInput((current) => current.map((sheet, itemIndex) => (itemIndex === index ? { ...sheet, ...patch } : sheet)));
  }

  function toggleLead(lead: SheetLead) {
    const id = leadId(lead);
    setSelectedRows((current) =>
      current.includes(id) ? current.filter((row) => row !== id) : [...current, id]
    );
  }

  function toggleFilteredSelection() {
    const rows = selectableFiltered.map((lead) => leadId(lead));
    if (allFilteredSelected) {
      setSelectedRows((current) => current.filter((row) => !filteredRows.has(row)));
      return;
    }
    setSelectedRows((current) => Array.from(new Set([...current, ...rows])));
  }

  function openEmailForLead(lead: SheetLead) {
    if (!isEmail(lead.email)) return;
    navigate(`/email-studio?leadId=${leadId(lead)}&mode=preview`);
  }

  function openEmailForRows(rows: SheetLead[]) {
    const ids = rows.map((lead) => leadId(lead));
    if (!ids.length) return;
    navigate(`/email-studio?leadIds=${ids.join(",")}&leadId=${ids[0]}&mode=selected`);
  }

  function openTextForLead(lead?: SheetLead) {
    if (!lead?.phone.trim()) return;
    navigate(`/conversations?leadId=${leadId(lead)}`);
  }

  function markAsCustomer(lead: SheetLead) {
    const id = leadId(lead);
    setPipelineMeta((current) => {
      const next = {
        ...current,
        [id]: {
          isCustomer: true,
          status: current[id]?.status ?? "Queue",
          completionBy: current[id]?.completionBy ?? "",
        },
      };
      localStorage.setItem(pipelineStorageKey, JSON.stringify(next));
      return next;
    });
    navigate(`/pipeline?customerId=${id}`);
  }
}

function mergeLeadSheets(saved: LeadSheetConfig[]) {
  return defaultLeadSheets.map((sheet) => ({
    ...sheet,
    ...(saved.find((item) => item.offer === sheet.offer) ?? {}),
  }));
}

function defaultSpreadsheetName(offer: string) {
  if (offer === "Web Design") return "Nexus Luma INQ";
  if (offer === "High Income Skills" || offer === "Digital Products") return "High Income Skills";
  if (offer === "Credit Repair") return "The Credit Project";
  return offer || "Not Available yet";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isLiveLeadSource(source?: string) {
  return source === "google_sheets" || source === "webhook_google_sheets" || source === "webhook";
}

function loadPipelineMeta(): PipelineMeta {
  try {
    return JSON.parse(localStorage.getItem(pipelineStorageKey) || "{}") as PipelineMeta;
  } catch {
    return {};
  }
}
