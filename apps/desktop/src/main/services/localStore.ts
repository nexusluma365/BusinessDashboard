import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";

/**
 * Small local store for two kinds of data:
 *  - non-sensitive app settings (spreadsheet ID, sheet/tab name, AI provider
 *    preference) — plain JSON
 *  - sensitive tokens (Google OAuth refresh token) — encrypted at rest via
 *    Electron's safeStorage (OS keychain-backed on macOS/Windows)
 *
 * Nothing here is ever sent to the renderer directly; the renderer only
 * calls IPC methods that return the *data* (leads, status flags), never
 * the raw tokens or keys.
 */

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function tokenPath() {
  return path.join(app.getPath("userData"), "google.token.enc");
}

export type AppSettings = {
  googleSpreadsheetId?: string;
  googleSheetName?: string; // tab/sheet name, e.g. "Leads"
  aiProvider?: "anthropic" | "openai";
};

export function readSettings(): AppSettings {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), "utf-8"));
  } catch {
    return {};
  }
}

export function writeSettings(patch: Partial<AppSettings>) {
  const current = readSettings();
  const next = { ...current, ...patch };
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), "utf-8");
  return next;
}

export function saveGoogleToken(tokenJson: string) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS-level secure storage is unavailable on this machine.");
  }
  const encrypted = safeStorage.encryptString(tokenJson);
  fs.writeFileSync(tokenPath(), encrypted);
}

export function loadGoogleToken(): string | null {
  try {
    const encrypted = fs.readFileSync(tokenPath());
    return safeStorage.decryptString(encrypted);
  } catch {
    return null;
  }
}

export function clearGoogleToken() {
  try {
    fs.unlinkSync(tokenPath());
  } catch {
    /* no-op if it never existed */
  }
}
