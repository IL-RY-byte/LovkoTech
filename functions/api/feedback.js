// Cloudflare Pages Function: /api/feedback
// POST — зберегти відгук у KV (binding FEEDBACK)
// GET  — експорт усіх відгуків для команди: /api/feedback?key=ADMIN_KEY[&format=csv]

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const clip = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
const TRUST = ["Так", "Скоріше так", "Ні"];

export async function onRequestPost({ request, env }) {
  if (!env.FEEDBACK) return json({ ok: false, error: "storage_not_configured" }, 503);
  const len = Number(request.headers.get("content-length") || 0);
  if (len > 8000) return json({ ok: false, error: "too_large" }, 413);

  let b;
  try { b = await request.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }

  const kind = b.kind === "trust" ? "trust" : "rating";
  const rec = {
    kind,
    rating: kind === "rating" ? Math.round(Number(b.rating)) : null,
    answer: kind === "trust" && TRUST.includes(b.answer) ? b.answer : "",
    role: clip(b.role, 40),
    comment: clip(b.comment, 2000),
    screen: clip(b.screen, 120),
    format: clip(b.format, 20),
    ts: new Date().toISOString(),
    country: (request.cf && request.cf.country) || "",
  };
  if (kind === "rating" && !(rec.rating >= 1 && rec.rating <= 5)) return json({ ok: false, error: "rating_1_5" }, 400);
  if (kind === "trust" && !rec.answer) return json({ ok: false, error: "bad_answer" }, 400);

  const key = `fb:${rec.ts}:${crypto.randomUUID().slice(0, 8)}`;
  await env.FEEDBACK.put(key, JSON.stringify(rec), {
    metadata: { k: kind, r: rec.rating, a: rec.answer, s: rec.screen.slice(0, 60), f: rec.format },
  });
  return json({ ok: true });
}

async function listAll(kv) {
  const keys = [];
  let cursor;
  do {
    const page = await kv.list({ prefix: "fb:", cursor });
    keys.push(...page.keys);
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return keys;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || request.headers.get("x-admin-key") || "";
  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) return json({ ok: false, error: "forbidden" }, 403);
  if (!env.FEEDBACK) return json({ ok: false, error: "storage_not_configured" }, 503);

  const keys = await listAll(env.FEEDBACK);
  const rows = (await Promise.all(keys.map((k) => env.FEEDBACK.get(k.name, "json")))).filter(Boolean);
  rows.sort((a, b) => (a.ts < b.ts ? -1 : 1));

  if (url.searchParams.get("format") === "csv") {
    const cols = ["ts", "kind", "rating", "answer", "role", "comment", "screen", "format", "country"];
    const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const csv = "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => q(r[c])).join(","))].join("\n");
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="lovkotech-feedback.csv"',
        "cache-control": "no-store",
      },
    });
  }
  return json({ ok: true, count: rows.length, rows });
}
