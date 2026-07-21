import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BriefcaseBusiness, Heart, ShoppingBag, Users } from "lucide-react";
import Header from "@/components/Header";
import type { SheetLead } from "@/lib/bridge";

const unavailable = "Not Available yet";
const offerColors = ["var(--status-info)", "var(--accent-gold)", "var(--status-success)", "var(--status-warning)", "var(--status-takeover)"];

export default function Dashboard() {
  const leadsQuery = useQuery({
    queryKey: ["leads"],
    queryFn: () => window.nexusLuma.leads.list(),
    refetchInterval: 60_000,
  });

  const leads = leadsQuery.data?.leads ?? [];
  const stats = useMemo(() => buildStats(leads), [leads]);
  const hasLiveData = leadsQuery.data?.source === "google_sheets" && leads.length > 0;

  const summaryCards = [
    { label: "New Leads", value: hasLiveData ? String(stats.newLeads) : unavailable, icon: Heart, featured: true },
    { label: "Qualified Leads", value: hasLiveData ? String(stats.qualifiedLeads) : unavailable, icon: Users },
    { label: "Sales", value: hasLiveData ? String(stats.sales) : unavailable, icon: ShoppingBag },
    { label: "Calls Booked", value: hasLiveData ? String(stats.callsBooked) : unavailable, icon: BriefcaseBusiness },
  ];

  return (
    <div className="premium-page h-full overflow-y-auto">
      <Header
        title="Dashboard"
        subtitle={
          leadsQuery.data?.source === "google_sheets"
            ? `${leads.length} live leads synced from Google Sheets`
            : leadsQuery.data?.source === "error"
              ? `Not Available yet — ${leadsQuery.data.error}`
              : "Not Available yet — connect Google Sheets to show live dashboard data"
        }
      />

      <div className="space-y-6 px-8 py-7">
        <section className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-4">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className={`premium-card flex min-h-[150px] items-center gap-5 p-6 ${
                card.featured ? "bg-accent-gold text-white shadow-glowGold" : ""
              }`}
            >
              <span className={`flex h-16 w-16 items-center justify-center rounded-card ${card.featured ? "bg-white/18" : "bg-accent-goldMuted text-accent-gold"}`}>
                <card.icon size={24} />
              </span>
              <div className="min-w-0">
                <div className={`leading-tight font-semibold ${card.value === unavailable ? "text-lg" : "text-[32px]"}`}>{card.value}</div>
                <div className={`mt-2 text-sm ${card.featured ? "text-white/80" : "text-text-secondary"}`}>{card.label}</div>
              </div>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-6 2xl:grid-cols-[1fr_460px]">
          <div className="premium-card min-h-[420px] p-7">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Lead Flow</h2>
                <p className="mt-4 text-[28px] font-semibold">
                  Revenue : <span className="text-accent-gold">{hasLiveData ? currency(stats.revenue) : unavailable}</span>
                </p>
              </div>
              <div className="rounded-card border border-border bg-bg-panel px-3 py-2 text-xs text-text-muted">
                Monthly
              </div>
            </div>

            {hasLiveData && stats.monthlyFlow.length > 0 ? (
              <>
                <div className="mb-4 flex items-center gap-5 text-sm">
                  <span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-accent-gold" /> Leads</span>
                  <span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-[#62b4f5]" /> Customers</span>
                </div>

                <ResponsiveContainer width="100%" height={265}>
                  <BarChart data={stats.monthlyFlow}>
                    <XAxis dataKey="month" tickLine={false} axisLine={false} stroke="var(--text-muted)" fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} stroke="var(--text-muted)" fontSize={12} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "var(--bg-secondary)", border: "1px solid var(--border-default)", borderRadius: 14, fontSize: 12 }} />
                    <Bar dataKey="leads" fill="var(--accent-gold)" radius={[9, 9, 9, 9]} barSize={18} />
                    <Bar dataKey="customers" fill="#62b4f5" radius={[9, 9, 9, 9]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </>
            ) : (
              <UnavailablePanel />
            )}
          </div>

          <div className="premium-card min-h-[420px] p-7">
            <h2 className="text-lg font-semibold">Revenue by Offer</h2>
            {hasLiveData && stats.revenueByOffer.length > 0 ? (
              <>
                <div className="relative mt-4">
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={stats.revenueByOffer} dataKey="revenue" innerRadius={78} outerRadius={118} paddingAngle={2}>
                        {stats.revenueByOffer.map((entry) => (
                          <Cell key={entry.offer} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-[30px] font-semibold text-accent-gold">{currency(stats.revenue)}</div>
                      <div className="text-xs text-text-muted">Total Sales</div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {stats.revenueByOffer.map((entry) => (
                    <div key={entry.offer} className="flex items-center gap-2 text-xs text-text-secondary">
                      <span className="h-3 w-3 rounded" style={{ backgroundColor: entry.color }} />
                      <span className="truncate">{entry.offer}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <UnavailablePanel />
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 2xl:grid-cols-[1fr_460px]">
          <div className="premium-card p-7">
            <h2 className="mb-5 text-lg font-semibold">Latest Lead Activity</h2>
            <div className="overflow-hidden rounded-card border border-border">
              <table className="w-full text-sm">
                <thead className="bg-bg-panel text-text-muted">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-medium">Lead</th>
                    <th className="px-4 py-3 font-medium">Offer</th>
                    <th className="px-4 py-3 font-medium">Submitted</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {hasLiveData ? (
                    stats.recentLeads.map((lead) => (
                      <tr key={lead.rowNumber} className="border-t border-border-subtle">
                        <td className="px-4 py-4 font-medium">{lead.fullName || unavailable}</td>
                        <td className="px-4 py-4 text-text-secondary">{lead.offer || lead.product || unavailable}</td>
                        <td className="px-4 py-4 text-text-muted">{lead.submittedAt || unavailable}</td>
                        <td className="px-4 py-4"><span className="badge bg-accent-goldMuted text-accent-gold">{lead.status || unavailable}</span></td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-text-muted">{unavailable}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="premium-card p-7">
            <h2 className="mb-5 text-lg font-semibold">Lead Sources</h2>
            {hasLiveData && stats.sources.length > 0 ? (
              <div className="space-y-4">
                {stats.sources.map((source) => (
                  <div key={source.name} className="flex items-center justify-between gap-4 border-b border-border-subtle pb-4 last:border-0">
                    <div>
                      <div className="font-medium">{source.name}</div>
                      <div className="text-xs text-text-muted">{source.customers} converted customers</div>
                    </div>
                    <div className="font-semibold text-accent-gold">{source.leads} leads</div>
                  </div>
                ))}
              </div>
            ) : (
              <UnavailablePanel />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function buildStats(leads: SheetLead[]) {
  const newLeads = leads.filter((lead) => /new/i.test(lead.status)).length;
  const qualifiedLeads = leads.filter((lead) => /qualified|booked/i.test(lead.status)).length;
  const customers = leads.filter((lead) => lead.purchased || /paid|completed|customer|purchased/i.test(`${lead.paymentStatus} ${lead.status}`));
  const callsBooked = leads.filter((lead) => /booked|call/i.test(lead.status)).length;
  const revenue = customers.reduce((sum, lead) => sum + moneyToNumber(lead.paymentAmount), 0);

  return {
    newLeads,
    qualifiedLeads,
    sales: customers.length,
    callsBooked,
    revenue,
    monthlyFlow: groupMonthly(leads),
    revenueByOffer: groupRevenueByOffer(customers),
    sources: groupSources(leads),
    recentLeads: [...leads].slice(-5).reverse(),
  };
}

function groupMonthly(leads: SheetLead[]) {
  const grouped = new Map<string, { month: string; leads: number; customers: number }>();
  for (const lead of leads) {
    const date = new Date(lead.submittedAt);
    if (Number.isNaN(date.getTime())) continue;
    const month = date.toLocaleString("en-US", { month: "short" });
    const current = grouped.get(month) ?? { month, leads: 0, customers: 0 };
    current.leads += 1;
    if (lead.purchased || /paid|completed|customer|purchased/i.test(`${lead.paymentStatus} ${lead.status}`)) current.customers += 1;
    grouped.set(month, current);
  }
  return Array.from(grouped.values()).slice(-8);
}

function groupRevenueByOffer(customers: SheetLead[]) {
  const grouped = new Map<string, number>();
  for (const customer of customers) {
    const offer = customer.offer || customer.product || unavailable;
    grouped.set(offer, (grouped.get(offer) ?? 0) + moneyToNumber(customer.paymentAmount));
  }
  return Array.from(grouped.entries())
    .filter(([, revenue]) => revenue > 0)
    .map(([offer, revenue], index) => ({ offer, revenue, color: offerColors[index % offerColors.length] }));
}

function groupSources(leads: SheetLead[]) {
  const grouped = new Map<string, { name: string; leads: number; customers: number }>();
  for (const lead of leads) {
    const name = lead.source || unavailable;
    const current = grouped.get(name) ?? { name, leads: 0, customers: 0 };
    current.leads += 1;
    if (lead.purchased || /paid|completed|customer|purchased/i.test(`${lead.paymentStatus} ${lead.status}`)) current.customers += 1;
    grouped.set(name, current);
  }
  return Array.from(grouped.values()).sort((a, b) => b.leads - a.leads).slice(0, 5);
}

function moneyToNumber(value: string) {
  const numeric = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function currency(value: number) {
  return value > 0 ? `$${value.toLocaleString()}` : unavailable;
}

function UnavailablePanel() {
  return (
    <div className="flex min-h-[260px] items-center justify-center rounded-card border border-border bg-bg-panel text-sm text-text-muted">
      {unavailable}
    </div>
  );
}
