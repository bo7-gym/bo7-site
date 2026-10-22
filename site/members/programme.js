// Bo7 training programmes: read the programme sheet (CSV exported from Numbers), work out starting weights,
// and find this week's and today's session. Plain script, shared by the hub, the staff page and the tests.
// Needs csv.js (Bo7Csv.parseRows). Exposes Bo7Programme.
(function (root) {
  'use strict';

  var LIFTS = [
    { key: 'back_squat', name: 'Back Squat', match: /back squat/i },
    { key: 'deadlift', name: 'Deadlift', match: /deadlift/i },
    { key: 'bench_press', name: 'Bench Press', match: /bench press/i }
  ];
  var DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  // The sheet uses capitals for headings; the hub uses sentence case (brand: calm, no shouting).
  function sentence(s) {
    s = clean(s);
    if (!s || s !== s.toUpperCase()) return s;
    return s.toLowerCase().replace(/(^[^a-z0-9]*|[·+:]\s*|\s-\s+)([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); })
      .replace(/\b(duo|amrap|rm|db|kb|mb|ffe)\b/gi, function (w) { return w.toUpperCase(); })
      .replace(/(\d)rm\b/gi, '$1RM');
  }
  function title(s) {
    s = sentence(s);
    return s.replace(/\b([a-z])/g, function (m) { return m.toUpperCase(); }).replace(/\b(And|Of|The|On|In)\b/g, function (w, x, i) { return i ? w.toLowerCase() : w; });
  }
  // "CONTROL. 3 seconds down..." -> "Control. 3 seconds down..."
  function leadIn(s) {
    s = clean(s);
    var m = /^([A-Z0-9 +&'/-]{3,})\.\s*(.*)$/.exec(s);
    return m ? sentence(m[1]) + '. ' + m[2] : s;
  }
  function splitDash(s) { var i = s.indexOf(' - '); return i < 0 ? [s] : [s.slice(0, i), s.slice(i + 3)]; }

  function blank(r) { return r.every(function (c) { return !clean(c); }); }
  function only0(r) { return clean(r[0]) && r.slice(1).every(function (c) { return !clean(c); }); }

  // CSV of the PROGRAMME table -> { programme, warnings }. opts: { startsOn: 'YYYY-MM-DD', homeCsv: text }
  function parse(text, opts) {
    opts = opts || {};
    var rows = root.Bo7Csv.parseRows(text).map(function (r) { while (r.length < 5) r.push(''); return r; });
    var warnings = [], weeks = [], week = null, session = null, block = '', phase = null, phaseNote = null, clock = null;
    var name = '8-week training programme', subtitle = '';
    var expectPhaseNote = false;

    rows.forEach(function (r, i) {
      var a = clean(r[0]), b = clean(r[1]), c = clean(r[2]), d = clean(r[3]);
      if (blank(r)) return;
      var line = i + 1;

      if (i === 0 && /PROGRAMME/i.test(a)) { name = sentence(a.replace(/^BO7\s*-\s*/i, '')); return; }
      if (i === 1 && only0(r)) { subtitle = title(a.split('·').pop()); return; }  // the dates: "21 Sep - 15 Nov"

      if (only0(r) && /^PHASE\s+\d/i.test(a)) {
        var pm = /^PHASE\s+(\d+)\s*-\s*([^(·]+)/i.exec(a);
        phase = pm ? 'Phase ' + pm[1] + ' · ' + title(pm[2]) : sentence(a);
        phaseNote = null; clock = null; expectPhaseNote = true; week = null; session = null;
        return;
      }
      if (only0(r) && /CLOCK/i.test(a) && !session) { clock = sentence(a.replace(/^THE\s+/i, '').replace(/^\d+-MIN CLOCK\s*-\s*/i, '')); return; }
      if (only0(r) && /^WEEK\s+\d+/i.test(a)) {
        var wm = /^WEEK\s+(\d+)\s*-\s*([A-Z ]+?)\s*(⚡|·|$)/i.exec(a);
        week = { week_no: parseInt(/^WEEK\s+(\d+)/i.exec(a)[1], 10), phase: phase, phase_note: phaseNote, clock: clock,
                 label: wm ? title(wm[2]) : null, focus: null, note: null, is_test: /TEST WEEK/i.test(a), sessions: [] };
        weeks.push(week); session = null; block = ''; expectPhaseNote = false;
        return;
      }
      if (expectPhaseNote && only0(r) && !week) { phaseNote = a; expectPhaseNote = false; return; }
      if (only0(r) && /^FOCUS\s*-/i.test(a)) { if (week) week.focus = leadIn(a.replace(/^FOCUS\s*-\s*/i, '')); return; }

      // Any other line under a week heading, before its first session (test-week instructions).
      if (only0(r) && week && !session && !/^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\b/i.test(a)) {
        week.note = week.note ? week.note + ' ' + a : a; return;
      }
      var dayHead = /^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\b/i.test(a) && only0(r);
      if (dayHead) {
        if (!week) { warnings.push('Line ' + line + ': a session before any week heading was skipped.'); return; }
        var parts = splitDash(a), rest = (parts[1] || '').split('·').map(clean).filter(Boolean);
        session = { days: title(parts[0]), title: title(rest[0] || ''), tag: rest[1] ? (/^THE\s/i.test(rest[1]) ? title(rest[1]) : sentence(rest[1])) : null,  // named workouts keep capitals: The Seven, The Grind
                    warm_up: null, format: null, clock: null, items: [] };
        week.sessions.push(session); block = '';
        return;
      }
      if (!session) { if (week) warnings.push('Line ' + line + ': "' + a.slice(0, 40) + '" is outside a session and was skipped.'); return; }
      if (/^BLOCK$/i.test(a) && /^EXERCISE$/i.test(b)) return;
      if (/^WARM UP$/i.test(a)) { session.warm_up = b; return; }
      if (/^FORMAT$/i.test(a)) { session.format = b; return; }
      if (/^CLOCK$/i.test(a)) { session.clock = sentence(b.replace(/^\d+-MIN CLOCK\s*-\s*/i, '')); return; }

      if (a) block = a;
      if (!b) { warnings.push('Line ' + line + ': row with no exercise was skipped.'); return; }
      if (!c && !d) {
        session.items.push({ block: '', kind: /^SCORE\b/i.test(b) ? 'score' : 'note', exercise: b, sets: null, reps: null, key_lift: null, guide_pct: null });
        return;
      }
      var item = { block: block, kind: 'exercise', exercise: b, sets: c || null, reps: d || null, key_lift: null, guide_pct: null };
      // The main lift: first exercise of block A in the three weekday sessions.
      if (/^A$/i.test(block) && !session.items.some(function (x) { return x.key_lift; })) {
        LIFTS.forEach(function (l) { if (!item.key_lift && l.match.test(b)) item.key_lift = l.key; });
      }
      session.items.push(item);
    });

    if (!weeks.length) warnings.unshift('No "WEEK 01 - ..." headings found. Is this the PROGRAMME table?');
    weeks.forEach(function (w, k) {
      if (w.week_no !== k + 1) warnings.push('Week ' + w.week_no + ' is out of order (expected week ' + (k + 1) + ').');
      if (!w.sessions.length) warnings.push('Week ' + w.week_no + ' has no sessions.');
    });

    var programme = { name: name, subtitle: subtitle || null, starts_on: opts.startsOn || null, gym: opts.gym || null,
                      guide: opts.homeCsv ? guideFromHome(opts.homeCsv) : [], weeks: weeks };
    return { programme: programme, warnings: warnings };
  }

  // HOME table: rows between "HOW TO TRAIN THIS BLOCK" and the next heading -> [{term, text}]
  function guideFromHome(text) {
    var rows = root.Bo7Csv.parseRows(text), out = [], on = false;
    rows.forEach(function (r) {
      var a = clean(r[0]), b = clean(r[1]);
      if (/^HOW TO TRAIN/i.test(a)) { on = true; return; }
      if (!on) return;
      if (a && !b) { on = false; return; }
      if (a && b) out.push({ term: sentence(a), text: b });
    });
    return out;
  }

  // ---------- weights ----------
  function round25(kg) { return Math.max(20, Math.round(kg / 2.5) * 2.5); }
  // Same as the sheet: MAX(20, ROUND(5RM × % ÷ 2.5) × 2.5) for each %.
  function guide(pcts, base) {
    if (!pcts || !pcts.length || !(base > 0)) return null;
    return pcts.map(function (p) { return round25(base * Number(p)); });
  }
  // The 5RM to work from in a given week: the latest test result before it, else the starting 5RM (week 0).
  function baseFor(logs, lift, weekNo, testWeeks) {
    var best = null;
    [0].concat(testWeeks || []).forEach(function (w) {
      if (w >= weekNo) return;
      var l = (logs || []).filter(function (x) { return x.lift === lift && x.week_no === w && Number(x.best_kg) > 0; })[0];
      if (l) best = Number(l.best_kg);
    });
    return best;
  }

  // ---------- dates ----------
  function parseDay(s) { var p = String(s).slice(0, 10).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function weekNoFor(programme, date) {
    if (!programme || !programme.starts_on) return null;
    var start = parseDay(programme.starts_on), d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var n = Math.floor(Math.round((d - start) / 864e5) / 7) + 1;
    return n < 1 ? 0 : n > programme.weeks ? programme.weeks + 1 : n;   // 0 = not started, weeks+1 = finished
  }
  function weekDates(programme, weekNo) {
    var s = parseDay(programme.starts_on); s.setDate(s.getDate() + (weekNo - 1) * 7);
    var e = new Date(s); e.setDate(e.getDate() + 6);
    return { start: s, end: e };
  }
  // Index of the session whose days include this weekday ("Monday + Tuesday" ...), else 0.
  function sessionIndexFor(sessions, date) {
    var day = DAYS[date.getDay()];
    for (var i = 0; i < (sessions || []).length; i++) if (String(sessions[i].days).toLowerCase().indexOf(day) > -1) return i;
    return 0;
  }


  // ---------- workout analysis (mirrors public.exercise_key and the records in save_workout) ----------
  function exerciseKey(name) {
    name = String(name || '');
    if (/^\s*DUO\s*-/i.test(name)) return 'duo ' + clean(name.replace(/^\s*DUO\s*-\s*/i, '').split(' · ')[0]).toLowerCase();
    return clean(name.replace(/^\s*★\s*/, '').split(' · ')[0].replace(/\s+-\s+.*$/, '')).toLowerCase();
  }
  function displayName(name) {
    if (/^\s*DUO\s*-/i.test(name)) return 'Duo · ' + clean(String(name).replace(/^\s*DUO\s*-\s*/i, '').split(' · ')[0]);
    return clean(String(name).replace(/^\s*★\s*/, '').split(' · ')[0].replace(/\s+-\s+.*$/, ''));
  }
  // Epley estimate, only trusted between 1 and 12 reps.
  function e1rm(kg, reps) { kg = +kg; reps = +reps; return kg > 0 && reps >= 1 && reps <= 12 ? kg * (1 + reps / 30) : null; }
  // sets: [{weight_kg, reps}] -> {weight, e1rm, volume (best single set), total}
  function bests(sets) {
    var b = { weight: null, e1rm: null, volume: null, total: 0, bestSet: null };
    (sets || []).forEach(function (x) {
      var w = +x.weight_kg || 0, r = +x.reps || 0, e = e1rm(w, r), v = w * r;
      if (w > 0 && (b.weight === null || w > b.weight)) b.weight = w;
      if (e !== null && (b.e1rm === null || e > b.e1rm)) { b.e1rm = e; b.bestSet = { weight_kg: w, reps: r }; }
      if (w > 0 && r > 0 && (b.volume === null || v > b.volume)) b.volume = v;
      b.total += v;
    });
    return b;
  }
  // Records this workout sets against everything before it (same rules as the database).
  function records(prevSets, newSets, name) {
    var p = bests((prevSets || []).filter(function (x) { return +x.weight_kg > 0; })), n = bests((newSets || []).filter(function (x) { return +x.weight_kg > 0; })), out = [];
    if (!prevSets || !prevSets.some(function (x) { return +x.weight_kg > 0; })) return out;
    if (n.weight !== null && p.weight !== null && n.weight > p.weight) out.push({ exercise: name, kind: 'weight', value: n.weight, previous: p.weight });
    if (n.e1rm !== null && p.e1rm !== null && n.e1rm > p.e1rm) out.push({ exercise: name, kind: 'e1rm', value: Math.round(n.e1rm * 10) / 10, previous: Math.round(p.e1rm * 10) / 10 });
    if (n.volume !== null && p.volume !== null && n.volume > p.volume) out.push({ exercise: name, kind: 'volume', value: n.volume, previous: p.volume });
    return out;
  }
  function firstInt(s) { var m = /\d+/.exec(String(s || '')); return m ? parseInt(m[0], 10) : null; }

  root.Bo7Programme = { parse: parse, guideFromHome: guideFromHome, guide: guide, baseFor: baseFor, round25: round25,
                        weekNoFor: weekNoFor, weekDates: weekDates, sessionIndexFor: sessionIndexFor, LIFTS: LIFTS,
                        sentence: sentence, splitDash: splitDash,
                        exerciseKey: exerciseKey, displayName: displayName, e1rm: e1rm, bests: bests, records: records, firstInt: firstInt };
})(typeof window !== 'undefined' ? window : globalThis);
