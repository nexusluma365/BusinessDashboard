export {};

export type SheetLead = {
  rowNumber: number;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  businessName: string;
  website: string;
  offer: string;
  product: string;
  source: string;
  campaign: string;
  utmSource: string;
  utmMedium: string;
  submittedAt: string;
  purchased: boolean;
  paymentAmount: string;
  paymentStatus: string;
  status: string;
  notes: string;
  sheetOffer: string;
  spreadsheetName?: string;
  sheetName: string;
  spreadsheetId: string;
  sourceRowNumber: number;
  raw: Record<string, string>;
};

export type LeadsResult = {
  source: "google_sheets" | "webhook_google_sheets" | "webhook" | "not_configured" | "error";
  leads: SheetLead[];
  columnsMissing?: string[];
  sheetErrors?: Array<{ offer: string; spreadsheetName?: string; spreadsheetId: string; sheetName: string; error: string }>;
  error?: string;
};

export type AppSettings = {
  googleSpreadsheetId?: string;
  googleSheetName?: string;
  googleLeadSheets?: LeadSheetConfig[];
  aiProvider?: "anthropic" | "openai";
};

export type LeadSheetConfig = {
  offer: "Web Design" | "High Income Skills" | "Digital Products" | "Credit Repair";
  spreadsheetName?: string;
  spreadsheetId: string;
  sheetName?: string;
};

declare global {
  interface Window {
    nexusLuma: {
      securityKey: {
        status: () => Promise<{ available: boolean; mode: string; reason?: string }>;
        authenticate: (
          pin: string
        ) => Promise<{ success: boolean; sessionToken?: string; expiresInSeconds?: number; reason?: string }>;
      };
      app: {
        getVersion: () => Promise<string>;
      };
      google: {
        status: () => Promise<{ configured: boolean; connected: boolean }>;
        connect: () => Promise<{ success: boolean; reason?: string }>;
        disconnect: () => Promise<void>;
      };
      settings: {
        get: () => Promise<AppSettings>;
        set: (patch: Partial<AppSettings>) => Promise<AppSettings>;
      };
      leads: {
        list: () => Promise<LeadsResult>;
      };
      ai: {
        providers: () => Promise<Array<"anthropic" | "openai">>;
      };
      sylus: {
        ask: (question: string) => Promise<{
          answer: string;
          groundedOn: string;
          action?: { type: "navigate"; path: string; label: string };
        }>;
        liveUpdates: () => Promise<{
          source: string;
          updates: Array<{ label: string; value: string; tone: "info" | "success" | "warning" | "error" }>;
          prompts: string[];
        }>;
        voiceStatus: () => Promise<{
          configured: boolean;
          vapiConfigured: boolean;
          aiConfigured: boolean;
          provider: "anthropic" | "openai" | null;
          mode: "admin_voice";
          wakePhrase: string;
          pronunciation: string;
        }>;
      };
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
        }) => Promise<{ reply: string } | { error: string }>;
      };
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
        }) => Promise<{ draft: string } | { error: string }>;
        open: (phone: string, body: string) => Promise<{ success: boolean; reason?: string }>;
      };
      email: {
        send: (input: { messages: Array<{ to: string; subject: string; html: string }> }) => Promise<{
          success: boolean;
          results: Array<{ email: string; status: "sent" | "error"; message?: string }>;
          error?: string;
        }>;
      };
    };
  }
}
