import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Activity, Lock, Mic, Navigation, Radio, Send, Volume2, VolumeX, X } from "lucide-react";
import { useSylusStore } from "@/store/useSylusStore";

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  }
}

export default function SylusPanel() {
  const navigate = useNavigate();
  const { open, toggle, messages, loading, ask } = useSylusStore();
  const [input, setInput] = useState("");
  const [alwaysListening, setAlwaysListening] = useState(true);
  const [speakResponses, setSpeakResponses] = useState(true);
  const [voiceDetected, setVoiceDetected] = useState(false);
  const voicePulseTimer = useRef<number | null>(null);
  const liveUpdates = useQuery({
    queryKey: ["sylus-live-updates"],
    queryFn: () => window.nexusLuma.sylus.liveUpdates(),
    enabled: open,
    refetchInterval: open ? 900_000 : false,
  });
  const voiceStatus = useQuery({
    queryKey: ["sylus-voice-status"],
    queryFn: () => window.nexusLuma.sylus.voiceStatus(),
    enabled: open,
  });
  const speechSupported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  const speechOutputSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!open || !speakResponses || !speechOutputSupported) return;
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "assistant" || lastMessage.content.startsWith("Error:")) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(lastMessage.content);
    utterance.rate = 0.95;
    utterance.pitch = 0.92;
    utterance.volume = 0.92;
    window.speechSynthesis.speak(utterance);
    return () => window.speechSynthesis.cancel();
  }, [messages, open, speakResponses, speechOutputSupported]);

  useEffect(() => {
    if (!alwaysListening || !speechSupported) return;

    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) return;

    let disposed = false;
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .flatMap((result) => Array.from(result).map((item) => item.transcript))
        .join(" ")
        .toLowerCase();
      if (/\byo\s+(syrus|cyrus|serious|sy rus|sylus)\b/.test(transcript)) {
        setVoiceDetected(true);
        if (voicePulseTimer.current) window.clearTimeout(voicePulseTimer.current);
        voicePulseTimer.current = window.setTimeout(() => setVoiceDetected(false), 2400);
        if (!open) {
          toggle();
        }
      }
    };
    recognition.onend = () => {
      if (alwaysListening && !disposed) {
        try {
          recognition.start();
        } catch {
          /* Already started or microphone permission was denied. */
        }
      }
    };

    try {
      recognition.start();
    } catch {
      return;
    }

    return () => {
      disposed = true;
      recognition.stop();
      if (voicePulseTimer.current) window.clearTimeout(voicePulseTimer.current);
    };
  }, [alwaysListening, open, speechSupported, toggle]);

  if (!open) {
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const action = await ask(input.trim());
    if (action?.type === "navigate") {
      navigate(action.path);
    }
    setInput("");
  }

  return (
    <div className="fixed right-5 bottom-5 z-50 w-[390px] max-h-[calc(100vh-40px)] bg-bg-secondary border border-border rounded-card shadow-card flex flex-col overflow-hidden">
      <div
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 h-16 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-accent-goldMuted text-accent-gold flex items-center justify-center">
              <VoiceOrb active={voiceDetected || loading} compact />
            </span>
            <div>
              <div className="text-sm font-medium">SYRUS Voice</div>
              <div className="text-[11px] text-text-muted">Admin-only voice assistant</div>
            </div>
          </div>
          <button onClick={toggle} className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-panelHover">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[calc(100vh-156px)] overflow-y-auto p-4 space-y-3">
          <div className="panel p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-medium">
                <Radio size={14} className={alwaysListening ? "text-status-success" : "text-text-muted"} />
                Always Listening
              </div>
              <button
                onClick={() => setAlwaysListening((value) => !value)}
                className={`w-10 h-5 rounded-pill p-0.5 transition-colors ${alwaysListening ? "bg-status-success" : "bg-bg-panelHover"}`}
              >
                <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${alwaysListening ? "translate-x-5" : ""}`} />
              </button>
            </div>
            <div className="rounded-card bg-bg-panel border border-border px-3 py-2">
              <div className="text-[10px] text-text-muted">Wake phrase</div>
              <div className="text-sm font-semibold">Yo SYRUS</div>
              <div className="text-[11px] text-text-muted mt-1">Pronounced: SYY RR UHH SSS</div>
              <div className="mt-2 flex items-center gap-1.5">
                {["Yo", "SYY", "RR", "UHH", "SSS"].map((part) => (
                  <span key={part} className={`syrus-syllable ${voiceDetected ? "is-speaking" : ""}`}>
                    {part}
                  </span>
                ))}
              </div>
              {!speechSupported && (
                <div className="text-[11px] text-status-warning mt-2">Wake listening needs VAPI or browser speech support.</div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 rounded-card bg-bg-panel border border-border px-3 py-2">
              <div className="flex items-center gap-2 text-xs font-medium">
                {speakResponses ? <Volume2 size={14} className="text-status-success" /> : <VolumeX size={14} className="text-text-muted" />}
                Speak Answers
              </div>
              <button
                onClick={() => {
                  if (speakResponses && speechOutputSupported) window.speechSynthesis.cancel();
                  setSpeakResponses((value) => !value);
                }}
                disabled={!speechOutputSupported}
                className={`w-10 h-5 rounded-pill p-0.5 transition-colors disabled:opacity-40 ${speakResponses ? "bg-status-success" : "bg-bg-panelHover"}`}
              >
                <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${speakResponses ? "translate-x-5" : ""}`} />
              </button>
            </div>
          </div>

          <div className="panel p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-medium">
                <Activity size={14} className="text-accent-gold" />
                Live Updates
              </div>
              <span className="text-[10px] text-text-muted">{liveUpdates.data?.source ?? "checking"}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(liveUpdates.data?.updates ?? []).map((update) => (
                <div key={update.label} className="rounded-card bg-bg-panel border border-border px-3 py-2">
                  <div className="text-[10px] text-text-muted">{update.label}</div>
                  <div className={`text-sm font-semibold ${toneClass(update.tone)}`}>{update.value}</div>
                </div>
              ))}
            </div>
            {liveUpdates.data?.prompts.length ? (
              <div className="flex flex-wrap gap-2">
                {liveUpdates.data.prompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => setInput(prompt)}
                    className="rounded-pill bg-bg-panel border border-border px-2.5 py-1 text-[11px] text-text-secondary hover:text-text-primary"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="panel p-3 flex items-start gap-3">
            <span className="w-8 h-8 rounded-full bg-bg-panel border border-border flex items-center justify-center text-text-muted">
              <Mic size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium">Voice lane</div>
              <p className="text-[11px] text-text-muted mt-1">
                {voiceStatus.data?.configured
                  ? `VAPI ready with ${voiceStatus.data.provider}.`
                  : "VAPI voice is separate from Lead Text; add VAPI plus Anthropic or OpenAI keys to activate live wake-word audio."}
              </p>
            </div>
            <Lock size={13} className="text-accent-gold shrink-0" />
          </div>

          {messages.length === 0 && (
            <p className="text-sm text-text-muted">
              Try: "How many leads do I have?", "Which leads need attention?", or "Open Email Studio."
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`text-sm ${m.role === "user" ? "text-text-primary" : "text-text-secondary"}`}>
              <div className={`inline-block max-w-[90%] rounded-lg px-3 py-2 ${
                m.role === "user" ? "bg-accent-goldMuted text-text-primary ml-auto" : "bg-bg-panel border border-border"
              }`}>
                {m.content}
              </div>
              {m.role === "assistant" && m.groundedOn && (
                <div className="text-[10px] text-text-muted mt-1 flex items-center gap-1">
                  {m.action ? <Navigation size={11} /> : null}
                  source: {m.groundedOn}{m.action ? ` · opened ${m.action.label}` : ""}
                </div>
              )}
            </div>
          ))}
          {loading && <div className="text-xs text-text-muted">SYRUS is thinking...</div>}
        </div>

        <form onSubmit={handleSubmit} className="p-3 border-t border-border-subtle flex items-center gap-2">
          <button type="button" className="p-2 rounded-full bg-bg-panel border border-border text-text-muted hover:text-accent-gold transition-colors" title="Voice input via VAPI">
            <Mic size={15} />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type or say a SYRUS command..."
            className="flex-1 bg-bg-panel border border-border rounded-full px-3 py-2 text-sm outline-none focus:border-accent-gold"
          />
          <button type="submit" className="p-2 rounded-full bg-accent-gold text-bg-primary hover:brightness-110 transition">
            <Send size={15} />
          </button>
        </form>
      </div>
    </div>
  );
}

function toneClass(tone: "info" | "success" | "warning" | "error") {
  if (tone === "success") return "text-status-success";
  if (tone === "warning") return "text-status-warning";
  if (tone === "error") return "text-status-error";
  return "text-status-info";
}

export function VoiceOrb({ active, compact = false }: { active: boolean; compact?: boolean }) {
  return (
    <span className={`syrus-voice-orb-shell ${compact ? "is-compact" : ""}`} aria-hidden="true">
      <span className={`syrus-voice-loader ${active ? "is-active" : "is-idle"}`}>
        <svg width="100" height="100" viewBox="0 0 100 100">
          <defs>
            <mask id={compact ? "syrus-clipping-compact" : "syrus-clipping"}>
              <polygon points="0,0 100,0 100,100 0,100" fill="black" />
              <polygon points="25,25 75,25 50,75" fill="white" />
              <polygon points="50,25 75,75 25,75" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
            </mask>
          </defs>
        </svg>
        <span
          className="syrus-voice-box"
          style={{ mask: `url(#${compact ? "syrus-clipping-compact" : "syrus-clipping"})`, WebkitMask: `url(#${compact ? "syrus-clipping-compact" : "syrus-clipping"})` }}
        />
      </span>
    </span>
  );
}
