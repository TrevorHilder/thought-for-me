/**
 * Vercel cron function — runs every hour.
 * Finds users due for their daily thought delivery, selects a passage,
 * records it in Supabase, and sends an email via AWS SES SMTP.
 *
 * Schedule: defined in vercel.json  ("0 * * * *" = top of every hour)
 * Protected by CRON_SECRET env var (set in Vercel dashboard).
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

// ── Supabase (service role — bypasses RLS) ───────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── SMTP transporter ─────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: "email-smtp.us-east-1.amazonaws.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.SES_SMTP_USER!,
    pass: process.env.SES_SMTP_PASSWORD!,
  },
});

// ── Passage type (matches passages.json) ────────────────────────────────────
interface Passage {
  id: string;
  title: string;
  text: string;
  source: string;
  page: number;
}

// ── Simple passage selection ─────────────────────────────────────────────────
function selectPassage(allPassages: Passage[], deliveredIds: Set<string>): Passage {
  let candidates = allPassages.filter((p) => !deliveredIds.has(p.id));
  if (candidates.length === 0) candidates = [...allPassages]; // pool exhausted — start over
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ── ISF link helpers ─────────────────────────────────────────────────────────
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
  if (!printedPage) return base;
  return `${base}#page=${printedPage + (BOOK_OFFSETS[source] ?? 0)}`;
}

// ── Email HTML template ───────────────────────────────────────────────────────
function buildEmail(passage: Passage, appUrl: string): { text: string; html: string } {
  const readUrl = isfUrl(passage.source, passage.page);
  const pageRef = passage.page ? `, p. ${passage.page}` : "";

  const text = [
    `A Thought for Me`,
    ``,
    passage.title,
    ``,
    passage.text,
    ``,
    `— ${passage.source}${pageRef}`,
    ``,
    `Read online: ${readUrl}`,
    `View your thread: ${appUrl}`,
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>A Thought for Me</title>
</head>
<body style="margin:0;padding:0;background:#f5f3ef;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ef;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#2d6a6a;padding:28px 40px;text-align:center;">
            <p style="margin:0;color:#b2d8d8;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-family:sans-serif;">A Thought for Me</p>
            <p style="margin:6px 0 0;color:#ffffff;font-size:13px;font-family:sans-serif;">A daily passage from the works of Idries Shah</p>
          </td>
        </tr>

        <!-- Passage -->
        <tr>
          <td style="padding:36px 40px 28px;">
            <h2 style="margin:0 0 20px;font-size:20px;color:#1a1a1a;font-family:Georgia,serif;font-weight:normal;line-height:1.3;">
              ${passage.title}
            </h2>
            <div style="font-size:16px;line-height:1.8;color:#2c2c2c;white-space:pre-line;font-family:Georgia,serif;">
              ${passage.text.replace(/\n/g, "<br>")}
            </div>
          </td>
        </tr>

        <!-- Source + link -->
        <tr>
          <td style="padding:0 40px 32px;">
            <hr style="border:none;border-top:1px solid #e8e4de;margin:0 0 20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:13px;color:#888;font-style:italic;font-family:Georgia,serif;">
                  <em>${passage.source}</em>${pageRef}
                </td>
                <td align="right">
                  <a href="${readUrl}" style="font-size:12px;color:#2d6a6a;text-decoration:none;font-family:sans-serif;border:1px solid #2d6a6a;padding:6px 14px;border-radius:6px;">
                    Read online ↗
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
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

  return { text, html };
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify this is a legitimate Vercel cron call
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers["authorization"] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const appUrl = process.env.APP_URL ?? "https://thought-for-me.vercel.app";

  try {
    // 1. Load all passages once
    const passagesUrl = `${appUrl}/passages.json`;
    const passagesResp = await fetch(passagesUrl);
    if (!passagesResp.ok) throw new Error(`Failed to fetch passages: ${passagesResp.status}`);
    const allPassages: Passage[] = await passagesResp.json();

    // 2. Find users due for delivery right now
    const { data: dueUsers, error: viewErr } = await supabase
      .from("users_due_for_delivery")
      .select("*");

    if (viewErr) throw new Error(`View query failed: ${viewErr.message}`);
    if (!dueUsers || dueUsers.length === 0) {
      return res.status(200).json({ message: "No users due for delivery", delivered: 0 });
    }

    const results: { email: string; status: string }[] = [];

    for (const user of dueUsers) {
      try {
        // 3. Get this user's already-delivered passage IDs
        const { data: pastDeliveries } = await supabase
          .from("deliveries")
          .select("passage_id")
          .eq("user_id", user.user_id);

        const deliveredIds = new Set((pastDeliveries ?? []).map((d: any) => d.passage_id));

        // 4. Select a passage
        const passage = selectPassage(allPassages, deliveredIds);

        // 5. Insert delivery record
        const { error: insertErr } = await supabase
          .from("deliveries")
          .insert({
            user_id: user.user_id,
            passage_id: passage.id,
            delivered_at: new Date().toISOString(),
          });

        if (insertErr) throw new Error(`Insert failed: ${insertErr.message}`);

        // 6. Send email (only if user has email notifications enabled)
        if (user.email_notifications && user.email) {
          const { text, html } = buildEmail(passage, appUrl);
          await transporter.sendMail({
            from: `"A Thought for Me" <library@thethirdsystem.foundation>`,
            to: user.email,
            subject: `${passage.title} — A Thought for Me`,
            text,
            html,
          });
        }

        results.push({ email: user.email, status: "delivered" });
      } catch (userErr: any) {
        results.push({ email: user.email, status: `error: ${userErr.message}` });
      }
    }

    return res.status(200).json({ delivered: results.filter(r => r.status === "delivered").length, results });
  } catch (err: any) {
    console.error("Cron deliver error:", err);
    return res.status(500).json({ error: err.message });
  }
}
