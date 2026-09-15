# Private Scale

A web app for tracking your weight. It works offline, sits on your home screen
as an icon, and needs no account, server or database — every measurement lives
in your own browser's storage.

- **Today** — enter your weight, see your trend weight, your progress towards
  your goal with a forecast of when you will reach it, and how many days in a
  row you have measured
- **Chart** — your trend by **day**, **week**, **month** and **year**, with a
  7-day average and your goal weight as a dashed line. Once you have measured
  your waist you can switch between weight and waist at the top
- **History** — every measurement grouped by month, tap to edit, cross to
  delete, plus an overview of the milestones you reached
- **Settings** — language, units, start and goal weight, height (for your
  BMI), reminders, backups and export

The interface is available in **English and Dutch**, in **metric or imperial**
units. Both follow your phone unless you pick something yourself under
Settings.

---

## Metric or imperial

**Settings → Units** switches between kilograms and centimetres, and pounds and
inches. On **System** the app looks at the region of your phone's locale — the
United States, Liberia and Myanmar get imperial, everywhere else metric. The
region is what counts, not the language: an American who reads the app in Dutch
still thinks in pounds.

Your measurements are stored in kilograms and centimetres whatever you choose.
Only what you see and what you type is converted, so switching back and forth
costs you nothing and a backup keeps one fixed meaning. The same goes for the
CSV export: its columns are `weight_kg` and `waist_cm`, and the header says so.

Height is the one field that changes shape. In imperial you can write it as
`5'11"`, `5-11`, `5 11` or as a plain number of inches, and the app shows it
back as `5'11"`.

## Waist measurement

Alongside your weight you can record your waist. That field is
optional; most people weigh themselves daily and measure their waist once a
week.

As soon as you fill one in, a card appears on **Today** with your latest
measurement and the change since your first one, and the chart gains a choice
between **Weight** and **Waist**. Until then nothing changes.

Why this is worth having: once you start exercising your weight can stall while
you still lose centimetres. The scale does not tell the whole story.

**Weight stays required, waist is an extra.** A measurement without a weight
does not exist — the trend weight, the forecast and the milestones all depend
on it. If you measure your waist on a day you do not weigh yourself, fill in
your weight as well.

The waist deliberately gets no trend line, no forecast and no milestones. It is
a second measure beside the scale, not a second app.

## The trend weight

The large number on the home screen is not your latest measurement but the
average of the past seven days. That is on purpose.

Your weight swings a kilo or more from day to day through water, salt and
whatever is still in your gut. None of that is fat. Steer by those raw numbers
and you will be alarmed by a bad morning and too pleased by a good one. The
weekly average shows what is actually happening. Today's measurement is right
underneath it.

From three measurements on, the app switches to the trend weight; before that
it shows your latest measurement.

The **forecast** under the progress bar draws a straight line through your
trend values of the past four weeks and works out when you will reach your
goal. It deliberately says nothing while you have measured for less than two
weeks or fewer than five times, and nothing either when your weight is flat or
rising — naming a date then would be false precision.

**Days in a row** counts how long you keep it up. The run does not break
because you have not stepped on the scale yet today; the day is not over. If
your reminder is set to weekly, the app counts weeks instead of days.

## What the app sends

Almost nothing. Your measurements, goals and milestones stay in your browser's
storage and never go anywhere.

The only thing the app sends is a count: at most one message per device per
day, and one when you install it. It says nothing beyond which kind of event it
was. On the other end — a Cloudflare Worker, see [`counter/`](counter/) — the
country code is derived from the IP address and numbers are incremented: per
day, per country. The IP address itself is not stored, and no user agent or
identifier is sent.

Under **Settings → Privacy** this is spelled out in the app itself, with a
switch to opt out. As long as no Worker address is filled in in
`js/telemetry.js`, the app sends nothing at all.

The totals are shown in the same place, under the switch: openings, home
screens and how many countries they came from. They are fetched when you open
Settings, not at every launch — a network request on every start for something
you rarely look at is a waste of battery.

Read the two numbers differently. **Openings** counts once per device per day,
so a single person who weighs in for a month adds thirty; it is not a headcount.
**Home screens** counts each installing device once, ever, so that one is close
to a number of people. The same figures are in the Worker itself:

```bash
curl https://private-scale-counter.roboroy.workers.dev/stats
```

## Sharing the app with others

Under **Settings → Share the app** you will find the app's address with a
**Share** button (which opens your phone's share sheet) and **Copy link**. If
your device has no share sheet, only the copy button remains.

You share nothing but the address. Whoever opens the link starts with an empty
app and their own measurements, which stay on their own device just like yours.
There is nothing shared: no account, no common list, no view of each other's
data.

The address is derived from the page you are on, so it stays correct if you
ever move the app somewhere else.

## Sharing your progress

The **↗** button in the top right makes an image of your progress: how much
came off, the line of your trend weight, your progress bar and your weigh-in
run. It goes through your phone's share sheet to WhatsApp, Signal, mail or
whatever else you have.

**By default your weight does not appear on it.** You share that 4.8 kg came
off and that you are 48% of the way — not what you weigh, not what your goal
is, and the chart has an axis without numbers. If you do want to include it,
tick **Include my actual weight**. That tick is off again every time; you decide per
message.

You need at least three measurements, because before that there is no trend to
show. If your device has no share sheet, the image is downloaded so you can
pass it on yourself.

## Filling in what is missing

Without a goal weight the app cannot work out progress or a forecast, and
without your height no BMI and no BMI milestones. If either is missing, the app
asks for it in a dialog when you open it, where you can fill it in right away.

You can dismiss it with **Later**; it comes back the next day as long as
something is missing. If you arrive through the *Weigh in* shortcut the dialog
stays away — you wanted to enter something quickly. It appears on the next
normal opening.

You do not need to set your starting weight yourself: the app takes your first
measurement, unless you change it under Settings.

## Milestones

The app celebrates three kinds of moment, and it does so on screen rather than
with a system notification. You only pass a milestone at the moment you enter a
weight, and you are looking at the app anyway. That means this part always
works, even without permission for notifications.

| Kind | When |
|---|---|
| Towards your goal | at 25%, 50%, 75% and 100% of the distance between your start and goal weight |
| BMI threshold | when your BMI drops below 30, and when it drops below 25 |
| Keeping it up | 7, 30 and 100 days in a row — or 4, 12 and 26 weeks if your reminder is weekly |

Three rules decide when something fires:

- **It works off your trend weight,** not your raw measurement. Otherwise you
  celebrate because you happened to have a dry morning and are back above the
  line the next day.
- **Once reached, always reached.** If you go back up later, the app does not
  take a milestone away and does not celebrate it a second time.
- **A BMI milestone only counts if you actually cross the line.** Someone who
  started below 25 does not get one.

On the first start after this version the app walks through your existing
history once and records milestones on the day you actually reached them —
without celebrating, because you did not reach them today. You find them under
**History → Milestones reached**.

---

## 1. Putting it on your phone

For reminders and offline use the app has to be served over **https**. Here is
the quickest free way.

### GitHub Pages (recommended)

1. Create an account at [github.com](https://github.com) if you do not have one.
2. Create a new repository, for example `private-scale`. You can make it
   **Private** — Pages works for private repos on a paid plan; on the free plan
   the repo has to be **Public**. The app itself sends nothing, so your
   measurements stay private either way: they only exist on your phone.
3. Upload the contents of this folder (`index.html`, `sw.js`,
   `manifest.webmanifest` and the `css/`, `js/`, `icons/` folders). Drag them
   into *Add file → Upload files*, or use git:

   ```bash
   git init && git add . && git commit -m "Private Scale" && git branch -M main && git remote add origin https://github.com/YOURNAME/private-scale.git && git push -u origin main
   ```

4. In the repo go to **Settings → Pages**, pick branch `main` and folder
   `/ (root)` under *Source*, and click **Save**.
5. After a minute the app is at `https://YOURNAME.github.io/private-scale/`.
   Open that link on your phone.

### Without GitHub

[Netlify Drop](https://app.netlify.com/drop): drag this folder onto that page.
You get an https address straight away. Keep the address somewhere — without an
account it is hard to find back.

### Entering your weight quickly

Press and hold the app icon on your home screen. A menu appears with **Weigh
in** and **Chart**. Tapping *Weigh in* opens the app directly on the input
field with today's date — no navigating first.

The same happens when you tap a reminder notification: it takes you straight to
the input field.

The keyboard does not open by itself. Android only allows that after a touch,
and opening a shortcut is not one. The field is selected and in view, so one
tap and you are typing.

### Installing on your home screen (Android)

Open the link in Chrome. A bar appears at the bottom saying **Install**; tap it.
If you do not see it, use the ⋮ menu → **Install app** or **Add to Home screen**.

**This is not optional if you want reminders.** Android only lets a web app be
woken in the background once it is installed.

### On an iPhone

Safari does not offer an install button, so the app shows instructions instead:
tap **Share** and choose *Add to Home Screen*. Do this — without it iOS cannot
show notifications at all, and Safari clears storage of sites you have not used
for a week (home-screen apps are exempt, according to Apple).

## 2. Reminders — what works and what does not

A web app is not allowed to schedule anything on your phone by itself. The app
therefore uses three layers:

| Layer | When | Reliability |
|---|---|---|
| Periodic Background Sync | App installed, Android wakes it now and then | Good, but Android decides the exact moment — the notification can arrive a little late |
| Timer inside the app | While the app is open | Fine, but only with the app open |
| Catch-up check | Every time you open the app | Always — you will see that you have not weighed in yet |

On an **iPhone** the first two fall away. Periodic Background Sync does not
exist there, so you only get the reminder when you open the app.

If you want a notification at a guaranteed time, use the **Calendar event**
button under Settings. It creates an `.ics` file with a repeating appointment
plus an alarm. Open the file on your phone and your calendar app adds it. That
runs through the operating system and is the surest option — and on an iPhone
it is effectively the only one.

Turn notifications on with the switch under **Settings → Reminder**. Chrome
asks for permission once. If you refused by accident, you can restore it
through the lock/settings icon to the left of the address bar → *Notifications*.

## 3. Your data

Everything lives in the `localStorage` of the browser you open the app in.
That means:

- Nobody else can reach it, not even me — there is no server.
- The data is **per device and per browser**. What you enter on your phone does
  not show up on your laptop.
- If you clear Chrome's site data, your measurements are gone.

Backups and the CSV export include your waist measurement; older backups
without that field still load fine.

Make a backup now and then: **Settings → Make a backup** gives you a JSON file
you can load again with **Restore a backup**. Underneath those buttons you see
when you last did it and how many measurements have been added since.

The app asks for one itself once it falls behind: at 20 measurements if you
never made a backup, after that whenever 25 measurements have been added, and
otherwise when it has been more than four months and something new exists. If
nothing has been added it stays quiet — there is nothing to lose. **Later**
gives you two weeks of peace.

The app cannot see whether the file was actually saved; pressing the button
counts as a backup made. Also: editing an old measurement does not change the
count, so such a change only shows up in the next round.

Under **History → CSV** you get a semicolon-separated file that opens directly
in Excel or Numbers.

## 4. Running it locally to change something

Double-clicking `index.html` does not work: the app uses JavaScript modules and
a service worker, and those need `http://` or `https://`. Start a local server:

```bash
python3 -m http.server 8931
```

Then open `http://localhost:8931`. On `localhost` the same rights apply as on
https, so the service worker and notifications work there too. The usage
counter deliberately stays quiet on localhost, so you do not pollute the
figures while developing.

### Files

```
index.html              screen layout
manifest.webmanifest    name, icons and colours for the home screen
sw.js                   offline cache + background reminder
css/styles.css          styling, light and dark theme
js/i18n.js              translations, language and unit choice, plurals
js/store.js             storage, unit conversion, dates, aggregation by day/week/month/year
js/charts.js            the SVG chart (no external libraries)
js/share.js             draws the shareable image on a canvas
js/reminders.js         notifications, scheduling and the .ics export
js/telemetry.js         the daily count, and nothing else
js/app.js               navigation and all screens tied together
icons/                  app icons
counter/                the Cloudflare Worker behind the usage count
```

### Adding a language

Everything visible sits in `js/i18n.js` as a key with a value per language.
Add a language code to `SUPPORTED`, add a block with the same keys, and
`missingKeys('xx')` tells you what you still owe. Dates and numbers follow
automatically through `Intl`.

Two placeholders fill themselves in: `{unitW}` becomes kg or lb and `{unitL}`
becomes cm or in, so a string like `'Weight ({unitW})'` needs no parameters at
the call site — and nobody can forget to pass them.

## 5. Publishing a change

```bash
./deploy.sh "what you changed"
```

That script computes a hash over all app files, writes it into `sw.js` as
`VERSION`, then commits and pushes. You never have to keep a version number
yourself — and do not edit that line by hand, because the script overwrites it.

It also lists any files that are not in git yet before committing, and flags
names that look like credentials. That check exists because a Cloudflare cache
file with an account id and email address once slipped into the public repo
through `git add -A`.

After about a minute the new version is on GitHub Pages. Open the app and a bar
appears at the bottom: **A new version is ready**, with a **Refresh** button.
Only when you tap it does the new version take over and the app reload in one
go.

That wait is deliberate. The service worker purposely does not call
`skipWaiting()` on install: if it took over immediately you could end up with
new HTML while the JavaScript still came from the old cache. By waiting for you
to tap *Refresh*, everything switches at once.

**Your measurements survive an update.** The service worker only manages the
cache of app files; your data lives in `localStorage` and is not touched. Only
the *Erase all data* button removes it.
