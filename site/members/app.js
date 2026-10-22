// Bo7 members area. Talks to Supabase (see config.js and supabase/migrations); all access rules live in the database.
(function () {
  'use strict';
  var CFG = window.BO7_CONFIG || {};
  var LIVE = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
  var DEMO = !LIVE && CFG.demo === true;

  var PB_TYPES = ['Back squat', 'Deadlift', 'Bench press', 'Overhead press', 'Pull-ups', 'Row 500m', 'Plank', 'Other'];
  var UNIT = { 'Back squat': 'kg', 'Deadlift': 'kg', 'Bench press': 'kg', 'Overhead press': 'kg', 'Pull-ups': 'reps', 'Row 500m': 'min:sec', 'Plank': 'min:sec', 'Other': 'kg' };
  var MS_IDEAS = ['First pull-up', 'Ran 5k', 'Back after injury', 'Touched my toes', 'Did a full session without stopping'];
  var SESSION_MARKS = [10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000];

  // ---------- Helpers ----------
  var $ = function (id) { return document.getElementById(id); };
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var toastT;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 3600); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoDay(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDay(s) { var p = String(s).slice(0, 10).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function shortDate(s) { var d = parseDay(s); return d.getDate() + ' ' + d.toLocaleString('en-IE', { month: 'short' }); }
  function longDate(s) { return shortDate(s) + ' ' + parseDay(s).getFullYear(); }
  function num(n) { return String(Math.round(n * 100) / 100); }
  function fmtTime(sec) { var m = Math.floor(sec / 60), s = Math.round((sec - m * 60) * 100) / 100; return m + ':' + (s < 10 ? '0' : '') + s; }
  function fmtVal(v, unit) { v = +v; return unit === 'min:sec' ? fmtTime(v) : num(v); }
  function unitLabel(unit) { return unit === 'min:sec' ? '' : unit === 'metres' ? 'm' : unit; }
  function parseVal(raw, unit) {
    var s = String(raw).trim().replace(',', '.');
    if (unit === 'min:sec') {
      var m = s.match(/^(\d+):([0-5]?\d(?:\.\d+)?)$/);
      if (m) return +m[1] * 60 + +m[2];
      if (/^\d+(\.\d+)?$/.test(s)) return +s; // plain seconds
      return NaN;
    }
    return /^\d+(\.\d+)?$/.test(s) ? +s : NaN;
  }
  function weekStart(d) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return isoDay(x); }
  function friendlyError(e) {
    var m = (e && (e.message || e.error_description)) || String(e);
    if (!navigator.onLine || /failed to fetch|network|load failed/i.test(m)) return 'Can’t reach Bo7 right now. Check your connection and try again.';
    if (/rate limit|too many|security purposes/i.test(m)) return 'Too many tries. Wait a minute and try again.';
    if (/invalid login credentials/i.test(m)) return 'That mobile and password don’t match. Check them, or text yourself a code instead.';
    if (/expired|invalid/i.test(m) && /token|otp|code/i.test(m)) return 'That code didn’t work. Check it, or send a new one.';
    if (/password/i.test(m) && /weak|short|characters|pwned|leaked/i.test(m)) return 'Pick a stronger password: at least 8 characters, and not a common one.';
    if (/jwt|not authenticated|permission denied|row-level security/i.test(m)) return 'Please log in again.';
    return m.length > 160 ? 'Something went wrong. Please try again.' : m;
  }
  function download(name, obj) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // Works out the same numbers as public.my_summary() in the database, for demo mode.
  function summarise(sessions, glofoxTotal) {
    var now = Date.now(), monthNow = new Date();
    var att = sessions.filter(function (s) { return s.status === 'attended' && new Date(s.starts_at).getTime() <= now; })
      .sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); });
    var weeks = {};
    att.forEach(function (s) { var d = new Date(s.starts_at); if (now - d < 400 * 864e5) { var k = weekStart(d); weeks[k] = (weeks[k] || 0) + 1; } });
    var next = sessions.filter(function (s) { return s.status === 'booked' && new Date(s.starts_at).getTime() > now; })
      .sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); })[0] || null;
    return {
      total: Math.max(att.length, glofoxTotal || 0),
      this_month: att.filter(function (s) { var d = new Date(s.starts_at); return d.getMonth() === monthNow.getMonth() && d.getFullYear() === monthNow.getFullYear(); }).length,
      weeks: weeks,
      marks: SESSION_MARKS.filter(function (n) { return att.length >= n; }).map(function (n) { return { n: n, at: att[n - 1].starts_at }; }),
      next: next && { starts_at: next.starts_at, gym: next.gym, coach: next.coach }
    };
  }

  // ---------- Programmes ----------
  var BP = window.Bo7Programme;
  function bySort(a, b) { return (a.sort || 0) - (b.sort || 0); }
  // Database rows (programme_weeks -> programme_sessions -> programme_items) or imported JSON -> one shape.
  function normProgramme(p) {
    var weeks = (p.programme_weeks || (Array.isArray(p.weeks) ? p.weeks : [])).slice().sort(function (a, b) { return a.week_no - b.week_no; });
    return {
      id: p.id, name: p.name, subtitle: p.subtitle, starts_on: p.starts_on, guide: p.guide || [],
      weeks: typeof p.weeks === 'number' ? p.weeks : weeks.length,
      list: weeks.map(function (w) {
        var sessions = (w.programme_sessions || w.sessions || []).slice();
        sessions.forEach(function (x, i) { if (x.sort == null) x.sort = i + 1; });
        sessions.sort(bySort);
        return Object.assign({}, w, { sessions: sessions.map(function (x) {
          var items = (x.programme_items || x.items || []).slice();
          items.forEach(function (it, i) { if (it.sort == null) it.sort = i + 1; });
          return Object.assign({}, x, { items: items.sort(bySort) });
        }) });
      })
    };
  }
  // The block running now; else the next one starting within two weeks; else the most recent.
  function pickProgramme(list, today) {
    if (!list.length) return null;
    var now = list.filter(function (p) { var n = BP.weekNoFor(p, today); return n >= 1 && n <= p.weeks; })[0];
    if (now) return now;
    var soon = list.filter(function (p) { return BP.weekNoFor(p, today) === 0 && (BP.weekDates(p, 1).start - today) < 15 * 864e5; })[0];
    return soon || list.slice().sort(function (a, b) { return a.starts_on < b.starts_on ? 1 : -1; })[0];
  }

  // ---------- Data: Supabase when configured, otherwise this browser (demo) ----------
  var api = LIVE ? liveApi() : DEMO ? demoApi() : null;

  function liveApi() {
    var sb, uid;
    function ready() {
      if (sb) return Promise.resolve();
      return new Promise(function (res, rej) {
        var s = document.createElement('script');
        s.src = 'vendor/supabase.min.js';
        s.onload = function () {
          sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
          sb.auth.onAuthStateChange(function (event) { if (event === 'SIGNED_OUT' && S) location.reload(); });
          res();
        };
        s.onerror = function () { rej(new Error('Failed to fetch')); };
        document.head.appendChild(s);
      });
    }
    function ok(r) { if (r.error) throw r.error; return r.data; }
    var MEMBER_COLS = 'id, first_name, last_name, phone, gym, coach, member_since, pref_whatsapp, pref_email, pref_share_pbs, pref_leaderboard';
    var PROG_COLS = 'id, name, subtitle, starts_on, weeks, gym, guide, programme_weeks(week_no, phase, phase_note, clock, label, focus, note, is_test, ' +
      'programme_sessions(sort, days, title, tag, warm_up, format, clock, programme_items(sort, block, kind, exercise, sets, reps, key_lift, guide_pct)))';
    var PB_COLS = 'id, exercise, value, unit, lower_is_better, achieved_on, shared';
    var MS_COLS = 'id, title, achieved_on, shared';
    return {
      session: function () { return ready().then(function () { return sb.auth.getSession(); }).then(function (r) { var s = r.data.session; uid = s && s.user.id; return !!s; }); },
      sendCode: function (phone) { return ready().then(function () { return sb.auth.signInWithOtp({ phone: phone }); }).then(ok); },
      verify: function (phone, code) { return sb.auth.verifyOtp({ phone: phone, token: code, type: 'sms' }).then(function (r) { ok(r); uid = r.data.user.id; }); },
      passwordLogin: function (phone, password) {
        return ready().then(function () { return sb.auth.signInWithPassword({ phone: phone, password: password }); }).then(function (r) { ok(r); uid = r.data.user.id; });
      },
      hasPassword: function () { return sb.auth.getUser().then(function (r) { var u = r.data && r.data.user; return !!(u && u.user_metadata && u.user_metadata.has_password); }); },
      setPassword: function (password) { return sb.auth.updateUser({ password: password, data: { has_password: true } }).then(ok); },
      signOut: function () { return ready().then(function () { return sb.auth.signOut(); }); },
      load: async function () {
        var member = ok(await sb.from('members').select(MEMBER_COLS).eq('user_id', uid).eq('status', 'active').maybeSingle());
        if (!member) { var e = new Error('not-member'); e.notMember = true; throw e; }
        var res = await Promise.all([
          sb.rpc('my_summary'),
          sb.from('pbs').select(PB_COLS).eq('member_id', member.id).order('achieved_on').order('id').limit(5000),
          sb.from('milestones').select(MS_COLS).eq('member_id', member.id).order('achieved_on', { ascending: false }).limit(5000),
          sb.from('announcements').select('id, gym, title, body, pinned, published_on').order('pinned', { ascending: false }).order('published_on', { ascending: false }).limit(8),
          sb.from('programmes').select(PROG_COLS).eq('status', 'published').order('starts_on', { ascending: false }).limit(6)
        ]);
        var programme = pickProgramme(ok(res[4]).map(normProgramme), new Date());
        var more = await Promise.all([
          programme ? sb.from('lift_logs').select('week_no, lift, sets_kg, best_kg, notes').eq('programme_id', programme.id).eq('member_id', member.id) : Promise.resolve({ data: [] }),
          sb.from('workouts').select('id, title, performed_on, started_at, finished_at, programme_id, week_no, session_sort, ' +
            'workout_sets(exercise, exercise_key, key_lift, item_sort, set_no, weight_kg, reps), workout_notes(item_sort, exercise_key, note)').eq('member_id', member.id)
            .order('performed_on', { ascending: false }).order('id', { ascending: false }).limit(300)
        ]);
        var workouts = ok(more[1]).map(function (w) { var x = Object.assign({}, w, { sets: w.workout_sets || [], notes: w.workout_notes || [] }); delete x.workout_sets; delete x.workout_notes; return x; });
        return { member: member, summary: ok(res[0]), pbs: ok(res[1]), milestones: ok(res[2]), news: ok(res[3]), programme: programme, logs: ok(more[0]), workouts: workouts };
      },
      addPb: function (row) { return sb.from('pbs').insert(row).select(PB_COLS).single().then(ok); },
      deletePb: function (id) { return sb.rpc('remove_pb', { p_id: id }).then(ok); },
      addMilestone: function (row) { return sb.from('milestones').insert(row).select(MS_COLS).single().then(ok); },
      deleteMilestone: function (id) { return sb.rpc('remove_milestone', { p_id: id }).then(ok); },
      updatePrefs: function (memberId, patch) { return sb.from('members').update(patch).eq('id', memberId).then(ok); },
      exportData: function () { return sb.rpc('export_my_data').then(ok); },
      saveLift: function (programmeId, weekNo, lift, sets, best, notes) {
        return sb.rpc('save_lift_log', { p_programme_id: programmeId, p_week_no: weekNo, p_lift: lift, p_sets_kg: sets, p_best_kg: best, p_notes: notes || null }).then(ok);
      },
      leaderboard: function (programmeId) { return sb.rpc('programme_leaderboard', { p_programme_id: programmeId }).then(ok); },
      saveWorkout: function (w) { return sb.rpc('save_workout', { p: w }).then(ok); },
      deleteWorkout: function (id) { return sb.rpc('delete_workout', { p_id: id }).then(ok); }
    };
  }

  function demoApi() {
    var KEY = 'bo7-demo-data-v3', SIGNED = 'bo7-demo-signed-in';
    var programmeReady = new Promise(function (res) {
      if (window.BO7_DEMO_PROGRAMME) return res();
      var sc = document.createElement('script'); sc.src = 'demo-programme.js'; sc.onload = res; sc.onerror = res; document.head.appendChild(sc);
    });
    function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
    var mem = null;
    function db() {
      if (mem) return mem;
      try { mem = JSON.parse(get(KEY)); } catch (e) { mem = null; }
      if (!mem) { mem = seed(); save(); }
      return mem;
    }
    function save() { set(KEY, JSON.stringify(mem)); }
    function seed() {
      var since = '2026-03-17', sessions = [], d = parseDay(since), now = new Date(), i = 0;
      while (d < now) {
        var wd = d.getDay();
        if ((wd === 2 || wd === 4 || wd === 6) && (i++ % 7) !== 3) {
          var t = new Date(d); t.setHours(wd === 6 ? 9 : 7, 0, 0, 0);
          if (t < now) sessions.push({ id: sessions.length + 1, starts_at: t.toISOString(), status: 'attended', gym: 'Killiney', coach: 'Ryan' });
        }
        d.setDate(d.getDate() + 1);
      }
      var next = new Date(now); next.setDate(next.getDate() + 1);
      while (next.getDay() !== 2 && next.getDay() !== 4) next.setDate(next.getDate() + 1);
      next.setHours(7, 0, 0, 0);
      sessions.push({ id: sessions.length + 1, starts_at: next.toISOString(), status: 'booked', gym: 'Killiney', coach: 'Ryan' });
      var id = 1;
      function pb(ex, unit, vals, dates, lower) { return vals.map(function (v, k) { return { id: id++, exercise: ex, value: v, unit: unit, lower_is_better: !!lower, achieved_on: dates[k], shared: true }; }); }
      var pbs = [].concat(
        pb('Deadlift', 'kg', [60, 70, 75, 85, 90], ['2026-04-02', '2026-05-07', '2026-06-18', '2026-08-20', '2026-10-02']),
        pb('Back squat', 'kg', [40, 50, 55, 62.5], ['2026-04-04', '2026-05-30', '2026-07-23', '2026-09-24']),
        pb('Pull-ups', 'reps', [1, 3, 5], ['2026-07-09', '2026-08-27', '2026-09-30']),
        pb('Row 500m', 'min:sec', [141, 132, 125], ['2026-05-02', '2026-07-04', '2026-09-15'], true)
      );
      return {
        nextId: id + 10,
        member: { id: 'demo', first_name: 'Clodagh', last_name: 'Byrne', phone: '353851234567', gym: 'Killiney', coach: 'Ryan', member_since: since, glofox_total_attendances: 0, pref_whatsapp: true, pref_email: true, pref_share_pbs: true, pref_leaderboard: true },
        logs: [
          { week_no: 0, lift: 'back_squat', sets_kg: [], best_kg: 85, notes: null },
          { week_no: 0, lift: 'deadlift', sets_kg: [], best_kg: 110, notes: null },
          { week_no: 0, lift: 'bench_press', sets_kg: [], best_kg: 55, notes: null },
          { week_no: 1, lift: 'back_squat', sets_kg: [60, 60, 60, 60], best_kg: null, notes: '3s down, all clean' },
          { week_no: 2, lift: 'back_squat', sets_kg: [62.5, 62.5, 65, 65], best_kg: null, notes: null },
          { week_no: 3, lift: 'back_squat', sets_kg: [77.5, 65, 65, 65], best_kg: null, notes: 'Top set moved well' },
          { week_no: 4, lift: 'back_squat', sets_kg: [85, 87.5, 90], best_kg: 90, notes: null }
        ],
        board: [
          { name: 'Aoife Walsh (sample)', gym: 'Killiney', lifts: { 'back_squat:4': 80, 'deadlift:4': 115, 'bench_press:4': 50, 'back_squat:0': 75, 'deadlift:0': 105, 'bench_press:0': 47.5 } },
          { name: 'Seán Kelly (sample)', gym: 'Blackrock', lifts: { 'back_squat:4': 120, 'deadlift:4': 150, 'bench_press:4': 90, 'back_squat:0': 110, 'deadlift:0': 140, 'bench_press:0': 85 } }
        ],
        sessions: sessions,
        pbs: pbs,
        milestones: [
          { id: id++, title: 'First unassisted pull-up', achieved_on: '2026-09-30', shared: true },
          { id: id++, title: 'Ran 5k without stopping', achieved_on: '2026-08-12', shared: true }
        ],
        news: [
          { id: 1, pinned: true, gym: null, published_on: '2026-10-08', title: 'Bring-a-friend session', body: 'Bring someone to train with you this Saturday. One guest each, booked like any class in the app.' },
          { id: 2, gym: 'Killiney', published_on: '2026-10-06', title: 'New early session', body: 'A 06:00 slot is now on the timetable on Tuesdays and Thursdays. Book it in the app.' },
          { id: 3, gym: 'Blackrock', published_on: '2026-10-02', title: 'Welcome to our newest coach', body: 'A new coach joins the Blackrock team this month. Say hello next time you’re in.' }
        ]
      };
    }
    function later(v) { return new Promise(function (r) { setTimeout(function () { r(v); }, 150); }); }
    function copy(o) { return JSON.parse(JSON.stringify(o)); }
    // Sample history: weeks 1-3 of the programme, weights creeping up, so Progress has something to show.
    function demoWorkouts(p) {
      if (!p) return [];
      var out = [], id = 500, start = parseDay(p.starts_on), base = { back_squat: 85, deadlift: 110, bench_press: 55 };
      var acc = { 'seated db shoulder press': 14, 'ffe split squat': 12, 'lateral raise': 6, 'db standing calf raise': 16, 'rear delt fly': 6,
                  'chest supported row': 18, 'hip thrust': 60, 'hamstring bridge': 0, 'incline db curl': 8, 'banded face pull': 0,
                  'pull-up / band-assisted': 0, 'incline db press': 16, 'hammer curl': 10, 'overhead tricep extension': 12, 'dead bug': 0 };
      p.weeks.slice(0, 3).forEach(function (w) {
        w.sessions.slice(0, 3).forEach(function (sess, si) {
          var day = new Date(start); day.setDate(day.getDate() + (w.week_no - 1) * 7 + si * 2);
          var sets = [];
          sess.items.forEach(function (it, ii) {
            if (it.kind !== 'exercise' || /^DUO/i.test(it.exercise)) return;
            var key = BP.exerciseKey(it.exercise), n = Math.min(5, BP.firstInt(it.sets) || 3), reps = BP.firstInt(it.reps) || 10;
            var g = it.key_lift ? BP.guide(it.guide_pct, base[it.key_lift]) : null;
            for (var k = 1; k <= n; k++) {
              var wkg = it.key_lift ? (g ? (k === 1 ? g[0] : g[g.length - 1]) : 40) : acc[key] === 0 ? null : acc[key] != null ? acc[key] + (w.week_no - 1) * (acc[key] >= 20 ? 2.5 : 1) : 10;
              sets.push({ exercise: it.exercise, exercise_key: key, key_lift: it.key_lift || null, item_sort: ii + 1, set_no: k, weight_kg: wkg || null, reps: k === 1 && g && g.length > 1 ? 6 : reps });
            }
          });
          out.unshift({ id: id++, title: sess.title, performed_on: isoDay(day), started_at: null, finished_at: null, programme_id: 1, week_no: w.week_no, session_sort: si + 1, sets: sets });
        });
      });
      return out;
    }
    return {
      session: function () { return later(get(SIGNED) === '1'); },
      sendCode: function () { return later(); },
      verify: function (phone) { set(SIGNED, '1'); var d = db(); d.member.phone = phone.replace(/\D/g, ''); save(); return later(); },
      passwordLogin: function (phone, password) {
        if (get('bo7-demo-pw') !== password) return new Promise(function (res, rej) { setTimeout(function () { rej(new Error('Invalid login credentials')); }, 150); });
        set(SIGNED, '1'); return later();
      },
      hasPassword: function () { return later(!!get('bo7-demo-pw')); },
      setPassword: function (password) { set('bo7-demo-pw', password); return later(); },
      signOut: function () { set(SIGNED, null); return later(); },
      load: function () {
        return programmeReady.then(function () {
          var dd = db();
          if (!dd.workouts) { dd.workouts = demoWorkouts(window.BO7_DEMO_PROGRAMME); save(); }
          var d = copy(dd);
          var programme = window.BO7_DEMO_PROGRAMME ? normProgramme(Object.assign({ id: 1 }, window.BO7_DEMO_PROGRAMME)) : null;
          return later({
            member: d.member, summary: summarise(d.sessions, d.member.glofox_total_attendances), pbs: d.pbs, milestones: d.milestones,
            news: d.news.filter(function (n) { return !n.gym || n.gym === d.member.gym; }),
            programme: programme, logs: d.logs, workouts: d.workouts
          });
        });
      },
      saveLift: function (programmeId, weekNo, lift, sets, best, notes) {
        var d = db(), row = { week_no: weekNo, lift: lift, sets_kg: sets, best_kg: best, notes: notes || null };
        d.logs = d.logs.filter(function (l) { return !(l.week_no === weekNo && l.lift === lift); }).concat([row]);
        save(); return later(copy(row));
      },
      saveWorkout: function (w) {
        var d = db(), prs = [], sets = [], id = w.id || d.nextId++;
        var before = d.workouts.filter(function (x) { return x.id !== w.id; });
        w.exercises.forEach(function (ex) {
          var k = 0, key = BP.exerciseKey(ex.exercise);
          ex.sets.forEach(function (st) {
            if (st.weight_kg == null && st.reps == null) return;
            k++; sets.push({ exercise: ex.exercise, exercise_key: key, key_lift: ex.key_lift || null, item_sort: ex.item_sort, set_no: k, weight_kg: st.weight_kg, reps: st.reps });
          });
          var prev = []; before.forEach(function (x) { x.sets.forEach(function (st) { if (st.exercise_key === key) prev.push(st); }); });
          prs = prs.concat(BP.records(prev, sets.filter(function (st) { return st.exercise_key === key; }), ex.exercise));
        });
        var old = d.workouts.filter(function (x) { return x.id === w.id; })[0];
        var row = { id: id, title: w.title, performed_on: old ? old.performed_on : isoDay(new Date()), started_at: old ? old.started_at : w.started_at, finished_at: w.finished_at,
                    programme_id: old ? old.programme_id : w.programme_id, week_no: old ? old.week_no : w.week_no, session_sort: old ? old.session_sort : w.session_sort, sets: sets,
                    notes: w.exercises.filter(function (ex) { return ex.note && ex.note.trim(); }).map(function (ex) { return { item_sort: ex.item_sort, exercise_key: BP.exerciseKey(ex.exercise), note: ex.note.trim().slice(0, 500) }; }) };
        d.workouts = [row].concat(d.workouts.filter(function (x) { return x.id !== id; }));
        if (row.week_no != null) {
          ['back_squat', 'deadlift', 'bench_press'].forEach(function (lift) {
            var ls = sets.filter(function (st) { return st.key_lift === lift && st.weight_kg > 0; });
            if (!ls.length) return;
            var isTest = w.is_test, best = isTest ? Math.max.apply(null, ls.filter(function (st) { return (st.reps == null ? 5 : st.reps) >= 5; }).map(function (st) { return st.weight_kg; }).concat([0])) : null;
            var cur = d.logs.filter(function (l) { return l.week_no === row.week_no && l.lift === lift; })[0];
            d.logs = d.logs.filter(function (l) { return l !== cur; }).concat([{ week_no: row.week_no, lift: lift, sets_kg: ls.map(function (st) { return st.weight_kg; }), best_kg: best || (cur && cur.best_kg) || null, notes: cur ? cur.notes : null }]);
          });
        }
        save(); return later({ id: id, sets: sets.length, prs: old ? [] : prs });
      },
      deleteWorkout: function (id) { var d = db(); d.workouts = d.workouts.filter(function (x) { return x.id !== id; }); save(); return later(); },
      leaderboard: function () {
        var d = db(), mine = { name: d.member.first_name + ' ' + d.member.last_name, gym: d.member.gym, me: true, lifts: {} };
        d.logs.forEach(function (l) { if (l.best_kg) mine.lifts[l.lift + ':' + l.week_no] = l.best_kg; });
        return later(copy(d.board.concat([mine])));  // you always see yourself
      },
      addPb: function (row) { var d = db(); row = Object.assign({ id: d.nextId++ }, row); d.pbs.push(row); save(); return later(copy(row)); },
      deletePb: function (id) { var d = db(); d.pbs = d.pbs.filter(function (p) { return p.id !== id; }); save(); return later(); },
      addMilestone: function (row) { var d = db(); row = Object.assign({ id: d.nextId++ }, row); d.milestones.push(row); save(); return later(copy(row)); },
      deleteMilestone: function (id) { var d = db(); d.milestones = d.milestones.filter(function (m) { return m.id !== id; }); save(); return later(); },
      updatePrefs: function (memberId, patch) { var d = db(); Object.assign(d.member, patch); save(); return later(); },
      exportData: function () { var d = copy(db()); return later({ exported_at: new Date().toISOString(), member: d.member, sessions: d.sessions, pbs: d.pbs, milestones: d.milestones }); }
    };
  }

  // ---------- State ----------
  var S = null; // { member, summary, pbs, milestones, news }

  // ---------- Connection ----------
  function syncOnline() { $('offline').hidden = navigator.onLine; }
  window.addEventListener('online', syncOnline);
  window.addEventListener('offline', syncOnline);
  syncOnline();
  window.addEventListener('unhandledrejection', function (e) { toast(friendlyError(e.reason)); });

  // ---------- Login ----------
  var phoneE164 = '';
  if (DEMO) { $('demo-badge').hidden = false; $('demo-code-hint').hidden = false; }
  function showLogin() { $('loading').hidden = true; $('login').hidden = false; $('tabbar').hidden = true; ['home', 'programme', 'pbs', 'milestones', 'me'].forEach(function (s) { $(s).hidden = true; }); }
  function busy(btn, on, label) { btn.disabled = on; if (label) btn.textContent = label; }
  function toE164(raw) {
    var t = String(raw).trim(), d = t.replace(/\D/g, '');
    if (/^(\+|00)/.test(t)) { d = d.replace(/^00/, ''); return d.length >= 8 && d.length <= 15 && !/^353/.test(d) ? '+' + d : (/^353/.test(d) ? toE164(d.slice(3)) : null); }
    d = d.replace(/^353/, '').replace(/^0/, '');
    return d.length === 9 ? '+353' + d : null;
  }
  function prettyPhone(e164) { return e164.indexOf('+353') === 0 ? '+353 ' + e164.slice(4).replace(/(\d{2})(\d{3})(\d+)/, '$1 $2 $3') : e164; }

  // Mobile + password (the usual way), or a texted code (first time, or a forgotten password).
  var viaCode = false;
  function readPhone() {
    var p = toE164($('phone').value);
    if (!p) { $('phone-err').textContent = 'Enter your mobile number, for example 85 123 4567.'; $('phone').focus(); return null; }
    $('phone-err').textContent = ''; phoneE164 = p; return p;
  }
  $('phone-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!readPhone()) return;
    var pw = $('password').value;
    if (!pw) { $('phone-err').textContent = 'Enter your password, or text yourself a code.'; $('password').focus(); return; }
    viaCode = false;
    busy($('pw-login'), true, 'Logging in…');
    api.passwordLogin(phoneE164, pw).then(function () { $('password').value = ''; return enter(); })
      .catch(function (err) { $('phone-err').textContent = friendlyError(err); })
      .then(function () { busy($('pw-login'), false, 'Log in'); });
  });
  $('send').addEventListener('click', function () {
    if (!readPhone()) return;
    busy($('send'), true, 'Sending…');
    api.sendCode(phoneE164).then(function () {
      $('sent-to').textContent = prettyPhone(phoneE164);
      $('phone-form').hidden = true; $('code-form').hidden = false; $('code-err').textContent = '';
      boxes[0].focus();
    }).catch(function (err) { $('phone-err').textContent = friendlyError(err); })
      .then(function () { busy($('send'), false, 'First time, or forgot your password? Text me a code'); });
  });
  var boxes = [].slice.call($('code').querySelectorAll('input'));
  function codeComplete() { return boxes.every(function (x) { return x.value; }); }
  boxes.forEach(function (b, i) {
    b.addEventListener('input', function () {
      var v = b.value.replace(/\D/g, '');
      if (v.length > 1) { v.split('').slice(0, 6 - i).forEach(function (d, k) { boxes[i + k].value = d; }); boxes[Math.min(5, i + v.length - 1)].focus(); if (codeComplete()) $('code-form').requestSubmit(); return; }
      b.value = v; if (v && i < 5) boxes[i + 1].focus();
      if (v && i === 5 && codeComplete()) $('code-form').requestSubmit();
    });
    b.addEventListener('keydown', function (e) { if (e.key === 'Backspace' && !b.value && i > 0) boxes[i - 1].focus(); });
  });
  var verifying = false;
  $('code-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (verifying) return;
    var code = boxes.map(function (b) { return b.value; }).join('');
    if (code.length < 6) { $('code-err').textContent = 'Enter all six digits.'; return; }
    verifying = true; busy($('verify'), true, 'Checking…');
    viaCode = true;
    api.verify(phoneE164, code).then(enter).catch(function (err) {
      $('code-err').textContent = friendlyError(err);
      boxes.forEach(function (b) { b.value = ''; }); boxes[0].focus();
    }).then(function () { verifying = false; busy($('verify'), false, 'Log in'); });
  });
  var lastResend = 0;
  $('resend').addEventListener('click', function () {
    if (!phoneE164) return;
    if (Date.now() - lastResend < 60000) { toast('Wait a minute before asking for another code.'); return; }
    lastResend = Date.now();
    api.sendCode(phoneE164).then(function () { toast(DEMO ? 'Demo: any six digits work.' : 'New code sent.'); })
      .catch(function (err) { $('code-err').textContent = friendlyError(err); });
  });
  $('change-number').addEventListener('click', function () { $('code-form').hidden = true; $('phone-form').hidden = false; boxes.forEach(function (b) { b.value = ''; }); $('phone').focus(); });
  $('logout').addEventListener('click', function () { api.signOut().then(function () { location.hash = ''; location.reload(); }); });
  $('export').addEventListener('click', function () {
    busy($('export'), true, 'Preparing…');
    api.exportData().then(function (d) { download('bo7-my-data-' + isoDay(new Date()) + '.json', d); })
      .catch(function (err) { toast(friendlyError(err)); })
      .then(function () { busy($('export'), false, 'Download my data'); });
  });

  // ---------- Screens ----------
  var SCREENS = ['home', 'programme', 'pbs', 'milestones', 'me'];
  function show(name) {
    if (SCREENS.indexOf(name) === -1) name = 'home';
    SCREENS.forEach(function (s) { $(s).hidden = s !== name; });
    document.querySelectorAll('[data-tab]').forEach(function (b) { if (b.dataset.tab === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    try { history.replaceState(null, '', '#' + name); } catch (e) {}
    if (name === 'programme' && S) renderProgramme();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('[data-tab]').forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.tab); }); });

  function enter() {
    $('loading').hidden = false; $('login').hidden = true;
    return api.load().then(function (data) {
      S = data;
      $('loading').hidden = true; $('tabbar').hidden = false;
      renderAll(); show((location.hash || '#home').slice(1));
      try { W = JSON.parse(stored(DRAFT) || 'null'); } catch (e) { W = null; }
      if (W && !(W.exercises && W.exercises.length >= 0)) W = null;
      syncResume(); if (W) startTick();
      if (viaCode) { viaCode = false; return api.hasPassword().then(function (has) { askForPassword(has); }).catch(function () {}); }
    }).catch(function (err) {
      showLogin(); $('code-form').hidden = true; $('phone-form').hidden = false;
      if (err && err.notMember) {
        api.signOut();
        $('phone-err').textContent = 'That number isn’t on our member list, or your membership has ended. Ask at the front desk.';
      } else { $('phone-err').textContent = friendlyError(err); }
    });
  }
  // After a texted code: create a password (or a new one) so next time is mobile + password, no code.
  var pwReturn = null;
  function askForPassword(has) {
    pwReturn = (location.hash || '#home').slice(1);
    $('setpw-form').querySelector('h2').textContent = has ? 'Set a new password?' : 'Create your password';
    $('setpw-user').value = S && S.member && S.member.phone ? '+' + S.member.phone : phoneE164;
    $('setpw-1').value = ''; $('setpw-2').value = ''; $('setpw-err').textContent = '';
    SCREENS.forEach(function (x) { $(x).hidden = true; });
    $('tabbar').hidden = true; $('wo-resume').hidden = true;
    $('phone-form').hidden = true; $('code-form').hidden = true; $('setpw-form').hidden = false;
    $('login').querySelector('.lede').hidden = true; $('login-h').textContent = has ? 'You’re in' : 'Welcome to Bo7';
    $('login').hidden = false; $('setpw-1').focus();
  }
  function leavePassword() {
    $('login').hidden = true; $('setpw-form').hidden = true; $('phone-form').hidden = false;
    $('login').querySelector('.lede').hidden = false; $('login-h').textContent = 'Welcome back';
    $('tabbar').hidden = false; show(pwReturn || 'home'); syncResume();
  }
  $('setpw-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var a = $('setpw-1').value, b = $('setpw-2').value;
    if (a.length < 8) { $('setpw-err').textContent = 'Use at least 8 characters.'; $('setpw-1').focus(); return; }
    if (a !== b) { $('setpw-err').textContent = 'Those two don’t match. Type it again.'; $('setpw-2').focus(); return; }
    busy($('setpw-save'), true, 'Saving…');
    api.setPassword(a).then(function () { leavePassword(); toast('Password saved. Next time, log in with your mobile and password.'); renderMe(); })
      .catch(function (err) { $('setpw-err').textContent = friendlyError(err); })
      .then(function () { busy($('setpw-save'), false, 'Save password'); });
  });
  $('setpw-skip').addEventListener('click', function () { leavePassword(); toast('You can set a password any time on the Me tab.'); });
  $('me-password').addEventListener('click', function () { api.hasPassword().then(askForPassword).catch(function () { askForPassword(false); }); });

  // Refresh when someone comes back to the page after a while (new sessions, announcements).
  var hiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (S && hiddenAt && Date.now() - hiddenAt > 30 * 60000 && document.querySelectorAll('.sheet:not([hidden])').length === 0) {
      api.load().then(function (data) { S = data; renderAll(); }).catch(function () {});
    }
  });

  // ---------- Home ----------
  function streakText(sum) {
    if (!sum.total) return 'Welcome to Bo7. Your sessions, PBs and milestones will build up here.';
    var counts = sum.weeks || {}, thisWeek = weekStart(new Date()), weeks = 0, mins = [];
    var cur = parseDay(thisWeek);
    if (!counts[thisWeek]) cur.setDate(cur.getDate() - 7); // this week isn't over yet
    while (counts[isoDay(cur)]) {
      weeks++;
      if (isoDay(cur) !== thisWeek) mins.push(counts[isoDay(cur)]);
      cur.setDate(cur.getDate() - 7);
    }
    if (weeks < 2) return 'You’ve trained ' + sum.total + (sum.total === 1 ? ' time' : ' times') + ' with us. Keep it going.';
    var k = mins.length ? Math.min.apply(null, mins) : 0;
    if (k >= 2) return 'You’ve trained ' + k + ' times a week for ' + weeks + ' weeks running.';
    return 'You’ve trained every week for ' + weeks + ' weeks running.';
  }
  function renderHome() {
    var m = S.member, sum = S.summary, now = new Date();
    $('home-gym').textContent = m.gym;
    $('hello').textContent = 'Hi ' + m.first_name;
    $('streak').textContent = streakText(sum);
    $('s-month').textContent = sum.this_month;
    $('s-month-l').textContent = 'sessions in ' + now.toLocaleString('en-IE', { month: 'long' });
    $('s-total').textContent = sum.total;
    $('s-pbs').textContent = (S.workouts || []).filter(function (w) { var d = parseDay(w.performed_on); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;

    var next = sum.next;
    if (next) {
      var d = new Date(next.starts_at);
      var when = d.toLocaleString('en-IE', { weekday: 'short' }) + ' ' + d.getDate() + ' ' + d.toLocaleString('en-IE', { month: 'short' }) + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
      $('next-body').innerHTML = '<div class="meta">Your next session</div><div class="when">' + esc(when) + '</div><div class="meta">' + esc(next.gym || m.gym) + (next.coach ? ' · with ' + esc(next.coach) : '') + '</div>';
    } else {
      $('next-body').innerHTML = '<div class="meta">Your next session</div><div class="when">Nothing booked</div><div class="meta">Book your next one in the Bo7 app.</div>';
    }
    if (CFG.bookingsUrl) { $('bookings').href = CFG.bookingsUrl; $('bookings').hidden = false; }

    $('news').innerHTML = S.news.length ? S.news.map(function (n) {
      return '<article class="post"><div class="post-meta">' + (n.pinned ? '<span class="tag pin">Pinned</span>' : '') + '<span class="tag">' + esc(n.gym || 'All gyms') + '</span><span>' + esc(shortDate(n.published_on)) + '</span></div><h3>' + esc(n.title) + '</h3><p>' + esc(n.body) + '</p></article>';
    }).join('') : '<p class="empty">No announcements right now.</p>';
  }

  // ---------- PBs ----------
  function groupPbs() {
    var g = {};
    S.pbs.forEach(function (p) { var k = p.exercise.toLowerCase(); (g[k] = g[k] || []).push(p); });
    return Object.keys(g).map(function (k) {
      var h = g[k].slice().sort(function (a, b) { return a.achieved_on < b.achieved_on ? -1 : a.achieved_on > b.achieved_on ? 1 : a.id - b.id; });
      var lower = h[h.length - 1].lower_is_better, better = function (a, b) { return lower ? a < b : a > b; };
      var bestI = 0, prevBest = null;
      h.forEach(function (p, i) { if (i === 0 || !better(+h[bestI].value, +p.value)) { if (i > 0 && better(+p.value, +h[bestI].value)) prevBest = +h[bestI].value; bestI = i; } });
      return { exercise: h[h.length - 1].exercise, unit: h[h.length - 1].unit, lower: lower, history: h, best: h[bestI], prevBest: prevBest, last: h[h.length - 1].achieved_on };
    }).sort(function (a, b) { return a.last < b.last ? 1 : a.last > b.last ? -1 : 0; });
  }
  function trend(g) {
    var vals = g.history.map(function (p) { return +p.value; }), lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), n = vals.length;
    if (n < 2 || hi === lo) return '';
    var pts = vals.map(function (v, i) { var y = g.lower ? (v - lo) / (hi - lo) : 1 - (v - lo) / (hi - lo); return (i / (n - 1) * 300).toFixed(1) + ',' + (4 + y * 20).toFixed(1); });
    return '<svg class="trend" viewBox="0 0 300 28" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pts.join(' ') + '" fill="none" stroke="var(--gold)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>';
  }
  function deltaText(g) {
    if (g.prevBest === null) return '';
    var d = Math.abs(+g.best.value - g.prevBest);
    if (g.unit === 'min:sec') return (d < 60 ? num(d) + 's' : fmtTime(d)) + (g.lower ? ' faster' : ' longer');
    return '+' + num(d) + ' ' + unitLabel(g.unit);
  }
  var pbGroups = [];
  function renderPBs() {
    pbGroups = groupPbs();
    $('pb-list').innerHTML = pbGroups.length ? pbGroups.map(function (g, i) {
      return '<button type="button" class="pb" data-pbg="' + i + '"><div><b>' + esc(g.exercise) + '</b><div class="sub">Best on ' + esc(shortDate(g.best.achieved_on)) + ' · ' + g.history.length + ' logged</div></div><div><div class="val">' + esc(fmtVal(g.best.value, g.unit)) + '<small>' + esc(unitLabel(g.unit)) + '</small></div><div class="up">' + esc(deltaText(g)) + '</div></div>' + trend(g) + '</button>';
    }).join('') : '<p class="empty">No PBs yet. Log your first one: a lift, a time or a rep count.</p>';
  }
  var histGroup = null;
  $('pb-list').addEventListener('click', function (e) {
    var b = e.target.closest('[data-pbg]'); if (!b) return;
    openHistory(pbGroups[+b.dataset.pbg].exercise);
  });
  function openHistory(exercise) {
    var g = groupPbs().filter(function (x) { return x.exercise.toLowerCase() === exercise.toLowerCase(); })[0];
    if (!g) { closeSheets(); return; }
    histGroup = g;
    $('hist-h').textContent = g.exercise;
    $('hist-list').innerHTML = g.history.slice().reverse().map(function (p) {
      return '<div><span class="v">' + esc(fmtVal(p.value, p.unit)) + ' <small class="unit-sm">' + esc(unitLabel(p.unit)) + '</small></span><span class="d">' + esc(longDate(p.achieved_on)) + (p === g.best ? ' <span class="best">Best</span>' : '') + '</span><button type="button" class="del" data-delpb="' + esc(p.id) + '">Remove</button></div>';
    }).join('');
    openSheet('hist');
  }
  function idOf(s) { return isNaN(+s) ? s : +s; }
  $('hist-list').addEventListener('click', function (e) {
    var b = e.target.closest('[data-delpb]'); if (!b) return;
    if (!confirm('Remove this entry?')) return;
    var id = idOf(b.dataset.delpb);
    b.disabled = true;
    api.deletePb(id).then(function () {
      S.pbs = S.pbs.filter(function (p) { return p.id !== id; });
      renderPBs(); renderHome(); openHistory(histGroup.exercise); toast('Removed.');
    }).catch(function (err) { b.disabled = false; toast(friendlyError(err)); });
  });
  $('hist-add').addEventListener('click', function () {
    var g = histGroup; closeSheets();
    pbWhat = PB_TYPES.indexOf(g.exercise) > -1 ? g.exercise : 'Other';
    drawPbChips();
    if (pbWhat === 'Other') { $('pb-other').value = g.exercise; $('pb-unit').value = g.unit; $('pb-lower').checked = g.lower; syncLower(); }
    openSheet('pb');
  });

  // ---------- Milestones ----------
  function renderMilestones() {
    var sum = S.summary, items = [{ auto: true, title: 'Joined Bo7 ' + S.member.gym, day: S.member.member_since }];
    var dated = {};
    (sum.marks || []).forEach(function (m) { dated[m.n] = m.at; });
    var nextMark = null;
    SESSION_MARKS.forEach(function (n) {
      if (sum.total >= n) items.push({ auto: true, title: n + 'th session', day: dated[n] ? isoDay(new Date(dated[n])) : null });
      else if (nextMark === null) nextMark = n;
    });
    S.milestones.forEach(function (m) { items.push({ id: m.id, title: m.title, day: m.achieved_on }); });
    items.sort(function (a, b) {
      if (a.day === b.day) return a.auto ? 1 : -1;
      if (!a.day) return 1; if (!b.day) return -1;
      return a.day < b.day ? 1 : -1;
    });
    var html = '';
    if (nextMark !== null) {
      var togo = nextMark - sum.total;
      html += '<li class="auto next-up"><b>' + nextMark + 'th session</b><span>Coming up: ' + togo + (togo === 1 ? ' session' : ' sessions') + ' to go</span></li>';
    }
    html += items.map(function (m) {
      return '<li class="' + (m.auto ? 'auto' : 'mine') + '"><b>' + esc(m.title) + '</b><span>' + (m.day ? esc(longDate(m.day)) : 'Reached') + (m.auto ? ' · added for you' : '') + '</span>' + (m.auto ? '' : '<button type="button" class="del" data-delms="' + esc(m.id) + '">Remove</button>') + '</li>';
    }).join('');
    $('timeline').innerHTML = html;
  }
  $('timeline').addEventListener('click', function (e) {
    var b = e.target.closest('[data-delms]'); if (!b) return;
    if (!confirm('Remove this milestone?')) return;
    var id = idOf(b.dataset.delms);
    b.disabled = true;
    api.deleteMilestone(id).then(function () {
      S.milestones = S.milestones.filter(function (m) { return m.id !== id; });
      renderMilestones(); toast('Removed.');
    }).catch(function (err) { b.disabled = false; toast(friendlyError(err)); });
  });

  // ---------- Programme ----------
  var PG = { week: null, session: null };   // what's on screen
  var LIFT_NAMES = { back_squat: 'Back squat', deadlift: 'Deadlift', bench_press: 'Bench press' };
  function prog() { return S && S.programme; }
  function testWeeks() { return prog() ? prog().list.filter(function (w) { return w.is_test; }).map(function (w) { return w.week_no; }) : []; }
  function weekObj(n) { return prog().list.filter(function (w) { return w.week_no === n; })[0]; }
  function logFor(week, lift) { return (S.logs || []).filter(function (l) { return l.week_no === week && l.lift === lift; })[0]; }
  function kg(n) { return num(+n) + ' kg'; }
  function dayShort(days) { return String(days).split('+').map(function (d) { return d.trim().slice(0, 3); }).join(' · '); }
  function rangeText(p, n) {
    var r = BP.weekDates(p, n), f = function (d) { return d.getDate() + ' ' + d.toLocaleString('en-IE', { month: 'short' }); };
    return f(r.start) + ' – ' + f(r.end);
  }
  function currentWeek() { var p = prog(); if (!p) return null; var n = BP.weekNoFor(p, new Date()); return n < 1 ? 1 : n > p.weeks ? p.weeks : n; }
  function setsReps(it) {
    var sets = it.sets || '', reps = it.reps || '';
    if (!sets || sets === '-') return reps;
    if (/^\d+$/.test(sets) && /^\d/.test(reps)) return sets + ' × ' + reps;
    return (sets + ' ' + reps).trim();
  }

  function renderHomeWeek() {
    var p = prog(), box = $('home-week');
    if (!p) { box.hidden = true; return; }
    var today = new Date(), n = BP.weekNoFor(p, today);
    box.hidden = false;
    if (n === 0) {
      $('hw-label').textContent = p.name;
      $('hw-title').textContent = 'Starts ' + BP.weekDates(p, 1).start.toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' });
      $('hw-meta').textContent = 'Add your start 5RMs before Week 1 so your weights are ready.';
      $('hw-open').textContent = 'See the programme';
      return;
    }
    if (n > p.weeks) {
      $('hw-label').textContent = p.name + ' · complete';
      $('hw-title').textContent = 'Block finished. See how your 5RMs moved.';
      $('hw-meta').textContent = 'Your coach will publish the next block here.';
      $('hw-open').textContent = 'See your 5RMs';
      return;
    }
    var w = weekObj(n), si = BP.sessionIndexFor(w.sessions, today), sess = w.sessions[si];
    $('hw-label').textContent = 'Week ' + n + ' of ' + p.weeks + (w.is_test ? ' · Strength test week' : w.label ? ' · ' + w.label : '');
    $('hw-title').textContent = sess ? sess.title + (sess.tag ? ' · ' + sess.tag : '') : '';
    $('hw-meta').textContent = sess ? 'Today: ' + sess.days + (w.focus ? ' · ' + w.focus.split('.')[0] : '') : '';
    $('hw-open').textContent = "Open today's session";
  }
  $('hw-open').addEventListener('click', function () { PG.week = null; PG.session = null; show('programme'); });

  function renderProgramme() {
    var p = prog();
    $('pg-none').hidden = !!p; $('pg-body').hidden = !p;
    if (!p) { $('pg-name').textContent = 'Programme'; $('pg-lede').textContent = ''; return; }
    var now = BP.weekNoFor(p, new Date());
    if (PG.week == null) PG.week = currentWeek();
    var w = weekObj(PG.week) || p.list[0];
    if (PG.session == null || !w.sessions[PG.session]) PG.session = now >= 1 && now <= p.weeks && PG.week === now ? BP.sessionIndexFor(w.sessions, new Date()) : 0;

    $('pg-name').textContent = p.name;
    $('pg-lede').textContent = (p.subtitle ? p.subtitle + ' · ' : '') +
      (now < 1 ? 'Starts ' + rangeText(p, 1).split(' – ')[0] : now > p.weeks ? 'Complete' : 'Week ' + now + ' of ' + p.weeks);

    $('pg-weeks').innerHTML = p.list.map(function (x) {
      return '<button type="button" class="wk' + (x.week_no === now ? ' now' : '') + '" data-week="' + x.week_no + '" aria-pressed="' + (x.week_no === w.week_no) + '"><b>' + x.week_no + '</b><span>' + (x.is_test ? '★ Test' : esc(x.label || '')) + '</span></button>';
    }).join('');
    var focus = '<span class="label">' + esc((w.phase ? w.phase + ' · ' : '') + rangeText(p, w.week_no)) + '</span>';
    if (w.focus) focus += '<div>' + esc(w.focus) + '</div>';
    if (w.note) focus += '<div>' + esc(w.note) + '</div>';
    $('pg-focus').innerHTML = focus;

    $('pg-sessions').style.gridTemplateColumns = 'repeat(' + w.sessions.length + ', minmax(0, 1fr))';
    $('pg-sessions').innerHTML = w.sessions.map(function (x, i) {
      return '<button type="button" data-session="' + i + '" aria-pressed="' + (i === PG.session) + '"><b>' + esc(dayShort(x.days)) + '</b><span>' + esc(x.title.replace(/^The\s+/i, '').split(' ')[0]) + '</span></button>';
    }).join('');
    var sess = w.sessions[PG.session];
    $('pg-s-days').textContent = sess.days + (sess.tag ? ' · ' + sess.tag : '');
    $('pg-s-title').textContent = sess.title;
    $('pg-warm').innerHTML = sess.warm_up ? '<span class="label full">Warm up</span>' + sess.warm_up.split('·').map(function (x) { return '<span>' + esc(x.trim()) + '</span>'; }).join('') : '';
    $('pg-format').textContent = [sess.format, sess.clock].filter(Boolean).join(' · ') || (w.clock ? 'The 50-minute clock: ' + w.clock : '');
    $('pg-blocks').innerHTML = renderBlocks(sess.items);

    renderStart(p, w, sess);
    render5rm(p);
    $('pg-guide').hidden = !(p.guide && p.guide.length);
    $('pg-guide-list').innerHTML = (p.guide || []).map(function (g) { return '<dt>' + esc(g.term) + '</dt><dd>' + esc(g.text) + '</dd>'; }).join('');
  }

  function renderBlocks(items) {
    var groups = [];
    items.forEach(function (it) {
      if (it.kind !== 'exercise' && groups.length) { groups[groups.length - 1].rows.push(it); return; }
      var g = groups[groups.length - 1];
      if (!g || g.block !== it.block) groups.push(g = { block: it.block, rows: [] });
      g.rows.push(it);
    });
    return groups.map(function (g) {
      return '<div class="blk"><div class="blk-name">' + esc(g.block || '') + '</div><div class="blk-rows">' + g.rows.map(function (it) {
        if (it.kind !== 'exercise') {
          var parts = BP.splitDash(it.exercise);
          return '<div class="callout">' + (parts[1] ? '<strong>' + esc(BP.sentence(parts[0])) + '</strong>' + esc(parts[1]) : esc(it.exercise)) + '</div>';
        }
        var name = it.exercise.split(' · '), main = name.shift();
        return '<div class="ex' + (it.key_lift ? ' key' : '') + '"><div><b>' + esc(main) + '</b>' + (name.length ? '<div class="hint">' + esc(name.join(' · ')) + '</div>' : '') +
          '</div><span class="sr">' + esc(setsReps(it)) + '</span></div>';
      }).join('') + '</div></div>';
    }).join('');
  }

  function guideText(pcts, base) {
    var g = BP.guide(pcts, base);
    if (!g) return null;
    return g.length > 1 ? 'Top set ' + kg(g[0]) + ' · back-offs ' + kg(g[1]) : kg(g[0]);
  }
  function renderStart(p, w, sess) {
    var key = sess.items.filter(function (i) { return i.key_lift; })[0], line = '';
    if (key) {
      var base = BP.baseFor(S.logs, key.key_lift, w.week_no, testWeeks());
      if (w.is_test) line = base ? 'To beat: ' + kg(base) + ' ' + LIFT_NAMES[key.key_lift].toLowerCase() : 'Test week: set your first 5RM mark';
      else { var gt = guideText(key.guide_pct, base); line = gt ? LIFT_NAMES[key.key_lift] + ': ' + (/^Top/.test(gt) ? gt.charAt(0).toLowerCase() + gt.slice(1) : 'start at ' + gt) : 'Add your start 5RMs below to get starting weights'; }
    }
    var done = (S.workouts || []).filter(function (x) { return x.programme_id === p.id && x.week_no === w.week_no && x.session_sort === sess.sort; })[0];
    $('pg-log').hidden = false;
    if (!sess.items.some(isSuperset)) {
      $('pg-logger').innerHTML = '<div class="logger-head"><h3>Conditioning session</h3></div><p class="hint">No weights to log today. Your score goes on the board in the gym.</p>';
      return;
    }
    $('pg-logger').innerHTML = '<div class="logger-head"><h3>' + (done ? 'Logged ' + esc(shortDate(done.performed_on)) : 'Log this session') + '</h3>' + (line ? '<span class="guide-kg">' + esc(line) + '</span>' : '') + '</div>' +
      '<p class="hint">' + (done ? done.sets.length + ' sets saved. Open it to check or change a weight.' : 'Every set of the supersets: weight and reps. Your last numbers are filled in to beat.') + '</p>' +
      '<div class="toolbar"><button class="btn primary grow" type="button" id="pg-start">' + (done ? 'Log it again' : 'Start workout') + '</button>' +
      (done ? '<button class="btn" type="button" id="pg-view">View</button>' : '') + '</div>';
    $('pg-start').addEventListener('click', function () { startFromSession(p, w, sess); });
    if (done) $('pg-view').addEventListener('click', function () { openWorkout(done.id); });
  }

  function render5rm(p) {
    var tw = testWeeks(), cols = [0].concat(tw);
    var rows = BP.LIFTS.map(function (l) {
      var vals = cols.map(function (w) { var x = logFor(w, l.key); return x && x.best_kg ? +x.best_kg : null; });
      var first = vals.filter(function (v) { return v; })[0], last = vals.filter(function (v) { return v; }).slice(-1)[0];
      var gain = first && last && last !== first ? last - first : null;
      return '<tr><td>' + esc(LIFT_NAMES[l.key]) + '</td>' + vals.map(function (v, i) {
        return i === 0 ? '<td><input class="input kg-in" id="st-' + l.key + '" inputmode="decimal" placeholder="kg" value="' + (v ? esc(num(v)) : '') + '" aria-label="Start 5RM ' + esc(LIFT_NAMES[l.key]) + '"></td>'
          : '<td>' + (v ? esc(num(v)) : '—') + '</td>';
      }).join('') + '<td class="gain">' + (gain ? (gain > 0 ? '+' : '') + esc(num(gain)) : '') + '</td></tr>';
    }).join('');
    $('pg-5rm').innerHTML = '<table class="mini"><thead><tr><th>Lift</th><th>Start</th>' + tw.map(function (w) { return '<th>Week ' + w + '</th>'; }).join('') +
      '<th>Gain</th></tr></thead><tbody>' + rows + '</tbody></table><div class="toolbar mt12"><button class="btn small" type="button" id="st-save">Save start numbers</button><span class="err" id="st-err"></span></div>';
    $('st-save').addEventListener('click', function () {
      var jobs = [];
      BP.LIFTS.forEach(function (l) {
        var raw = $('st-' + l.key).value.trim().replace(',', '.'), cur = logFor(0, l.key);
        if (!raw) return;
        var v = +raw;
        if (!(v > 0 && v <= 500)) { jobs.push(Promise.reject(new Error('Enter weights in kg, like 62.5.'))); return; }
        if (cur && +cur.best_kg === v) return;
        jobs.push(api.saveLift(p.id, 0, l.key, [], Math.round(v * 100) / 100, null).then(function (row) {
          S.logs = S.logs.filter(function (x) { return !(x.week_no === 0 && x.lift === l.key); }).concat([row]);
        }));
      });
      if (!jobs.length) { toast('Nothing new to save.'); return; }
      Promise.all(jobs).then(function () { toast('Start numbers saved. Your starting weights are ready.'); renderProgramme(); })
        .catch(function (err) { $('st-err').textContent = friendlyError(err); });
    });
  }

  $('pg-weeks').addEventListener('click', function (e) { var b = e.target.closest('[data-week]'); if (!b) return; PG.week = +b.dataset.week; PG.session = 0; renderProgramme(); });
  $('pg-sessions').addEventListener('click', function (e) { var b = e.target.closest('[data-session]'); if (!b) return; PG.session = +b.dataset.session; renderProgramme(); });

  // Leaderboard: the latest test week reached; total of the three lifts; gain on the test before it.
  function openBoard() {
    var p = prog(), tw = testWeeks(), now = BP.weekNoFor(p, new Date());
    var week = tw.filter(function (w) { return w <= Math.max(now, tw[0]); }).slice(-1)[0] || tw[0];
    var before = [0].concat(tw).filter(function (w) { return w < week; }).slice(-1)[0];
    $('board-optin').checked = !!S.member.pref_leaderboard;
    $('board-hint').textContent = 'Week ' + week + ' 5RMs. Only members who switch this on are shown.';
    $('board-table').innerHTML = '<p class="empty">Loading…</p>';
    openSheet('board');
    api.leaderboard(p.id).then(function (rows) {
      var list = rows.map(function (r) {
        var get = function (lift, w) { return r.lifts[lift + ':' + w] != null ? +r.lifts[lift + ':' + w] : null; };
        var v = BP.LIFTS.map(function (l) { return get(l.key, week); });
        var total = v.every(function (x) { return x; }) ? v.reduce(function (a, b) { return a + b; }, 0) : null;
        var prevV = BP.LIFTS.map(function (l) { return get(l.key, before); });
        var gain = total && prevV.every(function (x) { return x; }) ? total - prevV.reduce(function (a, b) { return a + b; }, 0) : null;
        return { r: r, v: v, total: total, gain: gain };
      }).filter(function (x) { return x.v.some(function (y) { return y; }); })
        .sort(function (a, b) { return (b.total || 0) - (a.total || 0) || (a.r.name < b.r.name ? -1 : 1); });
      $('board-table').innerHTML = list.length ? '<table class="mini"><thead><tr><th>Member</th><th>Squat</th><th>Deadlift</th><th>Bench</th><th>Total</th><th>Gain</th></tr></thead><tbody>' +
        list.map(function (x) {
          return '<tr' + (x.r.me ? ' class="me"' : '') + '><td>' + esc(x.r.name) + '<div class="hint">' + esc(x.r.gym) + '</div></td>' + x.v.map(function (y) { return '<td>' + (y ? esc(num(y)) : '—') + '</td>'; }).join('') +
            '<td>' + (x.total ? esc(num(x.total)) : '—') + '</td><td class="gain">' + (x.gain ? (x.gain > 0 ? '+' : '') + esc(num(x.gain)) : '') + '</td></tr>';
        }).join('') + '</tbody></table>' : '<p class="empty">No 5RMs logged for Week ' + week + ' yet.</p>';
    }).catch(function (err) { $('board-table').innerHTML = '<p class="err">' + esc(friendlyError(err)) + '</p>'; });
  }
  $('pg-board-open').addEventListener('click', function () { if (prog() && testWeeks().length) openBoard(); else toast('This block has no test weeks.'); });
  $('board-optin').addEventListener('change', function () {
    var c = $('board-optin');
    api.updatePrefs(S.member.id, { pref_leaderboard: c.checked }).then(function () {
      S.member.pref_leaderboard = c.checked; renderMe(); toast(c.checked ? 'You’re on the leaderboard.' : 'You’re off the leaderboard.'); openBoard();
    }).catch(function (err) { c.checked = !c.checked; toast(friendlyError(err)); });
  });

  // ---------- Workout logger (one exercise card each, rows of Set · Previous · kg · Reps · ✓) ----------
  var DRAFT = 'bo7-workout-draft', W = null, restEnd = 0, restLen = 90, tickT = null, finishArmed = false, discardArmed = false;
  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function stored(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function saveDraft() { if (W) store(DRAFT, JSON.stringify(W)); }
  function clock(sec) { sec = Math.max(0, Math.floor(sec)); var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), x = sec % 60; return (h ? h + ':' + pad(m) : m) + ':' + pad(x); }
  function kgNum(v) { v = String(v == null ? '' : v).trim().replace(',', '.'); return v === '' ? null : +v; }
  function setText(st) { return (st.weight_kg != null ? num(+st.weight_kg) + ' kg' : 'BW') + (st.reps != null ? ' × ' + st.reps : ''); }

  // Most recent workout that had this exercise, its sets in order.
  function noteFor(w, sort) { var n = (w.notes || []).filter(function (x) { return x.item_sort === sort; })[0]; return n ? n.note : ''; }
  // The most recent note on this exercise, from an earlier workout.
  function lastNote(key, notId) {
    var ws = S.workouts || [];
    for (var i = 0; i < ws.length; i++) {
      if (ws[i].id === notId) continue;
      var n = (ws[i].notes || []).filter(function (x) { return x.exercise_key === key; })[0];
      if (n) return { note: n.note, day: ws[i].performed_on };
    }
    return null;
  }
  function lastSets(key, notId) {
    var ws = (S.workouts || []);
    for (var i = 0; i < ws.length; i++) {
      if (ws[i].id === notId) continue;
      var sets = ws[i].sets.filter(function (st) { return st.exercise_key === key; }).sort(function (a, b) { return a.set_no - b.set_no; });
      if (sets.length) return sets;
    }
    return [];
  }
  // Only the lettered superset blocks (A, B, C...) are logged: not DUO finishers or the conditioning circuit.
  function isSuperset(it) { return it.kind === 'exercise' && /^[A-Z]$/.test(String(it.block || '').trim()); }
  function newEx(name, keyLift, sort, n, reps, guide, target, group) {
    var key = BP.exerciseKey(name), prev = lastSets(key), sets = [];
    for (var k = 0; k < n; k++) {
      var p = prev[k] || prev[prev.length - 1];
      var phW = guide ? (k === 0 ? guide[0] : guide[guide.length - 1]) : p && p.weight_kg != null ? +p.weight_kg : '';
      var phR = reps || (p && p.reps != null ? p.reps : '');
      sets.push({ w: '', r: '', done: false, pw: phW === '' ? '' : num(phW), pr: phR === '' ? '' : String(phR) });
    }
    return { exercise: name, key: key, key_lift: keyLift || null, item_sort: sort, target: target || '', guide: guide, sets: sets, group: group || null };
  }
  function startFromSession(p, w, sess) {
    if (W) { if (W.programme_id === p.id && W.week_no === w.week_no && W.session_sort === sess.sort) { openLogger(); return; } toast('Finish or discard the workout you have open first.'); openLogger(); return; }
    var exs = [];
    sess.items.forEach(function (it) {
      if (!isSuperset(it)) return;
      var base = it.key_lift ? BP.baseFor(S.logs, it.key_lift, w.week_no, testWeeks()) : null;
      var guide = it.key_lift && !w.is_test ? BP.guide(it.guide_pct, base) : it.key_lift && base ? [base] : null;
      var n = it.key_lift && w.is_test ? 3 : Math.min(10, Math.max(1, BP.firstInt(it.sets) || 3));
      var target = setsReps(it) + (it.key_lift && w.is_test ? ' · three attempts at a clean 5RM' : '');
      exs.push(newEx(it.exercise, it.key_lift, it.sort, n, BP.firstInt(it.reps), guide, target, String(it.block).trim()));
    });
    W = { id: null, title: sess.title, sub: 'Week ' + w.week_no + ' · ' + sess.days, programme_id: p.id, week_no: w.week_no, session_sort: sess.sort, is_test: !!w.is_test,
          started_at: Date.now(), exercises: exs };
    saveDraft(); openLogger();
  }
  function blockOf(w, sort) {
    var p = prog(); if (!p || p.id !== w.programme_id) return null;
    var wk = weekObj(w.week_no), sess = wk && wk.sessions.filter(function (x) { return x.sort === w.session_sort; })[0];
    var it = sess && sess.items.filter(function (x) { return x.sort === sort; })[0];
    return it && isSuperset(it) ? String(it.block).trim() : null;
  }
  // "A1", "A2"... for each exercise; the last exercise of a superset is where you rest.
  function supersetLabels(exs) {
    return exs.map(function (ex, i) {
      if (!ex.group) return { label: '', last: true };
      var same = exs.filter(function (x) { return x.group === ex.group; });
      return { label: ex.group + (same.length > 1 ? same.indexOf(ex) + 1 : ''), last: same[same.length - 1] === ex, first: same[0] === ex, size: same.length };
    });
  }
  function editWorkout(w) {
    if (W) { toast('Finish or discard the workout you have open first.'); openLogger(); return; }
    var by = {};
    w.sets.slice().sort(function (a, b) { return a.item_sort - b.item_sort || a.set_no - b.set_no; }).forEach(function (st) {
      var e = by[st.item_sort] || (by[st.item_sort] = { exercise: st.exercise, key: st.exercise_key, key_lift: st.key_lift, item_sort: st.item_sort, target: '', guide: null, sets: [], group: blockOf(w, st.item_sort) });
      e.sets.push({ w: st.weight_kg != null ? num(+st.weight_kg) : '', r: st.reps != null ? String(st.reps) : '', done: true, pw: '', pr: '' });
    });
    Object.keys(by).forEach(function (k) { by[k].note = noteFor(w, by[k].item_sort); });
    W = { id: w.id, title: w.title, sub: 'Editing · ' + longDate(w.performed_on), programme_id: w.programme_id, week_no: w.week_no, session_sort: w.session_sort,
          is_test: w.week_no != null && testWeeks().indexOf(w.week_no) > -1, started_at: null, exercises: Object.keys(by).map(function (k) { return by[k]; }) };
    saveDraft(); openLogger();
  }

  function renderLogger() {
    $('wo-title').textContent = W.title; $('wo-sub').textContent = W.sub || '';
    $('wo-finish').textContent = W.id ? 'Save' : 'Finish';
    var labels = supersetLabels(W.exercises);
    $('wo-body').innerHTML = (W.exercises.length ? '' : '<p class="empty">Nothing to log in this session.</p>') + W.exercises.map(function (ex, ei) {
      var prev = lastSets(ex.key, W.id), lb = labels[ei], lastN = lastNote(ex.key, W.id);
      var open = lb.first ? '<div class="wo-ss"><div class="wo-ss-head"><span class="label">Superset ' + esc(ex.group) + '</span>' +
        (lb.size > 1 ? '<span class="hint">Alternate ' + esc(ex.group) + '1 and ' + esc(ex.group) + lb.size + ', rest after ' + esc(ex.group) + lb.size + '</span>' : '') + '</div>' : '';
      return open + '<div class="wo-ex"><div class="wo-ex-head"><button type="button" class="wo-ex-name" data-exinfo="' + esc(ex.key) + '">' + (lb.label ? '<span class="ss-tag">' + esc(lb.label) + '</span> ' : '') + esc(BP.displayName(ex.exercise)) + '</button>' +
        (ex.guide ? '<span class="wo-guide">' + esc(ex.guide.length > 1 ? 'Top ' + num(ex.guide[0]) + ' · then ' + num(ex.guide[1]) + ' kg' : (W.is_test ? 'Beat ' : 'Start ') + num(ex.guide[0]) + ' kg') + '</span>' : '') + '</div>' +
        (ex.target ? '<div class="wo-target">' + esc(ex.target) + (ex.exercise.indexOf(' · ') > -1 ? ' · ' + esc(ex.exercise.split(' · ').slice(1).join(' · ')) : '') + '</div>' : '') +
        '<div class="set-row head"><span class="no">Set</span><span>Previous</span><span class="c">kg</span><span class="c">Reps</span><span class="c">✓</span></div>' +
        ex.sets.map(function (st, si) {
          var p = prev[si];
          return '<div class="set-row' + (st.done ? ' done' : '') + '" data-ei="' + ei + '" data-si="' + si + '"><span class="no">' + (si + 1) + '</span>' +
            '<button type="button" class="prev" data-copy tabindex="-1">' + (p ? esc(setText(p)) : '—') + '</button>' +
            '<input class="input" data-f="w" inputmode="decimal" enterkeyhint="next" aria-label="Set ' + (si + 1) + ' kg" placeholder="' + esc(st.pw) + '" value="' + esc(st.w) + '">' +
            '<input class="input" data-f="r" inputmode="numeric" enterkeyhint="done" aria-label="Set ' + (si + 1) + ' reps" placeholder="' + esc(st.pr) + '" value="' + esc(st.r) + '">' +
            '<button type="button" class="tick" data-tick aria-pressed="' + st.done + '" aria-label="Set ' + (si + 1) + ' done">✓</button></div>';
        }).join('') +
        '<div class="toolbar"><button type="button" class="wo-add" data-addset="' + ei + '">+ Add set</button>' + (ex.sets.length > 1 ? '<button type="button" class="wo-add muted" data-dropset="' + ei + '">Remove last set</button>' : '') +
          (ex.note || ex.noteOpen ? '' : '<button type="button" class="wo-add" data-addnote="' + ei + '">+ Note</button>') + '</div>' +
        (ex.note || ex.noteOpen ? '<textarea class="input wo-note" data-note="' + ei + '" rows="2" maxlength="300" placeholder="How it felt, form cues, what to change next time" aria-label="Note for ' + esc(BP.displayName(ex.exercise)) + '">' + esc(ex.note || '') + '</textarea>' : '') +
        (lastN ? '<p class="wo-last-note"><span class="label">Last note · ' + esc(shortDate(lastN.day)) + '</span> ' + esc(lastN.note) + '</p>' : '') + '</div>' +
        (lb.last && ex.group ? '</div>' : '');
    }).join('') +
      '<div class="toolbar"><button type="button" class="btn small" id="wo-discard">' + (W.id ? 'Cancel editing' : 'Discard workout') + '</button></div>';
    finishArmed = false; discardArmed = false;
  }
  function openLogger() {
    renderLogger();
    $('workout').hidden = false; $('wo-resume').hidden = true; document.body.style.overflow = 'hidden';
    startTick();
  }
  function minimise() { $('workout').hidden = true; document.body.style.overflow = ''; syncResume(); }
  function closeLogger() { W = null; store(DRAFT, null); restEnd = 0; $('wo-rest').hidden = true; $('workout').hidden = true; document.body.style.overflow = ''; syncResume(); }
  function syncResume() { $('wo-resume').hidden = !W || !$('workout').hidden || $('tabbar').hidden; if (W) $('wo-resume-sub').textContent = W.title; tickNow(); }
  function startTick() { if (!tickT) tickT = setInterval(tickNow, 1000); tickNow(); }
  function tickNow() {
    if (!W) { clearInterval(tickT); tickT = null; return; }
    var el = W.started_at ? clock((Date.now() - W.started_at) / 1000) : 'Edit';
    $('wo-timer').textContent = el; $('wo-resume-time').textContent = el;
    if (restEnd) {
      var left = (restEnd - Date.now()) / 1000;
      if (left <= 0) { restEnd = 0; $('wo-rest').hidden = true; if (navigator.vibrate) try { navigator.vibrate([200, 100, 200]); } catch (e) {} toast('Rest over. Next set.'); }
      else { $('wo-rest').hidden = false; $('wo-rest-time').textContent = clock(Math.ceil(left)); }
    }
  }
  function rest(sec) { restLen = sec; restEnd = Date.now() + sec * 1000; tickNow(); }

  $('wo-body').addEventListener('input', function (e) {
    if (e.target.dataset.note != null) { W.exercises[+e.target.dataset.note].note = e.target.value.slice(0, 300); saveDraft(); return; }
    var row = e.target.closest('.set-row'); if (!row || !e.target.dataset.f) return;
    W.exercises[+row.dataset.ei].sets[+row.dataset.si][e.target.dataset.f] = e.target.value.slice(0, 8);
    saveDraft();
  });
  $('wo-body').addEventListener('click', function (e) {
    var row = e.target.closest('.set-row'), b;
    if (row && e.target.closest('[data-tick]')) {
      var ex = W.exercises[+row.dataset.ei], st = ex.sets[+row.dataset.si];
      if (!st.done) {
        if (st.w === '' && st.pw !== '') st.w = st.pw;
        if (st.r === '' && st.pr !== '') st.r = st.pr;
        var wv = kgNum(st.w), rv = kgNum(st.r);
        if (wv === null && rv === null) { toast('Add the weight or reps first.'); row.querySelector('[data-f=w]').focus(); return; }
        if (wv !== null && !(wv >= 0 && wv <= 500)) { toast('Weights need to be between 0 and 500 kg.'); return; }
        if (rv !== null && !(rv >= 0 && rv <= 1000 && rv === Math.floor(rv))) { toast('Reps need to be a whole number.'); return; }
        st.done = true;
        var lb = supersetLabels(W.exercises)[W.exercises.indexOf(ex)];
        var heavy = W.exercises.some(function (x) { return x.group && x.group === ex.group && x.key_lift; }) || ex.key_lift;
        if (lb.last) rest(heavy ? 120 : 90);
        else { var nxt = W.exercises[W.exercises.indexOf(ex) + 1]; toast('Straight to ' + (supersetLabels(W.exercises)[W.exercises.indexOf(ex) + 1].label || '') + ': ' + BP.displayName(nxt.exercise) + '.'); }
      } else st.done = false;
      saveDraft(); renderLogger();
      return;
    }
    if (row && e.target.closest('[data-copy]')) {
      var p = lastSets(W.exercises[+row.dataset.ei].key, W.id)[+row.dataset.si]; if (!p) return;
      var s2 = W.exercises[+row.dataset.ei].sets[+row.dataset.si];
      s2.w = p.weight_kg != null ? num(+p.weight_kg) : ''; s2.r = p.reps != null ? String(p.reps) : '';
      saveDraft(); renderLogger(); return;
    }
    if ((b = e.target.closest('[data-addset]'))) {
      var ex2 = W.exercises[+b.dataset.addset], last = ex2.sets[ex2.sets.length - 1] || { pw: '', pr: '', w: '', r: '' };
      ex2.sets.push({ w: '', r: '', done: false, pw: last.w || last.pw, pr: last.r || last.pr });
      saveDraft(); renderLogger(); return;
    }
    if ((b = e.target.closest('[data-addnote]'))) {
      var ni = +b.dataset.addnote; W.exercises[ni].noteOpen = true; saveDraft(); renderLogger();
      var ta = $('wo-body').querySelector('[data-note="' + ni + '"]'); if (ta) ta.focus(); return;
    }
    if ((b = e.target.closest('[data-dropset]'))) { W.exercises[+b.dataset.dropset].sets.pop(); saveDraft(); renderLogger(); return; }
    if ((b = e.target.closest('[data-exinfo]'))) { if (exerciseGroups().some(function (g) { return g.key === b.dataset.exinfo; })) openExercise(b.dataset.exinfo); return; }
    if (e.target.id === 'wo-discard') {
      if (!discardArmed) { discardArmed = true; e.target.textContent = W.id ? 'Tap again to stop editing' : 'Tap again to discard'; return; }
      var wasEdit = !!W.id; closeLogger(); toast(wasEdit ? 'No changes saved.' : 'Workout discarded.');
    }
  });
  $('wo-min').addEventListener('click', minimise);
  $('wo-resume').addEventListener('click', openLogger);
  $('wo-rest-minus').addEventListener('click', function () { restEnd = Math.max(Date.now() + 1000, restEnd - 15000); tickNow(); });
  $('wo-rest-plus').addEventListener('click', function () { restEnd += 15000; tickNow(); });
  $('wo-rest-skip').addEventListener('click', function () { restEnd = 0; $('wo-rest').hidden = true; });

  $('wo-finish').addEventListener('click', function () {
    var b = $('wo-finish');
    var exs = W.exercises.map(function (ex) {
      return { exercise: ex.exercise, key_lift: ex.key_lift, item_sort: ex.item_sort, note: (ex.note || '').trim(),
               sets: ex.sets.filter(function (st) { return st.done; }).map(function (st) { return { weight_kg: kgNum(st.w), reps: kgNum(st.r) }; }) };
    }).filter(function (ex) { return ex.sets.length || ex.note; });
    var n = exs.reduce(function (a, ex) { return a + ex.sets.length; }, 0);
    if (!n) { toast('Tick off at least one set with ✓ first.'); return; }
    var open = W.exercises.reduce(function (a, ex) { return a + ex.sets.filter(function (st) { return !st.done && (st.w !== '' || st.r !== ''); }).length; }, 0);
    if (!finishArmed) { finishArmed = true; b.textContent = 'Save ' + n + ' set' + (n === 1 ? '' : 's') + '?'; if (open) toast(open + ' set' + (open === 1 ? ' isn’t' : 's aren’t') + ' ticked and won’t be saved.'); setTimeout(function () { if (finishArmed && W) { finishArmed = false; b.textContent = W.id ? 'Save' : 'Finish'; } }, 5000); return; }
    var payload = { id: W.id, title: W.title, programme_id: W.programme_id, week_no: W.week_no, session_sort: W.session_sort, is_test: W.is_test,
                    performed_on: W.id ? undefined : isoDay(new Date()), started_at: W.started_at ? new Date(W.started_at).toISOString() : null,
                    finished_at: W.id ? null : new Date().toISOString(), exercises: exs };
    var started = W.started_at, vol = exs.reduce(function (a, ex) { return a + ex.sets.reduce(function (c, st) { return c + (st.weight_kg || 0) * (st.reps || 0); }, 0); }, 0);
    b.disabled = true; b.textContent = 'Saving…';
    api.saveWorkout(payload).then(function (res) {
      var editing = !!W.id;
      closeLogger();
      return api.load().then(function (data) { S = data; renderAll(); }).catch(function () {}).then(function () {
        if (editing) { toast('Workout updated.'); return; }
        $('done-stats').innerHTML = (started ? '<div><b>' + esc(clock((Date.now() - started) / 1000)) + '</b><span>time</span></div>' : '') +
          '<div><b>' + res.sets + '</b><span>sets</span></div><div><b>' + esc(num(Math.round(vol))) + '</b><span>kg lifted</span></div>';
        var prs = res.prs || [], label = { weight: 'Heaviest weight', e1rm: 'Best est. 1RM', volume: 'Best set (kg × reps)' };
        $('done-prs').innerHTML = prs.length ? '<h3>New records</h3><ul class="pr-list">' + prs.map(function (r) {
          return '<li><span>' + esc(BP.displayName(r.exercise)) + ' · ' + esc(label[r.kind]) + '</span><b>' + esc(num(+r.value)) + (r.kind === 'volume' ? '' : ' kg') + '</b></li>';
        }).join('') + '</ul>' : '<p class="hint">Logged. Beat these numbers next time: they’ll be waiting in the Previous column.</p>';
        openSheet('done');
      });
    }).catch(function (err) { b.disabled = false; finishArmed = false; b.textContent = W && W.id ? 'Save' : 'Finish'; toast(friendlyError(err)); });
  });

  // ---------- Progress: every exercise you've logged ----------
  var EX_METRIC = 'e1rm', exOpen = null;
  function exerciseGroups() {
    var g = {};
    (S.workouts || []).slice().reverse().forEach(function (w) {   // oldest first
      w.sets.forEach(function (st) {
        var x = g[st.exercise_key] || (g[st.exercise_key] = { key: st.exercise_key, name: '', days: [], sets: 0 });
        x.name = BP.displayName(st.exercise); x.sets++;
        var d = x.days[x.days.length - 1];
        if (!d || d.id !== w.id) x.days.push(d = { id: w.id, day: w.performed_on, sets: [] });
        d.sets.push(st);
      });
    });
    return Object.keys(g).map(function (k) {
      var x = g[k];
      x.days.forEach(function (d) { var b = BP.bests(d.sets); d.e1rm = b.e1rm; d.weight = b.weight; d.total = b.total; d.bestSet = b.bestSet; });
      x.best = BP.bests([].concat.apply([], x.days.map(function (d) { return d.sets; })));
      x.last = x.days[x.days.length - 1].day;
      return x;
    }).sort(function (a, b) { return a.last < b.last ? 1 : a.last > b.last ? -1 : a.name < b.name ? -1 : 1; });
  }
  function metricOf(d, m) { return m === 'e1rm' ? (d.e1rm != null ? d.e1rm : d.weight) : m === 'weight' ? d.weight : d.total; }
  function spark(x) {
    var vals = x.days.map(function (d) { return metricOf(d, 'e1rm'); }).filter(function (v) { return v != null; }).slice(-12);
    if (vals.length < 2) return '';
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), n = vals.length;
    if (hi === lo) hi = lo + 1;
    var pts = vals.map(function (v, i) { return (i / (n - 1) * 300).toFixed(1) + ',' + (3 + (1 - (v - lo) / (hi - lo)) * 16).toFixed(1); });
    return '<svg class="trend" viewBox="0 0 300 22" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pts.join(' ') + '" fill="none" stroke="var(--tan)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>';
  }
  // Progress: one strength session at a time, its first six superset exercises (A1-C2) in programme order.
  var PR_SESSION = null;
  function strengthSessions() {
    var p = prog(); if (!p) return [];
    var w = weekObj(currentWeek()) || p.list[0];
    return w.sessions.filter(function (x) { return x.items.some(isSuperset); });
  }
  function exRow(g, label, fallbackName) {
    if (!g) return '<div class="ex-item off"><div><b>' + (label ? '<span class="ss-tag">' + esc(label) + '</span> ' : '') + esc(fallbackName) + '</b><div class="sub">Not logged yet</div></div><div class="val">—</div></div>';
    var big = g.best.e1rm != null ? num(Math.round(g.best.e1rm * 2) / 2) : g.best.weight != null ? num(g.best.weight) : String(Math.max.apply(null, g.days.map(function (d) { return Math.max.apply(null, d.sets.map(function (s) { return +s.reps || 0; })); })));
    var unit = g.best.e1rm != null ? 'est. 1RM kg' : g.best.weight != null ? 'heaviest kg' : 'best reps';
    return '<button type="button" class="ex-item" data-ex="' + esc(g.key) + '"><div><b>' + (label ? '<span class="ss-tag">' + esc(label) + '</span> ' : '') + esc(g.name) + '</b><div class="sub">' + g.days.length + (g.days.length === 1 ? ' workout' : ' workouts') + ' · last ' + esc(shortDate(g.last)) + '</div></div>' +
      '<div class="val">' + esc(big) + '<small>' + unit + '</small></div>' + spark(g) + '</button>';
  }
  function renderProgress() {
    var groups = exerciseGroups(), byKey = {}, sessions = strengthSessions();
    groups.forEach(function (g) { byKey[g.key] = g; });
    if (sessions.length) {
      if (PR_SESSION == null || PR_SESSION >= sessions.length) {
        var w = weekObj(currentWeek()), today = w ? w.sessions[BP.sessionIndexFor(w.sessions, new Date())] : null;
        PR_SESSION = Math.max(0, sessions.indexOf(today));
      }
      $('ex-sessions').hidden = false;
      $('ex-sessions').innerHTML = sessions.map(function (x, i) {
        return '<button type="button" class="chip" data-prs="' + i + '" aria-pressed="' + (i === PR_SESSION) + '">' + esc(x.title) + '</button>';
      }).join('');
      var items = sessions[PR_SESSION].items.filter(isSuperset).slice(0, 6);
      var exs = items.map(function (it) { return { group: String(it.block).trim() }; }), labels = supersetLabels(exs);
      $('ex-count').textContent = items.filter(function (it) { return byKey[BP.exerciseKey(it.exercise)]; }).length + ' of ' + items.length + ' logged';
      $('ex-list').innerHTML = items.map(function (it, i) { return exRow(byKey[BP.exerciseKey(it.exercise)], labels[i].label, BP.displayName(it.exercise)); }).join('');
    } else {
      $('ex-sessions').hidden = true;
      var list = groups.slice(0, 6);
      $('ex-count').textContent = '';
      $('ex-list').innerHTML = list.length ? list.map(function (g) { return exRow(g, '', g.name); }).join('') : '<p class="empty">Start a workout from the Programme tab and every set you tick shows up here.</p>';
    }
    var ws = (S.workouts || []).slice(0, 12);
    $('wo-list').innerHTML = ws.length ? ws.map(function (w) {
      var vol = w.sets.reduce(function (a, st) { return a + (+st.weight_kg || 0) * (+st.reps || 0); }, 0);
      var mins = w.started_at && w.finished_at ? Math.round((new Date(w.finished_at) - new Date(w.started_at)) / 60000) : null;
      return '<button type="button" class="ex-item" data-wo="' + esc(w.id) + '"><div><b>' + esc(w.title) + '</b><div class="sub">' + esc(longDate(w.performed_on)) + (w.week_no ? ' · Week ' + w.week_no : '') + (mins ? ' · ' + mins + ' min' : '') + '</div></div>' +
        '<div class="val">' + w.sets.length + '<small>sets · ' + esc(num(Math.round(vol))) + ' kg</small></div></button>';
    }).join('') : '<p class="empty">No workouts yet.</p>';
  }
  $('ex-sessions').addEventListener('click', function (e) { var b = e.target.closest('[data-prs]'); if (!b) return; PR_SESSION = +b.dataset.prs; renderProgress(); });
  $('ex-list').addEventListener('click', function (e) { var b = e.target.closest('[data-ex]'); if (b) openExercise(b.dataset.ex); });
  $('wo-list').addEventListener('click', function (e) { var b = e.target.closest('[data-wo]'); if (b) openWorkout(idOf(b.dataset.wo)); });

  function chart(days, metric) {
    var pts = days.map(function (d) { return { d: parseDay(d.day), v: metricOf(d, metric) }; }).filter(function (p) { return p.v != null && p.v > 0; });
    if (!pts.length) return '<p class="empty">No weights logged for this one yet.</p>';
    var W0 = 340, H = 180, L = 40, R = 12, T = 12, B = 26, lo = Math.min.apply(null, pts.map(function (p) { return p.v; })), hi = Math.max.apply(null, pts.map(function (p) { return p.v; }));
    var span = hi - lo || Math.max(5, hi * 0.1); lo = Math.max(0, lo - span * 0.15); hi = hi + span * 0.15;
    var t0 = pts[0].d.getTime(), t1 = pts[pts.length - 1].d.getTime(), tspan = t1 - t0 || 1;
    var X = function (p) { return pts.length === 1 ? (L + W0 - R) / 2 : L + (p.d.getTime() - t0) / tspan * (W0 - L - R); };
    var Y = function (v) { return T + (1 - (v - lo) / (hi - lo)) * (H - T - B); };
    var ticks = [lo, (lo + hi) / 2, hi].map(function (v) { return Math.round(v); });
    var line = pts.map(function (p) { return X(p).toFixed(1) + ',' + Y(p.v).toFixed(1); }).join(' ');
    var f = function (d) { return d.getDate() + ' ' + d.toLocaleString('en-IE', { month: 'short' }); };
    return '<svg viewBox="0 0 ' + W0 + ' ' + H + '" role="img" aria-label="' + esc(metric) + ' over time">' +
      ticks.map(function (v) { return '<line class="grid" x1="' + L + '" x2="' + (W0 - R) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/><text class="axis" x="' + (L - 6) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end">' + v + '</text>'; }).join('') +
      (pts.length > 1 ? '<polygon class="area" points="' + X(pts[0]).toFixed(1) + ',' + (H - B) + ' ' + line + ' ' + X(pts[pts.length - 1]).toFixed(1) + ',' + (H - B) + '"/><polyline class="line" points="' + line + '"/>' : '') +
      pts.map(function (p, i) { return '<circle class="dot' + (i === pts.length - 1 ? ' last' : '') + '" cx="' + X(p).toFixed(1) + '" cy="' + Y(p.v).toFixed(1) + '" r="4"/>'; }).join('') +
      '<text class="axis" x="' + L + '" y="' + (H - 6) + '">' + f(pts[0].d) + '</text>' + (pts.length > 1 ? '<text class="axis" x="' + (W0 - R) + '" y="' + (H - 6) + '" text-anchor="end">' + f(pts[pts.length - 1].d) + '</text>' : '') + '</svg>';
  }
  function openExercise(key) {
    var g = exerciseGroups().filter(function (x) { return x.key === key; })[0]; if (!g) return;
    exOpen = key;
    $('ex-h').textContent = g.name;
    document.querySelectorAll('#ex-metric [data-metric]').forEach(function (c) { c.setAttribute('aria-pressed', c.dataset.metric === EX_METRIC); });
    $('ex-chart').innerHTML = chart(g.days, EX_METRIC);
    var bv = BP.bests([].concat.apply([], g.days.map(function (d) { return d.sets; })));
    var reps = Math.max.apply(null, [].concat.apply([], g.days.map(function (d) { return d.sets.map(function (s) { return +s.reps || 0; }); })));
    $('ex-records').innerHTML = (bv.weight != null ? '<div><b>' + esc(num(bv.weight)) + '</b><span>heaviest kg</span></div>' : '') +
      (bv.e1rm != null ? '<div><b>' + esc(num(Math.round(bv.e1rm * 2) / 2)) + '</b><span>est. 1RM kg' + (bv.bestSet ? ' (' + esc(num(bv.bestSet.weight_kg)) + ' × ' + bv.bestSet.reps + ')' : '') + '</span></div>' : '') +
      (bv.volume != null ? '<div><b>' + esc(num(bv.volume)) + '</b><span>best set kg × reps</span></div>' : '<div><b>' + reps + '</b><span>most reps</span></div>') +
      '<div><b>' + g.days.length + '</b><span>workouts</span></div>';
    $('ex-history').innerHTML = g.days.slice().reverse().map(function (d) {
      var wk = (S.workouts || []).filter(function (x) { return x.id === d.id; })[0];
      var nt = wk && (wk.notes || []).filter(function (n) { return n.exercise_key === g.key; })[0];
      return '<div><span class="d"><b>' + esc(longDate(d.day)) + '</b><br>' + esc(d.sets.map(setText).join(' · ')) + (nt ? '<br><i class="note-line">' + esc(nt.note) + '</i>' : '') + '</span>' + (d.e1rm != null ? '<span class="v">' + esc(num(Math.round(d.e1rm * 2) / 2)) + '<small class="unit-sm"> e1RM</small></span>' : '') + '</div>';
    }).join('');
    if ($('workout').hidden) openSheet('ex'); else { $('sheet-ex').hidden = false; }
  }
  $('ex-metric').addEventListener('click', function (e) { var b = e.target.closest('[data-metric]'); if (!b) return; EX_METRIC = b.dataset.metric; openExercise(exOpen); });

  var woOpen = null, delArmed = false;
  function openWorkout(id) {
    var w = (S.workouts || []).filter(function (x) { return x.id === id; })[0]; if (!w) return;
    woOpen = w; delArmed = false; $('wod-del').textContent = 'Delete workout';
    $('wod-h').textContent = w.title;
    $('wod-sub').textContent = longDate(w.performed_on) + (w.week_no ? ' · Week ' + w.week_no : '');
    var by = [];
    w.sets.slice().sort(function (a, b) { return a.item_sort - b.item_sort || a.set_no - b.set_no; }).forEach(function (st) {
      var g = by[by.length - 1]; if (!g || g.sort !== st.item_sort) by.push(g = { sort: st.item_sort, name: BP.displayName(st.exercise), key: st.exercise_key, sets: [] }); g.sets.push(st);
    });
    $('wod-body').innerHTML = '<div class="history">' + by.map(function (g) {
      var nt = noteFor(w, g.sort);
      return '<div><span class="d"><b>' + esc(g.name) + '</b><br>' + g.sets.map(function (st) { return esc(setText(st)); }).join(' · ') + (nt ? '<br><i class="note-line">' + esc(nt) + '</i>' : '') + '</span></div>';
    }).join('') + '</div>';
    openSheet('wo');
  }
  $('wod-edit').addEventListener('click', function () { var w = woOpen; closeSheets(true); editWorkout(w); });
  $('wod-del').addEventListener('click', function () {
    var b = $('wod-del');
    if (!delArmed) { delArmed = true; b.textContent = 'Tap again to delete'; return; }
    b.disabled = true;
    api.deleteWorkout(woOpen.id).then(function () { return api.load(); }).then(function (data) { S = data; renderAll(); closeSheets(); toast('Workout deleted.'); })
      .catch(function (err) { toast(friendlyError(err)); }).then(function () { b.disabled = false; });
  });

  // ---------- Me ----------
  function renderMe() {
    var m = S.member, p = String(m.phone || '');
    $('me-name').textContent = [m.first_name, m.last_name].filter(Boolean).join(' ');
    $('me-phone').textContent = !p ? '—' : p.indexOf('353') === 0 ? ('0' + p.slice(3)).replace(/(\d{3})(\d{3})(\d+)/, '$1 $2 $3') : '+' + p;
    $('me-gym').textContent = m.gym;
    $('me-coach').textContent = m.coach || '—';
    $('me-since').textContent = parseDay(m.member_since).toLocaleString('en-IE', { month: 'long', year: 'numeric' });
    document.querySelectorAll('[data-pref]').forEach(function (c) { c.checked = !!m[c.dataset.pref]; });
    api.hasPassword().then(function (has) { $('me-password').textContent = has ? 'Change password' : 'Set a password'; }).catch(function () {});
  }
  document.querySelectorAll('[data-pref]').forEach(function (c) {
    c.addEventListener('change', function () {
      var patch = {}; patch[c.dataset.pref] = c.checked;
      c.disabled = true;
      api.updatePrefs(S.member.id, patch).then(function () { S.member[c.dataset.pref] = c.checked; toast('Saved.'); })
        .catch(function (err) { c.checked = !c.checked; toast(friendlyError(err)); })
        .then(function () { c.disabled = false; });
    });
  });

  function renderAll() { renderHome(); renderHomeWeek(); renderPBs(); renderProgress(); renderMilestones(); renderMe(); renderProgramme(); }

  // ---------- Sheets ----------
  var pbWhat = 'Deadlift', lastFocus = null;
  function openSheet(id) {
    closeSheets(true);
    lastFocus = document.activeElement;
    var today = isoDay(new Date());
    if (id === 'pb') { $('pb-date').value = today; $('pb-date').max = today; $('pb-share').checked = !!S.member.pref_share_pbs; $('pb-err').textContent = ''; }
    if (id === 'ms') { $('ms-date').value = today; $('ms-date').max = today; $('ms-share').checked = !!S.member.pref_share_pbs; $('ms-err').textContent = ''; }
    $('sheet-' + id).hidden = false; document.body.style.overflow = 'hidden';
    var f = $('sheet-' + id).querySelector(id === 'pb' ? '#pb-val' : id === 'ms' ? '#ms-text' : '.x');
    if (f) f.focus();
  }
  function closeSheets(keepFocus) {
    ['pb', 'ms', 'hist', 'board', 'done', 'ex', 'wo'].forEach(function (s) { $('sheet-' + s).hidden = true; });
    document.body.style.overflow = $('workout').hidden ? '' : 'hidden';
    if (!keepFocus && lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.querySelectorAll('[data-open]').forEach(function (b) { b.addEventListener('click', function () { if (b.dataset.open === 'pb') { pbWhat = 'Deadlift'; $('pb-other').value = ''; drawPbChips(); } openSheet(b.dataset.open); }); });
  document.querySelectorAll('.sheet').forEach(function (s) {
    s.addEventListener('click', function (e) { if (e.target === s || e.target.closest('[data-close]')) closeSheets(); });
  });
  document.addEventListener('keydown', function (e) { if (e.key !== 'Escape') return; if (document.querySelectorAll('.sheet:not([hidden])').length) closeSheets(); else if (!$('workout').hidden) minimise(); });

  function syncLower() { $('pb-lower-wrap').hidden = !(pbWhat === 'Other' && $('pb-unit').value === 'min:sec'); $('pb-val').placeholder = $('pb-unit').value === 'min:sec' ? '2:05' : '0'; }
  function drawPbChips() {
    $('pb-what').innerHTML = PB_TYPES.map(function (t) { return '<button type="button" class="chip" data-pbw="' + t + '" aria-pressed="' + (t === pbWhat) + '">' + t + '</button>'; }).join('');
    $('pb-other-wrap').hidden = pbWhat !== 'Other';
    $('pb-unit').value = UNIT[pbWhat];
    syncLower();
  }
  $('pb-what').addEventListener('click', function (e) { var b = e.target.closest('[data-pbw]'); if (b) { pbWhat = b.dataset.pbw; drawPbChips(); if (pbWhat === 'Other') $('pb-other').focus(); } });
  $('pb-unit').addEventListener('change', syncLower);
  drawPbChips();

  var saving = false;
  function saveButton(form, on) { var b = form.querySelector('[type=submit]'); b.disabled = on; }
  $('pb-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (saving) return;
    var unit = $('pb-unit').value, name = pbWhat === 'Other' ? $('pb-other').value.trim() : pbWhat;
    if (!name) { $('pb-err').textContent = 'Name what you did.'; $('pb-other').focus(); return; }
    var v = parseVal($('pb-val').value, unit);
    if (!(v > 0) || v >= 100000) { $('pb-err').textContent = unit === 'min:sec' ? 'Enter a time like 2:05.' : 'Enter a number, like 62.5.'; $('pb-val').focus(); return; }
    // Keep the same unit and direction as earlier entries of the same thing.
    var prev = groupPbs().filter(function (g) { return g.exercise.toLowerCase() === name.toLowerCase(); })[0];
    if (prev && prev.unit !== unit) { $('pb-err').textContent = 'You’ve logged ' + prev.exercise + ' in ' + prev.unit + ' before. Use the same unit.'; return; }
    var lower = prev ? prev.lower : (unit === 'min:sec' && (pbWhat === 'Other' ? $('pb-lower').checked : pbWhat !== 'Plank'));
    var row = { exercise: prev ? prev.exercise : name, value: Math.round(v * 100) / 100, unit: unit, lower_is_better: lower, achieved_on: $('pb-date').value || isoDay(new Date()), shared: $('pb-share').checked };
    saving = true; saveButton($('pb-form'), true);
    api.addPb(row).then(function (saved) {
      S.pbs.push(saved);
      renderPBs(); renderHome(); closeSheets(); $('pb-val').value = '';
      var beat = !prev || (lower ? v < +prev.best.value : v > +prev.best.value);
      toast(beat ? 'New PB saved: ' + row.exercise + ' ' + fmtVal(v, unit) + (unitLabel(unit) ? ' ' + unitLabel(unit) : '') + '.' + (row.shared ? ' Your coach will see it.' : '')
                 : 'Saved. Your best is still ' + fmtVal(prev.best.value, unit) + (unitLabel(unit) ? ' ' + unitLabel(unit) : '') + '.');
      show('pbs');
    }).catch(function (err) { $('pb-err').textContent = friendlyError(err); })
      .then(function () { saving = false; saveButton($('pb-form'), false); });
  });

  $('ms-ideas').innerHTML = MS_IDEAS.map(function (t) { return '<button type="button" class="chip" data-msi="' + t + '">' + t + '</button>'; }).join('');
  $('ms-ideas').addEventListener('click', function (e) { var b = e.target.closest('[data-msi]'); if (b) { $('ms-text').value = b.dataset.msi; $('ms-text').focus(); } });
  $('ms-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (saving) return;
    var t = $('ms-text').value.trim();
    if (!t) { $('ms-err').textContent = 'Say what happened first.'; $('ms-text').focus(); return; }
    var row = { title: t, achieved_on: $('ms-date').value || isoDay(new Date()), shared: $('ms-share').checked };
    saving = true; saveButton($('ms-form'), true);
    api.addMilestone(row).then(function (saved) {
      S.milestones.push(saved);
      renderMilestones(); closeSheets(); $('ms-text').value = '';
      toast('Milestone added.' + (row.shared ? ' Your coach will see it.' : ''));
      show('milestones');
    }).catch(function (err) { $('ms-err').textContent = friendlyError(err); })
      .then(function () { saving = false; saveButton($('ms-form'), false); });
  });

  // ---------- Start ----------
  if (!api) { $('loading').hidden = true; $('setup').hidden = false; return; } // not configured: never fall back to demo silently
  api.session().then(function (signed) { if (signed) enter(); else showLogin(); })
    .catch(function (err) { showLogin(); $('phone-err').textContent = friendlyError(err); });
})();
