import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, RefreshCw, Link2, CheckCircle2, Circle, ExternalLink } from "lucide-react";
import Header from "@/components/Header";

export default function Leads() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [offerFilter, setOfferFilter] = useState<string>("All");
  const [spreadsheetIdInput, setSpreadsheetIdInput] = useState("");
  const [sheetNameInput, setSheetNameInput] = useState("Sheet1");

  const googleStatus = useQuery({
    queryKey: ["google-status"],
    queryFn: () => window.nexusLuma.google.status(),
  });

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => window.nexusLuma.settings.get(),
  });

  const leadsQuery = useQuery({
    queryKey: ["leads"],
    queryFn: () => window.nexusLuma.leads.list(),
    refetchInterval: 60_000,
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

  const purchasedCount = leads.filter((l) => l.purchased).length;

  async function connectGoogle() {
    const result = await window.nexusLuma.google.connect();
    if (result.success) {
      queryClient.invalidateQueries({ queryKey: ["google-status"] });
    }
  }

  async function saveSpreadsheet() {
    await window.nexusLuma.settings.set({
      googleSpreadsheetId: spreadsheetIdInput.trim(),
      googleSheetName: sheetNameInput.trim() || "Sheet1",
    });
    queryClient.invalidateQueries({ queryKey: ["settings"] });
    queryClient.invalidateQueries({ queryKey: ["leads"] });
  }

  const needsSetup =
    googleStatus.data && (!googleStatus.data.connected || !settings.data?.googleSpreadsheetId);

  const summaryCards = [
    { label: "New leads", value: leads.filter((l) => /new/i.test(l.status)).length, color: "bg-[#7898ef]" },
    { label: "Awaiting response", value: leads.filter((l) => /await|human|follow/i.test(l.status)).length, color: "bg-[#f5a066]" },
    { label: "Qualified leads", value: leads.filter((l) => /qualified|booked/i.test(l.status)).length, color: "bg-[#ffe58c]" },
    { label: "Purchased leads", value: purchasedCount, color: "bg-[#65e89a]" },
  ];

  return (
    <div className="premium-page flex flex-col h-full">
      <Header
        title="Order list"
        subtitle={
          leadsQuery.data?.source === "google_sheets"
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
                <span className="badge bg-status-success/20 text-status-success text-[11px] mb-0.5">↑ 2.67%</span>
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
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-3 items-end">
                <div>
                  <label className="text-xs text-text-muted">Spreadsheet ID</label>
                  <input
                    value={spreadsheetIdInput}
                    onChange={(e) => setSpreadsheetIdInput(e.target.value)}
                    placeholder="from the sheet's URL"
                    className="w-full mt-1 bg-bg-panel border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent-gold"
                  />
                </div>
                <div>
                  <label className="text-xs text-text-muted">Tab name</label>
                  <input
                    value={sheetNameInput}
                    onChange={(e) => setSheetNameInput(e.target.value)}
                    className="w-full mt-1 bg-bg-panel border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent-gold"
                  />
                </div>
                <button
                  onClick={saveSpreadsheet}
                  className="bg-accent-gold text-bg-primary text-sm font-medium rounded-lg px-4 py-2 hover:brightness-110 transition"
                >
                  Save & sync
                </button>
              </div>
            )}
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
            onClick={() => leadsQuery.refetch()}
            className="flex items-center gap-2 premium-input rounded-card px-4 h-12 text-sm hover:bg-bg-panelHover transition-colors"
          >
            <RefreshCw size={14} className={leadsQuery.isFetching ? "animate-spin" : ""} />
            Refresh
          </button>

          <span className="text-xs text-text-muted ml-auto">{filtered.length} shown</span>
        </div>

        <div className="premium-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted bg-bg-panel">
                <th className="px-4 py-4 font-medium w-10">
                  <input type="checkbox" className="accent-status-info" />
                </th>
                <th className="px-4 py-3 font-medium">Lead</th>
                <th className="px-4 py-3 font-medium">Offer</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Purchased</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => (
                <tr key={lead.rowNumber} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                  <td className="px-4 py-4">
                    <input type="checkbox" className="accent-status-info" />
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
                  <td className="px-4 py-3 text-text-secondary">{lead.source || "Not Available yet"}</td>
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
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-text-muted text-sm">
                    {leads.length === 0 ? "Not Available yet. Connect Google Sheets to load live leads." : "No leads match your filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {leadsQuery.data?.source === "google_sheets" && settings.data?.googleSpreadsheetId && (
          <a
            href={`https://docs.google.com/spreadsheets/d/${settings.data.googleSpreadsheetId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-accent-gold transition-colors"
          >
            <ExternalLink size={12} /> Open source sheet
          </a>
        )}
      </div>
    </div>
  );
}
