/**
 * private-scale-counter — counts how often the app is opened and installed,
 * split by country and by day.
 *
 * Nothing but numbers is incremented. The IP address is never stored;
 * Cloudflare derives a country code from it at the edge of its network and
 * that code is kept as a separate counter.
 *
 * Careful when reading the figures: at small numbers a country with a single
 * count is not a statistic but a pointer at one person. See "What this is not"
 * in README.md.
 *
 * The table holds nothing but this:
 *   total:opens                            1423
 *   total:installs                           37
 *   day:2026-09-15:opens                     12
 *   country:NL:opens                       1280
 *   day:2026-09-15:country:NL:opens           9
 */

const ALLOWED_ORIGIN = 'https://roboroy.github.io';

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
  };
}

/** UTC date; a daily bucket does not have to line up to the minute. */
function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Two-letter country code from Cloudflare. 'XX' when it is missing or
 * malformed — with Tor, for instance, or when running locally.
 */
function countryOf(request) {
  const code = request.cf?.country;
  return /^[A-Z]{2}$/.test(code || '') ? code : 'XX';
}

/** Breaks a stored key apart into what it means. */
function parseKey(key) {
  const p = key.split(':');
  if (p[0] === 'total')   return { kind: 'total', name: p[1] };
  if (p[0] === 'country') return { kind: 'country', country: p[1], name: p[2] };
  if (p[0] === 'day' && p[2] === 'country') {
    return { kind: 'dayCountry', day: p[1], country: p[3], name: p[4] };
  }
  if (p[0] === 'day')     return { kind: 'day', day: p[1], name: p[2] };
  return { kind: 'unknown' };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method === 'GET' && url.pathname === '/stats') {
      const { results } = await env.DB
        .prepare("SELECT key, value FROM counts WHERE key LIKE 'total:%' OR key LIKE 'country:%'")
        .all();

      const out = { opens: 0, installs: 0, countries: {} };
      for (const row of results) {
        const k = parseKey(row.key);
        if (k.kind === 'total') {
          out[k.name] = row.value;
        } else if (k.kind === 'country') {
          out.countries[k.country] ??= { opens: 0, installs: 0 };
          out.countries[k.country][k.name] = row.value;
        }
      }

      // ?days=30 adds the split per day per country.
      const days = Number(url.searchParams.get('days'));
      if (Number.isInteger(days) && days > 0) {
        const { results: rows } = await env.DB
          .prepare("SELECT key, value FROM counts WHERE key LIKE 'day:%' ORDER BY key DESC LIMIT ?")
          .bind(Math.min(days * 20, 2000))
          .all();

        out.days = rows
          .map((r) => ({ ...parseKey(r.key), value: r.value }))
          .filter((r) => r.kind === 'dayCountry')
          .map(({ day, country, name, value }) => ({ day, country, name, value }));
      }

      return new Response(JSON.stringify(out), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    if (request.method !== 'POST') {
      return new Response('POST only', { status: 405, headers: cors });
    }
    if (origin !== ALLOWED_ORIGIN) {
      return new Response('Unknown origin', { status: 403, headers: cors });
    }

    const kind = url.searchParams.get('e');
    if (kind !== 'open' && kind !== 'install') {
      return new Response('Unknown type', { status: 400, headers: cors });
    }

    const name = kind === 'open' ? 'opens' : 'installs';
    const day = todayUTC();
    const country = countryOf(request);

    // One atomic statement per key: incrementing cannot go wrong.
    const bump = env.DB.prepare(
      `INSERT INTO counts (key, value) VALUES (?, 1)
       ON CONFLICT(key) DO UPDATE SET value = value + 1`,
    );
    await env.DB.batch([
      bump.bind(`total:${name}`),
      bump.bind(`day:${day}:${name}`),
      bump.bind(`country:${country}:${name}`),
      bump.bind(`day:${day}:country:${country}:${name}`),
    ]);

    return new Response(null, { status: 204, headers: cors });
  },
};
