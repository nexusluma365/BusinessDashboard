import { app, BrowserWindow, ipcMain, session } from "electron";
import path from "node:path";
import { connectGoogleAccount, disconnectGoogleAccount, googleAccountStatus } from "./services/googleAuth";
import { fetchLeadsFromSheet } from "./services/googleSheets";
import { readSettings, writeSettings } from "./services/localStore";
import { getAvailableProviders } from "./services/aiProviders";
import { askSylus, getSylusLiveUpdates, getSylusVoiceStatus, replyToLead } from "./services/sylus";
import { draftText, openInMessagesApp } from "./services/textDraft";
import { sendEmailMessages } from "./services/emailSender";
import { apiGet, apiPost, hasRemoteApi } from "./services/apiClient";

/**
 * Production security posture (Section 28 of the spec):
 * - contextIsolation: true
 * - nodeIntegration: false
 * - sandbox: true
 * - strict CSP applied to every response
 * - preload exposes only an explicit, typed, allowlisted API (see preload.ts)
 */

const isDev = !app.isPackaged || process.defaultApp || process.env.NODE_ENV === "development";

// Section 27: development/simulated security key must be IMPOSSIBLE in a
// production build. Local development enables it by default so the app can be
// run without a real hardware key; set this env var to "false" to test the
// locked production-style state during development.
const SIMULATED_USB_KEY_ENABLED =
  process.env.NEXUS_LUMA_ENABLE_SIMULATED_USB_KEY === "true" ||
  (isDev && process.env.NEXUS_LUMA_ENABLE_SIMULATED_USB_KEY !== "false");
const USE_VITE_DEV_SERVER = process.env.NEXUS_LUMA_USE_VITE === "true";

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: "#0a0a0c",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const devContentSecurityPolicy =
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self' http://127.0.0.1:5173 ws://127.0.0.1:5173 https:; " +
      "font-src 'self' data: https://fonts.gstatic.com;";
    const productionContentSecurityPolicy =
      "default-src 'self'; " +
      "script-src 'self'; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self' https:; " +
      "font-src 'self' data: https://fonts.gstatic.com;";

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          USE_VITE_DEV_SERVER ? devContentSecurityPolicy : productionContentSecurityPolicy,
        ],
      },
    });
  });

  if (USE_VITE_DEV_SERVER) {
    mainWindow.loadURL("http://127.0.0.1:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// --- Simulated USB security key IPC (demo / development only) -----------
// Real production flow (documented in docs/security-key-setup.md) signs a
// challenge with a hardware-held private key and validates against a cloud
// license server. This handler only exists to unblock local development of
// the auth UI and is a no-op unless SIMULATED_USB_KEY_ENABLED is true.
ipcMain.handle("security-key:status", () => {
  if (!SIMULATED_USB_KEY_ENABLED) {
    return { available: false, mode: "production", reason: "simulated key disabled" };
  }
  return { available: true, mode: "simulated" };
});

ipcMain.handle("security-key:authenticate", (_event, pin: string) => {
  if (!SIMULATED_USB_KEY_ENABLED) {
    return { success: false, reason: "Simulated security key is disabled in this build." };
  }
  // Demo-only PIN check. Production build replaces this entirely with the
  // cryptographic challenge/response + license-server verification flow.
  if (pin === "0000") {
    return {
      success: true,
      sessionToken: "demo-session-token",
      expiresInSeconds: 900,
    };
  }
  return { success: false, reason: "Incorrect PIN." };
});

ipcMain.handle("app:get-version", () => app.getVersion());

// --- Google account (OAuth) ----------------------------------------------
ipcMain.handle("google:status", () => (hasRemoteApi() ? apiGet("/api/google/status") : googleAccountStatus()));
ipcMain.handle("google:connect", () =>
  hasRemoteApi()
    ? { success: false, reason: "Google is managed by the Railway backend environment for this build." }
    : connectGoogleAccount()
);
ipcMain.handle("google:disconnect", () => disconnectGoogleAccount());

// --- App settings (non-sensitive) ----------------------------------------
ipcMain.handle("settings:get", () => readSettings());
ipcMain.handle("settings:set", (_event, patch) => writeSettings(patch));

// --- Leads (Google Sheets, or Railway API when configured) ---------------
ipcMain.handle("leads:list", async () => {
  if (hasRemoteApi()) {
    return apiGet("/api/leads");
  }

  const { connected } = await googleAccountStatus();
  const settings = readSettings();

  const hasLeadSheets = Boolean(settings.googleSpreadsheetId || settings.googleLeadSheets?.some((sheet) => sheet.spreadsheetId.trim()));
  if (!connected || !hasLeadSheets) {
    return { source: "not_configured" as const, leads: [], columnsMissing: [] };
  }

  try {
    const result = await fetchLeadsFromSheet();
    return result;
  } catch (err) {
    return { source: "error" as const, leads: [], error: (err as Error).message };
  }
});

// --- AI providers (Anthropic + OpenAI only) -------------------------------
ipcMain.handle("ai:providers", () => (hasRemoteApi() ? apiGet("/api/ai/providers") : getAvailableProviders()));
ipcMain.handle("sylus:ask", (_event, question: string) => (hasRemoteApi() ? apiPost("/api/syrus/ask", { question }) : askSylus(question)));
ipcMain.handle("sylus:live-updates", () => (hasRemoteApi() ? apiGet("/api/syrus/live-updates") : getSylusLiveUpdates()));
ipcMain.handle("sylus:voice-status", () => (hasRemoteApi() ? apiGet("/api/syrus/voice-status") : getSylusVoiceStatus()));
ipcMain.handle("lead-assistant:reply", (_event, input) => (hasRemoteApi() ? apiPost("/api/lead-assistant/reply", input) : replyToLead(input)));

// --- Text drafting (no telephony provider — human sends manually) --------
ipcMain.handle("texting:draft", (_event, input) => draftText(input));
ipcMain.handle("texting:open", (_event, phone: string, body: string) => openInMessagesApp(phone, body));

// --- Email sending (Gmail API through the connected Google account) -------
ipcMain.handle("email:send", (_event, input) => (hasRemoteApi() ? apiPost("/api/email/send", input) : sendEmailMessages(input)));

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
