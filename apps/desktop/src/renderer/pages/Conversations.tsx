import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, Check, Copy, ExternalLink, MessageSquareText, Phone, Search, Send, ShieldCheck, Sparkles } from "lucide-react";
import Header from "@/components/Header";
import type { SheetLead } from "@/lib/bridge";

type ChatMessage = { role: "user" | "assistant"; content: string; timestamp: string };
type ThreadMap = Record<number, ChatMessage[]>;

export default function Conversations() {
  const [search, setSearch] = useState("");
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [threads, setThreads] = useState<ThreadMap>({});
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const leadsQuery = useQuery({
    queryKey: ["leads"],
    queryFn: () => window.nexusLuma.leads.list(),
  });

  const leads = leadsQuery.data?.leads ?? [];
  const textableLeads = leads.filter((lead) => lead.phone.trim());
  const filtered = textableLeads.filter((l) => {
    const q = search.toLowerCase();
    return !q || l.fullName.toLowerCase().includes(q) || l.phone.includes(q) || l.offer.toLowerCase().includes(q);
  });
  const selected = textableLeads.find((lead) => lead.rowNumber === selectedRow) ?? filtered[0] ?? null;
  const activeThread = selected ? threads[selected.rowNumber] ?? [] : [];
  const latestDraft = [...activeThread].reverse().find((m) => m.role === "assistant")?.content ?? "";
  const recentLeads = useMemo(() => textableLeads.slice(0, 7), [textableLeads]);

  useEffect(() => {
    if (!selectedRow && filtered[0]) {
      setSelectedRow(filtered[0].rowNumber);
    }
  }, [filtered, selectedRow]);

  function selectLead(lead: SheetLead) {
    setSelectedRow(lead.rowNumber);
    setCopied(false);
  }

  async function generateReply(message: string) {
    if (!selected || loading) return;

    const userMessage: ChatMessage = { role: "user", content: message, timestamp: timeNow() };
    const history = threads[selected.rowNumber] ?? [];
    setThreads((current) => ({
      ...current,
      [selected.rowNumber]: [...history, userMessage],
    }));
    setInput("");
    setLoading(true);
    setCopied(false);

    const result = await window.nexusLuma.leadAssistant.reply({
      lead: {
        firstName: selected.firstName,
        fullName: selected.fullName,
        offer: selected.offer,
        businessName: selected.businessName,
        website: selected.website,
      },
      message,
      history: history.map(({ role, content }) => ({ role, content })),
    });

    setLoading(false);
    const assistantMessage: ChatMessage =
      "error" in result
        ? { role: "assistant", content: `Error: ${result.error}`, timestamp: timeNow() }
        : { role: "assistant", content: result.reply, timestamp: timeNow() };
    setThreads((current) => ({
      ...current,
      [selected.rowNumber]: [...(current[selected.rowNumber] ?? []), assistantMessage],
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    generateReply(input.trim());
  }

  async function copyDraft() {
    await navigator.clipboard.writeText(latestDraft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function openInMessages() {
    if (!selected) return;
    await window.nexusLuma.texting.open(selected.phone, latestDraft);
  }

  return (
    <div className="premium-page flex flex-col h-full">
      <Header title="Conversations" subtitle="Lead and customer text conversations with SYRUS customer-safe replies." />

      <div className="flex-1 grid grid-cols-[340px_1fr] overflow-hidden">
        <aside className="border-r border-border-subtle flex flex-col overflow-hidden bg-bg-secondary/60 backdrop-blur-xl">
          <div className="p-4 border-b border-border-subtle space-y-4">
            <div className="flex items-center gap-2 bg-bg-panel border border-border rounded-pill px-3 py-1.5">
              <Search size={14} className="text-text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations"
                className="bg-transparent outline-none text-sm placeholder:text-text-muted w-full"
              />
            </div>

            <div>
              <div className="text-xs font-medium text-text-secondary mb-3">Recent Chat</div>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {recentLeads.map((lead) => (
                  <button key={lead.rowNumber} onClick={() => selectLead(lead)} className="relative shrink-0" title={lead.fullName || lead.phone}>
                    <LeadAvatar lead={lead} active={selected?.rowNumber === lead.rowNumber} />
                    <span className="absolute -right-0.5 -top-0.5 w-2.5 h-2.5 rounded-full bg-status-success border border-[#050308]" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium">Conversation List</h2>
            <span className="text-xs text-text-muted">{filtered.length}</span>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
            {filtered.map((lead) => (
              <button
                key={lead.rowNumber}
                onClick={() => selectLead(lead)}
                className={`w-full text-left rounded-card border p-4 transition-colors ${
                  selected?.rowNumber === lead.rowNumber
                    ? "bg-[#f7f4ff] text-[#141217] border-transparent"
                    : "bg-bg-panel border-border hover:bg-bg-panelHover"
                }`}
              >
                <div className="flex items-center gap-3">
                  <LeadAvatar lead={lead} active={selected?.rowNumber === lead.rowNumber} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold truncate">{lead.fullName || "Unnamed lead"}</div>
                      <span className="text-[11px] opacity-60">{threadAge(threads[lead.rowNumber])}</span>
                    </div>
                    <div className="text-xs opacity-70 truncate mt-1">{latestPreview(threads[lead.rowNumber]) || lead.offer || "Not Available yet"}</div>
                    <div className="text-[11px] opacity-60 truncate mt-1">{lead.phone || "Not Available yet"}</div>
                  </div>
                </div>
              </button>
            ))}
            {filtered.length === 0 && <p className="p-4 text-sm text-text-muted">Not Available yet. Leads with phone numbers will show here after live data is connected.</p>}
          </div>
        </aside>

        <main className="flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
              <div className="text-center space-y-2">
                <MessageSquareText size={22} className="mx-auto" />
                <p>Select a conversation.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between bg-bg-secondary/40">
                <div className="flex items-center gap-3">
                  <LeadAvatar lead={selected} active />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{selected.fullName || "Unnamed lead"}</span>
                      <span className="text-[11px] text-status-success">online</span>
                    </div>
                    <div className="text-xs text-text-muted">{selected.phone || "Not Available yet"} · {selected.offer || "Not Available yet"}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="hidden lg:flex items-center gap-1.5 text-xs text-status-success mr-2">
                    <ShieldCheck size={14} />
                    customer-safe
                  </div>
                  <button
                    onClick={() => generateReply("Draft a friendly opening text to this lead based on their interest.")}
                    className="w-9 h-9 bg-bg-panel border border-border rounded-card flex items-center justify-center hover:bg-bg-panelHover"
                    title="Draft opener"
                  >
                    <Sparkles size={15} />
                  </button>
                  <button
                    onClick={() => selected && window.nexusLuma.texting.open(selected.phone, "")}
                    className="w-9 h-9 bg-bg-panel border border-border rounded-card flex items-center justify-center hover:bg-bg-panelHover"
                    title="Open phone"
                  >
                    <Phone size={15} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                {activeThread.length === 0 && (
                  <div className="panel p-5 max-w-xl">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Bot size={16} className="text-accent-gold" />
                      SYRUS Customer Text
                    </div>
                    <p className="text-sm text-text-secondary mt-2">
                      Type the lead's question or ask SYRUS to draft an outgoing text. Replies use only customer-safe
                      context for this lead.
                    </p>
                  </div>
                )}
                {activeThread.map((m, i) => (
                  <div key={`${m.timestamp}-${i}`} className={m.role === "user" ? "text-right" : ""}>
                    <div className={`mb-1 text-[10px] text-text-muted ${m.role === "user" ? "mr-1" : "ml-1"}`}>{m.timestamp}</div>
                    <div
                      className={`inline-block max-w-[78%] rounded-card px-4 py-3 text-sm leading-relaxed ${
                        m.role === "user"
                          ? "bg-accent-goldMuted text-text-primary"
                          : "bg-bg-panel border border-border text-text-secondary"
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                {loading && <p className="text-xs text-text-muted">SYRUS is drafting...</p>}
              </div>

              {latestDraft && !loading && (
                <div className="px-5 py-3 border-t border-border-subtle bg-bg-panel/40 flex items-center gap-2">
                  <button
                    onClick={copyDraft}
                    className="flex items-center gap-1.5 text-xs bg-bg-panel border border-border rounded-lg px-3 py-2 hover:bg-bg-panelHover transition-colors"
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy text"}
                  </button>
                  <button
                    onClick={openInMessages}
                    disabled={!selected.phone}
                    className="flex items-center gap-1.5 text-xs bg-accent-gold text-bg-primary font-medium rounded-lg px-3 py-2 hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ExternalLink size={13} /> Open in Messages
                  </button>
                </div>
              )}

              <form onSubmit={handleSubmit} className="p-3 border-t border-border-subtle flex items-center gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={`Message ${selected.fullName || "this lead"}...`}
                  className="flex-1 bg-bg-panel border border-border rounded-full px-3 py-2 text-sm outline-none focus:border-accent-gold"
                />
                <button type="submit" className="p-2 rounded-full bg-accent-gold text-bg-primary hover:brightness-110 transition">
                  <Send size={15} />
                </button>
              </form>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function LeadAvatar({ lead, active }: { lead: SheetLead; active?: boolean }) {
  const initials =
    [lead.firstName, lead.lastName]
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  return (
    <span
      className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
        active ? "bg-[#141217] text-[#f7f4ff]" : "bg-gradient-to-br from-[#8aa5ff] via-[#c4a6ff] to-[#ff9b73] text-[#141217]"
      }`}
    >
      {initials}
    </span>
  );
}

function timeNow() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function latestPreview(thread?: ChatMessage[]) {
  return thread?.[thread.length - 1]?.content;
}

function threadAge(thread?: ChatMessage[]) {
  return thread?.length ? "now" : "new";
}
