// Bo7 homepage: booking overlay (WhatsApp first, Glofox form second), mobile menu, hero video, lazy YouTube embeds, scroll reveals.
(function () {
  // One form for both gyms: leads land in the Killiney Glofox branch and get routed by the team.
  const LEAD_URL = 'https://app.glofox.com/portal/#/branch/6659f3a6bc0507bc710421c5/lead-register';
  const WA_URL = 'https://wa.me/353852413999?text=' + encodeURIComponent("Hi Bo7, I'd like to book a free consultation.");
  document.querySelectorAll('[data-wa]').forEach(a => a.href = WA_URL);

  // Booking overlay: every "Book" link opens it; #start stays as the no-JS fallback.
  const book = document.getElementById('book');
  const bookFrame = document.getElementById('book-frame');
  let lastFocus = null;
  function openBook() {
    if (!book || typeof book.showModal !== 'function') return false;
    lastFocus = document.activeElement;
    if (bookFrame.getAttribute('src') !== LEAD_URL) bookFrame.setAttribute('src', LEAD_URL);
    book.showModal();
    document.documentElement.classList.add('has-modal');
    return true;
  }
  if (book) {
    document.querySelectorAll('a[href="#start"]').forEach(a => {
      a.addEventListener('click', e => { if (openBook()) e.preventDefault(); });
    });
    book.querySelector('.book__close').addEventListener('click', () => book.close());
    book.addEventListener('click', e => { if (e.target === book) book.close(); });
    book.addEventListener('close', () => {
      document.documentElement.classList.remove('has-modal');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    });
  }

  // Ryan's message: play button on the portrait opens a lightbox player.
  const vid = document.getElementById('vid');
  const player = document.getElementById('vid-player');
  const playBtn = document.querySelector('.founder__play');
  if (vid && player && playBtn && typeof vid.showModal === 'function') {
    playBtn.addEventListener('click', () => {
      if (!player.getAttribute('src')) player.src = player.dataset.src;
      vid.showModal();
      player.play().catch(() => {});
    });
    const stop = () => { player.pause(); vid.close(); };
    vid.querySelector('.vid__close').addEventListener('click', stop);
    vid.addEventListener('click', e => { if (e.target === vid) stop(); });
    vid.addEventListener('close', () => player.pause());
  }

  // Mobile menu.
  const nav = document.querySelector('.nav');
  const toggle = document.querySelector('.nav__toggle');
  if (toggle) {
    const setOpen = open => {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    toggle.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
    nav.querySelectorAll('.nav__links a').forEach(a => a.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
  }

  // Hero video: pick the lighter file on phones; reduced-motion users get the poster frame.
  const hero = document.querySelector('.hero');
  const video = document.getElementById('hero-video');
  if (video) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const large = matchMedia('(min-width: 900px)').matches;
    video.src = large ? video.dataset.srcLarge : video.dataset.srcSmall;
    if (reduce) { video.removeAttribute('autoplay'); video.pause(); }
  }

  // Fall back to the standard thumbnail if YouTube has no max-res one.
  document.querySelectorAll('.video img').forEach(img => {
    img.addEventListener('error', () => { img.src = img.src.replace('maxresdefault', 'hqdefault'); }, { once: true });
  });

  // Member stories: open the vertical YouTube video in a lightbox (the tiles are too small to watch in place).
  const yt = document.getElementById('yt');
  const ytFrame = yt && yt.querySelector('.yt__frame');
  if (yt && ytFrame && typeof yt.showModal === 'function') {
    let ytLast = null;
    const closeYt = () => { ytFrame.innerHTML = ''; if (yt.open) yt.close(); };
    document.querySelectorAll('.video[data-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        ytLast = btn;
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube-nocookie.com/embed/${btn.dataset.id}?autoplay=1&rel=0&playsinline=1`;
        iframe.title = btn.getAttribute('aria-label') || 'Member story';
        iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
        iframe.allowFullscreen = true;
        ytFrame.replaceChildren(iframe);
        yt.showModal();
      });
    });
    yt.querySelector('.vid__close').addEventListener('click', closeYt);
    yt.addEventListener('click', e => { if (e.target === yt) closeYt(); });
    yt.addEventListener('close', () => { ytFrame.innerHTML = ''; if (ytLast) ytLast.focus(); });
  }

  // Reveal sections as they enter the viewport.
  const targets = document.querySelectorAll('.why__list li, .steps li, .outcomes__grid li, .video, .location, .faq__list details');
  targets.forEach(el => el.setAttribute('data-reveal', ''));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    targets.forEach(el => io.observe(el));
  } else {
    targets.forEach(el => el.classList.add('is-in'));
  }
})();
