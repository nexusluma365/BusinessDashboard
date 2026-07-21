import { contextBridge, ipcRenderer } from "electron";

/**
 * The only surface the renderer can touch. No direct Node/Electron access
 * is exposed — every call is a named, typed method that proxies to a single
 * ipcMain handler. Add new bridge methods deliberately; never expose
 * ipcRenderer.invoke directly.
 */
const api = {
  securityKey: {
    status: () => ipcRenderer.invoke("security-key:status"),
    authenticate: (pin: string) => ipcRenderer.invoke("security-key:authenticate", pin),
  },
  app: {
    getVersion: () => ipcRenderer.invoke("app:get-version"),
  },
  google: {
    status: () => ipcRenderer.invoke("google:status"),
    connect: () => ipcRenderer.invoke("google:connect"),
    disconnect: () => ipcRenderer.invoke("google:disconnect"),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (patch: Record<string, unknown>) => ipcRenderer.invoke("settings:set", patch),
  },
  leads: {
    list: () => ipcRenderer.invoke("leads:list"),
  },
  ai: {
    providers: () => ipcRenderer.invoke("ai:providers"),
  },
  sylus: {
    ask: (question: string) => ipcRenderer.invoke("sylus:ask", question),
    liveUpdates: () => ipcRenderer.invoke("sylus:live-updates"),
    voiceStatus: () => ipcRenderer.invoke("sylus:voice-status"),
    speak: (text: string) => ipcRenderer.invoke("sylus:speak", text),
    stopSpeaking: () => ipcRenderer.invoke("sylus:stop-speaking"),
  },
  leadAssistant: {
    reply: (input: {
      lead: {
        firstName: string;
        fullName: string;
        offer: string;
        businessName: string;
        website: string;
      };
      message: string;
      history: Array<{ role: "user" | "assistant"; content: string }>;
    }) => ipcRenderer.invoke("lead-assistant:reply", input),
  },
  texting: {
    draft: (input: {
      lead: {
        fullName: string;
        offer: string;
        status: string;
        businessName: string;
        notes: string;
        purchased: boolean;
      };
      instruction: string;
      history: Array<{ role: "user" | "assistant"; content: string }>;
    }) => ipcRenderer.invoke("texting:draft", input),
    open: (phone: string, body: string) => ipcRenderer.invoke("texting:open", phone, body),
  },
  email: {
    send: (input: { messages: Array<{ to: string; subject: string; html: string }> }) =>
      ipcRenderer.invoke("email:send", input),
  },
};

export type NexusLumaBridge = typeof api;

contextBridge.exposeInMainWorld("nexusLuma", api);
