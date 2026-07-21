export type EmailBlock =
  | { id: string; type: "header"; data: { logoText: string; bgColor: string; textColor: string; align: "left" | "center" | "right" } }
  | { id: string; type: "headline"; data: { text: string; color: string; align: "left" | "center" | "right" } }
  | { id: string; type: "text"; data: { html: string; color: string } }
  | { id: string; type: "button"; data: { text: string; url: string; bgColor: string; textColor: string; align: "left" | "center" | "right" } }
  | { id: string; type: "divider"; data: { color: string } }
  | { id: string; type: "footer"; data: { text: string; unsubText: string; unsubUrl: string; bgColor: string; textColor: string } };

export type EmailGlobals = {
  bgColor: string;
  contentBgColor: string;
  fontFamily: string;
  accentColor: string;
};

export type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  preheader: string;
  blocks: EmailBlock[];
  global: EmailGlobals;
};

export function buildEmailHtml(template: EmailTemplate) {
  const rows = template.blocks.map((block) => renderBlock(block, template.global)).join("\n");
  const preheader = template.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(template.preheader)}</div>`
    : "";

  return normalizeShortHexColors(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<title>${escapeHtml(template.subject || "Email")}</title>
<style>
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
  img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none;}
  body{margin:0;padding:0;background-color:${template.global.bgColor};}
  a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}
</style>
</head>
<body style="margin:0;padding:0;background-color:${template.global.bgColor};font-family:${template.global.fontFamily};">
${preheader}
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:${template.global.bgColor};">
<tr><td align="center" style="padding:24px 0 34px;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color:${template.global.contentBgColor};max-width:600px;width:100%;border-radius:0;overflow:hidden;">
    ${rows}
  </table>
</td></tr>
</table>
</body>
</html>`);
}

function renderBlock(block: EmailBlock, global: EmailGlobals) {
  switch (block.type) {
    case "header":
      return tr(`<td align="${block.data.align}" style="background-color:${escapeHtml(block.data.bgColor)};padding:20px 32px;">
        <span style="font-size:20px;font-weight:800;color:${escapeHtml(block.data.textColor)};font-family:${global.fontFamily};">${escapeHtml(block.data.logoText)}</span>
      </td>`);
    case "headline":
      return tr(`<td style="padding:26px 32px 10px;">
        <h1 style="margin:0;font-size:28px;font-weight:800;color:${escapeHtml(block.data.color)};text-align:${block.data.align};line-height:1.25;font-family:${global.fontFamily};">${escapeHtml(block.data.text)}</h1>
      </td>`);
    case "text":
      return tr(`<td style="padding:8px 32px 16px;font-family:${global.fontFamily};font-size:15px;line-height:1.75;color:${escapeHtml(block.data.color)};">
        ${sanitizeHtml(block.data.html)}
      </td>`);
    case "button": {
      const href = normalizeLink(block.data.url) || "#";
      return tr(`<td align="${block.data.align}" style="padding:12px 32px 24px;">
        <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:${escapeHtml(block.data.bgColor || global.accentColor)};color:${escapeHtml(block.data.textColor)};font-family:${global.fontFamily};font-size:15px;font-weight:800;text-decoration:none;padding:14px 28px;border-radius:8px;text-align:center;">${escapeHtml(block.data.text)}</a>
      </td>`);
    }
    case "divider":
      return tr(`<td style="padding:18px 32px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr><td style="border-top:1px solid ${escapeHtml(block.data.color)};font-size:0;line-height:0;">&nbsp;</td></tr>
        </table>
      </td>`);
    case "footer": {
      const href = normalizeLink(block.data.unsubUrl) || "#";
      return tr(`<td align="center" style="padding:18px 32px;background-color:${escapeHtml(block.data.bgColor)};border-top:1px solid #e5e0da;">
        <p style="margin:0;font-family:${global.fontFamily};font-size:12px;color:${escapeHtml(block.data.textColor)};line-height:1.8;">
          ${escapeHtml(block.data.text)}<br/>
          <a href="${escapeHtml(href)}" style="color:${escapeHtml(block.data.textColor)};text-decoration:underline;">${escapeHtml(block.data.unsubText)}</a>
        </p>
      </td>`);
    }
  }
}

function tr(inner: string) {
  return `<tr>${inner}</tr>`;
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeHtml(html: string) {
  return String(html || "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/on\w+="[^"]*"/gi, "")
    .replace(/javascript:/gi, "");
}

function normalizeLink(value: string) {
  const raw = String(value || "").trim();
  if (!raw || raw === "https://") return "";
  if (/^(https?:|mailto:|tel:)/i.test(raw)) return raw;
  return `https://${raw.replace(/^\/+/, "")}`;
}

function normalizeShortHexColors(html: string) {
  return html.replace(/#([0-9a-fA-F]{3})(?![0-9a-fA-F])/g, (_match, hex: string) => {
    return `#${hex
      .split("")
      .map((char) => char + char)
      .join("")}`.toLowerCase();
  });
}
