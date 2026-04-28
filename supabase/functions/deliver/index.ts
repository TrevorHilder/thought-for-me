/**
 * Supabase Edge Function — hourly thought delivery
 *
 * Invoked every hour by a pg_cron job. Finds users whose preferred_time hour
 * matches the current UTC hour (after timezone conversion), selects a passage,
 * records it in the deliveries table, and sends an email via AWS SES HTTP API
 * (Signature V4 signed — no SMTP/TCP required).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Types ────────────────────────────────────────────────────────────────────

interface Passage {
  id: string;
  title: string;
  text: string;
  source: string;
  page: number;
}

interface DueUser {
  user_id: string;
  email: string;
  preferred_time: string;
  timezone: string;
  email_notifications: boolean;
}

// ── Book offsets (printed page → PDF page) ───────────────────────────────────

const BOOK_OFFSETS: Record<string, number> = {
  "A Perfumed Scorpion": 12, "A Veiled Gazelle": 10, "Caravan of Dreams": 14,
  "Evenings With Idries Shah": 6, "Knowing How To Know": 18, "Learning How to Learn": 22,
  "Lectures And Letters": 6, "Neglected Aspects Of Sufi Study": 12, "Observations": 8,
  "Reflections": 8, "Seeker After Truth": 12, "Special Illumination": 8,
  "Sufi Thought And Action": 10, "Tales of the Dervishes": 14, "The Book Of The Book": 10,
  "The Commanding Self": 16, "The Dermis Probe": 16,
  "The Exploits Of The Incomparable Mulla Nasrudin": 14,
  "The Hundred Tales Of Wisdom": 10, "The Magic Monastery": 14,
  "The Pleasantries Of The Incredible Mulla Nasrudin": 16,
  "The Subtleties Of The Inimitable Mulla Nasrudin": 18,
  "The Sufis": 18, "The Way of the Sufi": 10, "The World Of Nasrudin": 22,
  "The World Of the Sufi": 12, "Thinkers of the East": 14, "Wisdom of the Idiots": 12,
};

const ISF_SLUG_OVERRIDES: Record<string, string> = {
  "Lectures And Letters": "letters-and-lectures",
  "The World Of the Sufi": "the-world-of-the-sufis",
};

function isfUrl(source: string, printedPage?: number): string {
  const slug = ISF_SLUG_OVERRIDES[source] ??
    source.toLowerCase().replace(/[''']/g, "").replace(/[^a-z0-9\s-]/g, "")
      .trim().replace(/\s+/g, "-").replace(/-+/g, "-");
  const base = `https://idriesshahfoundation.org/pdfviewer/${slug}/?auto_viewer=true`;
  if (printedPage == null || printedPage === 0) return base;
  return `${base}#page=${printedPage + (BOOK_OFFSETS[source] ?? 0)}`;
}

// ── Passage selection ─────────────────────────────────────────────────────────

function selectPassage(allPassages: Passage[], deliveredIds: Set<string>): Passage {
  let candidates = allPassages.filter((p) => !deliveredIds.has(p.id));
  if (candidates.length === 0) candidates = [...allPassages];
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ── Email builder ─────────────────────────────────────────────────────────────

function reflow(text: string): string {
  return text
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/(?<!\n)\n(?!\n)/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/  +/g, ' ')
    .trim();
}

function truncate(text: string, maxChars = 300): string {
  const reflowed = reflow(text);
  if (reflowed.length <= maxChars) return reflowed;
  // Break at a word boundary
  const cut = reflowed.lastIndexOf(" ", maxChars);
  return reflowed.slice(0, cut > 0 ? cut : maxChars) + " ...";
}

function buildEmail(passage: Passage, appUrl: string): { subject: string; text: string; html: string } {
  const readUrl = isfUrl(passage.source, passage.page);
  const pageRef = passage.page ? `, p. ${passage.page}` : "";
  const subject = `A Thought for Me \u2013 ${passage.title}`;
  const preview = truncate(passage.text);

  const text = [
    subject, "",
    preview, "",
    `— ${passage.source}${pageRef}`, "",
    `Read online: ${readUrl}`,
    `View your thread: ${appUrl}`,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f3ef;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ef;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#2d6a6a;padding:28px 40px;text-align:center;">
            <p style="margin:0;color:#b2d8d8;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-family:sans-serif;">A Thought for Me</p>
            <p style="margin:6px 0 0;color:#ffffff;font-size:13px;font-family:sans-serif;">A daily passage from the works of Idries Shah</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px 28px;">
            <h2 style="margin:0 0 20px;font-size:20px;color:#1a1a1a;font-family:Georgia,serif;font-weight:normal;line-height:1.3;">${passage.title}</h2>
            <div style="font-size:16px;line-height:1.8;color:#2c2c2c;font-family:Georgia,serif;">${preview.replace(/\n\n/g, '<br><br>').replace(/\n/g, ' ')}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 32px;">
            <hr style="border:none;border-top:1px solid #e8e4de;margin:0 0 20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:13px;color:#888;font-style:italic;font-family:Georgia,serif;"><em>${passage.source}</em>${pageRef}</td>
                <td align="right"><a href="${readUrl}" style="font-size:12px;color:#2d6a6a;text-decoration:none;font-family:sans-serif;border:1px solid #2d6a6a;padding:6px 14px;border-radius:6px;">Read online ↗</a></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#f5f3ef;padding:20px 40px;text-align:center;">
            <a href="${appUrl}" style="font-size:12px;color:#2d6a6a;font-family:sans-serif;">View your thread</a>
            <span style="color:#ccc;margin:0 8px;">·</span>
            <a href="${appUrl}/#/settings" style="font-size:12px;color:#888;font-family:sans-serif;">Manage preferences</a>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

// ── AWS SES via HTTP API (Signature V4) ───────────────────────────────────────

const enc = new TextEncoder();

async function hmacSha256(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(data));
}

async function sha256Hex(data: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(data));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getSigningKey(secretKey: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(enc.encode(`AWS4${secretKey}`), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

async function sendEmailViaSES(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
  accessKeyId: string;
  secretAccessKey: string;
}): Promise<void> {
  const { to, subject, text, html, accessKeyId, secretAccessKey } = opts;
  const REGION = "us-east-1";
  const SERVICE = "email";
  const HOST = `${SERVICE}.${REGION}.amazonaws.com`;
  const ENDPOINT = `https://${HOST}/`;
  const FROM = "A Thought for Me <library@thethirdsystem.foundation>";

  // Build MIME message for SendRawEmail (v1 API — permitted by AmazonSesSendingAccess)
  // Use base64 body encoding to avoid quoted-printable mangling of URLs containing #page=N
  const toBase64 = (str: string) => btoa(unescape(encodeURIComponent(str)));
  const boundary = `mime_${Date.now()}`;
  const mime = [
    `From: ${FROM}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    toBase64(text),
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    toBase64(html),
    ``,
    `--${boundary}--`,
  ].join("\r\n");

  // Base64-encode the entire raw MIME message for SendRawEmail
  const rawBase64 = btoa(unescape(encodeURIComponent(mime)));

  // URL-encoded form body for SendRawEmail
  const body = new URLSearchParams({
    Action: "SendRawEmail",
    "RawMessage.Data": rawBase64,
  }).toString();

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = await sha256Hex(body);
  const canonicalHeaders = `content-type:application/x-www-form-urlencoded\nhost:${HOST}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-date";
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${await sha256Hex(canonicalRequest)}`;

  const signingKey = await getSigningKey(secretAccessKey, dateStamp, REGION, SERVICE);
  const signatureBytes = await hmacSha256(signingKey, stringToSign);
  const signature = Array.from(new Uint8Array(signatureBytes)).map((b) => b.toString(16).padStart(2, "0")).join("");

  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Amz-Date": amzDate,
      "Authorization": authHeader,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SES API error ${res.status}: ${err}`);
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (_req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sesAccessKeyId = Deno.env.get("SES_ACCESS_KEY_ID")!;
  const sesSecretAccessKey = Deno.env.get("SES_SECRET_ACCESS_KEY")!;
  const appUrl = Deno.env.get("APP_URL") ?? "https://thought-for-me.vercel.app";

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // 1. Load passages from the live app
    const passagesResp = await fetch(`${appUrl}/passages.json`);
    if (!passagesResp.ok) throw new Error(`Failed to fetch passages: ${passagesResp.status}`);
    const allPassages: Passage[] = await passagesResp.json();

    // 2. Find users due for delivery
    const { data: dueUsers, error: viewErr } = await supabase
      .from("users_due_for_delivery")
      .select("*");

    if (viewErr) throw new Error(`View query failed: ${viewErr.message}`);
    if (!dueUsers || dueUsers.length === 0) {
      return new Response(JSON.stringify({ message: "No users due", delivered: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const results: { email: string; status: string }[] = [];

    for (const user of dueUsers as DueUser[]) {
      try {
        // 3. Get already-delivered passage IDs for this user
        const { data: past } = await supabase
          .from("deliveries")
          .select("passage_id")
          .eq("user_id", user.user_id);

        const deliveredIds = new Set((past ?? []).map((d: { passage_id: string }) => d.passage_id));

        // 4. Select passage
        const passage = selectPassage(allPassages, deliveredIds);

        // 5. Insert delivery record
        const { error: insertErr } = await supabase
          .from("deliveries")
          .insert({ user_id: user.user_id, passage_id: passage.id, delivered_at: new Date().toISOString() });

        if (insertErr) throw new Error(`Insert failed: ${insertErr.message}`);

        // 6. Send email
        if (user.email_notifications && user.email) {
          const { subject, text, html } = buildEmail(passage, appUrl);
          await sendEmailViaSES({
            to: user.email,
            subject,
            text,
            html,
            accessKeyId: sesAccessKeyId,
            secretAccessKey: sesSecretAccessKey,
          });
        }

        results.push({ email: user.email, status: "delivered" });
      } catch (e: unknown) {
        results.push({ email: user.email, status: `error: ${e instanceof Error ? e.message : String(e)}` });
      }
    }

    return new Response(
      JSON.stringify({ delivered: results.filter((r) => r.status === "delivered").length, results }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e: unknown) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
