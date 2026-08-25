<?php /* assets/net-lite.js.php — Network-adaptive Lite mode.
   ধীর সংযোগ (Network Information API) auto-detect করে <html>/<body>-তে `net-lite`
   class + window.BA_LITE toggle করে; সংযোগ ভালো হলে **reload ছাড়াই** full mode-এ
   ফেরে। `net-lite` থাকলে brand name-এর পাশের "Lite" superscript (CSS-driven) দেখায়।
   অন্য module `ba:litechange` event শুনে react করতে পারে।
   iOS Safari / Firefox-এ connection API নেই → ওখানে সবসময় full (নিরাপদ ডিফল্ট)। */ ?>
(function () {
  'use strict';

  var LS_HINT = '_ba_lite';   // last-resolved state — পরের load-এ আগেভাগে apply (head hint)

  function _conn() {
    return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
  }

  // এই মুহূর্তে lite হওয়া উচিত কিনা
  function _shouldLite() {
    var c = _conn();
    if (!c) return false;                 // API নেই (iOS/Firefox) → full
    if (c.saveData) return true;          // Data-Saver চালু → lite
    var et = c.effectiveType || '';
    return et === 'slow-2g' || et === '2g' || et === '3g';
  }

  function _persist(lite) {
    try { localStorage.setItem(LS_HINT, lite ? '1' : '0'); } catch (e) {}
  }

  // ── Resolved mode apply ───────────────────────────────────────
  var _cur = null;
  function _apply(lite, initial) {
    if (lite === _cur) return;            // কোনো পরিবর্তন নেই
    _cur = lite;
    document.documentElement.classList.toggle('net-lite', lite);
    if (document.body) document.body.classList.toggle('net-lite', lite);
    window.BA_LITE = lite;
    _persist(lite);
    // অন্য module-কে জানাই (image hydrate, polling ইত্যাদি — ভবিষ্যতের জন্য)
    var detail = { lite: lite, initial: !!initial };
    try {
      document.dispatchEvent(new CustomEvent('ba:litechange', { detail: detail }));
    } catch (e) {
      var ev = document.createEvent('CustomEvent');
      ev.initCustomEvent('ba:litechange', false, false, detail);
      document.dispatchEvent(ev);
    }
  }

  // ── Boot + live updates ───────────────────────────────────────
  var _t = 0;
  function _evaluate() {
    var want = _shouldLite();
    if (_t) { clearTimeout(_t); _t = 0; }
    // change event-এ debounce — দ্রুত ওঠানামায় flicker এড়াতে
    _t = setTimeout(function () { _t = 0; _apply(want, false); }, 1200);
  }

  function _boot() {
    _apply(_shouldLite(), true);          // initial — সাথে সাথে
    var c = _conn();
    if (c && c.addEventListener) c.addEventListener('change', _evaluate);
    else if (c) { c.onchange = _evaluate; }
    window.BA_NetLite = {
      isLite:  function () { return !!window.BA_LITE; },
      refresh: function () { _apply(_shouldLite(), false); }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _boot);
  else _boot();
})();
