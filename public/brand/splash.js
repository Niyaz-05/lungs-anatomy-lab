/* pomeylo loading screen: the wordmark writes itself letter by letter on black while the lab loads,
   then fades out once the 3D model is ready ([data-ready="true"]) or has failed (.viewer-status.is-error).
   Same file in every lab. Skipped under automation (navigator.webdriver) unless the URL has ?splash. */
(function () {
  'use strict';
  var q = location.search;
  if (/[?&]nosplash\b/.test(q) || (navigator.webdriver && !/[?&]splash\b/.test(q))) return;
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SRC = '/brand/logo.png';
  /* each letter's band, as fractions of the wordmark's width */
  var LETTERS = [[0, 0.17286], [0.17286, 0.30286], [0.30286, 0.53143], [0.53143, 0.66964], [0.66964, 0.80893], [0.80893, 0.8625], [0.8625, 1]];
  var LEAD = 150, PER_LETTER = 150, GAP = 60, FADE = 350, MAX_WAIT = 20000; /* ms */
  var pct = function (v) { return (100 * v).toFixed(4) + '%'; };

  var n = document.createElement('div');
  n.id = 'splash-container';
  n.setAttribute('role', 'img');
  n.setAttribute('aria-label', 'pomeylo');
  n.setAttribute('style', 'position:fixed;inset:0;background:#000;z-index:2147483647;');
  var logo = document.createElement('div');
  logo.setAttribute('style', 'position:absolute;left:50%;top:46%;width:min(max(35vw,200px),105vh,80vw);transform:translate(-50%,-50%)');
  var sizer = document.createElement('img');
  sizer.alt = '';
  sizer.setAttribute('style', 'display:block;width:100%;height:auto;visibility:hidden');
  logo.appendChild(sizer);
  var imgs = [sizer];
  /* each letter is wiped in by a sliding mask: the window's box moves in from the left while the image
     inside moves the other way, so the letter stays put and only the mask edge travels (compositor-only) */
  var letters = LETTERS.map(function (band) {
    var a = band[0], bw = band[1] - band[0];
    var win = document.createElement('div');
    win.setAttribute('style', 'position:absolute;top:0;height:100%;overflow:hidden;left:' + pct(a) + ';width:' + pct(bw));
    var slider = document.createElement('div');
    slider.setAttribute('style', 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;transform:translateX(-100%)');
    var img = document.createElement('img');
    img.alt = '';
    img.setAttribute('style', 'position:absolute;top:0;height:100%;max-width:none;user-select:none;-webkit-user-drag:none;width:' + pct(1 / bw) + ';left:' + pct(-a / bw) + ';transform:translateX(' + pct(bw) + ')');
    slider.appendChild(img); win.appendChild(slider); logo.appendChild(win);
    imgs.push(img);
    return { slider: slider, img: img, bw: bw };
  });
  n.appendChild(logo);

  var doneAt = 0;
  function write() {
    if (still || !sizer.animate) {
      letters.forEach(function (l) { l.slider.style.transform = l.img.style.transform = 'none'; });
      return;
    }
    var t = LEAD;
    letters.forEach(function (l) {
      var d = Math.round(PER_LETTER * LETTERS.length * l.bw);   /* steady pen speed: wide letters take longer */
      var o = { duration: d, delay: t, easing: 'ease-out', fill: 'forwards' };
      l.slider.animate([{ transform: 'translateX(-100%)' }, { transform: 'translateX(0)' }], o);
      l.img.animate([{ transform: 'translateX(' + pct(l.bw) + ')' }, { transform: 'translateX(0)' }], o);
      t += d + GAP;
    });
    doneAt = performance.now() + t - GAP;
  }

  var gone = false;
  function remove() {
    if (gone) return; gone = true;
    clearInterval(poll);
    if (!n.parentNode) return;
    if (still || !n.animate) { n.parentNode.removeChild(n); return; }
    n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE, easing: 'ease-in', fill: 'forwards' })
      .onfinish = function () { n.parentNode && n.parentNode.removeChild(n); };
  }
  /* finish writing the word first, then go */
  function dispose() { setTimeout(remove, Math.max(0, doneAt - performance.now())); }
  var started = performance.now(), disposing = false;
  var poll = setInterval(function () {
    if (disposing) return;
    var ready = document.querySelector('[data-ready="true"], .viewer-status.is-error');
    if (ready || performance.now() - started > MAX_WAIT) { disposing = true; dispose(); }
  }, 100);

  sizer.onload = function () { write(); };
  sizer.onerror = function () { gone = true; clearInterval(poll); n.parentNode && n.parentNode.removeChild(n); };
  document.body.appendChild(n);
  imgs.forEach(function (img) { img.src = SRC; });
  window.pomeyloSplash = { dispose: dispose };
})();
