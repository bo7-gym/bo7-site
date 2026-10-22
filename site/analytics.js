// Bo7 analytics: Google Analytics 4 (G-Z20JQXCC3R, "Bo7.ie" property in ryan@bo7.ie's Google account),
// behind a cookie choice (Google Consent Mode v2).
// The old site's Tag Manager container GTM-NJRHF7LZ was removed on 22 Oct 2026: no Bo7 account controls it,
// so it let an outside party run code on bo7.ie and sent data to a property Bo7 can't see.
// Until someone taps "Accept", consent stays denied: Google gets cookieless pings only, nothing is stored.
(function () {
  var GA_ID = 'G-Z20JQXCC3R';
  var KEY = 'bo7-cookie-choice'; // 'granted' | 'denied'

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function remember(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function consent(v) {
    return { analytics_storage: v, ad_storage: v, ad_user_data: v, ad_personalization: v };
  }

  var choice = stored();
  var defaults = consent('denied');
  defaults.wait_for_update = 500;
  gtag('consent', 'default', defaults);
  if (choice === 'granted') gtag('consent', 'update', consent('granted'));

  gtag('js', new Date());
  gtag('config', GA_ID);
  var s = document.createElement('script'); s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(s);

  // ---------- Key actions ----------
  // Event names show up in GA4 under Reports > Engagement > Events.
  function track(name, params) { gtag('event', name, params || {}); }
  window.bo7Track = track;

  function where(el) { var s = el.closest('section, header, footer, dialog, .stickybar'); return s ? (s.id || s.className.split(' ')[0]) : 'page'; }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a, button');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    var p = { location: where(a) };
    if (a.hasAttribute('data-wa') || href.indexOf('https://wa.me') === 0) track('whatsapp_click', p);
    else if (href.indexOf('tel:') === 0) track('call_click', p);
    else if (href === '#start') track('book_consultation_click', p);
    else if (href.indexOf('classes-week-view') > -1) { p.gym = href.indexOf('681a3f74') > -1 ? 'Blackrock' : 'Killiney'; track('timetable_click', p); }
    else if (href.indexOf('google.com/maps') > -1) { p.gym = /Blackrock/.test(href) ? 'Blackrock' : 'Killiney'; track('directions_click', p); }
    else if (href.indexOf('instagram.com') > -1) track('instagram_click', p);
    else if (a.classList.contains('founder__play')) track('video_play', { video: 'Ryan message' });
    else if (a.classList.contains('video')) track('video_play', { video: 'member story', id: a.getAttribute('data-id') });
  }, true);

  // ---------- Cookie choice ----------
  function banner() {
    if (document.getElementById('cookies')) return;
    var d = document.createElement('div');
    d.id = 'cookies'; d.className = 'cookies'; d.setAttribute('role', 'region'); d.setAttribute('aria-label', 'Cookie choice');
    d.innerHTML = '<p>We use cookies to see how people find Bo7 and which pages help. Nothing is shared for advertising unless you accept.</p>' +
      '<div class="cookies__btns"><button type="button" class="btn btn--gold" data-c="granted">Accept</button>' +
      '<button type="button" class="btn btn--ghost" data-c="denied">Reject</button></div>';
    d.addEventListener('click', function (e) {
      var b = e.target.closest('[data-c]'); if (!b) return;
      var v = b.getAttribute('data-c');
      remember(v); gtag('consent', 'update', consent(v));
      track('cookie_choice', { choice: v });
      d.remove();
    });
    document.body.appendChild(d);
  }
  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  ready(function () {
    if (!choice) banner();
    document.querySelectorAll('[data-cookie-settings]').forEach(function (b) { b.addEventListener('click', banner); });
  });
})();
