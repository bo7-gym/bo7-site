// Bo7 staff page: Glofox sync status, imports, announcements, shared PBs. Access rules live in the database.
(function () {
  'use strict';
  var CFG = window.BO7_CONFIG || {};
  var LIVE = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
  var DEMO = !LIVE && CFG.demo === true;

  var $ = function (id) { return document.getElementById(id); };
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var toastT;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 4000); }
  function errText(e) {
    var m = (e && (e.message || e.error_description)) || String(e);
    if (!navigator.onLine || /failed to fetch|network/i.test(m)) return 'Can’t reach the server. Check your connection.';
    if (/captcha/i.test(m)) return 'The security check didn’t go through. Please try again.';
    return m;
  }
  function ago(iso) {
    if (!iso) return 'never';
    var min = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return min + ' min ago';
    if (min < 48 * 60) return Math.round(min / 60) + ' h ago';
    return Math.round(min / 1440) + ' days ago';
  }
  function fmtVal(v, unit) { v = +v; if (unit === 'min:sec') { var m = Math.floor(v / 60), s = Math.round((v - m * 60) * 100) / 100; return m + ':' + (s < 10 ? '0' : '') + s; } return String(Math.round(v * 100) / 100) + ' ' + (unit === 'metres' ? 'm' : unit); }
  function readFile(input) {
    return new Promise(function (res, rej) {
      var f = input.files && input.files[0];
      if (!f) return rej(new Error('Choose a file first.'));
      if (f.size > 20 * 1024 * 1024) return rej(new Error('That file is over 20 MB. Is it the right export?'));
      var r = new FileReader(); r.onload = function () { res(String(r.result)); }; r.onerror = function () { rej(new Error('Couldn’t read the file.')); };
      r.readAsText(f);
    });
  }

  // ---------- Data ----------
  var api = LIVE ? liveApi() : DEMO ? demoApi() : null;

  function liveApi() {
    var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'bo7-staff-auth' } });
    function ok(r) { if (r.error) throw r.error; return r.data; }
    return {
      session: function () { return sb.auth.getSession().then(function (r) { return !!r.data.session; }); },
      sendCode: function (p) {
        return Promise.resolve(window.BO7_CAPTCHA && window.BO7_CAPTCHA.token())
          .then(function (t) { return sb.auth.signInWithOtp({ phone: p, options: { captchaToken: t } }); }).then(ok);
      },
      verify: function (p, c) { return sb.auth.verifyOtp({ phone: p, token: c, type: 'sms' }).then(ok); },
      signOut: function () { return sb.auth.signOut(); },
      me: async function () {
        var u = ok(await sb.auth.getUser()).user;
        return ok(await sb.from('staff').select('name, role, gym').eq('user_id', u.id).eq('active', true).maybeSingle());
      },
      gyms: function () { return sb.from('gyms').select('name, glofox_branch_id').eq('active', true).order('name').then(ok); },
      syncState: function () { return sb.from('sync_state').select('*').order('gym').then(ok); },
      syncNow: async function (mode) {
        var s = ok(await sb.auth.getSession()).session;
        var res = await fetch(CFG.supabaseUrl + '/functions/v1/glofox-sync', {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + s.access_token, apikey: CFG.supabaseAnonKey },
          body: JSON.stringify({ mode: mode })
        });
        var body = await res.json().catch(function () { return {}; });
        if (res.status === 401) throw new Error('Only admins can start a sync.');
        if (!res.ok && !body.results) throw new Error(body.error || 'Sync failed (HTTP ' + res.status + ').');
        return body;
      },
      memberCounts: function () { return sb.from('members').select('gym, status').limit(50000).then(ok); },
      feed: async function () {
        var res = await Promise.all([
          sb.from('pbs').select('exercise, value, unit, achieved_on, created_at, members(first_name, last_name, gym)').order('created_at', { ascending: false }).limit(25),
          sb.from('milestones').select('title, achieved_on, created_at, members(first_name, last_name, gym)').order('created_at', { ascending: false }).limit(25)
        ]);
        return { pbs: ok(res[0]), milestones: ok(res[1]) };
      },
      importMembers: function (gym, rows, dry, force) { return sb.rpc('import_members', { p_gym: gym, p_rows: rows, p_full_snapshot: true, p_dry_run: dry, p_force: !!force }).then(ok); },
      importSessions: function (rows, dry) { return sb.rpc('import_sessions', { p_rows: rows, p_dry_run: dry }).then(ok); },
      news: function () { return sb.from('announcements').select('*').order('published_on', { ascending: false }).order('id', { ascending: false }).limit(50).then(ok); },
      addNews: function (row) { return sb.from('announcements').insert(row).then(ok); },
      deleteNews: function (id) { return sb.from('announcements').delete().eq('id', id).then(ok); },
      members: function () { return sb.rpc('staff_members').then(ok); },
      archive: function () { return sb.rpc('staff_archive').then(ok); },
      staffList: function () { return sb.from('staff').select('id, name, role, gym').eq('active', true).order('name').then(ok); },
      assignCoach: function (memberId, staffId) { return sb.rpc('assign_coach', { p_member_id: memberId, p_staff_id: staffId }).then(ok); },
      memberDetail: async function (id) {
        var res = await Promise.all([
          sb.from('pbs').select('exercise, value, unit, achieved_on').eq('member_id', id).order('achieved_on', { ascending: false }).limit(30),
          sb.from('milestones').select('title, achieved_on').eq('member_id', id).order('achieved_on', { ascending: false }).limit(20),
          sb.from('lift_logs').select('programme_id, week_no, lift, sets_kg, best_kg, notes, updated_at').eq('member_id', id).order('week_no'),
          sb.from('sessions').select('starts_at, status, gym').eq('member_id', id).lte('starts_at', new Date().toISOString()).order('starts_at', { ascending: false }).limit(12),
          sb.from('workouts').select('id, title, performed_on, week_no, workout_sets(exercise, item_sort, set_no, weight_kg, reps), workout_notes(item_sort, note)').eq('member_id', id)
            .order('performed_on', { ascending: false }).order('id', { ascending: false }).limit(10)
        ]);
        return { pbs: ok(res[0]), milestones: ok(res[1]), logs: ok(res[2]), sessions: ok(res[3]), workouts: ok(res[4]) };
      },
      programmes: function () { return sb.from('programmes').select('id, name, subtitle, starts_on, weeks, gym, status').order('starts_on', { ascending: false }).then(ok); },
      programmeKeyItems: function (id) {
        return sb.from('programme_weeks').select('week_no, is_test, programme_sessions(programme_items(key_lift, guide_pct))').eq('programme_id', id).order('week_no').then(ok);
      },
      importProgramme: function (p, publish) { return sb.rpc('import_programme', { p: p, p_publish: publish }).then(ok); },
      setStatus: function (id, status) { return sb.rpc('set_programme_status', { p_id: id, p_status: status }).then(ok); },
      setGuide: function (id, week, lift, pct) { return sb.rpc('set_programme_guide', { p_id: id, p_week_no: week, p_lift: lift, p_pct: pct }).then(ok); },
      deleteProgramme: function (id) { return sb.rpc('delete_programme', { p_id: id }).then(ok); },
      leaderboard: function (id) { return sb.rpc('programme_leaderboard', { p_programme_id: id }).then(ok); }
    };
  }

  function demoApi() {
    var news = [{ id: 1, gym: null, title: 'Bring-a-friend session', body: 'Bring someone this Saturday.', pinned: true, published_on: '2026-10-08' }];
    var later = function (v) { return new Promise(function (r) { setTimeout(function () { r(v); }, 200); }); };
    var signed = false;
    try { signed = sessionStorage.getItem('bo7-staff-demo') === '1'; } catch (e) {}
    function fakeImport(rows, dry, force) {
      var active = rows.filter(function (r) { return r.membership_name && !(r.membership_expiry && r.membership_expiry < new Date().toISOString().slice(0, 10)); }).length;
      var res = { rows: rows.length, active_before: 0, added: active, updated: 0, expired: 0, ignored: rows.length - active, active_after: active, issues: [], dry_run: dry };
      return later(res);
    }
    return {
      session: function () { return later(signed); },
      sendCode: function () { return later(); },
      verify: function () { try { sessionStorage.setItem('bo7-staff-demo', '1'); } catch (e) {} return later(); },
      signOut: function () { try { sessionStorage.removeItem('bo7-staff-demo'); } catch (e) {} return later(); },
      me: function () { return later({ name: 'Ryan', role: 'admin', gym: null }); },
      gyms: function () { return later([{ name: 'Blackrock', glofox_branch_id: null }, { name: 'Killiney', glofox_branch_id: '6659f3a6bc0507bc710421c5' }]); },
      syncState: function () {
        var t = new Date(Date.now() - 12 * 60000).toISOString();
        return later([{ gym: 'Killiney', kind: 'members', last_success_at: t, last_error: null, last_summary: { added: 0, updated: 4, expired: 0 } },
                      { gym: 'Killiney', kind: 'bookings', last_success_at: t, last_error: null, last_summary: { saved: 37, not_members: 2 } }]);
      },
      syncNow: function (mode) { return later({ mode: mode, results: [{ gym: 'Killiney', kind: 'members', ok: true }, { gym: 'Killiney', kind: 'bookings', ok: true }] }); },
      memberCounts: function () {
        var out = [];
        for (var i = 0; i < 412; i++) out.push({ gym: 'Killiney', status: i < 380 ? 'active' : i < 390 ? 'paused' : 'expired' });
        for (var j = 0; j < 236; j++) out.push({ gym: 'Blackrock', status: j < 215 ? 'active' : 'expired' });
        return later(out);
      },
      feed: function () {
        return later({
          pbs: [{ exercise: 'Deadlift', value: 95, unit: 'kg', achieved_on: '2026-10-14', created_at: new Date().toISOString(), members: { first_name: 'Clodagh', last_name: 'Byrne', gym: 'Killiney' } },
                { exercise: 'Row 500m', value: 121, unit: 'min:sec', achieved_on: '2026-10-13', created_at: new Date().toISOString(), members: { first_name: 'Sean', last_name: 'Kelly', gym: 'Blackrock' } }],
          milestones: [{ title: 'First unassisted pull-up', achieved_on: '2026-09-30', created_at: new Date().toISOString(), members: { first_name: 'Clodagh', last_name: 'Byrne', gym: 'Killiney' } }]
        });
      },
      importMembers: function (gym, rows, dry, force) { return fakeImport(rows, dry, force); },
      importSessions: function (rows, dry) { return later({ rows: rows.length, saved: rows.length, not_matched: 0, issues: [], dry_run: dry }); },
      news: function () { return later(news.slice()); },
      addNews: function (row) { news.unshift(Object.assign({ id: Date.now(), published_on: new Date().toISOString().slice(0, 10) }, row)); return later(); },
      deleteNews: function (id) { news = news.filter(function (n) { return n.id !== id; }); return later(); },
      members: function () { return later(demoMembers.map(function (m) { return Object.assign({}, m); })); },
      archive: function () {
        return later([{ glofox_id: 'a1', gym: 'Killiney', first_name: 'Orla', last_name: 'Byrne (sample)', email: 'orla@example.com', phone: '353871234567', reason: 'plan ended', membership_name: 'Monthly Unlimited', membership_expiry: '2026-08-31' },
                      { glofox_id: 'a2', gym: 'Blackrock', first_name: 'Dan', last_name: 'Walsh (sample)', email: 'dan@example.com', phone: null, reason: 'paused', membership_name: '12 sessions 4 Week Plan', membership_expiry: '2026-11-30' },
                      { glofox_id: 'a3', gym: 'Killiney', first_name: 'Ger', last_name: 'Kelly (sample)', email: null, phone: '353861112223', reason: 'no plan', membership_name: null, membership_expiry: null }]);
      },
      staffList: function () { return later(demoStaff.slice()); },
      assignCoach: function (memberId, staffId) {
        var m = demoMembers.filter(function (x) { return x.id === memberId; })[0], st = demoStaff.filter(function (x) { return x.id === staffId; })[0];
        if (m) { m.coach_id = staffId; m.coach = st ? st.name : null; } return later();
      },
      memberDetail: function () {
        return later({ pbs: [{ exercise: 'Deadlift', value: 95, unit: 'kg', achieved_on: '2026-10-14' }, { exercise: 'Row 500m', value: 121, unit: 'min:sec', achieved_on: '2026-10-13' }],
                       milestones: [{ title: 'First unassisted pull-up', achieved_on: '2026-09-30' }],
                       logs: [{ programme_id: 1, week_no: 0, lift: 'back_squat', sets_kg: [], best_kg: 85 }, { programme_id: 1, week_no: 1, lift: 'back_squat', sets_kg: [60, 60, 60, 60] },
                              { programme_id: 1, week_no: 2, lift: 'back_squat', sets_kg: [62.5, 62.5, 65, 65] }, { programme_id: 1, week_no: 4, lift: 'back_squat', sets_kg: [85, 87.5, 90], best_kg: 90 },
                              { programme_id: 1, week_no: 0, lift: 'deadlift', sets_kg: [], best_kg: 110 }, { programme_id: 1, week_no: 4, lift: 'deadlift', sets_kg: [105, 112.5, 115], best_kg: 115 }],
                       sessions: [{ starts_at: new Date(Date.now() - 864e5).toISOString(), status: 'attended', gym: 'Killiney' }],
                       workouts: [{ id: 2, title: 'Back & Hamstrings', performed_on: '2026-10-14', week_no: 4, workout_sets: [
                                    { exercise: 'Conventional Deadlift', item_sort: 1, set_no: 1, weight_kg: 105, reps: 5 }, { exercise: 'Conventional Deadlift', item_sort: 1, set_no: 2, weight_kg: 112.5, reps: 5 },
                                    { exercise: 'Conventional Deadlift', item_sort: 1, set_no: 3, weight_kg: 115, reps: 5 }, { exercise: 'Chest Supported Row', item_sort: 3, set_no: 1, weight_kg: 22, reps: 10 },
                                    { exercise: 'Chest Supported Row', item_sort: 3, set_no: 2, weight_kg: 22, reps: 10 }] },
                                  { id: 1, title: 'Legs & Shoulders', performed_on: '2026-10-12', week_no: 4, workout_sets: [
                                    { exercise: 'Back Squat', item_sort: 1, set_no: 1, weight_kg: 85, reps: 5 }, { exercise: 'Back Squat', item_sort: 1, set_no: 2, weight_kg: 87.5, reps: 5 },
                                    { exercise: 'Back Squat', item_sort: 1, set_no: 3, weight_kg: 90, reps: 5 }] }] });
      },
      programmes: function () { return later(demoProgrammes.slice()); },
      programmeKeyItems: function () {
        var p = window.BO7_DEMO_PROGRAMME;
        return later(p ? p.weeks.map(function (w) { return { week_no: w.week_no, is_test: w.is_test, programme_sessions: w.sessions.map(function (x) { return { programme_items: x.items }; }) }; }) : []);
      },
      importProgramme: function (p, publish) { demoProgrammes.unshift({ id: Date.now(), name: p.name, subtitle: p.subtitle, starts_on: p.starts_on, weeks: p.weeks.length, gym: p.gym, status: publish ? 'published' : 'draft' }); return later(); },
      setStatus: function (id, status) { demoProgrammes.forEach(function (p) { if (p.id === id) p.status = status; }); return later(); },
      setGuide: function () { return later(1); },
      deleteProgramme: function (id) { demoProgrammes = demoProgrammes.filter(function (p) { return p.id !== id; }); return later(); },
      leaderboard: function () {
        return later([{ name: 'Clodagh Byrne', gym: 'Killiney', lifts: { 'back_squat:0': 85, 'back_squat:4': 90, 'deadlift:0': 110, 'deadlift:4': 115, 'bench_press:0': 55 } },
                      { name: 'Seán Kelly (sample)', gym: 'Blackrock', lifts: { 'back_squat:4': 120, 'deadlift:4': 150, 'bench_press:4': 90, 'back_squat:0': 110, 'deadlift:0': 140, 'bench_press:0': 85 } }]);
      }
    };
  }
  var demoStaff = [{ id: 's1', name: 'Ryan', role: 'admin', gym: null }, { id: 's2', name: 'Mark', role: 'coach', gym: 'Killiney' }, { id: 's3', name: 'Aaron', role: 'coach', gym: 'Blackrock' }];
  var demoMembers = [
    { id: 'm1', name: 'Clodagh Byrne', gym: 'Killiney', status: 'active', coach_id: 's2', coach: 'Mark', last_session: new Date(Date.now() - 864e5).toISOString(), sessions_30d: 11, sessions_total: 79, workouts_30d: 9, pbs_shared: 15, last_logged: new Date().toISOString() },
    { id: 'm2', name: 'Seán Kelly (sample)', gym: 'Blackrock', status: 'active', coach_id: 's3', coach: 'Aaron', last_session: new Date(Date.now() - 3 * 864e5).toISOString(), sessions_30d: 8, sessions_total: 140, workouts_30d: 5, pbs_shared: 6, last_logged: new Date(Date.now() - 5 * 864e5).toISOString() },
    { id: 'm3', name: 'Aoife Walsh (sample)', gym: 'Killiney', status: 'active', coach_id: null, coach: null, last_session: new Date(Date.now() - 19 * 864e5).toISOString(), sessions_30d: 2, sessions_total: 33, pbs_shared: 2, last_logged: null }
  ];
  var demoProgrammes = [{ id: 1, name: '8-week training programme', subtitle: '21 Sep - 15 Nov', starts_on: '2026-09-21', weeks: 8, gym: null, status: 'published' }];
  if (DEMO && !window.BO7_DEMO_PROGRAMME) { var dps = document.createElement('script'); dps.src = 'demo-programme.js'; document.head.appendChild(dps); }

  // ---------- Login ----------
  var ME = null, GYMS = [], phoneE164 = '';
  function toE164(raw) {
    var t = String(raw).trim(), d = t.replace(/\D/g, '');
    if (/^(\+|00)/.test(t)) { d = d.replace(/^00/, ''); return d.length >= 8 && d.length <= 15 ? '+' + d : null; }
    d = d.replace(/^0/, '');
    return d.length === 9 ? '+353' + d : null;
  }
  function showLogin() { $('loading').hidden = true; $('login').hidden = false; $('tabbar').hidden = true; }
  $('phone-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var p = toE164($('phone').value);
    if (!p) { $('phone-err').textContent = 'Enter your mobile number.'; return; }
    phoneE164 = p; $('send').disabled = true; $('phone-err').textContent = '';
    api.sendCode(p).then(function () { $('phone-form').hidden = true; $('code-form').hidden = false; $('code').focus(); })
      .catch(function (err) { $('phone-err').textContent = errText(err); })
      .then(function () { $('send').disabled = false; });
  });
  $('code-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var c = $('code').value.replace(/\D/g, '');
    if (c.length !== 6) { $('code-err').textContent = 'Enter the 6-digit code.'; return; }
    $('verify').disabled = true;
    api.verify(phoneE164, c).then(enter).catch(function (err) { $('code-err').textContent = errText(err); })
      .then(function () { $('verify').disabled = false; });
  });
  $('logout').addEventListener('click', function () { api.signOut().then(function () { location.reload(); }); });

  function enter() {
    $('login').hidden = true; $('loading').hidden = false;
    return Promise.all([api.me(), api.gyms()]).then(function (r) {
      ME = r[0]; GYMS = r[1];
      if (!ME) { api.signOut(); showLogin(); $('code-form').hidden = true; $('phone-form').hidden = false; $('phone-err').textContent = 'This number isn’t on the staff list.'; return; }
      $('loading').hidden = true; $('tabbar').hidden = false;
      $('who').textContent = ME.name + ' · ' + (ME.role === 'admin' ? 'Admin' : 'Coach') + ' · ' + (ME.gym || 'All gyms');
      setupForms();
      show((location.hash || '#overview').slice(1));
    }).catch(function (err) { showLogin(); $('phone-err').textContent = errText(err); });
  }

  // ---------- Screens ----------
  var SCREENS = ['overview', 'members', 'programmes', 'import', 'news'];
  function show(name) {
    if (SCREENS.indexOf(name) === -1) name = 'overview';
    SCREENS.forEach(function (s) { $(s).hidden = s !== name; });
    document.querySelectorAll('[data-tab]').forEach(function (b) { if (b.dataset.tab === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    try { history.replaceState(null, '', '#' + name); } catch (e) {}
    if (name === 'overview') loadOverview();
    if (name === 'news') loadNews();
    if (name === 'members') loadMembers();
    if (name === 'programmes') loadProgrammes();
  }
  document.querySelectorAll('[data-tab]').forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.tab); }); });

  function myGyms() { return GYMS.filter(function (g) { return !ME.gym || g.name === ME.gym; }); }
  function setupForms() {
    var admin = ME.role === 'admin';
    $('sync-now').hidden = !admin;
    $('import-coach').hidden = admin; $('import-members').hidden = !admin; $('import-sessions').hidden = !admin;
    $('news-form').hidden = !admin;
    $('im-gym').innerHTML = myGyms().map(function (g) { return '<option>' + esc(g.name) + '</option>'; }).join('');
    $('n-gym').innerHTML = (ME.gym ? '' : '<option value="">All gyms</option>') + myGyms().map(function (g) { return '<option>' + esc(g.name) + '</option>'; }).join('');
  }

  // ---------- Overview ----------
  function loadOverview() {
    api.syncState().then(renderSync).catch(function (err) { $('sync-hint').textContent = errText(err); });
    api.memberCounts().then(renderCounts).catch(function (err) { $('counts').innerHTML = '<tr><td>' + esc(errText(err)) + '</td></tr>'; });
    api.feed().then(renderFeed).catch(function (err) { $('feed').innerHTML = '<tr><td>' + esc(errText(err)) + '</td></tr>'; });
  }
  function renderSync(rows) {
    var synced = myGyms().filter(function (g) { return g.glofox_branch_id; });
    if (!synced.length) { $('sync-table').innerHTML = '<tr><td>No gym has a Glofox branch id yet, so nothing syncs automatically. See the README.</td></tr>'; $('sync-hint').textContent = ''; return; }
    var html = '<tr><th>Gym</th><th>Data</th><th>Last success</th><th>Status</th></tr>', stale = false;
    synced.forEach(function (g) {
      ['members', 'bookings'].forEach(function (k) {
        var s = rows.filter(function (r) { return r.gym === g.name && r.kind === k; })[0] || {};
        var old = !s.last_success_at || Date.now() - Date.parse(s.last_success_at) > 3 * 3600e3;
        if (old || s.last_error) stale = true;
        var status = s.last_error ? '<span class="err">' + esc(s.last_error) + '</span>' : old ? '<span class="err">Not synced recently</span>' : 'OK';
        html += '<tr><td>' + esc(g.name) + '</td><td>' + k + '</td><td>' + esc(ago(s.last_success_at)) + '</td><td>' + status + '</td></tr>';
      });
    });
    $('sync-table').innerHTML = html;
    $('sync-hint').textContent = stale ? 'Something needs attention. Check the Glofox API key, then press Sync now. Supabase → Edge Functions → glofox-sync → Logs has the detail.' : 'Syncs every 30 minutes, with a full check every night.';
  }
  $('sync-now').addEventListener('click', function () {
    var b = $('sync-now'); b.disabled = true; b.textContent = 'Syncing…';
    api.syncNow('incremental').then(function (r) {
      var bad = (r.results || []).filter(function (x) { return !x.ok; });
      toast(bad.length ? 'Sync had problems: ' + bad.map(function (x) { return x.gym + ' ' + x.kind; }).join(', ') : 'Sync finished.');
    }).catch(function (err) { toast(errText(err)); })
      .then(function () { b.disabled = false; b.textContent = 'Sync now'; loadOverview(); });
  });
  function renderCounts(rows) {
    var by = {};
    rows.forEach(function (r) { by[r.gym] = by[r.gym] || { active: 0, paused: 0, expired: 0 }; by[r.gym][r.status]++; });
    var gyms = Object.keys(by).sort();
    $('counts').innerHTML = gyms.length ? '<tr><th>Gym</th><th>Active</th><th>Paused</th><th>Expired</th></tr>' + gyms.map(function (g) {
      return '<tr><td>' + esc(g) + '</td><td>' + by[g].active + '</td><td>' + by[g].paused + '</td><td>' + by[g].expired + '</td></tr>';
    }).join('') : '<tr><td>No members yet. Import them from Glofox.</td></tr>';
  }
  function renderFeed(f) {
    var items = f.pbs.map(function (p) { return { at: p.created_at, who: p.members, what: p.exercise + ': ' + fmtVal(p.value, p.unit), kind: 'PB', day: p.achieved_on }; })
      .concat(f.milestones.map(function (m) { return { at: m.created_at, who: m.members, what: m.title, kind: 'Milestone', day: m.achieved_on }; }))
      .sort(function (a, b) { return a.at < b.at ? 1 : -1; }).slice(0, 30);
    $('feed').innerHTML = items.length ? '<tr><th>Member</th><th>Gym</th><th></th><th>What</th><th>When</th></tr>' + items.map(function (i) {
      var w = i.who || {};
      return '<tr><td>' + esc([w.first_name, w.last_name].filter(Boolean).join(' ')) + '</td><td>' + esc(w.gym) + '</td><td><span class="tag">' + i.kind + '</span></td><td>' + esc(i.what) + '</td><td>' + esc(i.day) + '</td></tr>';
    }).join('') : '<tr><td>Nothing shared yet.</td></tr>';
  }

  // ---------- Imports: check first, then apply exactly what was checked ----------
  function resultHtml(r, labels) {
    var tiles = labels.map(function (l) { return '<div><b>' + (r[l[0]] == null ? '—' : r[l[0]]) + '</b><span>' + l[1] + '</span></div>'; }).join('');
    var issues = (r.issues || []).slice(0, 200).map(function (i) { return '<li>Row ' + esc(i.row) + ': ' + esc(i.issue) + (i.name ? ' (' + esc(i.name) + ')' : '') + '</li>'; }).join('');
    return (r.blocked ? '<p class="blocked">' + esc(r.blocked) + '</p>' : '') +
      '<p class="hint">' + (r.dry_run ? 'Checked: nothing has changed yet.' : 'Done. Saved.') + '</p>' +
      '<div class="result">' + tiles + '</div>' +
      (issues ? '<p class="hint mt12">' + r.issues.length + ' row(s) to look at:</p><ul class="issues">' + issues + '</ul>' : '');
  }
  function fileProblems(parsed) {
    return parsed.problems.length ? '<p class="hint mt12">' + parsed.problems.length + ' row(s) couldn’t be read:</p><ul class="issues">' + parsed.problems.slice(0, 50).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' : '';
  }

  var imPending = null;
  function checkMembers() {
    $('im-err').textContent = ''; $('im-result').innerHTML = ''; $('im-apply').hidden = true; imPending = null;
    if (!$('im-file').files.length) return;
    readFile($('im-file')).then(function (text) {
      var parsed = Bo7Csv.glofoxMembers(Bo7Csv.parse(text));
      if (parsed.missing.length) throw new Error('This doesn’t look like a Glofox Clients export (missing: ' + parsed.missing.join(', ') + ').');
      if (!parsed.rows.length) throw new Error('No rows found in the file.');
      var gym = $('im-gym').value;
      return api.importMembers(gym, parsed.rows, true, false).then(function (r) {
        $('im-result').innerHTML = resultHtml(r, [['rows', 'rows in file'], ['added', 'new members'], ['updated', 'updated'], ['expired', 'lose access'], ['ignored', 'leads / ignored'], ['active_after', 'active after']]) + fileProblems(parsed);
        imPending = { gym: gym, rows: parsed.rows, force: !!r.blocked };
        $('im-apply').textContent = r.blocked ? 'Apply anyway' : 'Apply';
        $('im-apply').hidden = false;
      });
    }).catch(function (err) { $('im-err').textContent = errText(err); });
  }
  $('im-file').addEventListener('change', checkMembers);
  $('im-gym').addEventListener('change', checkMembers);
  $('im-apply').addEventListener('click', function () {
    if (!imPending) return;
    if (imPending.force && prompt('This will remove access for a large share of ' + imPending.gym + ' members. Type the gym name to confirm.') !== imPending.gym) return;
    var b = $('im-apply'); b.disabled = true;
    api.importMembers(imPending.gym, imPending.rows, false, imPending.force).then(function (r) {
      $('im-result').innerHTML = resultHtml(r, [['added', 'new members'], ['updated', 'updated'], ['expired', 'lost access'], ['active_after', 'active now']]);
      b.hidden = true; imPending = null; $('im-file').value = ''; toast('Members imported.');
    }).catch(function (err) { $('im-err').textContent = errText(err); }).then(function () { b.disabled = false; });
  });

  var isPending = null;
  $('is-file').addEventListener('change', function () {
    $('is-err').textContent = ''; $('is-result').innerHTML = ''; $('is-apply').hidden = true; isPending = null;
    readFile($('is-file')).then(function (text) {
      var parsed = Bo7Csv.sessions(Bo7Csv.parse(text));
      if (parsed.missing.length) throw new Error('Couldn’t find these columns: ' + parsed.missing.join(', ') + '.');
      if (!parsed.rows.length) throw new Error('No rows found in the file.');
      return api.importSessions(parsed.rows, true).then(function (r) {
        $('is-result').innerHTML = resultHtml(r, [['rows', 'rows'], ['saved', 'sessions'], ['not_matched', 'no matching member']]) + fileProblems(parsed);
        isPending = parsed.rows; $('is-apply').hidden = false;
      });
    }).catch(function (err) { $('is-err').textContent = errText(err); });
  });
  $('is-apply').addEventListener('click', function () {
    if (!isPending) return;
    var b = $('is-apply'); b.disabled = true;
    api.importSessions(isPending, false).then(function (r) {
      $('is-result').innerHTML = resultHtml(r, [['saved', 'sessions saved'], ['not_matched', 'no matching member']]);
      b.hidden = true; isPending = null; $('is-file').value = ''; toast('Sessions imported.');
    }).catch(function (err) { $('is-err').textContent = errText(err); }).then(function () { b.disabled = false; });
  });

  // ---------- News ----------
  function loadNews() {
    api.news().then(function (list) {
      $('news-list').innerHTML = list.length ? list.map(function (n) {
        return '<article class="post"><div class="post-meta">' + (n.pinned ? '<span class="tag pin">Pinned</span>' : '') + '<span class="tag">' + esc(n.gym || 'All gyms') + '</span><span>' + esc(n.published_on) + '</span>' +
          (ME.role === 'admin' ? '<button class="del" type="button" data-del="' + esc(n.id) + '">Delete</button>' : '') + '</div><h3>' + esc(n.title) + '</h3><p>' + esc(n.body) + '</p></article>';
      }).join('') : '<p class="empty">Nothing posted yet.</p>';
    }).catch(function (err) { $('news-list').innerHTML = '<p class="err">' + esc(errText(err)) + '</p>'; });
  }
  $('news-list').addEventListener('click', function (e) {
    var b = e.target.closest('[data-del]'); if (!b || !confirm('Delete this announcement?')) return;
    api.deleteNews(+b.dataset.del).then(function () { toast('Deleted.'); loadNews(); }).catch(function (err) { toast(errText(err)); });
  });
  $('news-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var row = { gym: $('n-gym').value || null, title: $('n-title').value.trim(), body: $('n-body').value.trim(), pinned: $('n-pin').checked };
    if (!row.title || !row.body) { $('n-err').textContent = 'Add a title and a message.'; return; }
    $('n-err').textContent = '';
    var b = $('news-form').querySelector('[type=submit]'); b.disabled = true;
    api.addNews(row).then(function () { $('n-title').value = ''; $('n-body').value = ''; $('n-pin').checked = false; toast('Posted.'); loadNews(); })
      .catch(function (err) { $('n-err').textContent = errText(err); }).then(function () { b.disabled = false; });
  });

  // ---------- Sheets ----------
  function openSheet(id) { $('sheet-' + id).hidden = false; document.body.style.overflow = 'hidden'; }
  function closeSheets() { document.querySelectorAll('.sheet').forEach(function (x) { x.hidden = true; }); document.body.style.overflow = ''; }
  document.querySelectorAll('.sheet').forEach(function (sh) { sh.addEventListener('click', function (e) { if (e.target === sh || e.target.closest('[data-close]')) closeSheets(); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheets(); });
  function day(iso) { return iso ? new Date(iso).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' }) : '—'; }
  function n2(x) { return String(Math.round(+x * 100) / 100); }
  var LIFT = { back_squat: 'Back squat', deadlift: 'Deadlift', bench_press: 'Bench press' };

  // ---------- Members (coaches: their cohort; admins: their gyms) ----------
  var MEMBERS = [], STAFF = [];
  function loadMembers() {
    var admin = ME.role === 'admin';
    $('mb-eyebrow').textContent = admin ? (ME.gym ? ME.gym + ' members' : 'All members') : 'My cohort';
    $('mb-title').textContent = admin ? 'Members' : 'Your members';
    $('mb-lede').textContent = admin ? 'Everyone you can see, with their coach. Open a member to see their programme numbers and assign a coach.'
      : 'The members assigned to you. Open a member to see their programme numbers, shared PBs and milestones.';
    $('mb-filter').innerHTML = '<option value="all">All</option><option value="quiet">Not in for 14+ days</option>' + (admin ? '<option value="unassigned">No coach</option><option value="archive">Archive: no active plan</option>' : '');
    $('mb-table').innerHTML = '<tr><td>Loading…</td></tr>';
    Promise.all([api.members(), admin ? api.staffList() : Promise.resolve([])]).then(function (r) {
      MEMBERS = r[0]; STAFF = r[1]; renderMembers();
    }).catch(function (err) { $('mb-table').innerHTML = '<tr><td class="err">' + esc(errText(err)) + '</td></tr>'; });
  }
  function quiet(m) { return !m.last_session || Date.now() - Date.parse(m.last_session) > 14 * 864e5; }
  // Archive: Glofox clients without an active plan (paused, ended, never had one). Admins only, for contacting later.
  var ARCHIVE = null;
  var REASON = { 'paused': 'Paused', 'plan ended': 'Plan ended', 'no plan': 'No plan' };
  function archiveRows() {
    var q = $('mb-search').value.trim().toLowerCase();
    return (ARCHIVE || []).filter(function (a) { return !q || ((a.first_name || '') + ' ' + (a.last_name || '') + ' ' + (a.email || '')).toLowerCase().indexOf(q) > -1; });
  }
  function renderArchive() {
    $('mb-download').hidden = false;
    if (ARCHIVE === null) {
      $('mb-table').innerHTML = '<tr><td>Loading…</td></tr>';
      api.archive().then(function (rows) { ARCHIVE = rows; renderMembers(); })
        .catch(function (err) { $('mb-table').innerHTML = '<tr><td class="err">' + esc(errText(err)) + '</td></tr>'; });
      return;
    }
    var list = archiveRows();
    $('mb-table').innerHTML = '<tr><th>Name</th><th>Gym</th><th>Why</th><th>Last plan</th><th>Ended</th><th>Email</th><th>Mobile</th></tr>' +
      (list.length ? list.map(function (a) {
        return '<tr><td><b>' + esc([a.first_name, a.last_name].filter(Boolean).join(' ')) + '</b></td><td>' + esc(a.gym) + '</td><td>' + esc(REASON[a.reason] || a.reason) +
          '</td><td>' + esc(a.membership_name || '—') + '</td><td>' + esc(a.membership_expiry ? new Date(a.membership_expiry).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—') + '</td><td>' + esc(a.email || '') +
          '</td><td>' + esc(a.phone ? '+' + a.phone : '') + '</td></tr>';
      }).join('') : '<tr><td colspan="7">Nobody on the archive' + ($('mb-search').value ? ' matches.' : ' yet.') + '</td></tr>');
  }
  $('mb-download').addEventListener('click', function () {
    var cell = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [['First name', 'Last name', 'Gym', 'Why', 'Last plan', 'Ended', 'Email', 'Mobile'].join(',')].concat(archiveRows().map(function (a) {
      return [a.first_name, a.last_name, a.gym, REASON[a.reason] || a.reason, a.membership_name, a.membership_expiry, a.email, a.phone ? '+' + a.phone : ''].map(cell).join(',');
    }));
    var url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })), link = document.createElement('a');
    link.href = url; link.download = 'bo7-archive-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(link); link.click();
    setTimeout(function () { URL.revokeObjectURL(url); link.remove(); }, 1000);
  });

  function renderMembers() {
    var q = $('mb-search').value.trim().toLowerCase(), f = $('mb-filter').value;
    if (f === 'archive') { renderArchive(); return; }
    $('mb-download').hidden = true;
    var list = MEMBERS.filter(function (m) {
      return (!q || m.name.toLowerCase().indexOf(q) > -1) && (f !== 'quiet' || quiet(m)) && (f !== 'unassigned' || !m.coach_id);
    });
    if (!MEMBERS.length) {
      $('mb-table').innerHTML = '<tr><td>' + (ME.role === 'admin' ? 'No members yet. Import them from Glofox.' : 'No members are assigned to you yet. An admin assigns members to coaches on this page.') + '</td></tr>';
      return;
    }
    $('mb-table').innerHTML = '<tr><th>Member</th><th>Gym</th><th>Coach</th><th>Last in</th><th class="num">30 days</th><th class="num">Total</th><th class="num">Workouts 30d</th><th>Last logged</th></tr>' +
      (list.length ? list.map(function (m) {
        return '<tr class="click" data-member="' + esc(m.id) + '"><td><b>' + esc(m.name) + '</b>' + (m.status !== 'active' ? ' <span class="pill">' + esc(m.status) + '</span>' : '') +
          '</td><td>' + esc(m.gym) + '</td><td>' + (m.coach ? esc(m.coach) : '<span class="hint">None</span>') + '</td><td>' + (quiet(m) ? '<span class="pill quiet">' + esc(day(m.last_session)) + '</span>' : esc(day(m.last_session))) +
          '</td><td class="num">' + (m.sessions_30d || 0) + '</td><td class="num">' + (m.sessions_total || 0) + '</td><td class="num">' + (m.workouts_30d || 0) + '</td><td>' + esc(day(m.last_logged)) + '</td></tr>';
      }).join('') : '<tr><td colspan="8">No members match.</td></tr>');
  }
  $('mb-search').addEventListener('input', renderMembers);
  $('mb-filter').addEventListener('change', renderMembers);
  $('mb-table').addEventListener('click', function (e) { var tr = e.target.closest('[data-member]'); if (tr) openMember(tr.dataset.member); });

  var OPEN_MEMBER = null;
  function openMember(id) {
    var m = MEMBERS.filter(function (x) { return x.id === id; })[0]; if (!m) return;
    OPEN_MEMBER = m;
    $('md-name').textContent = m.name;
    $('md-meta').textContent = m.gym + ' · ' + m.sessions_total + ' sessions' + (m.member_since ? ' · since ' + day(m.member_since) : '');
    var admin = ME.role === 'admin';
    $('md-coach-row').hidden = !admin;
    if (admin) {
      $('md-coach').innerHTML = '<option value="">No coach</option>' + STAFF.filter(function (st) { return !st.gym || st.gym === m.gym; })
        .map(function (st) { return '<option value="' + esc(st.id) + '"' + (st.id === m.coach_id ? ' selected' : '') + '>' + esc(st.name) + (st.role === 'admin' ? ' (admin)' : '') + '</option>'; }).join('');
    }
    $('md-body').innerHTML = '<p class="empty">Loading…</p>';
    openSheet('member');
    api.memberDetail(id).then(function (d) {
      var weeks = {}; d.logs.forEach(function (l) { weeks[l.week_no] = true; });
      var wk = Object.keys(weeks).map(Number).sort(function (a, b) { return a - b; });
      var lifts = wk.length ? '<table class="mini"><thead><tr><th>Lift</th>' + wk.map(function (w) { return '<th>' + (w === 0 ? 'Start' : 'W' + w) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        Object.keys(LIFT).map(function (k) {
          return '<tr><td>' + LIFT[k] + '</td>' + wk.map(function (w) {
            var l = d.logs.filter(function (x) { return x.lift === k && x.week_no === w; })[0];
            if (!l) return '<td>—</td>';
            return '<td' + (l.best_kg ? ' class="gain"' : '') + ' title="' + esc((l.sets_kg || []).map(n2).join(' · ') + (l.notes ? ' — ' + l.notes : '')) + '">' + esc(l.best_kg ? n2(l.best_kg) : n2(Math.max.apply(null, l.sets_kg || [0]))) + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table><p class="hint">Tan numbers are 5RMs. Others are the heaviest set that week; hover for every set and notes.</p>'
        : '<p class="empty">No programme numbers logged yet.</p>';
      $('md-body').innerHTML = '<h3>Programme numbers</h3><div class="table-wrap">' + lifts + '</div><div class="md-grid mt12">' +
        '<div><h3>PBs shared</h3>' + (d.pbs.length ? '<table class="mini"><tbody>' + d.pbs.map(function (p) {
          return '<tr><td>' + esc(p.exercise) + '</td><td>' + esc(fmtVal(p.value, p.unit)) + '</td><td>' + esc(day(p.achieved_on)) + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="empty">None shared.</p>') + '</div>' +
        '<div><h3>Milestones shared</h3>' + (d.milestones.length ? '<table class="mini"><tbody>' + d.milestones.map(function (x) {
          return '<tr><td>' + esc(x.title) + '</td><td>' + esc(day(x.achieved_on)) + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="empty">None shared.</p>') + '</div>' +
        '<div class="wide"><h3>Recent workouts</h3>' + ((d.workouts || []).length ? d.workouts.map(function (w) {
          var by = [];
          (w.workout_sets || []).slice().sort(function (a, b) { return a.item_sort - b.item_sort || a.set_no - b.set_no; }).forEach(function (st) {
            var g = by[by.length - 1]; if (!g || g.sort !== st.item_sort) by.push(g = { sort: st.item_sort, name: st.exercise.split(' · ')[0], sets: [] }); g.sets.push(st);
          });
          return '<p class="hint"><b>' + esc(day(w.performed_on)) + ' · ' + esc(w.title) + (w.week_no ? ' · W' + w.week_no : '') + '</b><br>' + by.map(function (g) {
            var nt = (w.workout_notes || []).filter(function (n) { return n.item_sort === g.sort; })[0];
            return esc(g.name) + ': ' + g.sets.map(function (st) { return (st.weight_kg != null ? n2(st.weight_kg) : 'BW') + (st.reps != null ? '×' + st.reps : ''); }).join(', ') + (nt ? ' <i>“' + esc(nt.note) + '”</i>' : '');
          }).join('<br>') + '</p>';
        }).join('') : '<p class="empty">No workouts logged yet.</p>') + '</div>' +
        '<div><h3>Recent sessions</h3>' + (d.sessions.length ? '<table class="mini"><tbody>' + d.sessions.map(function (x) {
          return '<tr><td>' + esc(day(x.starts_at)) + '</td><td>' + esc(x.status.replace('_', '-')) + '</td><td>' + esc(x.gym || '') + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="empty">No sessions synced yet.</p>') + '</div></div>';
    }).catch(function (err) { $('md-body').innerHTML = '<p class="err">' + esc(errText(err)) + '</p>'; });
  }
  $('md-coach').addEventListener('change', function () {
    var m = OPEN_MEMBER, v = $('md-coach').value || null;
    api.assignCoach(m.id, v).then(function () {
      var st = STAFF.filter(function (x) { return x.id === v; })[0];
      m.coach_id = v; m.coach = st ? st.name : null; renderMembers();
      toast(v ? m.name + ' is now with ' + m.coach + '.' : m.name + ' has no coach now.');
    }).catch(function (err) { toast(errText(err)); });
  });

  // ---------- Programmes ----------
  var PROGS = [], OPEN_PROG = null, PENDING = null;
  function loadProgrammes() {
    var admin = ME.role === 'admin';
    $('pr-import').hidden = !admin;
    $('pi-gym').innerHTML = (ME.gym ? '' : '<option value="">All gyms</option>') + myGyms().map(function (g) { return '<option>' + esc(g.name) + '</option>'; }).join('');
    if (!$('pi-start').value) { var d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); $('pi-start').value = d.toISOString().slice(0, 10); }
    api.programmes().then(function (list) {
      PROGS = list;
      $('pr-table').innerHTML = list.length ? '<tr><th>Programme</th><th>Dates</th><th>Gym</th><th>Status</th></tr>' + list.map(function (p) {
        var end = new Date(p.starts_on); end.setDate(end.getDate() + p.weeks * 7 - 1);
        return '<tr class="click" data-prog="' + p.id + '"><td><b>' + esc(p.name) + '</b><div class="hint">' + p.weeks + ' weeks</div></td><td>' + esc(day(p.starts_on)) + ' – ' + esc(day(end.toISOString())) +
          '</td><td>' + esc(p.gym || 'All gyms') + '</td><td><span class="pill ' + esc(p.status) + '">' + esc(p.status) + '</span></td></tr>';
      }).join('') : '<tr><td>No programmes yet.' + (admin ? ' Add one below.' : '') + '</td></tr>';
      if (OPEN_PROG) openProgramme(OPEN_PROG.id);
    }).catch(function (err) { $('pr-table').innerHTML = '<tr><td class="err">' + esc(errText(err)) + '</td></tr>'; });
  }
  $('pr-table').addEventListener('click', function (e) { var tr = e.target.closest('[data-prog]'); if (tr) openProgramme(+tr.dataset.prog || tr.dataset.prog); });

  function openProgramme(id) {
    var p = PROGS.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    OPEN_PROG = p;
    var admin = ME.role === 'admin';
    $('pr-detail').hidden = false;
    $('pr-d-title').textContent = p.name + (p.subtitle ? ' · ' + p.subtitle : '');
    $('pr-d-status').innerHTML = '<span class="pill ' + esc(p.status) + '">' + esc(p.status) + '</span>';
    var acts = '';
    if (admin) {
      if (p.status !== 'published') acts += '<button class="btn primary small" type="button" data-act="published">Publish to members</button>';
      if (p.status === 'published') acts += '<button class="btn small" type="button" data-act="draft">Unpublish</button>';
      if (p.status !== 'archived') acts += '<button class="btn small" type="button" data-act="archived">Archive</button>';
      if (p.status === 'draft') acts += '<button class="btn small" type="button" data-act="delete">Delete draft</button>';
    }
    $('pr-d-actions').innerHTML = acts;
    $('pr-guides-save').hidden = !admin;
    $('pr-guides').innerHTML = '<tr><td>Loading…</td></tr>';
    api.programmeKeyItems(p.id).then(function (weeks) {
      $('pr-guides').innerHTML = '<tr><th>Week</th>' + Object.keys(LIFT).map(function (k) { return '<th>' + LIFT[k] + '</th>'; }).join('') + '</tr>' + weeks.map(function (w) {
        var items = []; w.programme_sessions.forEach(function (x) { (x.programme_items || []).forEach(function (it) { if (it.key_lift) items.push(it); }); });
        return '<tr><td>Week ' + w.week_no + (w.is_test ? ' <span class="pill draft">Test</span>' : '') + '</td>' + Object.keys(LIFT).map(function (k) {
          var it = items.filter(function (x) { return x.key_lift === k; })[0];
          if (!it) return '<td class="hint">—</td>';
          if (w.is_test) return '<td class="hint">5RM test</td>';
          var v = (it.guide_pct || []).map(function (x) { return n2(+x * 100); }).join('/');
          return '<td><input class="input" data-gw="' + w.week_no + '" data-gl="' + k + '" data-orig="' + esc(v) + '" value="' + esc(v) + '" placeholder="%" aria-label="Week ' + w.week_no + ' ' + LIFT[k] + ' %"' + (admin ? '' : ' disabled') + '></td>';
        }).join('') + '</tr>';
      }).join('');
    }).catch(function (err) { $('pr-guides').innerHTML = '<tr><td class="err">' + esc(errText(err)) + '</td></tr>'; });
    $('pr-board').innerHTML = '<p class="empty">Loading…</p>';
    api.leaderboard(p.id).then(function (rows) {
      var tests = Object.keys(rows.reduce(function (o, r) { Object.keys(r.lifts).forEach(function (k) { o[k.split(':')[1]] = 1; }); return o; }, {})).map(Number).sort(function (a, b) { return a - b; });
      if (!rows.length) { $('pr-board').innerHTML = '<p class="empty">No 5RMs logged yet.</p>'; return; }
      $('pr-board').innerHTML = '<table class="mini"><thead><tr><th>Member</th>' + Object.keys(LIFT).map(function (k) {
        return tests.map(function (t) { return '<th>' + LIFT[k].split(' ')[0] + ' ' + (t === 0 ? 'start' : 'W' + t) + '</th>'; }).join(''); }).join('') + '</tr></thead><tbody>' +
        rows.map(function (r) { return '<tr><td>' + esc(r.name) + '<div class="hint">' + esc(r.gym) + '</div></td>' + Object.keys(LIFT).map(function (k) {
          return tests.map(function (t) { var v = r.lifts[k + ':' + t]; return '<td>' + (v != null ? esc(n2(v)) : '—') + '</td>'; }).join(''); }).join('') + '</tr>'; }).join('') +
        '</tbody></table><p class="hint">Staff see every member they coach or manage. Members only see people who opted in.</p>';
    }).catch(function (err) { $('pr-board').innerHTML = '<p class="err">' + esc(errText(err)) + '</p>'; });
  }
  $('pr-d-actions').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b || !OPEN_PROG) return;
    var act = b.dataset.act, p = OPEN_PROG;
    if (act === 'delete' && !confirm('Delete this draft? This can’t be undone.')) return;
    if (act === 'published' && !confirm('Publish "' + p.name + '" to ' + (p.gym || 'all gyms') + '? Members will see it straight away.')) return;
    b.disabled = true;
    (act === 'delete' ? api.deleteProgramme(p.id) : api.setStatus(p.id, act)).then(function () {
      toast(act === 'delete' ? 'Draft deleted.' : act === 'published' ? 'Published. Members can see it now.' : act === 'archived' ? 'Archived.' : 'Unpublished.');
      if (act === 'delete') { OPEN_PROG = null; $('pr-detail').hidden = true; }
      loadProgrammes();
    }).catch(function (err) { b.disabled = false; toast(errText(err)); });
  });
  $('pr-guides-save').addEventListener('click', function () {
    var jobs = [], bad = false;
    document.querySelectorAll('[data-gw]').forEach(function (inp) {
      var v = inp.value.trim(); if (v === inp.dataset.orig) return;
      var pct = v ? v.split('/').map(function (x) { return +x.trim() / 100; }) : null;
      if (pct && pct.some(function (x) { return !(x > 0 && x <= 1.2); })) { bad = true; return; }
      jobs.push(api.setGuide(OPEN_PROG.id, +inp.dataset.gw, inp.dataset.gl, pct).then(function () { inp.dataset.orig = v; }));
    });
    if (bad) { $('pr-guides-err').textContent = 'Use numbers like 70, or 90/75.'; return; }
    $('pr-guides-err').textContent = '';
    if (!jobs.length) { toast('Nothing changed.'); return; }
    Promise.all(jobs).then(function () { toast('Starting weights saved.'); }).catch(function (err) { $('pr-guides-err').textContent = errText(err); });
  });

  // Import: read the CSV in the browser, show what was understood, then save.
  function previewImport() {
    $('pi-err').textContent = ''; $('pi-preview').innerHTML = ''; $('pi-actions').hidden = true; PENDING = null;
    if (!$('pi-file').files.length) return;
    Promise.all([readFile($('pi-file')), $('pi-home').files.length ? readFile($('pi-home')) : Promise.resolve(null)]).then(function (txt) {
      var start = $('pi-start').value;
      if (!start) throw new Error('Pick the date Week 1 starts.');
      if (new Date(start + 'T12:00:00').getDay() !== 1) throw new Error('Week 1 should start on a Monday.');
      var res = Bo7Programme.parse(txt[0], { startsOn: start, gym: $('pi-gym').value || null, homeCsv: txt[1] });
      var p = res.programme;
      if (!p.weeks.length) throw new Error(res.warnings[0] || 'No weeks found in that file.');
      var sessions = 0, exercises = 0, lifts = 0;
      p.weeks.forEach(function (w) { sessions += w.sessions.length; w.sessions.forEach(function (x) { x.items.forEach(function (it) { if (it.kind === 'exercise') exercises++; if (it.key_lift) lifts++; }); }); });
      var end = new Date(start); end.setDate(end.getDate() + p.weeks.length * 7 - 1);
      $('pi-preview').innerHTML = '<div class="result"><div><b>' + p.weeks.length + '</b><span>weeks</span></div><div><b>' + sessions + '</b><span>sessions</span></div><div><b>' + exercises +
        '</b><span>exercises</span></div><div><b>' + p.weeks.filter(function (w) { return w.is_test; }).length + '</b><span>test weeks</span></div><div><b>' + p.guide.length + '</b><span>training notes</span></div></div>' +
        '<p class="hint mt12">' + esc(p.name) + ' · ' + esc(day(start)) + ' – ' + esc(day(end.toISOString())) + ' · ' + esc($('pi-gym').value || 'All gyms') + '. ' + lifts + ' main-lift slots found. Set starting weights after saving.</p>' +
        (res.warnings.length ? '<p class="hint mt12">Check these lines:</p><ul class="issues">' + res.warnings.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '');
      PENDING = p; $('pi-actions').hidden = false;
    }).catch(function (err) { $('pi-err').textContent = errText(err); });
  }
  ['pi-file', 'pi-home', 'pi-start', 'pi-gym'].forEach(function (id) { $(id).addEventListener('change', previewImport); });
  function saveImport(publish) {
    if (!PENDING) return;
    if (publish && !confirm('Publish "' + PENDING.name + '" to ' + (PENDING.gym || 'all gyms') + ' now?')) return;
    var b1 = $('pi-draft'), b2 = $('pi-publish'); b1.disabled = b2.disabled = true;
    api.importProgramme(PENDING, publish).then(function () {
      toast(publish ? 'Programme published.' : 'Saved as a draft.');
      $('pi-file').value = ''; $('pi-home').value = ''; $('pi-preview').innerHTML = ''; $('pi-actions').hidden = true; PENDING = null;
      loadProgrammes();
    }).catch(function (err) { $('pi-err').textContent = errText(err); }).then(function () { b1.disabled = b2.disabled = false; });
  }
  $('pi-draft').addEventListener('click', function () { saveImport(false); });
  $('pi-publish').addEventListener('click', function () { saveImport(true); });

  // ---------- Start ----------
  function syncOnline() { $('offline').hidden = navigator.onLine; }
  window.addEventListener('online', syncOnline); window.addEventListener('offline', syncOnline); syncOnline();
  if (!api) { $('loading').hidden = true; $('setup').hidden = false; return; }
  if (DEMO) $('demo-badge').hidden = false;
  api.session().then(function (s) { if (s) enter(); else showLogin(); }).catch(function (err) { showLogin(); $('phone-err').textContent = errText(err); });
})();
