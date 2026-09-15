/**
 * afvalapp-teller — telt hoe vaak de app geopend en geïnstalleerd wordt,
 * uitgesplitst per land en per dag.
 *
 * Er worden uitsluitend getallen opgehoogd. Het IP-adres wordt niet
 * opgeslagen; Cloudflare leidt er aan de rand van zijn netwerk een landcode
 * uit af en die wordt als losse teller bijgehouden.
 *
 * Let op bij het lezen van de cijfers: bij kleine aantallen is een land met
 * één telling geen statistiek maar een aanwijzing over één persoon. Zie het
 * kopje "Wat dit niet is" in README.md.
 *
 * De tabel bevat niets anders dan dit:
 *   totaal:openingen                          1423
 *   totaal:installaties                         37
 *   dag:2026-09-15:openingen                    12
 *   land:NL:openingen                         1280
 *   dag:2026-09-15:land:NL:openingen             9
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

function vandaagUTC() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Tweeletterige landcode van Cloudflare. 'XX' als die ontbreekt of niet
 * klopt — bijvoorbeeld bij Tor, of lokaal draaien.
 */
function landVan(request) {
  const code = request.cf?.country;
  return /^[A-Z]{2}$/.test(code || '') ? code : 'XX';
}

/** Splitst een sleutel uit de tabel op in zijn betekenis. */
function ontleed(sleutel) {
  const d = sleutel.split(':');
  if (d[0] === 'totaal') return { soort: 'totaal', naam: d[1] };
  if (d[0] === 'land') return { soort: 'land', land: d[1], naam: d[2] };
  if (d[0] === 'dag' && d[2] === 'land') {
    return { soort: 'dagland', dag: d[1], land: d[3], naam: d[4] };
  }
  if (d[0] === 'dag') return { soort: 'dag', dag: d[1], naam: d[2] };
  return { soort: 'onbekend' };
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
        .prepare("SELECT sleutel, aantal FROM tellingen WHERE sleutel LIKE 'totaal:%' OR sleutel LIKE 'land:%'")
        .all();

      const uit = { openingen: 0, installaties: 0, landen: {} };
      for (const rij of results) {
        const k = ontleed(rij.sleutel);
        if (k.soort === 'totaal') {
          uit[k.naam] = rij.aantal;
        } else if (k.soort === 'land') {
          uit.landen[k.land] ??= { openingen: 0, installaties: 0 };
          uit.landen[k.land][k.naam] = rij.aantal;
        }
      }

      // ?dagen=30 geeft de verdeling per dag per land erbij.
      const dagen = Number(url.searchParams.get('dagen'));
      if (Number.isInteger(dagen) && dagen > 0) {
        const { results: rijen } = await env.DB
          .prepare("SELECT sleutel, aantal FROM tellingen WHERE sleutel LIKE 'dag:%' ORDER BY sleutel DESC LIMIT ?")
          .bind(Math.min(dagen * 20, 2000))
          .all();

        uit.dagen = rijen
          .map((r) => ({ ...ontleed(r.sleutel), aantal: r.aantal }))
          .filter((r) => r.soort === 'dagland')
          .map(({ dag, land, naam, aantal }) => ({ dag, land, naam, aantal }));
      }

      return new Response(JSON.stringify(uit), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
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

    const naam = soort === 'open' ? 'openingen' : 'installaties';
    const dag = vandaagUTC();
    const land = landVan(request);

    const ophogen = env.DB.prepare(
      `INSERT INTO tellingen (sleutel, aantal) VALUES (?, 1)
       ON CONFLICT(sleutel) DO UPDATE SET aantal = aantal + 1`,
    );
    await env.DB.batch([
      ophogen.bind(`totaal:${naam}`),
      ophogen.bind(`dag:${dag}:${naam}`),
      ophogen.bind(`land:${land}:${naam}`),
      ophogen.bind(`dag:${dag}:land:${land}:${naam}`),
    ]);

    return new Response(null, { status: 204, headers: cors });
  },
};
