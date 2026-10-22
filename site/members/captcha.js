// Cloudflare Turnstile: a free, mostly invisible bot check before Supabase texts a code or checks a password.
// Bots that trigger texts ("SMS pumping") are the biggest Twilio cost risk, and the login pages are public.
//
// Off while turnstileSiteKey in config.js is empty. Order to switch it on:
//   1. paste the site key into config.js and put the pages live;
//   2. then turn on CAPTCHA protection in Supabase with the matching secret key.
// The other way round, every login fails until the pages are updated.
window.BO7_CAPTCHA = (function () {
  var key = (window.BO7_CONFIG || {}).turnstileSiteKey || '';
  var loading = null, widget = null, pending = null;

  function load() {
    if (loading) return loading;
    loading = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = res;
      s.onerror = function () { loading = null; rej(new Error('Failed to fetch')); };
      document.head.appendChild(s);
    });
    return loading;
  }
  function settle(fn, arg) { var p = pending; pending = null; if (p) p[fn](arg); }

  // Resolves with a one-use token, or undefined when the check is off.
  function token() {
    if (!key) return Promise.resolve(undefined);
    return load().then(function () {
      return new Promise(function (res, rej) {
        settle('rej', new Error('Captcha check replaced by a newer one'));
        pending = { res: res, rej: rej };
        if (widget === null) {
          widget = window.turnstile.render('#captcha', {
            sitekey: key,
            execution: 'execute', // only runs when asked, not on page load
            appearance: 'interaction-only', // invisible unless Cloudflare needs a click
            callback: function (t) { settle('res', t); },
            'error-callback': function () { settle('rej', new Error('Captcha check failed')); },
            'timeout-callback': function () { settle('rej', new Error('Captcha check failed')); }
          });
        } else {
          window.turnstile.reset(widget); // tokens are single-use
        }
        window.turnstile.execute(widget);
      });
    });
  }
  return { on: !!key, token: token };
})();
