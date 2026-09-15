/**
 * afvalapp-teller — telt hoe vaak de app geopend en geïnstalleerd wordt.
 *
 * Dit is bewust het domste ding dat werkt: er worden uitsluitend getallen
 * opgehoogd. Er wordt geen IP-adres, geen user agent, geen identificatie en
 * geen enkel gegeven uit de app opgeslagen. Ook niet gehasht — er is
 * simpelweg geen veld om het in te zetten.
 *
 * Wat er in de KV-opslag komt te staan, en verder niets:
 *   totaal:openingen          → 1423
 *   totaal:installaties       → 37
 *   dag:2026-09-15:openingen  → 12
 *   dag:2026-09-15:installaties → 1
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

async function hoogOp(kv, sleutel) {
  // Lezen-optellen-schrijven kan in theorie botsen als twee verzoeken
  // exact samenvallen. Bij dit aantal gebruikers gebeurt dat niet, en een
  // gemiste ophoging is hier geen ramp. Wil je het waterdicht, stap dan
  // over op D1 met een atomaire UPDATE.
  const huidig = Number(await kv.get(sleutel)) || 0;
  await kv.put(sleutel, String(huidig + 1));
}

export default {
  async fetch(request, env) {
    const herkomst = request.headers.get('Origin');
    const cors = corsKoppen(herkomst);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // Openbaar en geaggregeerd: handig om zelf even te kijken.
    if (request.method === 'GET' && url.pathname === '/stats') {
      const [openingen, installaties] = await Promise.all([
        env.TELLER.get('totaal:openingen'),
        env.TELLER.get('totaal:installaties'),
      ]);
      return new Response(
        JSON.stringify({
          openingen: Number(openingen) || 0,
          installaties: Number(installaties) || 0,
        }),
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

    const naam = soort === 'open' ? 'openingen' : 'installaties';
    await Promise.all([
      hoogOp(env.TELLER, `totaal:${naam}`),
      hoogOp(env.TELLER, `dag:${vandaagUTC()}:${naam}`),
    ]);

    return new Response(null, { status: 204, headers: cors });
  },
};
