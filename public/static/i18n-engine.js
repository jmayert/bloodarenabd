<?php /* i18n-engine.js.php — standalone copy of the dictionary-driven translation
   engine (same logic as the block in boot.js.php) for pages that should NOT load
   boot.js.php's PWA/service-worker code, e.g. admin.php. Requires window.BA_I18N
   (from i18n-dict.js.php) to be defined first. Default language stays 'bn'. */ ?>
(function() {
    var I18N     = window.BA_I18N || {};
    var DICT     = I18N.bn2en   || {};
    var PATTERNS = I18N.patterns || [];
    var ATTRS    = ['placeholder', 'title', 'aria-label', 'value'];
    var BN_RE    = /[ঀ-৿]/;
    var SKIP     = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1 };

    var _origText = new WeakMap();
    var _origAttr = new WeakMap();
    var _currentLang = 'bn';
    var _observer = null;
    var _applying = false;

    function _hasBangla(s) { return BN_RE.test(s); }

    // NFC-normalized dict, built lazily. DOM text and dict keys may sit in
    // different Unicode normalization forms (composed vs decomposed Bangla), so
    // an exact byte match silently fails. Normalizing both sides to NFC fixes it.
    var _NDICT = null;
    function _ndict() {
        if (_NDICT) return _NDICT;
        _NDICT = {};
        for (var k in DICT) {
            if (Object.prototype.hasOwnProperty.call(DICT, k)) {
                _NDICT[k.normalize ? k.normalize('NFC') : k] = DICT[k];
            }
        }
        return _NDICT;
    }

    function _translate(bn) {
        if (Object.prototype.hasOwnProperty.call(DICT, bn)) return DICT[bn];
        var nfc = bn.normalize ? bn.normalize('NFC') : bn;
        var nd = _ndict();
        if (Object.prototype.hasOwnProperty.call(nd, nfc)) return nd[nfc];
        for (var i = 0; i < PATTERNS.length; i++) {
            var p = PATTERNS[i];
            p.re.lastIndex = 0;
            if (p.re.test(bn)) { p.re.lastIndex = 0; return bn.replace(p.re, p.en); }
        }
        return null;
    }

    function _doTextNode(node, lang) {
        if (lang === 'en') {
            var raw = _origText.has(node) ? _origText.get(node) : node.nodeValue;
            if (raw == null) return;
            var trimmed = raw.replace(/^\s+|\s+$/g, '');
            if (!trimmed || !_hasBangla(trimmed)) return;
            var en = _translate(trimmed);
            if (en == null) return;
            if (!_origText.has(node)) _origText.set(node, node.nodeValue);
            var lead  = (raw.match(/^\s*/)  || [''])[0];
            var trail = (raw.match(/\s*$/)  || [''])[0];
            node.nodeValue = lead + en + trail;
        } else {
            if (_origText.has(node)) node.nodeValue = _origText.get(node);
        }
    }

    function _attrTranslatable(el, a) {
        if (!el.hasAttribute || !el.hasAttribute(a)) return false;
        if (a === 'value') {
            var tag = el.tagName;
            if (tag === 'BUTTON') return true;
            return tag === 'INPUT' && /^(button|submit|reset)$/i.test(el.type || '');
        }
        return true;
    }

    function _doAttrs(el, lang) {
        for (var i = 0; i < ATTRS.length; i++) {
            var a = ATTRS[i];
            if (!_attrTranslatable(el, a)) continue;
            if (lang === 'en') {
                var store = _origAttr.get(el) || {};
                var raw = Object.prototype.hasOwnProperty.call(store, a)
                        ? store[a] : el.getAttribute(a);
                var trimmed = (raw || '').replace(/^\s+|\s+$/g, '');
                if (!trimmed || !_hasBangla(trimmed)) continue;
                var en = _translate(trimmed);
                if (en == null) continue;
                if (!Object.prototype.hasOwnProperty.call(store, a)) {
                    store[a] = raw; _origAttr.set(el, store);
                }
                el.setAttribute(a, en);
            } else {
                var s = _origAttr.get(el);
                if (s && Object.prototype.hasOwnProperty.call(s, a)) el.setAttribute(a, s[a]);
            }
        }
    }

    function _walk(root, lang) {
        if (root.nodeType === 3) { _doTextNode(root, lang); return; }
        if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;

        var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: function(n) {
                var p = n.parentNode;
                if (!p || SKIP[p.nodeName]) return NodeFilter.FILTER_REJECT;
                if (p.closest && p.closest('[data-noi18n]')) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        var n;
        while ((n = tw.nextNode())) _doTextNode(n, lang);

        if (root.nodeType === 1 && (!root.closest || !root.closest('[data-noi18n]'))) {
            _doAttrs(root, lang);
        }
        if (root.querySelectorAll) {
            var els = root.querySelectorAll('[placeholder],[title],[aria-label],button,input');
            for (var i = 0; i < els.length; i++) {
                if (els[i].closest && els[i].closest('[data-noi18n]')) continue;
                _doAttrs(els[i], lang);
            }
        }
    }

    function _apply(lang) {
        _applying = true;
        try { _walk(document.body, lang); } catch (e) {}
        _applying = false;
    }

    function _startObserver() {
        if (_observer || !window.MutationObserver) return;
        _observer = new MutationObserver(function(muts) {
            if (_applying || _currentLang !== 'en') return;
            _applying = true;
            try {
                for (var i = 0; i < muts.length; i++) {
                    var added = muts[i].addedNodes;
                    for (var j = 0; j < added.length; j++) _walk(added[j], 'en');
                }
            } catch (e) {}
            _applying = false;
        });
        _observer.observe(document.body, { childList: true, subtree: true });
    }

    function _stopObserver() {
        if (_observer) { _observer.disconnect(); _observer = null; }
    }

    function _updateChrome(lang) {
        try {
            document.documentElement.setAttribute('lang', lang === 'en' ? 'en' : 'bn');
            var badge = document.getElementById('langCurrentBadge');
            if (badge) badge.textContent = (lang === 'en') ? 'English' : 'বাংলা';
        } catch (e) {}
    }

    function _setLang(lang) {
        lang = (lang === 'en') ? 'en' : 'bn';
        _currentLang = lang;
        if (lang === 'en') { _startObserver(); _apply('en'); }
        else { _apply('bn'); _stopObserver(); }
        _updateChrome(lang);
        try { localStorage.setItem('ba_lang', lang); } catch (e) {}
    }

    window.t = function(bn) {
        if (_currentLang !== 'en' || bn == null) return bn;
        var en = _translate(String(bn).replace(/^\s+|\s+$/g, ''));
        return (en == null) ? bn : en;
    };
    window.toggleAppLanguage = function() {
        _setLang(_currentLang === 'bn' ? 'en' : 'bn');
    };
    window.getAppLang = function() { return _currentLang; };

    // Auto-translate native alert()/confirm() dialogs (they never enter the DOM,
    // so the observer can't reach them). Admin uses many of these.
    try {
        var _alert = window.alert.bind(window);
        window.alert = function(m) { return _alert(window.t ? window.t(m) : m); };
        var _confirm = window.confirm.bind(window);
        window.confirm = function(m) { return _confirm(window.t ? window.t(m) : m); };
    } catch (e) {}

    document.addEventListener('DOMContentLoaded', function() {
        var saved = 'bn';
        try { saved = localStorage.getItem('ba_lang') || 'bn'; } catch (e) {}
        _setLang(saved);
    });
})();
