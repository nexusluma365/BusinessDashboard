import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SheetLead } from "@/lib/bridge";
import { leadId } from "@/lib/leadIdentity";
import { useNotificationsStore } from "@/store/useNotificationsStore";

const knownLeadsKey = "nexus-luma-known-lead-ids";
const lastLeadSoundKey = "nexus-luma-last-lead-alert-sound";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export default function LeadMonitor() {
  const addNotification = useNotificationsStore((state) => state.addNotification);
  const initialized = useRef(false);

  const leadsQuery = useQuery({
    queryKey: ["leads"],
    queryFn: () => window.nexusLuma.leads.list(),
    refetchInterval: 900_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const leads = leadsQuery.data?.leads ?? [];
    if (!leads.length) return;

    const known = loadKnownLeadIds();
    const currentIds = leads.map((lead) => leadId(lead));
    const freshLeads = leads.filter((lead) => !known.has(leadId(lead)));

    if (!initialized.current && known.size === 0) {
      saveKnownLeadIds(currentIds);
      initialized.current = true;
      addNotification({
        id: "lead-monitor-ready",
        title: "Live lead monitor connected",
        description: `${leads.length} leads are now being watched from Google Sheets.`,
        timeline: "Now",
        type: "update_available",
        unread: false,
      });
      return;
    }

    initialized.current = true;
    if (!freshLeads.length) {
      saveKnownLeadIds(currentIds);
      return;
    }

    for (const lead of freshLeads.slice(-10).reverse()) {
      addNotification({
        id: `new-lead-${leadId(lead)}`,
        title: `New lead: ${lead.fullName || lead.email || "Not Available yet"}`,
        description: [
          lead.offer || lead.product || "Not Available yet",
          lead.email || lead.phone || "No contact listed",
          lead.spreadsheetName || lead.sheetName || "Google Sheets",
        ].join(" · "),
        timeline: relativeTimeline(lead),
        type: lead.purchased ? "sale" : "new_lead",
      });
    }

    saveKnownLeadIds(currentIds);
    playLeadAlertSound();
  }, [addNotification, leadsQuery.data?.leads]);

  return null;
}

function loadKnownLeadIds() {
  try {
    const saved = JSON.parse(localStorage.getItem(knownLeadsKey) || "[]") as string[];
    return new Set(saved);
  } catch {
    return new Set<string>();
  }
}

function saveKnownLeadIds(ids: string[]) {
  localStorage.setItem(knownLeadsKey, JSON.stringify(Array.from(new Set(ids)).slice(-5000)));
}

function relativeTimeline(lead: SheetLead) {
  const submitted = new Date(lead.submittedAt);
  if (Number.isNaN(submitted.getTime())) return "New";
  const minutes = Math.max(0, Math.round((Date.now() - submitted.getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return submitted.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function playLeadAlertSound() {
  const lastSoundAt = Number(localStorage.getItem(lastLeadSoundKey) || 0);
  if (Date.now() - lastSoundAt < 4_000) return;
  localStorage.setItem(lastLeadSoundKey, String(Date.now()));

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.42);
    gain.connect(context.destination);

    [660, 990, 1320].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, context.currentTime + index * 0.08);
      oscillator.connect(gain);
      oscillator.start(context.currentTime + index * 0.08);
      oscillator.stop(context.currentTime + 0.42);
    });

    window.setTimeout(() => void context.close(), 650);
  } catch {
    // Browser/Electron may block audio until the first user gesture.
  }
}
