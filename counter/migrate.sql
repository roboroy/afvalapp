-- One-off migration from the Dutch key names to English, keeping the counts.
--
-- Do NOT run this with --file=: that goes through Cloudflare's import
-- endpoint, which refuses OAuth tokens with "Authentication error [10000]"
-- even when the token has d1 write access. Use --command instead, which
-- goes through the normal query endpoint:
--
--   wrangler d1 execute afvalapp-teller --remote --command "<paste below>" 
ALTER TABLE tellingen RENAME TO counts;
ALTER TABLE counts RENAME COLUMN sleutel TO key;
ALTER TABLE counts RENAME COLUMN aantal TO value;

UPDATE counts SET key = replace(key, 'totaal:', 'total:');
UPDATE counts SET key = replace(key, 'dag:', 'day:');
UPDATE counts SET key = replace(key, 'land:', 'country:');
UPDATE counts SET key = replace(key, 'openingen', 'opens');
UPDATE counts SET key = replace(key, 'installaties', 'installs');
