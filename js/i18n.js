/* ============================================================
   i18n.js — language selection and translated strings.

   Deliberately imports nothing: store.js reads the active language and
   unit system from here for its formatting, so a dependency the other way
   would be circular.

   English is the base language. A missing key falls back to English, and
   if it is missing there too the key itself is returned — a blank label
   hides the bug, a visible key does not.
   ============================================================ */

const SUPPORTED = ['en', 'nl'];
const FALLBACK = 'en';

const UNITS = ['metric', 'imperial'];
const UNITS_FALLBACK = 'metric';

/* Waar mensen hun eigen gewicht in ponden en hun lengte in voet noemen.
   Het gaat om het land, niet om de taal: een Amerikaan die de app in het
   Nederlands zet, denkt nog steeds in ponden. */
const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM']);

let current = FALLBACK;
let currentUnits = UNITS_FALLBACK;
const listeners = new Set();
const unitListeners = new Set();

/* ── Strings ────────────────────────────────────────────────── */

/**
 * One entry per visible string. A value may be:
 *   'plain text'                         — used as is
 *   'hello {name}'                       — {name} replaced from params
 *   { one: '…', other: '…' }             — picked with Intl.PluralRules
 *                                          using params.n
 */
const STRINGS = {
  en: {
    'app.name': 'Private Scale',
    'app.title': 'Private Scale — weight tracking that stays on your phone',

    'nav.today': 'Today',
    'nav.chart': 'Chart',
    'nav.history': 'History',
    'nav.settings': 'Settings',

    'a11y.share': 'Share progress',
    'a11y.theme': 'Switch theme',
    'a11y.close': 'Close',
    'a11y.mainNav': 'Main navigation',
    'a11y.period': 'Period',
    'a11y.measure': 'What you are viewing',
    'a11y.frequency': 'How often to remind',
    'a11y.language': 'Language',
    'a11y.units': 'Units',
    'a11y.stepDown': 'Take off {step} {unitW}',
    'a11y.stepUp': 'Add {step} {unitW}',
    'a11y.deleteEntry': 'Delete the measurement of {date}',

    /* ── Today ── */
    'today.currentWeight': 'Current weight',
    'today.trendWeight': 'Trend weight',
    'today.goalTitle': 'Towards your goal',
    'chart.goalLine': 'goal',
    'today.waist': 'Waist',
    'form.title': 'Add your weight',
    'form.date': 'Date',
    'form.weight': 'Weight ({unitW})',
    'form.waist': 'Waist ({unitL})',
    'form.note': 'Note',
    'form.optional': '(optional)',
    'eg.value': 'e.g. {n}',
    'form.notePlaceholder': 'e.g. after exercise',
    'form.save': 'Save',
    'form.update': 'Update',
    'stat.week': 'This week',
    'stat.month': 'This month',
    'stat.total': 'Total',
    'stat.streakDays': 'Days in a row',
    'stat.streakWeeks': 'Weeks in a row',

    /* ── Chart ── */
    'chart.weight': 'Weight',
    'chart.waist': 'Waist',
    'chart.day': 'Day',
    'chart.week': 'Week',
    'chart.month': 'Month',
    'chart.year': 'Year',
    'chart.movingAverage': '7-day average',
    'chart.lowest': 'Lowest',
    'chart.average': 'Average',
    'chart.highest': 'Highest',

    /* ── History ── */
    'history.title': 'History',
    'history.csv': 'CSV',
    'history.milestones': 'Milestones reached',
    'history.empty': 'No measurements saved yet.',

    /* ── Settings ── */
    'settings.title': 'Settings',
    'settings.language': 'Language',
    'settings.language.system': 'System',
    'settings.language.hint':
      'Follows your phone when set to System. Dates and numbers change along with it.',

    'settings.units': 'Units',
    'settings.units.system': 'System',
    'settings.units.metric': 'Metric',
    'settings.units.imperial': 'Imperial',
    'settings.units.hint':
      'Metric is kilograms and centimetres, imperial is pounds and inches. '
      + 'Your measurements are always stored the same way, so switching back '
      + 'later changes nothing about what you have saved.',
    'unit.kg': 'kg',
    'unit.lb': 'lb',
    'unit.cm': 'cm',
    'unit.in': 'in',

    'settings.goals': 'Goals',
    'settings.startWeight': 'Starting weight ({unitW})',
    'settings.goalWeight': 'Goal weight ({unitW})',
    'settings.height': 'Height ({unitL})',
    'settings.heightHint': '— for your BMI',

    'reminder.title': 'Reminder',
    'reminder.toggle': 'Remind me to weigh in',
    'reminder.howOften': 'How often',
    'reminder.daily': 'Every day',
    'reminder.weekly': 'Once a week',
    'reminder.whichDay': 'Which day',
    'reminder.time': 'Time',
    'reminder.test': 'Test notification',
    'reminder.calendar': 'Calendar event',

    'data.title': 'Your data',
    'data.hint': 'Your measurements are only on this device. Make a backup now and then.',
    'data.backup': 'Make a backup',
    'data.restore': 'Restore a backup',
    'data.wipe': 'Erase all data',

    'share.app.title': 'Share the app',
    'share.app.hint':
      'Pass the link on. Whoever opens it can put the app on their own home screen — '
      + 'with their own measurements, which stay on their own phone. You share no data, '
      + 'only the address.',
    'share.app.copy': 'Copy link',
    'share.app.share': 'Share',

    /* ── Privacy ── */
    'privacy.title': 'Privacy',
    'privacy.localTitle': 'What stays on this device',
    'privacy.localBody':
      'Your measurements, notes, goals, height and milestones live in this browser\u2019s '
      + 'storage. They are never sent anywhere and nobody else can reach them — not even '
      + 'the maker of the app. There is no account and no server holding them.',
    'privacy.sendTitle': 'What the app does send',
    'privacy.sendBody1':
      'At most once a day the app sends an empty message to a counter. It says nothing '
      + 'beyond which kind of event it was: an open or an install.',
    'privacy.sendBody2':
      'The server receiving that message sees your IP address, like every website you '
      + 'visit. From it the country is derived — no city, no address. What is kept is how '
      + 'many opens there were per day per country. Your IP address itself is not stored.',
    'privacy.sendBody3':
      'No weight, no goal, no note, no milestone, no name and nothing that could identify '
      + 'you. There are no cookies, no adverts and no other services. If you would rather '
      + 'not be counted at all, switch it off below.',
    'privacy.counted': 'Count me in the user total',
    'privacy.country': 'the country',

    /* ── Banners and dialogs ── */
    'backup.noticeTitle': 'Time for a backup',
    'later': 'Later',
    'update.ready': 'A new version of {app} is ready.',
    'update.refresh': 'Refresh',
    'update.busy': 'One moment\u2026',
    'install.prompt': 'Put {app} on your home screen for reminders.',
    'install.button': 'Install',
    'setup.title': 'One more thing',
    'setup.save': 'Save',
    'sharecard.title': 'Share progress',
    'sharecard.includeWeights': 'Include my actual weight',
    'sharecard.hint': 'Without the tick nobody sees what you weigh — only how much came off.',
    'sharecard.close': 'Close',
    'sharecard.share': 'Share',

    'version.line': '{app} · works offline · {version}',

    /* ── Plurals ── */
    /* ── Runtime: today ── */
    'theme.toast': 'Theme: {name}',
    'theme.system': 'system', 'theme.light': 'light', 'theme.dark': 'dark',
    'today.deltaDays': '{delta} {unitW} in 7 days',
    'today.deltaSince': '{delta} {unitW} since {date}',
    'today.trendNote': 'Average over 7 days — smooths out the daily swings.',
    'today.trendSoon': 'From three measurements on, the app shows your trend weight.',
    'today.measured': 'Measured {date}: {kg} {unitW}',
    'today.lastMeasured': 'Last measurement: {date}',
    'today.noMeasurement': 'No measurements yet — add your weight below.',
    'goal.reached': 'Goal reached! 🎉',
    'goal.remaining': '{kg} {unitW} to go',
    'form.exists': '{kg} {unitW} is already saved for {date}. Saving overwrites it.',
    'waist.measuredOn': 'measured {date}',
    'waist.since': '{delta} {unitL} since {date}',

    /* ── Forecast ── */
    'forecast.pace': 'Pace {rate} {unitW} per week.',
    'forecast.withinWeek': 'Pace {rate} {unitW} per week. At this pace you reach your goal within a week.',
    'forecast.date': 'Pace {rate} {unitW} per week. At this pace you reach your goal around {date}.',
    'forecast.done': 'You are at or below your goal weight. Well done.',
    'forecast.flat': 'Pace {rate} {unitW} per week. Your weight is not going down right now, so there is no date to give.',
    'forecast.faraway': 'Pace {rate} {unitW} per week. At this pace your goal is years away — an interim goal might help.',
    'forecast.tooLittle': 'After two weeks of measuring the app can predict when you reach your goal.',

    /* ── Toasts ── */
    'toast.saved': '{kg} {unitW} saved',
    'toast.updated': '{date} updated to {kg} {unitW}',
    'toast.saveFailed': 'Saving failed — is your browser storage full?',
    'toast.weightRange': 'Enter a weight between {min} and {max} {unitW}.',
    'toast.waistRange': 'Enter a waist between {min} and {max} {unitL}.',
    'toast.noFuture': 'You cannot pick a date in the future.',
    'toast.deleted': 'Measurement deleted',
    'toast.reminderOn': 'Reminder on: {when}',
    'toast.reminder': 'Reminder: {when}',
    'toast.noPermission': 'Without permission the app cannot alert you. The calendar event still works.',
    'toast.notSupported': 'Notifications are not supported.',
    'toast.notAllowed': 'Notifications are not allowed.',
    'toast.notifSent': 'Notification sent', 'toast.notifFailed': 'Notification could not be shown',
    'toast.icsSaved': 'Open the file to add it to your calendar',
    'toast.backupSaved': 'Backup downloaded', 'toast.csvSaved': 'CSV downloaded',
    'toast.restored': '{n} measurements restored',
    'toast.noUsable': 'No usable measurements in this file.',
    'toast.readFailed': 'Could not read the file ({error}).',
    'toast.wiped': 'All data erased',
    'toast.installed': '{app} is now on your home screen',
    'toast.setupSaved': 'Added — your progress is now calculated',
    'toast.setupGoal': 'Enter a goal weight between {min} and {max} {unitW}.',
    'toast.setupHeight': 'Enter a height between {min} and {max}.',
    'toast.linkCopied': 'Link copied',
    'toast.copyBlocked': 'Copying was blocked — the link is selected',
    'toast.copyFailed': 'Copying failed. Select the link by hand.',
    'toast.countedIn': 'You are counted again', 'toast.countedOut': 'You are no longer counted',
    'toast.imageSaved': 'Image downloaded — you will find it with your downloads',
    'toast.shareFailed': 'Sharing did not work on this device.',
    'toast.notWeighed': 'You have not weighed yourself today.',

    /* ── Confirmations ── */
    'confirm.delete': 'Delete the measurement of {date}?',
    'confirm.restore': '{n} measurements found. This replaces your current measurements. Continue?',
    'confirm.wipe': 'Erase everything? All your measurements and settings disappear from this device. This cannot be undone.',

    /* ── Reminder wording ── */
    'reminder.everyDay': 'every day at {time}',
    'reminder.everyWeekday': 'every {weekday} at {time}',
    'reminder.off': 'Reminder is off.',
    'reminder.iosInstallFirst': 'Set for {when}. Put the app on your home screen with the Share button first — Safari itself cannot show notifications on iOS. After that you will see the reminder whenever you open the app.',
    'reminder.iosBackground': 'Set for {when}. A web app cannot be woken in the background on an iPhone, so you get the notification when you open the app. To be sure it arrives on time, use the calendar event above.',
    'reminder.unsupported': 'Notifications are not supported in this browser. The calendar event still works.',
    'reminder.blocked': 'Notifications are blocked. Turn them on in your browser site settings, or use the calendar event.',
    'reminder.notYet': 'Notifications are not allowed yet.',
    'reminder.background': 'You get a notification {when}, even when the app is closed.',
    'reminder.needInstall': 'Set for {when}. Put the app on your home screen — only then may Android wake you while the app is closed. Until then you will see the reminder when you open the app.',
    'reminder.androidTiming': 'Set for {when}. Android decides for itself when the background process may run, so the notification can arrive a little late. The calendar event is the surest backup.',
    'reminder.body': 'Time to fill in your weight.',
    'reminder.bodyMissed': 'You have not weighed yourself today.',
    'reminder.testBody': 'This is what your daily reminder looks like.',
    'ics.summary': 'Weigh in — {app}',
    'ics.description': 'Fill in your weight in {app}.',

    /* ── Backup ── */
    'backup.notBackedUp': 'You have {n} measurements and no backup. They are only on this device.',
    'backup.pendingOne': '1 measurement is not in a backup yet. The last one was {date}.',
    'backup.pending': '{n} measurements are not in a backup yet. The last one was {date}.',
    'backup.none': 'You have not made a backup yet.',
    'backup.upToDate': 'Last backup: {date} — up to date.',
    'backup.since': 'Last backup: {date} — {n} since then.',

    /* ── Counter ── */
    'counter.notSet': 'The counter is not set up, so the app sends nothing at all right now.',
    'counter.off': 'You are not counted. The app sends nothing.',
    'counter.on': 'Only a count, at most once a day.',
    'counter.figuresLoading': 'Fetching the figures\u2026',
    'counter.figuresFailed': 'The figures could not be fetched.',
    'counter.figures': 'Counted so far: {parts}.',
    'counter.figuresNote':
      'An opening counts once per device per day, so that number is not a headcount. '
      + 'The home screens are: every device that installed the app counts once, ever.',
    'counter.openings': { one: '{count} opening', other: '{count} openings' },
    'counter.homescreens': { one: '{count} home screen', other: '{count} home screens' },
    'counter.countries': { one: '{count} country', other: '{count} countries' },

    /* ── Setup dialog ── */
    'setup.both': 'With your goal weight and your height the app can work out your progress, your forecast and your BMI.',
    'setup.goal': 'With your goal weight the app can work out your progress and your forecast towards it.',
    'setup.height': 'With your height the app can work out your BMI, and the milestones that go with it.',

    /* ── iOS ── */
    'ios.install': 'Put {app} on your home screen: tap Share and choose “Add to Home Screen”. Only then can the app remind you.',

    /* ── Chart ── */
    'chart.last30': 'Last 30 days',
    'chart.lastN': 'Last {n} measurements',
    'chart.yours': 'Your measurements',
    'chart.last26weeks': 'Last 26 weeks', 'chart.perWeek': 'Per week',
    'chart.last24months': 'Last 24 months', 'chart.perMonth': 'Per month',
    'chart.perYear': 'Per year',
    'chart.range': '{from} – {to}',
    'chart.weeksWith': { one: '{n} week with measurements', other: '{n} weeks with measurements' },
    'chart.monthsWith': { one: '{n} month with measurements', other: '{n} months with measurements' },
    'chart.yearsWith': { one: '{n} year with measurements', other: '{n} years with measurements' },
    'chart.emptyWeight': 'No measurements in this period.<br>Add your weight under <strong>{tab}</strong>.',
    'chart.emptyWaist': 'No waist measurements in this period.<br>Add one under <strong>{tab}</strong>.',
    'chart.tooltipCount': '{label} · {n} measurements',

    /* ── BMI ── */
    'bmi.under': 'underweight', 'bmi.healthy': 'healthy weight',
    'bmi.over': 'overweight', 'bmi.obese': 'obesity',
    'bmi.line': 'BMI: {value} — {label} (at {kg} {unitW}).',
    'bmi.noHeight': 'Enter your height to see your BMI.',

    /* ── Milestones ── */
    'ms.goalPart': '{pct}% of the way',
    'ms.goalPartBody': 'You are {pct}% of the way from {start} to {goal} {unitW}.',
    'ms.goalDone': 'Goal weight reached',
    'ms.goalDoneBody': 'You are at {goal} {unitW}. That was the goal.',
    'ms.bmi30': 'Out of the obesity range',
    'ms.bmi30Body': 'Your BMI is under 30. That is a real health gain.',
    'ms.bmi25': 'Healthy weight',
    'ms.bmi25Body': 'Your BMI is under 25 — that counts as a healthy weight.',
    'ms.streakDays': '{n} days in a row',
    'ms.streakWeeks': '{n} weeks in a row',
    'ms.streakBody': 'You weighed yourself {n} {unit} in a row. Keeping it up is half the work.',
    'ms.unitDays': 'days', 'ms.unitWeeks': 'weeks',

    /* ── Share card ── */
    'card.title': 'MY PROGRESS',
    'card.since': 'since {date}',
    'card.goal': 'goal {kg} {unitW}',
    'card.pctOfGoal': '{pct}% of my goal',
    'card.now': 'now {kg} {unitW}',
    'card.weighedDays': 'weighed {n} days in a row',
    'card.weighedWeeks': 'weighed {n} weeks in a row',
    'card.measurements': '{n} measurements',
    'card.tooFew': 'You need at least three measurements before there is a trend to share.',
    'share.progressText': 'Ik gebruik deze app…',
    'share.appText': 'I use this app to track my weight. It works offline and your measurements stay on your own phone.',

    'entries.count': { one: '{n} measurement', other: '{n} measurements' },
    'streak.days': { one: '{n} day in a row', other: '{n} days in a row' },
    'streak.weeks': { one: '{n} week in a row', other: '{n} weeks in a row' },
  },

  nl: {
    'app.name': 'Private Scale',
    'app.title': 'Private Scale — gewicht bijhouden dat op je telefoon blijft',

    'nav.today': 'Vandaag',
    'nav.chart': 'Grafiek',
    'nav.history': 'Historie',
    'nav.settings': 'Instellingen',

    'a11y.share': 'Voortgang delen',
    'a11y.theme': 'Thema wisselen',
    'a11y.close': 'Sluiten',
    'a11y.mainNav': 'Hoofdnavigatie',
    'a11y.period': 'Periode',
    'a11y.measure': 'Wat je bekijkt',
    'a11y.frequency': 'Hoe vaak herinneren',
    'a11y.language': 'Taal',
    'a11y.units': 'Eenheden',
    'a11y.stepDown': '{step} {unitW} eraf',
    'a11y.stepUp': '{step} {unitW} erbij',
    'a11y.deleteEntry': 'Meting van {date} verwijderen',

    'today.currentWeight': 'Huidig gewicht',
    'today.trendWeight': 'Trendgewicht',
    'today.goalTitle': 'Naar je doel',
    'chart.goalLine': 'doel',
    'today.waist': 'Middelomtrek',
    'form.title': 'Gewicht invullen',
    'form.date': 'Datum',
    'form.weight': 'Gewicht ({unitW})',
    'form.waist': 'Middel ({unitL})',
    'form.note': 'Notitie',
    'form.optional': '(optioneel)',
    'eg.value': 'Bijv. {n}',
    'form.notePlaceholder': 'Bijv. na het sporten',
    'form.save': 'Opslaan',
    'form.update': 'Bijwerken',
    'stat.week': 'Deze week',
    'stat.month': 'Deze maand',
    'stat.total': 'Totaal',
    'stat.streakDays': 'Dagen op rij',
    'stat.streakWeeks': 'Weken op rij',

    'chart.weight': 'Gewicht',
    'chart.waist': 'Middel',
    'chart.day': 'Dag',
    'chart.week': 'Week',
    'chart.month': 'Maand',
    'chart.year': 'Jaar',
    'chart.movingAverage': '7-daags gemiddelde',
    'chart.lowest': 'Laagste',
    'chart.average': 'Gemiddeld',
    'chart.highest': 'Hoogste',

    'history.title': 'Historie',
    'history.csv': 'CSV',
    'history.milestones': 'Behaalde mijlpalen',
    'history.empty': 'Nog geen metingen opgeslagen.',

    'settings.title': 'Instellingen',
    'settings.language': 'Taal',
    'settings.language.system': 'Systeem',
    'settings.language.hint':
      'Volgt je telefoon als je Systeem kiest. Datums en getallen gaan mee.',

    'settings.units': 'Eenheden',
    'settings.units.system': 'Systeem',
    'settings.units.metric': 'Metrisch',
    'settings.units.imperial': 'Imperiaal',
    'settings.units.hint':
      'Metrisch is kilo\u2019s en centimeters, imperiaal is ponden en inches. '
      + 'Je metingen worden altijd hetzelfde opgeslagen, dus later terugzetten '
      + 'verandert niets aan wat je hebt bewaard.',
    'unit.kg': 'kg',
    'unit.lb': 'lb',
    'unit.cm': 'cm',
    'unit.in': 'inch',

    'settings.goals': 'Doelen',
    'settings.startWeight': 'Startgewicht ({unitW})',
    'settings.goalWeight': 'Streefgewicht ({unitW})',
    'settings.height': 'Lengte ({unitL})',
    'settings.heightHint': '— voor je BMI',

    'reminder.title': 'Herinnering',
    'reminder.toggle': 'Herinnering om te wegen',
    'reminder.howOften': 'Hoe vaak',
    'reminder.daily': 'Elke dag',
    'reminder.weekly': '1\u00d7 per week',
    'reminder.whichDay': 'Op welke dag',
    'reminder.time': 'Tijdstip',
    'reminder.test': 'Test melding',
    'reminder.calendar': 'Agenda-afspraak',

    'data.title': 'Gegevens',
    'data.hint': 'Je metingen staan alleen op dit apparaat. Maak af en toe een back-up.',
    'data.backup': 'Back-up maken',
    'data.restore': 'Back-up terugzetten',
    'data.wipe': 'Alle gegevens wissen',

    'share.app.title': 'Deel de app',
    'share.app.hint':
      'Stuur de link door. Wie hem opent kan de app op zijn eigen beginscherm zetten — '
      + 'met zijn eigen metingen, die op zijn eigen telefoon blijven. Je deelt geen '
      + 'gegevens, alleen het adres.',
    'share.app.copy': 'Kopieer link',
    'share.app.share': 'Delen',

    'privacy.title': 'Privacy',
    'privacy.localTitle': 'Wat op dit apparaat blijft',
    'privacy.localBody':
      'Je metingen, notities, doelen, lengte en mijlpalen staan in de opslag van deze '
      + 'browser. Ze worden nergens heen gestuurd en niemand anders kan erbij — ook de '
      + 'maker van de app niet. Er is geen account en geen server die ze bewaart.',
    'privacy.sendTitle': 'Wat de app wél verstuurt',
    'privacy.sendBody1':
      'Hoogstens één keer per dag stuurt de app een leeg berichtje naar een teller. '
      + 'Daarin staat niets anders dan om wat voor gebeurtenis het gaat: een opening of '
      + 'een installatie.',
    'privacy.sendBody2':
      'De server die dat berichtje ontvangt ziet daarbij je IP-adres, net als elke '
      + 'website die je bezoekt. Daaruit wordt het land afgeleid — geen stad, geen adres. '
      + 'Bijgehouden wordt hoeveel openingen er per dag per land waren. Je IP-adres zelf '
      + 'wordt niet opgeslagen.',
    'privacy.sendBody3':
      'Er gaat geen gewicht mee, geen doel, geen notitie, geen mijlpaal, geen naam en '
      + 'geen kenmerk waarmee je herkend kunt worden. Er staan geen cookies in de app en '
      + 'er zijn geen advertenties of andere diensten. Wil je helemaal niet meetellen, '
      + 'dan zet je de schakelaar hieronder uit.',
    'privacy.counted': 'Meetellen in het gebruikersaantal',
    'privacy.country': 'het land',

    'backup.noticeTitle': 'Tijd voor een back-up',
    'later': 'Later',
    'update.ready': 'Er staat een nieuwe versie van {app} klaar.',
    'update.refresh': 'Vernieuwen',
    'update.busy': 'Bezig\u2026',
    'install.prompt': 'Zet {app} op je beginscherm voor herinneringen.',
    'install.button': 'Installeren',
    'setup.title': 'Nog even aanvullen',
    'setup.save': 'Opslaan',
    'sharecard.title': 'Voortgang delen',
    'sharecard.includeWeights': 'Mijn gewicht zelf meesturen',
    'sharecard.hint': 'Zonder vinkje ziet niemand wat je weegt — alleen hoeveel eraf is.',
    'sharecard.close': 'Sluiten',
    'sharecard.share': 'Delen',

    'version.line': '{app} · werkt offline · {version}',

    /* ── Runtime: today ── */
    'theme.toast': 'Thema: {name}',
    'theme.system': 'systeem', 'theme.light': 'licht', 'theme.dark': 'donker',
    'today.deltaDays': '{delta} {unitW} in 7 dagen',
    'today.deltaSince': '{delta} {unitW} sinds {date}',
    'today.trendNote': 'Gemiddelde over 7 dagen — dempt dagelijkse schommelingen.',
    'today.trendSoon': 'Vanaf drie metingen toont de app je trendgewicht.',
    'today.measured': 'Meting {date}: {kg} {unitW}',
    'today.lastMeasured': 'Laatste meting: {date}',
    'today.noMeasurement': 'Nog geen meting — vul hieronder je gewicht in.',
    'goal.reached': 'Doel gehaald! 🎉',
    'goal.remaining': 'nog {kg} {unitW} te gaan',
    'form.exists': 'Er staat al {kg} {unitW} op {date}. Opslaan overschrijft die meting.',
    'waist.measuredOn': 'gemeten {date}',
    'waist.since': '{delta} {unitL} sinds {date}',

    'forecast.pace': 'Tempo {rate} {unitW} per week.',
    'forecast.withinWeek': 'Tempo {rate} {unitW} per week. Bij dit tempo zit je binnen een week op je doel.',
    'forecast.date': 'Tempo {rate} {unitW} per week. Bij dit tempo zit je rond {date} op je doel.',
    'forecast.done': 'Je zit op of onder je streefgewicht. Mooi gedaan.',
    'forecast.flat': 'Tempo {rate} {unitW} per week. Je gewicht daalt op dit moment niet, dus een datum voor je doel valt nog niet te geven.',
    'forecast.faraway': 'Tempo {rate} {unitW} per week. In dit tempo duurt je doel nog jaren — misschien is een tussendoel handiger.',
    'forecast.tooLittle': 'Na twee weken meten kan de app voorspellen wanneer je je doel haalt.',

    'toast.saved': '{kg} {unitW} opgeslagen',
    'toast.updated': '{date} bijgewerkt naar {kg} {unitW}',
    'toast.saveFailed': 'Opslaan mislukt — is de opslag van je browser vol?',
    'toast.weightRange': 'Vul een gewicht in tussen {min} en {max} {unitW}.',
    'toast.waistRange': 'Vul een middelomtrek in tussen {min} en {max} {unitL}.',
    'toast.noFuture': 'Je kunt geen datum in de toekomst kiezen.',
    'toast.deleted': 'Meting verwijderd',
    'toast.reminderOn': 'Herinnering aan: {when}',
    'toast.reminder': 'Herinnering: {when}',
    'toast.noPermission': 'Zonder toestemming kan de app je niet waarschuwen. De agenda-afspraak werkt wel.',
    'toast.notSupported': 'Meldingen worden niet ondersteund.',
    'toast.notAllowed': 'Meldingen zijn niet toegestaan.',
    'toast.notifSent': 'Melding verstuurd', 'toast.notifFailed': 'Melding kon niet worden getoond',
    'toast.icsSaved': 'Open het bestand om het in je agenda te zetten',
    'toast.backupSaved': 'Back-up gedownload', 'toast.csvSaved': 'CSV gedownload',
    'toast.restored': '{n} metingen teruggezet',
    'toast.noUsable': 'Geen bruikbare metingen in dit bestand.',
    'toast.readFailed': 'Bestand kon niet gelezen worden ({error}).',
    'toast.wiped': 'Alle gegevens gewist',
    'toast.installed': '{app} staat nu op je beginscherm',
    'toast.setupSaved': 'Aangevuld — je voortgang wordt nu berekend',
    'toast.setupGoal': 'Vul een streefgewicht in tussen {min} en {max} {unitW}.',
    'toast.setupHeight': 'Vul een lengte in tussen {min} en {max}.',
    'toast.linkCopied': 'Link gekopieerd',
    'toast.copyBlocked': 'Kopiëren mocht niet — de link staat geselecteerd',
    'toast.copyFailed': 'Kopiëren lukte niet. Selecteer de link met de hand.',
    'toast.countedIn': 'Je telt weer mee', 'toast.countedOut': 'Je telt niet meer mee',
    'toast.imageSaved': 'Afbeelding gedownload — je vindt hem bij je downloads',
    'toast.shareFailed': 'Delen lukte niet op dit apparaat.',
    'toast.notWeighed': 'Je hebt jezelf vandaag nog niet gewogen.',

    'confirm.delete': 'Meting van {date} verwijderen?',
    'confirm.restore': '{n} metingen gevonden. Dit vervangt je huidige metingen. Doorgaan?',
    'confirm.wipe': 'Alles wissen? Al je metingen en instellingen verdwijnen van dit apparaat. Dit kan niet ongedaan gemaakt worden.',

    'reminder.everyDay': 'elke dag om {time}',
    'reminder.everyWeekday': 'elke {weekday} om {time}',
    'reminder.off': 'Herinnering staat uit.',
    'reminder.iosInstallFirst': 'Ingesteld op {when}. Zet de app eerst op je beginscherm via de Deel-knop — in Safari zelf kan iOS geen meldingen tonen. Daarna zie je de herinnering in elk geval zodra je de app opent.',
    'reminder.iosBackground': 'Ingesteld op {when}. Een webapp kan op een iPhone niet op de achtergrond gewekt worden, dus je krijgt de melding zodra je de app opent. Wil je zeker weten dat hij op tijd afgaat, gebruik dan de agenda-afspraak hierboven.',
    'reminder.unsupported': 'Meldingen worden niet ondersteund in deze browser. De agenda-afspraak werkt wel.',
    'reminder.blocked': 'Meldingen zijn geblokkeerd. Zet ze aan bij de site-instellingen van je browser, of gebruik de agenda-afspraak.',
    'reminder.notYet': 'Meldingen zijn nog niet toegestaan.',
    'reminder.background': 'Je krijgt {when} een melding, ook als de app dicht is.',
    'reminder.needInstall': 'Ingesteld op {when}. Zet de app op je beginscherm — pas dan mag Android je wekken terwijl de app dicht is. Tot die tijd zie je de herinnering zodra je de app opent.',
    'reminder.androidTiming': 'Ingesteld op {when}. Android bepaalt zelf wanneer het achtergrondproces mag draaien, dus de melding kan iets later komen. De agenda-afspraak is de zekerste back-up.',
    'reminder.body': 'Tijd om je gewicht in te vullen.',
    'reminder.bodyMissed': 'Je hebt jezelf vandaag nog niet gewogen.',
    'reminder.testBody': 'Zo ziet je dagelijkse herinnering eruit.',
    'ics.summary': 'Wegen — {app}',
    'ics.description': 'Vul je gewicht in {app} in.',

    'backup.notBackedUp': 'Je hebt {n} metingen en nog geen back-up. Ze staan alleen op dit apparaat.',
    'backup.pendingOne': 'Er staat 1 meting nog niet in een back-up. De laatste was {date}.',
    'backup.pending': 'Er staan {n} metingen nog niet in een back-up. De laatste was {date}.',
    'backup.none': 'Je hebt nog geen back-up gemaakt.',
    'backup.upToDate': 'Laatste back-up: {date} — bij.',
    'backup.since': 'Laatste back-up: {date} — {n} sindsdien.',

    'counter.notSet': 'De teller is nog niet ingesteld, dus de app verstuurt op dit moment helemaal niets.',
    'counter.off': 'Je telt niet mee. De app verstuurt niets.',
    'counter.on': 'Alleen een telling, hoogstens één keer per dag.',
    'counter.figuresLoading': 'Cijfers ophalen\u2026',
    'counter.figuresFailed': 'De cijfers zijn niet op te halen.',
    'counter.figures': 'Tot nu toe geteld: {parts}.',
    'counter.figuresNote':
      'Een opening telt één keer per apparaat per dag, dus dat getal is geen aantal personen. '
      + 'De beginschermen wél: elk apparaat dat de app installeerde telt één keer, voorgoed.',
    'counter.openings': { one: '{count} opening', other: '{count} openingen' },
    'counter.homescreens': { one: '{count} beginscherm', other: '{count} beginschermen' },
    'counter.countries': { one: '{count} land', other: '{count} landen' },

    'setup.both': 'Met je streefgewicht en je lengte kan de app je voortgang, je prognose en je BMI berekenen.',
    'setup.goal': 'Met je streefgewicht kan de app je voortgang en je prognose naar dat doel berekenen.',
    'setup.height': 'Met je lengte kan de app je BMI berekenen, en de mijlpalen die daarbij horen.',

    'ios.install': 'Zet {app} op je beginscherm: tik op Deel en kies “Zet op beginscherm”. Pas dan kan de app je herinneren.',

    'chart.last30': 'Laatste 30 dagen',
    'chart.lastN': 'Laatste {n} metingen',
    'chart.yours': 'Je metingen',
    'chart.last26weeks': 'Laatste 26 weken', 'chart.perWeek': 'Per week',
    'chart.last24months': 'Laatste 24 maanden', 'chart.perMonth': 'Per maand',
    'chart.perYear': 'Per jaar',
    'chart.range': '{from} – {to}',
    'chart.weeksWith': { one: '{n} week met metingen', other: '{n} weken met metingen' },
    'chart.monthsWith': { one: '{n} maand met metingen', other: '{n} maanden met metingen' },
    'chart.yearsWith': { one: '{n} jaar met metingen', other: '{n} jaren met metingen' },
    'chart.emptyWeight': 'Nog geen metingen in deze periode.<br>Vul je gewicht in bij <strong>{tab}</strong>.',
    'chart.emptyWaist': 'Nog geen middelomtrek in deze periode.<br>Vul er een in bij <strong>{tab}</strong>.',
    'chart.tooltipCount': '{label} · {n} metingen',

    'bmi.under': 'ondergewicht', 'bmi.healthy': 'gezond gewicht',
    'bmi.over': 'overgewicht', 'bmi.obese': 'obesitas',
    'bmi.line': 'BMI: {value} — {label} (bij {kg} {unitW}).',
    'bmi.noHeight': 'Vul je lengte in om je BMI te zien.',

    'ms.goalPart': '{pct}% van de weg',
    'ms.goalPartBody': 'Je bent {pct}% onderweg van {start} naar {goal} {unitW}.',
    'ms.goalDone': 'Streefgewicht bereikt',
    'ms.goalDoneBody': 'Je zit op {goal} {unitW}. Dat was het doel.',
    'ms.bmi30': 'Uit de obesitas-categorie',
    'ms.bmi30Body': 'Je BMI is onder de 30. Dat is een echte gezondheidswinst.',
    'ms.bmi25': 'Gezond gewicht',
    'ms.bmi25Body': 'Je BMI is onder de 25 — dat geldt als een gezond gewicht.',
    'ms.streakDays': '{n} dagen op rij',
    'ms.streakWeeks': '{n} weken op rij',
    'ms.streakBody': 'Je hebt je {n} {unit} achter elkaar gewogen. Dat volhouden is het halve werk.',
    'ms.unitDays': 'dagen', 'ms.unitWeeks': 'weken',

    'card.title': 'MIJN VOORTGANG',
    'card.since': 'sinds {date}',
    'card.goal': 'doel {kg} {unitW}',
    'card.pctOfGoal': '{pct}% van mijn doel',
    'card.now': 'nu {kg} {unitW}',
    'card.weighedDays': '{n} dagen op rij gewogen',
    'card.weighedWeeks': '{n} weken op rij gewogen',
    'card.measurements': '{n} metingen',
    'card.tooFew': 'Je hebt minstens drie metingen nodig voordat er een trend te delen valt.',
    'share.progressText': 'Ik gebruik deze app…',
    'share.appText': 'Ik gebruik deze app om mijn gewicht bij te houden. Hij werkt offline en je metingen blijven op je eigen telefoon.',

    'entries.count': { one: '{n} meting', other: '{n} metingen' },
    'streak.days': { one: '{n} dag op rij', other: '{n} dagen op rij' },
    'streak.weeks': { one: '{n} week op rij', other: '{n} weken op rij' },
  },
};

/* ── Language selection ─────────────────────────────────────── */

/** Turn a preference ('system' | 'en' | 'nl') into a language we support. */
export function resolveLanguage(preference) {
  if (SUPPORTED.includes(preference)) return preference;

  const tags = navigator.languages?.length
    ? navigator.languages
    : [navigator.language || ''];

  for (const tag of tags) {
    const base = String(tag).toLowerCase().split('-')[0];
    if (SUPPORTED.includes(base)) return base;
  }
  return FALLBACK;
}

/** @returns {string} the language actually in use now */
export function setLanguage(preference) {
  const next = resolveLanguage(preference);
  if (next === current) return current;

  current = next;
  document.documentElement.lang = next;
  for (const fn of listeners) {
    try { fn(next); } catch { /* one bad listener must not stop the rest */ }
  }
  return current;
}

export function language() {
  return current;
}

export function supportedLanguages() {
  return [...SUPPORTED];
}

/** Register a callback for language changes; returns an unsubscribe function. */
export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ── Unit system ────────────────────────────────────────────── */

/**
 * Turn a preference ('system' | 'metric' | 'imperial') into a system we can
 * use. 'system' looks at the region of the phone's own locale, not at the
 * chosen app language.
 */
export function resolveUnits(preference) {
  if (UNITS.includes(preference)) return preference;

  const tags = navigator.languages?.length
    ? navigator.languages
    : [navigator.language || ''];

  for (const tag of tags) {
    let region = '';
    try {
      region = new Intl.Locale(tag).maximize().region || '';
    } catch {
      // Oudere browsers kennen Intl.Locale niet; dan maar met de hand.
      const delen = String(tag).split('-');
      region = (delen[delen.length - 1] || '').toUpperCase();
    }
    if (region) return IMPERIAL_REGIONS.has(region) ? 'imperial' : 'metric';
  }
  return UNITS_FALLBACK;
}

/** @returns {string} the unit system actually in use now */
export function setUnits(preference) {
  const next = resolveUnits(preference);
  if (next === currentUnits) return currentUnits;

  currentUnits = next;
  for (const fn of unitListeners) {
    try { fn(next); } catch { /* one bad listener must not stop the rest */ }
  }
  return currentUnits;
}

export function units() {
  return currentUnits;
}

/** 'kg' or 'lb' — the label that belongs with a weight right now. */
export function unitWeight() {
  return t(currentUnits === 'imperial' ? 'unit.lb' : 'unit.kg');
}

/** 'cm' or 'in' — the label that belongs with a waist or height right now. */
export function unitLength() {
  return t(currentUnits === 'imperial' ? 'unit.in' : 'unit.cm');
}

/** Register a callback for unit changes; returns an unsubscribe function. */
export function onUnitsChange(fn) {
  unitListeners.add(fn);
  return () => unitListeners.delete(fn);
}

/* ── Lookup ─────────────────────────────────────────────────── */

export function t(key, params = {}) {
  let entry = STRINGS[current]?.[key];
  if (entry === undefined) entry = STRINGS[FALLBACK][key];
  if (entry === undefined) return key;      // visible on purpose

  if (typeof entry === 'object') {
    const rule = new Intl.PluralRules(current).select(Number(params.n ?? 0));
    entry = entry[rule] ?? entry.other;
  }

  /* {unitW} en {unitL} staan in tientallen zinnen. Ze hier invullen scheelt
     dat elke aanroep ze moet meegeven — en dat iemand het ergens vergeet. */
  return String(entry).replace(/\{(\w+)\}/g, (heel, naam) => {
    if (naam in params) return String(params[naam]);
    if (naam === 'unitW') return unitWeight();
    if (naam === 'unitL') return unitLength();
    return heel;
  });
}

/** Every key that has no translation yet in the given language. */
export function missingKeys(lang = current) {
  const base = Object.keys(STRINGS[FALLBACK]);
  return base.filter((k) => STRINGS[lang]?.[k] === undefined);
}
