import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Check,
  Copy,
  Download,
  GripVertical,
  Mail,
  Monitor,
  Plus,
  Save,
  Search,
  Send,
  Smartphone,
  Trash2,
} from "lucide-react";
import Header from "@/components/Header";
import { buildEmailHtml, type EmailBlock, type EmailTemplate } from "@/lib/emailTemplate";
import type { SheetLead } from "@/lib/bridge";
import { findLeadById, leadId, parseLeadIds } from "@/lib/leadIdentity";

const storageKey = "nexus-luma-email-templates";

const presets: EmailTemplate[] = [
  {
    id: "welcome",
    name: "Welcome",
    subject: "Welcome to Nexus Luma, {{firstName}}",
    preheader: "Your next step is ready.",
    global: defaultGlobal("#c9a55c"),
    blocks: [
      header("Nexus Luma", "#151218"),
      headline("You're officially in, {{firstName}}.", "#151218", "center"),
      text("<p>Thanks for reaching out about <strong>{{offer}}</strong>. We have your details and the next step is simple.</p>"),
      button("Book your strategy call", "https://nexusluma.com", "#c9a55c"),
      divider(),
      footer(),
    ],
  },
  {
    id: "follow-up",
    name: "Follow-up",
    subject: "Quick follow-up on {{offer}}",
    preheader: "A short note from Nexus Luma.",
    global: defaultGlobal("#4f8ef7"),
    blocks: [
      header("Nexus Luma", "#141a24"),
      headline("Still interested in {{offer}}?", "#111827", "left"),
      text("<p>Hi {{firstName}}, I wanted to follow up while this is still fresh. If now is a good time, we can help map the cleanest next step for {{businessName}}.</p>"),
      button("Reply with a good time", "mailto:hello@nexusluma.com", "#4f8ef7"),
      footer(),
    ],
  },
  {
    id: "promo",
    name: "Offer",
    subject: "{{offer}} is ready for you",
    preheader: "A focused offer based on your request.",
    global: defaultGlobal("#34c98d"),
    blocks: [
      header("Nexus Luma", "#101915"),
      headline("Let's turn interest into momentum.", "#101915", "center"),
      text("<p>Hi {{firstName}}, based on your request, <strong>{{offer}}</strong> looks like the best place to start. This email gives you the quick path forward without the noise.</p>"),
      button("View the offer", "https://nexusluma.com", "#34c98d"),
      divider(),
      text("<p><strong>Lead context:</strong> {{status}} via {{source}}</p>"),
      footer(),
    ],
  },
];

const basePreset = presets[0]!;

type Device = "desktop" | "mobile";
type SendMode = "preview" | "selected" | "filtered" | "manual";
type SendResult = { email: string; status: "sent" | "error"; message?: string };

export default function EmailStudio() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [templates, setTemplates] = useState<EmailTemplate[]>(() => loadTemplates());
  const [activeId, setActiveId] = useState(templates[0]?.id ?? basePreset.id);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(templates[0]?.blocks[1]?.id ?? null);
  const [leadQuery, setLeadQuery] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [sendMode, setSendMode] = useState<SendMode>("preview");
  const [manualRecipients, setManualRecipients] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResults, setSendResults] = useState<SendResult[]>([]);
  const [sendError, setSendError] = useState("");
  const [device, setDevice] = useState<Device>("desktop");
  const [copied, setCopied] = useState<"html" | "subject" | null>(null);

  const googleStatus = useQuery({
    queryKey: ["google-status"],
    queryFn: () => window.nexusLuma.google.status(),
  });

  const leadsQuery = useQuery({
    queryKey: ["leads"],
    queryFn: () => window.nexusLuma.leads.list(),
  });

  const leads = leadsQuery.data?.leads ?? [];
  const selectedLead = findLeadById(leads, selectedLeadId) ?? leads[0] ?? null;
  const activeTemplate: EmailTemplate = templates.find((template) => template.id === activeId) ?? templates[0] ?? basePreset;
  const personalized = useMemo(() => personalizeTemplate(activeTemplate, selectedLead), [activeTemplate, selectedLead]);
  const html = useMemo(() => buildEmailHtml(personalized), [personalized]);
  const selectedBlock = activeTemplate.blocks.find((block) => block.id === selectedBlockId) ?? null;

  const filteredLeads = useMemo(() => leads.filter((lead) => {
    const query = leadQuery.toLowerCase();
    return (
      !query ||
      lead.fullName.toLowerCase().includes(query) ||
      lead.email.toLowerCase().includes(query) ||
      lead.offer.toLowerCase().includes(query)
    );
  }), [leadQuery, leads]);
  const selectedRowSet = useMemo(() => new Set(selectedRows), [selectedRows]);
  const selectedLeads = useMemo(() => leads.filter((lead) => selectedRowSet.has(leadId(lead))), [leads, selectedRowSet]);
  const recipients = useMemo(
    () => recipientsForMode(sendMode, selectedLead, selectedLeads, filteredLeads, manualRecipients),
    [filteredLeads, manualRecipients, selectedLead, selectedLeads, sendMode]
  );
  const validRecipientCount = useMemo(() => recipients.filter((recipient) => isEmail(recipient.email)).length, [recipients]);
  const canSend = Boolean(googleStatus.data?.connected && validRecipientCount > 0 && !sending);

  useEffect(() => {
    if (!leads.length) return;

    const id = searchParams.get("leadId");
    const ids = parseLeadIds(searchParams.get("leadIds"));
    const legacyLeadRow = Number(searchParams.get("lead") || "");
    const legacyRows = parseRowsParam(searchParams.get("rows"));
    const mode = searchParams.get("mode") as SendMode | null;

    if (ids.length) {
      setSelectedRows(ids);
      setSendMode("selected");
    } else if (legacyRows.length) {
      const mapped = legacyRows
        .map((row) => leads.find((lead) => lead.rowNumber === row))
        .filter((lead): lead is SheetLead => Boolean(lead))
        .map((lead) => leadId(lead));
      setSelectedRows(mapped);
      if (mapped.length) setSendMode("selected");
    }

    if (findLeadById(leads, id)) {
      setSelectedLeadId(id);
    } else if (Number.isFinite(legacyLeadRow)) {
      const legacyLead = leads.find((lead) => lead.rowNumber === legacyLeadRow);
      if (legacyLead) setSelectedLeadId(leadId(legacyLead));
    }

    if (mode && ["preview", "selected", "filtered", "manual"].includes(mode)) {
      setSendMode(mode);
    }
  }, [leads, searchParams]);

  function updateTemplate(patch: Partial<EmailTemplate>) {
    setTemplates((current) => persist(current.map((template) => (template.id === activeTemplate.id ? { ...template, ...patch } : template))));
  }

  function updateBlock(blockId: string, data: Record<string, string>) {
    updateTemplate({
      blocks: activeTemplate.blocks.map((block) =>
        block.id === blockId ? ({ ...block, data: { ...block.data, ...data } } as EmailBlock) : block
      ),
    });
  }

  function addBlock(type: EmailBlock["type"]) {
    const block = makeBlock(type);
    updateTemplate({ blocks: [...activeTemplate.blocks.slice(0, -1), block, activeTemplate.blocks[activeTemplate.blocks.length - 1] ?? footer()] });
    setSelectedBlockId(block.id);
  }

  function removeBlock(blockId: string) {
    const nextBlocks = activeTemplate.blocks.filter((block) => block.id !== blockId);
    updateTemplate({ blocks: nextBlocks.length ? nextBlocks : [footer()] });
    setSelectedBlockId(nextBlocks[0]?.id ?? null);
  }

  function choosePreset(template: EmailTemplate) {
    const fresh = cloneTemplate(template);
    setTemplates((current) => persist([fresh, ...current.filter((item) => item.id !== fresh.id)]));
    setActiveId(fresh.id);
    setSelectedBlockId(fresh.blocks[1]?.id ?? null);
  }

  function saveCopy() {
    const duplicate = cloneTemplate({ ...activeTemplate, name: `${activeTemplate.name} copy` });
    setTemplates((current) => persist([duplicate, ...current]));
    setActiveId(duplicate.id);
  }

  async function copyText(kind: "html" | "subject") {
    await navigator.clipboard.writeText(kind === "html" ? html : personalized.subject);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
  }

  function downloadHtml() {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slugify(activeTemplate.name)}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function connectGoogle() {
    const result = await window.nexusLuma.google.connect();
    if (result.success) {
      queryClient.invalidateQueries({ queryKey: ["google-status"] });
    } else {
      setSendError(result.reason ?? "Google connection failed.");
    }
  }

  function toggleLead(lead: SheetLead) {
    const id = leadId(lead);
    setSelectedRows((current) =>
      current.includes(id) ? current.filter((row) => row !== id) : [...current, id]
    );
  }

  function selectFilteredLeads() {
    setSelectedRows(filteredLeads.map((lead) => leadId(lead)));
    setSendMode("selected");
  }

  async function sendEmail() {
    if (!canSend) return;
    setSending(true);
    setSendError("");
    setSendResults(recipients.map((recipient) => ({ email: recipient.email, status: "sent" as const, message: "Queued" })));

    const messages = recipients
      .filter((recipient) => isEmail(recipient.email))
      .map((recipient) => {
        const merged = personalizeTemplate(activeTemplate, recipient.lead ?? selectedLead);
        return {
          to: recipient.email,
          subject: merged.subject,
          html: buildEmailHtml(merged),
        };
      });

    const result = await window.nexusLuma.email.send({ messages });
    setSending(false);
    setSendResults(result.results);
    if (!result.success) {
      setSendError(result.error ?? "No email was sent. Check the recipient list and Gmail connection.");
    }
  }

  return (
    <div className="premium-page flex h-full min-h-0 flex-col">
      <Header title="Email Studio" subtitle="Build email-safe templates, personalize with leads, then copy or export for sending." />

      <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(640px,1fr)_360px] overflow-hidden">
        <aside className="overflow-y-auto border-r border-border-subtle bg-bg-secondary/70 backdrop-blur-xl">
          <div className="space-y-3 border-b border-border-subtle p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-text-primary">Templates</h2>
              <button onClick={saveCopy} className="flex h-10 w-10 items-center justify-center rounded-card border border-border bg-bg-panel text-text-secondary shadow-card transition hover:bg-bg-panelHover hover:text-text-primary" title="Save a copy">
                <Save size={15} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {presets.map((preset) => (
                <button key={preset.id} onClick={() => choosePreset(preset)} className="h-10 rounded-pill border border-border bg-bg-panel px-3 text-xs font-medium text-text-secondary transition hover:bg-bg-panelHover hover:text-text-primary">
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 p-4">
            {templates.map((template) => (
              <button
                key={template.id}
                onClick={() => {
                  setActiveId(template.id);
                  setSelectedBlockId(template.blocks[0]?.id ?? null);
                }}
                className={`w-full rounded-card border px-4 py-4 text-left shadow-card transition-all ${
                  template.id === activeTemplate.id
                    ? "border-accent-gold/40 bg-accent-gold text-white shadow-glow"
                    : "border-border bg-bg-panel text-text-primary hover:-translate-y-0.5 hover:bg-bg-panelHover"
                }`}
              >
                <span className="block text-sm font-medium truncate">{template.name}</span>
                <span className={`mt-1 block truncate text-xs ${template.id === activeTemplate.id ? "text-white/75" : "text-text-muted"}`}>{template.subject}</span>
              </button>
            ))}
          </div>

          <div className="space-y-3 border-t border-border-subtle p-5">
            <h2 className="text-sm font-semibold text-text-primary">Lead personalization</h2>
            <div className="premium-input flex items-center gap-2 rounded-pill px-3 py-2 shadow-card">
              <Search size={14} className="text-text-muted" />
              <input value={leadQuery} onChange={(event) => setLeadQuery(event.target.value)} placeholder="Search leads" className="w-full bg-transparent text-sm outline-none placeholder:text-text-muted" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <button onClick={selectFilteredLeads} className="text-xs font-medium text-accent-gold hover:text-text-primary">
                Select filtered
              </button>
              <button onClick={() => setSelectedRows([])} className="text-xs text-text-muted hover:text-text-primary">
                Clear
              </button>
            </div>
            <div className="max-h-[270px] space-y-2 overflow-y-auto pr-1">
              {filteredLeads.map((lead) => (
                <div
                  key={leadId(lead)}
                  className={`w-full rounded-card border px-3 py-3 text-left text-sm shadow-card transition-colors ${
                    selectedLead && leadId(selectedLead) === leadId(lead)
                      ? "border-accent-gold/40 bg-accent-gold text-white"
                      : "border-border bg-bg-panel text-text-secondary hover:bg-bg-panelHover"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedRowSet.has(leadId(lead))}
                      onChange={() => toggleLead(lead)}
                      className="accent-status-info"
                    />
                    <button onClick={() => setSelectedLeadId(leadId(lead))} className="min-w-0 flex-1 text-left">
                      <span className="block truncate font-medium">{lead.fullName || "Unnamed lead"}</span>
                      <span className="block truncate text-xs opacity-70">{lead.email || lead.offer || "No context"}</span>
                    </button>
                  </div>
                </div>
              ))}
              {filteredLeads.length === 0 && <p className="text-xs text-text-muted">No leads match this search.</p>}
            </div>
          </div>
        </aside>

        <main className="flex flex-col overflow-hidden">
          <div className="flex h-16 items-center gap-2 border-b border-border-subtle bg-bg-secondary/45 px-5 backdrop-blur-xl">
            <button onClick={() => addBlock("headline")} className="flex h-10 items-center gap-2 rounded-pill border border-border bg-bg-panel px-4 text-xs font-medium text-text-secondary shadow-card transition hover:bg-bg-panelHover hover:text-text-primary">
              <Plus size={14} /> Headline
            </button>
            <button onClick={() => addBlock("text")} className="flex h-10 items-center gap-2 rounded-pill border border-border bg-bg-panel px-4 text-xs font-medium text-text-secondary shadow-card transition hover:bg-bg-panelHover hover:text-text-primary">
              <Plus size={14} /> Text
            </button>
            <button onClick={() => addBlock("button")} className="flex h-10 items-center gap-2 rounded-pill border border-border bg-bg-panel px-4 text-xs font-medium text-text-secondary shadow-card transition hover:bg-bg-panelHover hover:text-text-primary">
              <Plus size={14} /> CTA
            </button>
            <button onClick={() => addBlock("divider")} className="flex h-10 items-center gap-2 rounded-pill border border-border bg-bg-panel px-4 text-xs font-medium text-text-secondary shadow-card transition hover:bg-bg-panelHover hover:text-text-primary">
              <Plus size={14} /> Divider
            </button>
            <div className="ml-auto flex items-center gap-2">
              <DeviceButton active={device === "desktop"} onClick={() => setDevice("desktop")} label="Desktop" icon={<Monitor size={15} />} />
              <DeviceButton active={device === "mobile"} onClick={() => setDevice("mobile")} label="Mobile" icon={<Smartphone size={15} />} />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-7">
            <div className="mx-auto max-w-4xl space-y-5">
              <div className="premium-card p-5">
                <label className="text-xs text-text-muted">Subject</label>
                <div className="mt-2 flex items-center gap-2">
                  <Mail size={15} className="text-accent-gold" />
                  <input
                    value={activeTemplate.subject}
                    onChange={(event) => updateTemplate({ subject: event.target.value })}
                    className="flex-1 bg-transparent outline-none text-sm font-medium"
                  />
                  <button onClick={() => copyText("subject")} className="flex h-10 w-10 items-center justify-center rounded-card border border-border bg-bg-panel text-text-secondary transition hover:bg-bg-panelHover hover:text-text-primary" title="Copy subject">
                    {copied === "subject" ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <input
                  value={activeTemplate.preheader}
                  onChange={(event) => updateTemplate({ preheader: event.target.value })}
                  placeholder="Preview text"
                  className="premium-input mt-3 w-full rounded-card px-3 py-2.5 text-sm outline-none transition focus:border-accent-gold"
                />
              </div>

              <div className="premium-card overflow-hidden">
                <div className="flex h-11 items-center gap-2 border-b border-border-subtle bg-bg-secondary/75 px-4">
                  <div className="w-2.5 h-2.5 rounded-full bg-status-error" />
                  <div className="w-2.5 h-2.5 rounded-full bg-status-warning" />
                  <div className="w-2.5 h-2.5 rounded-full bg-status-success" />
                  <div className="flex-1 text-center text-[11px] font-medium text-text-muted">Email Preview</div>
                </div>
                <div className="overflow-x-auto px-5 py-7" style={{ backgroundColor: personalized.global.bgColor }}>
                  <iframe
                    title="Email preview"
                    srcDoc={html}
                    className={`mx-auto block h-[720px] border-0 bg-white shadow-card transition-all ${device === "mobile" ? "w-[375px]" : "w-[640px]"}`}
                  />
                </div>
              </div>
            </div>
          </div>
        </main>

        <aside className="overflow-y-auto border-l border-border-subtle bg-bg-secondary/70 backdrop-blur-xl">
          <div className="border-b border-border-subtle p-5">
            <h2 className="text-sm font-semibold text-text-primary">Editor</h2>
            <p className="text-xs text-text-muted mt-1">Merge fields: {"{{firstName}}"}, {"{{offer}}"}, {"{{businessName}}"}, {"{{status}}"}</p>
          </div>

          <div className="space-y-4 p-5">
            <div className="space-y-2">
              {activeTemplate.blocks.map((block) => (
                <button
                  key={block.id}
                  onClick={() => setSelectedBlockId(block.id)}
                  className={`flex w-full items-center gap-2 rounded-card border px-3 py-3 text-left text-sm shadow-card transition-all ${
                    selectedBlockId === block.id
                      ? "border-accent-gold/40 bg-accent-gold text-white shadow-glow"
                      : "border-border bg-bg-panel text-text-secondary hover:bg-bg-panelHover hover:text-text-primary"
                  }`}
                >
                  <GripVertical size={14} className={selectedBlockId === block.id ? "text-white/70" : "text-text-muted"} />
                  <span className="capitalize flex-1">{block.type}</span>
                  {block.type !== "footer" && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        removeBlock(block.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") removeBlock(block.id);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-card hover:bg-bg-panelHover"
                    >
                      <Trash2 size={13} />
                    </span>
                  )}
                </button>
              ))}
            </div>

            {selectedBlock ? <BlockEditor block={selectedBlock} onUpdate={(data) => updateBlock(selectedBlock.id, data)} /> : <p className="text-xs text-text-muted">Select a block to edit it.</p>}

            <div className="grid grid-cols-2 gap-2 border-t border-border-subtle pt-4">
              <button onClick={() => copyText("html")} className="flex h-11 items-center justify-center gap-2 rounded-pill border border-border bg-bg-panel text-xs font-medium text-text-secondary shadow-card transition hover:bg-bg-panelHover hover:text-text-primary">
                {copied === "html" ? <Check size={14} /> : <Copy size={14} />} HTML
              </button>
              <button onClick={downloadHtml} className="flex h-11 items-center justify-center gap-2 rounded-pill bg-accent-gold text-xs font-semibold text-white shadow-glow transition hover:opacity-95">
                <Download size={14} /> Export
              </button>
            </div>

            <div className="space-y-3 border-t border-border-subtle pt-4">
              <div>
                <h2 className="text-sm font-semibold">Send Email</h2>
                <p className="text-xs text-text-muted mt-1">
                  {googleStatus.data?.connected
                    ? "Sending uses the connected Gmail account."
                    : "Connect Google to send from this app."}
                </p>
              </div>

              {!googleStatus.data?.connected && (
                <button onClick={connectGoogle} className="h-11 w-full rounded-pill bg-accent-gold text-xs font-semibold text-white shadow-glow transition hover:opacity-95">
                  Connect Google
                </button>
              )}

              <select
                value={sendMode}
                onChange={(event) => setSendMode(event.target.value as SendMode)}
                className="premium-input w-full rounded-card px-3 py-2.5 text-sm outline-none transition focus:border-accent-gold"
              >
                <option value="preview">Preview lead only</option>
                <option value="selected">Checked leads</option>
                <option value="filtered">All filtered leads</option>
                <option value="manual">Manual recipients</option>
              </select>

              {sendMode === "manual" && (
                <textarea
                  value={manualRecipients}
                  onChange={(event) => setManualRecipients(event.target.value)}
                  placeholder="name@example.com, second@example.com"
                  className="premium-input min-h-24 w-full rounded-card px-3 py-2 text-sm outline-none transition focus:border-accent-gold"
                />
              )}

              <div className="space-y-1 rounded-card border border-border bg-bg-panel p-3 text-xs text-text-secondary shadow-card">
                <div className="flex justify-between gap-3">
                  <span>Recipients</span>
                  <span className="text-text-primary">{validRecipientCount}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>Template</span>
                  <span className="text-text-primary truncate">{activeTemplate.name}</span>
                </div>
              </div>

              <button
                onClick={sendEmail}
                disabled={!canSend}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-accent-gold text-sm font-semibold text-white shadow-glow transition hover:opacity-95 disabled:cursor-not-allowed disabled:bg-bg-panel disabled:text-text-muted disabled:shadow-none"
              >
                <Send size={15} /> {sending ? "Sending..." : "Send email"}
              </button>

              {sendError && <p className="text-xs text-status-error">{sendError}</p>}
              {sendResults.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {sendResults.map((result) => (
                    <div key={result.email} className="rounded-card bg-bg-panel border border-border px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{result.email}</span>
                        <span className={result.status === "sent" ? "text-status-success" : "text-status-error"}>
                          {result.message === "Queued" ? "Queued" : result.status}
                        </span>
                      </div>
                      {result.message && result.message !== "Queued" && <p className="text-text-muted mt-1">{result.message}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function BlockEditor({ block, onUpdate }: { block: EmailBlock; onUpdate: (data: Record<string, string>) => void }) {
  if (block.type === "divider") {
    return <ColorInput label="Line color" value={block.data.color} onChange={(value) => onUpdate({ color: value })} />;
  }

  if (block.type === "footer") {
    return (
      <div className="space-y-3">
        <TextInput label="Footer text" value={block.data.text} onChange={(value) => onUpdate({ text: value })} />
        <TextInput label="Unsubscribe label" value={block.data.unsubText} onChange={(value) => onUpdate({ unsubText: value })} />
        <TextInput label="Unsubscribe URL" value={block.data.unsubUrl} onChange={(value) => onUpdate({ unsubUrl: value })} />
        <ColorInput label="Background" value={block.data.bgColor} onChange={(value) => onUpdate({ bgColor: value })} />
      </div>
    );
  }

  if (block.type === "text") {
    return (
      <div className="space-y-3">
        <label className="block text-xs text-text-muted">
          Body HTML
          <textarea value={block.data.html} onChange={(event) => onUpdate({ html: event.target.value })} className="premium-input mt-1 min-h-40 w-full rounded-card px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent-gold" />
        </label>
        <ColorInput label="Text color" value={block.data.color} onChange={(value) => onUpdate({ color: value })} />
      </div>
    );
  }

  if (block.type === "button") {
    return (
      <div className="space-y-3">
        <TextInput label="Button text" value={block.data.text} onChange={(value) => onUpdate({ text: value })} />
        <TextInput label="Button URL" value={block.data.url} onChange={(value) => onUpdate({ url: value })} />
        <ColorInput label="Button color" value={block.data.bgColor} onChange={(value) => onUpdate({ bgColor: value })} />
        <AlignSelect value={block.data.align} onChange={(value) => onUpdate({ align: value })} />
      </div>
    );
  }

  if (block.type === "header") {
    return (
      <div className="space-y-3">
        <TextInput label="Brand text" value={block.data.logoText} onChange={(value) => onUpdate({ logoText: value })} />
        <ColorInput label="Background" value={block.data.bgColor} onChange={(value) => onUpdate({ bgColor: value })} />
        <ColorInput label="Text color" value={block.data.textColor} onChange={(value) => onUpdate({ textColor: value })} />
        <AlignSelect value={block.data.align} onChange={(value) => onUpdate({ align: value })} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <TextInput label="Headline" value={block.data.text} onChange={(value) => onUpdate({ text: value })} />
      <ColorInput label="Text color" value={block.data.color} onChange={(value) => onUpdate({ color: value })} />
      <AlignSelect value={block.data.align} onChange={(value) => onUpdate({ align: value })} />
    </div>
  );
}

function DeviceButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center rounded-card border shadow-card transition ${
        active ? "border-accent-gold/40 bg-accent-gold text-white shadow-glow" : "border-border bg-bg-panel text-text-secondary hover:bg-bg-panelHover hover:text-text-primary"
      }`}
      title={label}
    >
      {icon}
    </button>
  );
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-xs text-text-muted">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="premium-input mt-1 w-full rounded-card px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-accent-gold" />
    </label>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-xs text-text-muted">
      {label}
      <span className="mt-1 flex items-center gap-2">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-10 rounded-card border border-border bg-bg-panel p-1 shadow-card" />
        <input value={value} onChange={(event) => onChange(event.target.value)} className="premium-input min-w-0 flex-1 rounded-card px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-accent-gold" />
      </span>
    </label>
  );
}

function AlignSelect({ value, onChange }: { value: "left" | "center" | "right"; onChange: (value: "left" | "center" | "right") => void }) {
  return (
    <label className="block text-xs text-text-muted">
      Alignment
      <select value={value} onChange={(event) => onChange(event.target.value as "left" | "center" | "right")} className="premium-input mt-1 w-full rounded-card px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-accent-gold">
        <option value="left">Left</option>
        <option value="center">Center</option>
        <option value="right">Right</option>
      </select>
    </label>
  );
}

function personalizeTemplate(template: EmailTemplate, lead: SheetLead | null): EmailTemplate {
  const replacements: Record<string, string> = {
    firstName: lead?.firstName || lead?.fullName.split(" ")[0] || "there",
    fullName: lead?.fullName || "there",
    email: lead?.email || "",
    offer: lead?.offer || "your offer",
    businessName: lead?.businessName || "your business",
    status: lead?.status || "new lead",
    source: lead?.source || "direct",
  };
  const merge = (value: string) => value.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => replacements[key] ?? "");

  return {
    ...template,
    subject: merge(template.subject),
    preheader: merge(template.preheader),
    blocks: template.blocks.map((block) => ({
      ...block,
      data: Object.fromEntries(Object.entries(block.data).map(([key, value]) => [key, typeof value === "string" ? merge(value) : value])) as EmailBlock["data"],
    })) as EmailBlock[],
  };
}

function recipientsForMode(
  mode: SendMode,
  selectedLead: SheetLead | null,
  selectedLeads: SheetLead[],
  filteredLeads: SheetLead[],
  manualRecipients: string
) {
  if (mode === "manual") {
    return parseRecipientInput(manualRecipients).map((email) => ({ email, lead: selectedLead }));
  }

  if (mode === "selected") {
    return selectedLeads.map((lead) => ({ email: lead.email, lead }));
  }

  if (mode === "filtered") {
    return filteredLeads.map((lead) => ({ email: lead.email, lead }));
  }

  return selectedLead ? [{ email: selectedLead.email, lead: selectedLead }] : [];
}

function parseRecipientInput(value: string) {
  return value
    .split(/[\n,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter((email, index, list) => email && list.indexOf(email) === index);
}

function parseRowsParam(value: string | null) {
  return (value || "")
    .split(",")
    .map((row) => Number(row.trim()))
    .filter((row, index, rows) => Number.isFinite(row) && rows.indexOf(row) === index);
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function loadTemplates() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]") as EmailTemplate[];
    return parsed.length ? parsed : presets.map(cloneTemplate);
  } catch {
    return presets.map(cloneTemplate);
  }
}

function persist(templates: EmailTemplate[]) {
  localStorage.setItem(storageKey, JSON.stringify(templates));
  return templates;
}

function cloneTemplate(template: EmailTemplate): EmailTemplate {
  return {
    ...template,
    id: `${template.id}-${makeId()}`,
    blocks: template.blocks.map((block) => ({ ...block, id: makeId(), data: { ...block.data } })) as EmailBlock[],
    global: { ...template.global },
  };
}

function makeBlock(type: EmailBlock["type"]): EmailBlock {
  if (type === "header") return header("Nexus Luma", "#151218");
  if (type === "headline") return headline("Your headline", "#151218", "left");
  if (type === "button") return button("Take the next step", "https://nexusluma.com", "#c9a55c");
  if (type === "divider") return divider();
  if (type === "footer") return footer();
  return text("<p>Write a clear, useful message for {{firstName}} here.</p>");
}

function header(logoText: string, bgColor: string): EmailBlock {
  return { id: makeId(), type: "header", data: { logoText, bgColor, textColor: "#ffffff", align: "center" } };
}

function headline(textValue: string, color: string, align: "left" | "center" | "right"): EmailBlock {
  return { id: makeId(), type: "headline", data: { text: textValue, color, align } };
}

function text(html: string): EmailBlock {
  return { id: makeId(), type: "text", data: { html, color: "#444455" } };
}

function button(textValue: string, url: string, bgColor: string): EmailBlock {
  return { id: makeId(), type: "button", data: { text: textValue, url, bgColor, textColor: "#ffffff", align: "center" } };
}

function divider(): EmailBlock {
  return { id: makeId(), type: "divider", data: { color: "#e5e0da" } };
}

function footer(): EmailBlock {
  return {
    id: makeId(),
    type: "footer",
    data: {
      text: "Nexus Luma - 123 Main Street, Charlotte, NC",
      unsubText: "Unsubscribe",
      unsubUrl: "#",
      bgColor: "#fafaf9",
      textColor: "#9ca3af",
    },
  };
}

function defaultGlobal(accentColor: string) {
  return {
    bgColor: "#f4f4f7",
    contentBgColor: "#ffffff",
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
    accentColor,
  };
}

function makeId() {
  return Math.random().toString(36).slice(2, 9);
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "email-template";
}
