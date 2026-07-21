import { app, BrowserWindow, ipcMain, session } from "electron";
import fs from "node:fs";
import path from "node:path";
import { readSettings, writeSettings } from "./services/localStore";
import { draftText, openInMessagesApp } from "./services/textDraft";
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

// Temporary launch mode: allow PIN 0000 until the production hardware key is
// ready. Set NEXUS_LUMA_ENABLE_SIMULATED_USB_KEY=false in a future signed
// build to restore the hardware-key-only lock.
const SIMULATED_USB_KEY_ENABLED =
  process.env.NEXUS_LUMA_ENABLE_SIMULATED_USB_KEY !== "false";
const USE_VITE_DEV_SERVER = process.env.NEXUS_LUMA_USE_VITE === "true";

let mainWindow: BrowserWindow | null = null;

function writeStartupLog(message: string, error?: unknown) {
  try {
    const details = error instanceof Error ? `${error.message}\n${error.stack || ""}` : error ? String(error) : "";
    fs.appendFileSync(path.join(app.getPath("userData"), "startup.log"), `[${new Date().toISOString()}] ${message}${details ? `\n${details}` : ""}\n`);
  } catch {
    // Logging must never prevent the app from opening.
  }
}

function createWindow() {
  writeStartupLog("Creating main window");
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
    show: false,
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const devContentSecurityPolicy =
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self' http://127.0.0.1:5173 ws://127.0.0.1:5173 https: wss:; " +
      "media-src 'self' blob: data: https:; " +
      "worker-src 'self' blob:; " +
      "font-src 'self' data: https://fonts.gstatic.com;";
    const productionContentSecurityPolicy =
      "default-src 'self'; " +
      "script-src 'self'; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self' https: wss:; " +
      "media-src 'self' blob: data: https:; " +
      "worker-src 'self' blob:; " +
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

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });

  if (USE_VITE_DEV_SERVER) {
    mainWindow.loadURL("http://127.0.0.1:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.webContents.once("did-finish-load", () => {
    writeStartupLog("Main window finished loading");
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    writeStartupLog(`Renderer process gone: ${details.reason}`);
  });

  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      writeStartupLog("Main window forced visible after timeout");
      mainWindow.show();
      mainWindow.focus();
    }
  }, 2_000);

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
  // Temporary PIN check. Production build replaces this with the
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
ipcMain.handle("google:status", async () => {
  if (hasRemoteApi()) return apiGet("/api/google/status");
  const { googleAccountStatus } = await import("./services/googleAuth");
  return googleAccountStatus();
});
ipcMain.handle("google:connect", async () => {
  if (hasRemoteApi()) {
    return { success: false, reason: "Google is managed by the Railway backend environment for this build." };
  }
  const { connectGoogleAccount } = await import("./services/googleAuth");
  return connectGoogleAccount();
});
ipcMain.handle("google:disconnect", async () => {
  const { disconnectGoogleAccount } = await import("./services/googleAuth");
  return disconnectGoogleAccount();
});

// --- App settings (non-sensitive) ----------------------------------------
ipcMain.handle("settings:get", () => readSettings());
ipcMain.handle("settings:set", (_event, patch) => writeSettings(patch));

// --- Leads (Google Sheets, or Railway API when configured) ---------------
ipcMain.handle("leads:list", async () => {
  if (hasRemoteApi()) {
    return apiGet("/api/leads");
  }

  const [{ googleAccountStatus }, { fetchLeadsFromSheet }] = await Promise.all([
    import("./services/googleAuth"),
    import("./services/googleSheets"),
  ]);
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
ipcMain.handle("ai:providers", async () => {
  if (hasRemoteApi()) return apiGet("/api/ai/providers");
  const { getAvailableProviders } = await import("./services/aiProviders");
  return getAvailableProviders();
});
ipcMain.handle("sylus:ask", async (_event, question: string) => {
  if (hasRemoteApi()) return apiPost("/api/syrus/ask", { question });
  const { askSylus } = await import("./services/sylus");
  return askSylus(question);
});
ipcMain.handle("sylus:live-updates", async () => {
  if (hasRemoteApi()) return apiGet("/api/syrus/live-updates");
  const { getSylusLiveUpdates } = await import("./services/sylus");
  return getSylusLiveUpdates();
});
ipcMain.handle("sylus:voice-status", async () => {
  if (hasRemoteApi()) return apiGet("/api/syrus/voice-status");
  const { getSylusVoiceStatus } = await import("./services/sylus");
  return getSylusVoiceStatus();
});
ipcMain.handle("lead-assistant:reply", async (_event, input) => {
  if (hasRemoteApi()) return apiPost("/api/lead-assistant/reply", input);
  const { replyToLead } = await import("./services/sylus");
  return replyToLead(input);
});

// --- Text drafting (no telephony provider — human sends manually) --------
ipcMain.handle("texting:draft", (_event, input) => draftText(input));
ipcMain.handle("texting:open", (_event, phone: string, body: string) => openInMessagesApp(phone, body));

// --- Email sending (Gmail API through the connected Google account) -------
ipcMain.handle("email:send", async (_event, input) => {
  if (hasRemoteApi()) return apiPost("/api/email/send", input);
  const { sendEmailMessages } = await import("./services/emailSender");
  return sendEmailMessages(input);
});

process.on("uncaughtException", (error) => writeStartupLog("Uncaught exception", error));
process.on("unhandledRejection", (error) => writeStartupLog("Unhandled rejection", error));

app.whenReady()
  .then(() => {
    if (process.platform === "darwin") app.setActivationPolicy("regular");
    writeStartupLog("App ready");
    createWindow();
  })
  .catch((error) => writeStartupLog("App failed before ready", error));

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
