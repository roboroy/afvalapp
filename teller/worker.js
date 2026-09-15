/**
 * afvalapp-teller — telt hoe vaak de app geopend en geïnstalleerd wordt.
 *
 * Dit is bewust het domste ding dat werkt: er worden uitsluitend getallen
 * opgehoogd. Er wordt geen IP-adres, geen user agent, geen identificatie en
 * geen enkel gegeven uit de app opgeslagen. Ook niet gehasht — er is
 * simpelweg geen veld om het in te zetten.
 *
 * De opslag is D1 (SQLite) en niet KV, omdat KV leesacties tot een minuut
 * cachet. Met lezen-optellen-schrijven bovenop zo'n cache verdwijnen
 * tellingen: twee openingen binnen dezelfde minuut lezen allebei dezelfde
 * oude waarde en schrijven allebei datzelfde getal plus één. D1 hoogt in
 * één opdracht op en kan dat niet misgaan.
 *
 * De tabel bevat niets anders dan dit:
 *   sleutel                      aantal
 *   totaal:openingen             1423
 *   totaal:installaties            37
 *   dag:2026-09-15:openingen       12
 *   dag:2026-09-15:installaties     1
 */

const TOEGESTANE_HERKOMST = 'https://roboroy.github.io';

function corsKoppen(herkomst) {
  return {
    'Access-Control-Allow-Origin': herkomst === TOEGESTANE_HERKOMST ? herkomst : TOEGESTANE_HERKOMST,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
  };
}

/** UTC-datum; een dagbucket hoeft niet op de minuut te kloppen. */
function vandaagUTC() {
  return new Date().toISOString().slice(0, 10);
}

export default {
  async fetch(request, env) {
    const herkomst = request.headers.get('Origin');
    const cors = corsKoppen(herkomst);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method === 'GET' && url.pathname === '/stats') {
      const { results } = await env.DB
        .prepare("SELECT sleutel, aantal FROM tellingen WHERE sleutel LIKE 'totaal:%'")
        .all();
      const vind = (naam) => results.find((r) => r.sleutel === `totaal:${naam}`)?.aantal ?? 0;
      return new Response(
        JSON.stringify({ openingen: vind('openingen'), installaties: vind('installaties') }),
        { headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }

    if (request.method !== 'POST') {
      return new Response('Alleen POST', { status: 405, headers: cors });
    }
    if (herkomst !== TOEGESTANE_HERKOMST) {
      return new Response('Onbekende herkomst', { status: 403, headers: cors });
    }

    const soort = url.searchParams.get('e');
    if (soort !== 'open' && soort !== 'install') {
      return new Response('Onbekend type', { status: 400, headers: cors });
    }

    // Eén atomaire opdracht per sleutel: ophogen kan niet misgaan.
    const naam = soort === 'open' ? 'openingen' : 'installaties';
    const ophogen = env.DB.prepare(
      `INSERT INTO tellingen (sleutel, aantal) VALUES (?, 1)
       ON CONFLICT(sleutel) DO UPDATE SET aantal = aantal + 1`,
    );
    await env.DB.batch([
      ophogen.bind(`totaal:${naam}`),
      ophogen.bind(`dag:${vandaagUTC()}:${naam}`),
    ]);

    return new Response(null, { status: 204, headers: cors });
  },
};
