// Reads Glofox CSV exports in the browser and turns them into rows for the import functions in the database.
// Plain script (no build step); also loadable in Deno for tests. Exposes Bo7Csv.
(function (root) {
  'use strict';

  // RFC 4180-ish: quoted fields, "" escapes, commas and newlines inside quotes, CRLF, a leading BOM.
  function parseRows(text) {
    text = String(text || '').replace(/^\uFEFF/, '');
    var rows = [], row = [], field = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        rows.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
    return rows;
  }

  function parse(text) {
    var rows = parseRows(text).filter(function (r) { return r.length > 1 || r[0] !== ''; });
    if (!rows.length) return { headers: [], rows: [] };
    var headers = rows[0].map(function (h) { return h.trim(); });
    return {
      headers: headers,
      rows: rows.slice(1).map(function (r) { var o = {}; headers.forEach(function (h, k) { o[h] = (r[k] || '').trim(); }); return o; })
    };
  }

  function findHeader(headers, re) { for (var i = 0; i < headers.length; i++) if (re.test(headers[i])) return headers[i]; return null; }

  // Dates: ISO (2026-03-17), day-first (17/03/2026, Irish default) or month-first (03/17/2026) — decided per column
  // by looking at every value, so 05/06/2026 is read the same way as the rest of the file.
  function dateOrder(values) {
    var dayFirst = 0, monthFirst = 0;
    values.forEach(function (v) {
      var m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/.exec(v || '');
      if (!m) return;
      if (+m[1] > 12) dayFirst++;
      if (+m[2] > 12) monthFirst++;
    });
    return monthFirst > dayFirst ? 'mdy' : 'dmy';
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function valid(y, mo, d) { var t = new Date(Date.UTC(y, mo - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d; }
  function toIsoDate(v, order) {
    v = String(v || '').trim();
    if (!v || /^(n\/?a|none|-|never)$/i.test(v)) return '';
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
    if (m) return valid(+m[1], +m[2], +m[3]) ? m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]) : null;
    m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/.exec(v);
    if (m) {
      var y = +m[3] < 100 ? 2000 + +m[3] : +m[3], a = +m[1], b = +m[2];
      var d = order === 'mdy' ? b : a, mo = order === 'mdy' ? a : b;
      return valid(y, mo, d) ? y + '-' + pad(mo) + '-' + pad(d) : null;
    }
    var t = Date.parse(v);
    if (!isNaN(t)) { var x = new Date(t); return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()); }
    return null;
  }
  function toTime(v) {
    var m = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i.exec(v || '');
    if (!m) return null;
    var h = +m[1];
    if (m[4]) { h = h % 12 + (/pm/i.test(m[4]) ? 12 : 0); }
    return h < 24 && +m[2] < 60 ? pad(h) + ':' + m[2] : null;
  }

  // Glofox Clients export -> import_members rows. Returns { rows, problems, missing }.
  var MEMBER_COLS = {
    added: /^added$|^joined|^created|member since/i,
    first: /^first ?name$/i, last: /^last ?name$|^surname$/i,
    email: /^e-?mail$/i, phone: /^phone|mobile/i,
    plan: /^membership ?name$|^membership$|^plan/i,
    expiry: /expiry|expires|end date/i,
    total: /total ?attendances|attendances|visits/i
  };
  function glofoxMembers(table) {
    var h = {}, missing = [];
    Object.keys(MEMBER_COLS).forEach(function (k) { h[k] = findHeader(table.headers, MEMBER_COLS[k]); });
    ['first', 'email', 'phone', 'plan', 'expiry'].forEach(function (k) { if (!h[k]) missing.push(k); });
    if (missing.length) return { rows: [], problems: [], missing: missing };
    var orderAdded = dateOrder(table.rows.map(function (r) { return h.added ? r[h.added] : ''; }));
    var orderExpiry = dateOrder(table.rows.map(function (r) { return r[h.expiry]; }));
    var problems = [], rows = [];
    table.rows.forEach(function (r, i) {
      var since = h.added ? toIsoDate(r[h.added], orderAdded) : '';
      var expiry = toIsoDate(r[h.expiry], orderExpiry);
      if (since === null) { problems.push('Row ' + (i + 2) + ': can’t read the date added "' + r[h.added] + '"'); since = ''; }
      if (expiry === null) { problems.push('Row ' + (i + 2) + ': can’t read the expiry date "' + r[h.expiry] + '" — row skipped'); return; }
      var total = h.total ? String(r[h.total]).replace(/[^\d]/g, '') : '';
      rows.push({
        email: r[h.email], phone: r[h.phone], first_name: r[h.first], last_name: h.last ? r[h.last] : '',
        member_since: since, membership_name: r[h.plan], membership_expiry: expiry, total_attendances: total
      });
    });
    return { rows: rows, problems: problems, missing: [] };
  }

  // Any attendance / bookings export with an email or phone and a date (and maybe a separate time) -> import_sessions rows.
  function sessions(table, tzOffsetMinutes) {
    var hs = table.headers;
    var h = {
      email: findHeader(hs, /e-?mail/i), phone: findHeader(hs, /phone|mobile/i),
      when: findHeader(hs, /^(date ?time|start(s|ed)? ?(at|time)?|class (date|start)|date)$/i) || findHeader(hs, /date/i),
      time: findHeader(hs, /^(time|start time|class time)$/i),
      status: findHeader(hs, /status|attend/i), coach: findHeader(hs, /coach|trainer|instructor/i)
    };
    var missing = [];
    if (!h.email && !h.phone) missing.push('email or phone');
    if (!h.when) missing.push('date');
    if (missing.length) return { rows: [], problems: [], missing: missing };
    var order = dateOrder(table.rows.map(function (r) { return r[h.when]; }));
    var off = tzOffsetMinutes == null ? -new Date().getTimezoneOffset() : tzOffsetMinutes;
    var sign = off >= 0 ? '+' : '-', abs = Math.abs(off), tz = sign + pad(Math.floor(abs / 60)) + ':' + pad(abs % 60);
    var problems = [], rows = [];
    table.rows.forEach(function (r, i) {
      var d = toIsoDate(r[h.when], order);
      var t = toTime(h.time ? r[h.time] : r[h.when]) || '00:00';
      if (!d) { problems.push('Row ' + (i + 2) + ': can’t read the date "' + r[h.when] + '" — row skipped'); return; }
      var st = h.status ? String(r[h.status]).toLowerCase() : '';
      var status = /no.?show|absent|missed/.test(st) ? 'no_show' : /cancel/.test(st) ? 'cancelled'
        : /attend|checked|present|yes|true|complete/.test(st) ? 'attended' : /book|reserv/.test(st) ? 'booked' : '';
      rows.push({ email: h.email ? r[h.email] : '', phone: h.phone ? r[h.phone] : '', starts_at: d + 'T' + t + ':00' + tz,
                  status: status, coach: h.coach ? r[h.coach] : '' });
    });
    return { rows: rows, problems: problems, missing: [] };
  }

  root.Bo7Csv = { parse: parse, parseRows: parseRows, glofoxMembers: glofoxMembers, sessions: sessions, toIsoDate: toIsoDate, dateOrder: dateOrder };
})(typeof window !== 'undefined' ? window : globalThis);
