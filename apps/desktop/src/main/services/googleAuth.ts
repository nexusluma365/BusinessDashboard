import { OAuth2Client } from "google-auth-library";
import { shell } from "electron";
import http from "node:http";
import { URL } from "node:url";
import { loadGoogleToken, saveGoogleToken, clearGoogleToken } from "./localStore";

/**
 * OAuth ("sign in with your own Google account") flow for a desktop app,
 * using the standard loopback-redirect pattern Google recommends for
 * installed apps (no client secret needs to be treated as truly secret,
 * but we still never expose it to the renderer).
 *
 * Gmail send is intentionally limited to composing/sending mail as the
 * connected user; Sheets stay read-only.
 */
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "openid",
  "email",
];

let cachedClient: OAuth2Client | null = null;

function createClient(redirectUri?: string) {
  return new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  });
}

export function isGoogleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export async function getAuthorizedClient(): Promise<OAuth2Client | null> {
  if (!isGoogleConfigured()) return null;

  const savedToken = loadGoogleToken();
  if (!savedToken) return null;

  if (cachedClient) return cachedClient;

  const client = createClient();
  client.setCredentials(JSON.parse(savedToken));
  client.on("tokens", (tokens) => {
    // Persist rotated/refreshed tokens automatically.
    const merged = { ...JSON.parse(savedToken), ...tokens };
    saveGoogleToken(JSON.stringify(merged));
  });
  cachedClient = client;
  return client;
}

/**
 * Opens the user's system browser to Google's consent screen, spins up a
 * short-lived local HTTP server to catch the OAuth redirect, exchanges the
 * code for tokens, and stores them encrypted on disk.
 */
export function connectGoogleAccount(): Promise<{ success: boolean; email?: string; reason?: string }> {
  return new Promise((resolve) => {
    if (!isGoogleConfigured()) {
      resolve({ success: false, reason: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set." });
      return;
    }

    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? "", "http://127.0.0.1");
        const code = url.searchParams.get("code");
        if (!code) throw new Error("No authorization code returned.");

        const port = (server.address() as { port: number }).port;
        const client = createClient(`http://127.0.0.1:${port}/oauth2callback`);
        const { tokens } = await client.getToken(code);
        client.setCredentials(tokens);
        saveGoogleToken(JSON.stringify(tokens));
        cachedClient = client;

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<html><body style="font-family:sans-serif;background:#0a0a0c;color:#f4f3ef;display:flex;
          align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center"><h2>Nexus Luma connected ✅</h2>
          <p>You can close this tab and return to the app.</p></div></body></html>`);
        server.close();
        resolve({ success: true });
      } catch (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Authentication failed. You can close this tab.");
        server.close();
        resolve({ success: false, reason: (err as Error).message });
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      const client = createClient(`http://127.0.0.1:${port}/oauth2callback`);
      const authUrl = client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: SCOPES,
      });
      shell.openExternal(authUrl);
    });
  });
}

export function disconnectGoogleAccount() {
  clearGoogleToken();
  cachedClient = null;
}

export async function googleAccountStatus() {
  const configured = isGoogleConfigured();
  const client = configured ? await getAuthorizedClient() : null;
  return { configured, connected: Boolean(client) };
}
