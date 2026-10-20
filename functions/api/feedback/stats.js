// Cloudflare Pages Function: /api/feedback/stats — публічна агрегована статистика (без текстів відгуків)
export async function onRequestGet({ env }) {
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=30" };
  if (!env.FEEDBACK) return new Response(JSON.stringify({ count: 0, configured: false }), { headers });

  let cursor, n = 0, sum = 0;
  const trust = { "Так": 0, "Скоріше так": 0, "Ні": 0 };
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  do {
    const page = await env.FEEDBACK.list({ prefix: "fb:", cursor });
    for (const k of page.keys) {
      const m = k.metadata || {};
      if (m.k === "rating" && m.r >= 1 && m.r <= 5) { n++; sum += m.r; dist[m.r]++; }
      if (m.k === "trust" && m.a in trust) trust[m.a]++;
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);

  return new Response(
    JSON.stringify({ count: n, avg: n ? Math.round((sum / n) * 10) / 10 : null, dist, trust, configured: true }),
    { headers }
  );
}
