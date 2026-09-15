# private-scale-counter

A Cloudflare Worker that does nothing but increment numbers, so you know how
many people use Private Scale without keeping anything about them.

## What is stored

One table in a D1 database (SQLite), two columns, numbers only:

```
key                                    count
total:opens                             1423
total:installs                            37
day:2026-09-15:opens                      12
country:NL:opens                        1280
day:2026-09-15:country:NL:opens            9
```

No IP address, no user agent, no identifier, no data from the app.

The **country** comes from Cloudflare itself: it derives a two-letter code from
the IP address at the edge of its network and passes it along as
`request.cf.country`. That address is never recorded; only the country code is
used as a counter. If the code is missing or malformed — with Tor, for instance
— it becomes `XX`.

The day keys use UTC, while the app bases its own "at most once a day" on your
local date. Someone weighing themselves at night can land in the previous UTC
day. It makes no difference to the totals; only the daily split shifts by a few
hours.

## Why D1 and not KV

The first version used KV with read-add-write. That does not work: KV caches
reads for about a minute, so two counts within that same minute both read the
same old value and both write that number plus one. The second count is gone.

Measured on the live counter: five reads in a row gave `1, 1, 2, 1, 1`. That is
not a rare coincidence but the normal behaviour.

D1 increments with a single statement — `INSERT ... ON CONFLICT DO UPDATE SET
count = count + 1` — and therefore cannot lose anything.

## Setting it up

You need Node and wrangler. If Node is not installed yet:

```bash
brew install node && npm install -g wrangler && wrangler login
```

1. **Create the database.**

   ```bash
   wrangler d1 create private-scale-counter
   ```

   You get a `database_id` back. Put it in `wrangler.toml` where
   `FILL_IN_YOUR_D1_DATABASE_ID` is.

   > Wrangler prints a ready-made block alongside it with
   > `binding = "private_scale_counter"`. **Do not copy that.** The Worker looks
   > for `env.DB`, so the binding in `wrangler.toml` has to stay `DB`. Only the
   > `database_id` needs copying.

2. **Create the table.**

   ```bash
   wrangler d1 execute private-scale-counter --remote --command "CREATE TABLE IF NOT EXISTS counts (key TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0)"
   ```

   > Avoid `--file=`. That route goes through Cloudflare's import endpoint,
   > which refuses OAuth tokens with *Authentication error [code: 10000]* even
   > when the token has d1 write access. `--command` uses the normal query
   > endpoint and works.

3. **Publish.**

   ```bash
   wrangler deploy
   ```

   Check the output shows `env.DB (private-scale-counter)` with `D1 Database`.
   If you see something else, a different `wrangler.toml` is being used and you
   are probably running from the wrong folder.

4. The address is in the output, shaped like
   `https://private-scale-counter.roboroy.workers.dev`. Put that address in
   `js/telemetry.js` under `COUNTER_URL`. As long as the placeholder is there,
   the app sends nothing.

## Reading the figures

Totals plus the split by country:

```bash
curl https://private-scale-counter.roboroy.workers.dev/stats
```

With the split per day per country as well:

```bash
curl "https://private-scale-counter.roboroy.workers.dev/stats?days=30"
```

Or straight from the database:

```bash
wrangler d1 execute private-scale-counter --remote --command "SELECT * FROM counts ORDER BY key"
```

Resetting to zero:

```bash
wrangler d1 execute private-scale-counter --remote --command "DELETE FROM counts"
```

## Free tier limits

The free plan has a daily maximum of Worker requests and of D1 rows read and
written. Every count writes four rows: the total, the day, the country, and the
day per country. The app sends at most one message per device per day, so you
sit well under those limits. Do check the current limits in your dashboard —
Cloudflare adjusts them now and then.

## What the app does on its side

See [`js/telemetry.js`](../js/telemetry.js).

- **At most one count per device per calendar day.** The app remembers the date
  of the last count. That makes the figure "how many devices opened the app that
  day" rather than a tally of screen visits.
- **An install counts once per device**, at the moment you put the app on your
  home screen.
- **If the request fails, the date is not stored.** Being offline or having an
  unreachable counter therefore does not cost you a day: the next time you open
  the app it tries again. You notice nothing; a count is never important enough
  to show an error for.
- **The switch under Settings → Privacy** turns everything off. No request is
  made at all after that.
- **With no address in `COUNTER_URL`, the app sends nothing.** Handy while
  developing: you do not pollute the counter. The app also stays quiet on
  `localhost` for the same reason.

## What this is not

The Worker refuses requests whose `Origin` header does not come from the app.
That stops other websites, but it is not security: anyone who knows the address
can send an arbitrary `Origin` with `curl` and bump the counter.

Making it stricter would mean tracking per IP who counts how often — exactly
what we do not want here.

**And be careful with the country figures.** At small numbers a country with a
single count is not a statistic but a pointer at one person: you do not learn
"1% is in Norway" but "that one friend in Norway opened the app", and with the
daily split you learn when. Read those numbers with that in mind, certainly
while there are only a handful of users.

On top of that a PWA structurally undercounts: opening it offline produces no
count, and working offline is a core feature of this app. Anyone who turns the
switch off does not count either.

So it is an indication of use, not an audited figure. For the question "does
anyone actually use my app" that is plenty.
