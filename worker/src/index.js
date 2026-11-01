// Gym Log cloud backup: keeps every backup the app uploads, forever, in KV.
// PUT /backups      store a backup (JSON body), returns { id, at }
// GET /backups      list every stored backup, newest first, with sessions/sets/bytes
// GET /backups/:id  one backup's JSON
// POST /health      store Apple Health numbers a phone pushes (iOS Shortcut or Health Auto Export)
// GET /health       days from ?from=YYYY-MM-DD (default 60 days back) to ?to=, newest last
// Every request needs "Authorization: Bearer <BACKUP_KEY>" (a Worker secret), except POST /health,
// which takes "Bearer <HEALTH_KEY>" instead: a separate secret, so the key sitting in a phone automation
// can add health numbers but can never read or list backups.

import { parseHealth, mergeDay, dayOf } from './health-parse.js';

const ORIGINS = ['https://guitarmanj55.github.io', 'http://localhost:8123', 'http://127.0.0.1:8123'];
const MAX_BYTES = 20 * 1024 * 1024; // KV allows 25 MB per value
const MAX_HEALTH_BYTES = 2 * 1024 * 1024;
const PREFIX = 'b:';
const HEALTH = 'h:'; // "h:<YYYY-MM-DD>": one day, the record is also the key's metadata so a list returns it all

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin');
    const cors = {
      'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    const json = (body, status = 200) => new Response(JSON.stringify(body), {
      status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '');
    const auth = req.headers.get('Authorization');

    if (path === '/health' && req.method === 'POST') {
      if (!env.HEALTH_KEY || !(await sameKey(auth, `Bearer ${env.HEALTH_KEY}`))) return json({ error: 'Wrong health key.' }, 401);
      const text = await req.text();
      if (text.length > MAX_HEALTH_BYTES) return json({ error: 'Too large.' }, 413);
      let body;
      try { body = JSON.parse(text); } catch { return json({ error: 'Not JSON.' }, 400); }
      const { days, skipped } = parseHealth(body, Date.now());
      const at = Date.now();
      for (const [day, fields] of Object.entries(days)) {
        const stored = await env.BACKUPS.get(HEALTH + day, 'json');
        const record = mergeDay(stored, fields, at);
        await env.BACKUPS.put(HEALTH + day, JSON.stringify(record), { metadata: record });
      }
      return json({ days: Object.keys(days).sort(), skipped });
    }

    if (!env.BACKUP_KEY || !(await sameKey(auth, `Bearer ${env.BACKUP_KEY}`))) {
      return json({ error: 'Wrong backup key.' }, 401);
    }

    if (path === '/health' && req.method === 'GET') {
      const to = dayOf(url.searchParams.get('to')) || '9999-12-31';
      const from = dayOf(url.searchParams.get('from')) || new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
      const out = [];
      let cursor;
      do {
        const page = await env.BACKUPS.list({ prefix: HEALTH, cursor });
        for (const k of page.keys) {
          const day = k.name.slice(HEALTH.length);
          if (day >= from && day <= to && k.metadata) out.push({ day, ...k.metadata });
        }
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      return json({ days: out.sort((a, b) => a.day.localeCompare(b.day)) });
    }

    if (path === '/backups' && req.method === 'PUT') {
      const text = await req.text();
      if (text.length > MAX_BYTES) return json({ error: 'Backup too large.' }, 413);
      let data;
      try { data = JSON.parse(text); } catch { return json({ error: 'Not JSON.' }, 400); }
      if (!Number.isInteger(data?.schema) || !Array.isArray(data.sessions)) return json({ error: 'Not a Gym Log backup.' }, 400);
      const at = Date.now();
      // Zero-padded time keeps KV's alphabetical listing in time order.
      const id = String(at).padStart(15, '0');
      const metadata = { at, sessions: data.sessions.length, sets: Array.isArray(data.sets) ? data.sets.length : 0, bytes: text.length };
      await env.BACKUPS.put(PREFIX + id, text, { metadata });
      return json({ id, ...metadata });
    }

    if (path === '/backups' && req.method === 'GET') {
      const items = [];
      let cursor;
      do {
        const page = await env.BACKUPS.list({ prefix: PREFIX, cursor });
        for (const k of page.keys) items.push({ id: k.name.slice(PREFIX.length), ...k.metadata });
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      items.reverse();
      return json({ backups: items });
    }

    const one = path.match(/^\/backups\/(\d{15})$/);
    if (one && req.method === 'GET') {
      const text = await env.BACKUPS.get(PREFIX + one[1]);
      if (text === null) return json({ error: 'No such backup.' }, 404);
      return new Response(text, { headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }

    return json({ error: 'Not found.' }, 404);
  },
};

/** Compares two strings without leaking how much of the key matched. */
async function sameKey(a, b) {
  if (typeof a !== 'string') return false;
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([a, b].map((s) => crypto.subtle.digest('SHA-256', enc.encode(s))));
  return crypto.subtle.timingSafeEqual(ha, hb);
}
