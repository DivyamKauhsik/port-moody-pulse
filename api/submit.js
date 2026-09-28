// Receives tip / event submissions from /submit.html and forwards them to the
// Pulse inbox via FormSubmit's free AJAX endpoint (no signup, no cost).
// The browser keeps a mailto: fallback, so if this endpoint ever fails the
// visitor's email app opens instead — the form can never hard-break.
const INBOX = "portmoodypulse@gmail.com";
const FORMSUBMIT_URL = `https://formsubmit.co/ajax/${INBOX}`;

// Tiny in-memory rate limit: max 5 submissions per IP per hour.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const cutoff = now - 60 * 60 * 1000;
  const times = (hits.get(ip) || []).filter((t) => t > cutoff);
  times.push(now);
  hits.set(ip, times);
  // keep the map small
  if (hits.size > 2000) hits.clear();
  return times.length > 5;
}

function clean(v, max) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false });
  }
  try {
    const body = req.body || {};
    // Honeypot: bots fill it, humans never see it. Pretend success.
    if (body.hp) return res.status(200).json({ ok: true });

    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
    if (rateLimited(ip)) return res.status(429).json({ ok: false });

    const kind = body.kind;
    const f = body.fields || {};
    let subject, lines, replyTo = "";

    if (kind === "tip") {
      const what = clean(f.what, 3000);
      if (!what) return res.status(400).json({ ok: false });
      subject = "News tip for the Pulse";
      lines = [
        "What's happening:\n" + what,
        f.where && "Where: " + clean(f.where, 300),
        f.when && "When: " + clean(f.when, 300),
        f.name && "From: " + clean(f.name, 200),
        f.contact && "Contact: " + clean(f.contact, 200),
      ];
      const contact = clean(f.contact, 200);
      if (EMAIL_RE.test(contact)) replyTo = contact;
    } else if (kind === "event") {
      const name = clean(f.name, 200);
      const date = clean(f.date, 200);
      const loc = clean(f.loc, 300);
      const desc = clean(f.desc, 4000);
      const email = clean(f.email, 200);
      if (!name || !date || !loc || !desc || !EMAIL_RE.test(email)) {
        return res.status(400).json({ ok: false });
      }
      subject = "Event submission: " + name;
      lines = [
        "Event: " + name,
        "Date: " + date,
        f.time && "Time: " + clean(f.time, 200),
        "Location: " + loc,
        "Details:\n" + desc,
        f.org && "Organizer: " + clean(f.org, 200),
        f.link && "Link: " + clean(f.link, 500),
        "Submitted by: " + email,
      ];
      replyTo = email;
    } else {
      return res.status(400).json({ ok: false });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let response;
    try {
      response = await fetch(FORMSUBMIT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          _subject: subject,
          message: lines.filter(Boolean).join("\n\n"),
          _replyto: replyTo || undefined,
          _template: "table",
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      console.error("formsubmit error", response.status);
      return res.status(502).json({ ok: false });
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false });
  }
}
