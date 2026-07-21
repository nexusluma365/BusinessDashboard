import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, Clock, Search, UserCheck } from "lucide-react";
import Header from "@/components/Header";
import type { SheetLead } from "@/lib/bridge";

type PipelineStatus = "Not yet" | "In Process" | "Completed";
type PipelineMeta = Record<number, { status: PipelineStatus; completionBy: string }>;

const storageKey = "nexus-luma-customer-pipeline";
const statuses: PipelineStatus[] = ["Not yet", "In Process", "Completed"];

export default function Pipeline() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PipelineStatus | "All">("All");
  const [meta, setMeta] = useState<PipelineMeta>(() => loadMeta());

  const leadsQuery = useQuery({
    queryKey: ["leads"],
    queryFn: () => window.nexusLuma.leads.list(),
  });

  const customers = useMemo(() => {
    return (leadsQuery.data?.leads ?? []).filter(isConvertedCustomer);
  }, [leadsQuery.data?.leads]);

  const filtered = customers.filter((customer) => {
    const query = search.toLowerCase();
    const customerStatus = pipelineFor(meta, customer).status;
    const matchesStatus = statusFilter === "All" || customerStatus === statusFilter;
    const matchesSearch =
      !query ||
      customer.fullName.toLowerCase().includes(query) ||
      customer.email.toLowerCase().includes(query) ||
      customer.offer.toLowerCase().includes(query);
    return matchesStatus && matchesSearch;
  });

  const counts = statuses.map((status) => ({
    status,
    value: customers.filter((customer) => pipelineFor(meta, customer).status === status).length,
  }));

  function updateCustomer(rowNumber: number, patch: Partial<PipelineMeta[number]>) {
    setMeta((current) => {
      const next = {
        ...current,
        [rowNumber]: {
          status: current[rowNumber]?.status ?? "Not yet",
          completionBy: current[rowNumber]?.completionBy ?? "",
          ...patch,
        },
      };
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }

  return (
    <div className="premium-page flex flex-col h-full">
      <Header
        title="Pipeline"
        subtitle={
          leadsQuery.data?.source === "google_sheets"
            ? `${customers.length} converted customers from Google Sheets`
            : leadsQuery.data?.source === "not_configured"
              ? "Not Available yet — connect Google Sheets for live customers"
              : "Customer pipeline"
        }
      />

      <div className="flex-1 overflow-y-auto px-7 py-6 space-y-5">
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="panel p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Converted customers</span>
              <UserCheck size={16} className="text-accent-gold" />
            </div>
            <div className="text-[32px] leading-none font-semibold mt-4">{customers.length}</div>
          </div>
          {counts.map((count) => (
            <div key={count.status} className="panel p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">{count.status}</span>
                {count.status === "Completed" ? (
                  <CheckCircle2 size={16} className="text-status-success" />
                ) : count.status === "In Process" ? (
                  <Clock size={16} className="text-status-warning" />
                ) : (
                  <CalendarDays size={16} className="text-status-info" />
                )}
              </div>
              <div className="text-[32px] leading-none font-semibold mt-4">{count.value}</div>
            </div>
          ))}
        </section>

        <section className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 premium-input rounded-card px-4 h-12 w-72">
            <Search size={14} className="text-text-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search customers"
              className="bg-transparent outline-none text-sm placeholder:text-text-muted w-full"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as PipelineStatus | "All")}
            className="premium-input rounded-card px-3 h-12 text-sm outline-none"
          >
            <option value="All">All statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <span className="text-xs text-text-muted ml-auto">{filtered.length} shown</span>
        </section>

        <section className="premium-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted bg-bg-panel">
                <th className="px-4 py-4 font-medium">Customer</th>
                <th className="px-4 py-4 font-medium">Email</th>
                <th className="px-4 py-4 font-medium">Offer</th>
                <th className="px-4 py-4 font-medium">Current status</th>
                <th className="px-4 py-4 font-medium">Completion by</th>
                <th className="px-4 py-4 font-medium">Payment</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer) => {
                const item = pipelineFor(meta, customer);
                return (
                  <tr key={customer.rowNumber} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-4 py-4">
                      <div className="font-medium">{customer.fullName || "Not Available yet"}</div>
                      <div className="text-xs text-text-muted">{customer.businessName || customer.phone || "Not Available yet"}</div>
                    </td>
                    <td className="px-4 py-4 text-text-secondary">{customer.email || "Not Available yet"}</td>
                    <td className="px-4 py-4 text-text-secondary">{customer.offer || customer.product || "Not Available yet"}</td>
                    <td className="px-4 py-4">
                      <select
                        value={item.status}
                        onChange={(event) => updateCustomer(customer.rowNumber, { status: event.target.value as PipelineStatus })}
                        className="bg-bg-panel border border-border rounded-card px-3 py-2 text-sm outline-none focus:border-accent-gold"
                      >
                        {statuses.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-4">
                      <input
                        type="date"
                        value={item.completionBy}
                        onChange={(event) => updateCustomer(customer.rowNumber, { completionBy: event.target.value })}
                        className="bg-bg-panel border border-border rounded-card px-3 py-2 text-sm outline-none focus:border-accent-gold"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <span className="badge bg-status-success/15 text-status-success">
                        Paid{customer.paymentAmount ? ` · $${customer.paymentAmount}` : ""}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-text-muted">
                    {customers.length === 0 ? "Not Available yet. Converted customers will show here after live lead data is connected." : "No converted customers match this view."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

function isConvertedCustomer(lead: SheetLead) {
  return lead.purchased || /paid|completed|customer|purchased/i.test(`${lead.paymentStatus} ${lead.status}`);
}

function pipelineFor(meta: PipelineMeta, customer: SheetLead) {
  return meta[customer.rowNumber] ?? { status: "Not yet" as const, completionBy: "" };
}

function loadMeta(): PipelineMeta {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "{}") as PipelineMeta;
  } catch {
    return {};
  }
}
