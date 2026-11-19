// Cinema finishing motion: headline numbers count up once, the first time they scroll into view.
// Text is never hidden or changed for good: with JS off (or before a row reaches the screen) the real number shows; the
// count writes in-between numbers into the same text node and always ends on the exact original text. If a page script
// writes a new value mid-count (live data), the count carries on to that value and ends on its exact text.
// Off under prefers-reduced-motion.
(function () {
  'use strict';
  try {
    if (!('IntersectionObserver' in window) || !window.requestAnimationFrame) return;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  } catch (e) { return; }

  // Home hero stats, the Active Disasters header counts, the Rebuild stat row and a disaster's Response Locations counts.
  var SEL = '.hero-stats dd, .count-chip b[data-stat], .stat-row dd, .mini-stats dd';
  var DURATION = 1400;
  var done = typeof WeakSet === 'function' ? new WeakSet() : null;
  var rowStart = new Map();
  var ease = function (t) { return 1 - Math.pow(1 - t, 3); };

  function numberNode(el) {
    var tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), n;
    while ((n = tw.nextNode())) if (/\d/.test(n.nodeValue)) return n;
    return null;
  }

  var RE = /^(\D*)(\d[\d,]*)(.*)$/;
  function read(node) {
    var m = node && node.nodeValue.match(RE);
    if (!m) return null;
    return { node: node, text: node.nodeValue, pre: m[1], post: m[3], n: parseInt(m[2].replace(/,/g, ''), 10), commas: m[2].indexOf(',') >= 0 };
  }

  function count(el) {
    var cur = read(numberNode(el));
    if (!cur || !(cur.n >= 2)) return; // 0 and 1 have nothing to count
    // Reserve the current width so the row never shifts while digits change.
    var w = el.getBoundingClientRect().width, prevMin = el.style.minWidth;
    if (w && getComputedStyle(el).display !== 'inline') el.style.minWidth = w + 'px';
    var from = 0, shown = 0, last = null, start = 0;
    function fmt(v) { return cur.commas ? v.toLocaleString('en-US') : String(v); }
    function finish() {
      if (cur.node.isConnected && cur.node.nodeValue === last) cur.node.nodeValue = cur.text; // the exact original text
      el.style.minWidth = prevMin;
    }
    function frame(now) {
      if (!start) start = now;
      if (last !== null && (!cur.node.isConnected || cur.node.nodeValue !== last)) {
        // A page script wrote a new value mid-count (live data): carry on from where we are to the new number.
        var next = read(numberNode(el));
        if (!next || next.n < 2 || next.n <= shown) { el.style.minWidth = prevMin; return; }
        cur = next; from = shown; start = now; last = null;
      }
      var t = Math.min(1, (now - start) / DURATION);
      if (t >= 1) { finish(); return; }
      shown = Math.round(from + (cur.n - from) * ease(t));
      last = cur.pre + fmt(shown) + cur.post;
      cur.node.nodeValue = last;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // A count that has no number yet (a "—" placeholder) waits for the live value, then counts if still on screen.
  function whenNumber(el, cb) {
    var tries = 0;
    (function check() {
      if (/\d/.test(el.textContent)) { cb(); return; }
      if (++tries > 20) return;
      setTimeout(check, 300);
    })();
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      var el = en.target;
      io.unobserve(el);
      // A stat row counts once per visit: rows a page script re-renders later (filters) just show their new values.
      var row = el.closest('dl, .count-chip') || el;
      if (row.parentElement && row.classList.contains('count-chip')) row = row.parentElement;
      var first = rowStart.get(row);
      if (first && Date.now() - first > 2500) return;
      if (!first) rowStart.set(row, Date.now());
      whenNumber(el, function () {
        // Only count while the number is still on screen; otherwise it simply keeps its real value.
        var r = el.getBoundingClientRect();
        if (r.bottom > 0 && r.top < innerHeight) count(el);
      });
    });
  }, { threshold: 0.6 });

  function scan() {
    try {
      var list = document.querySelectorAll(SEL);
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        if (done) { if (done.has(el)) continue; done.add(el); }
        else { if (el.getAttribute('data-cx-count')) continue; el.setAttribute('data-cx-count', '1'); }
        io.observe(el);
      }
    } catch (e) {}
  }

  function start() {
    scan();
    // Stat rows that a page script renders later (Rebuild, a disaster's Response Locations) are picked up as they appear.
    try {
      var t = 0;
      new MutationObserver(function () { clearTimeout(t); t = setTimeout(scan, 150); })
        .observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
