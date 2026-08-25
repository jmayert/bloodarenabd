// ============================================================
// PWA INSTALL — Settings-only, no auto-popup
// ============================================================
(function() {
    var _deferredPrompt = null;

    // beforeinstallprompt শুধু store — auto-show নেই
    window.addEventListener('beforeinstallprompt', function(e) {
        e.preventDefault();
        _deferredPrompt = e;
        window._pwaPromptEvent = e;
    });

    // appinstalled → Settings badge update
    window.addEventListener('appinstalled', function() {
        _deferredPrompt = null;
        window._pwaPromptEvent = null;
        var txt = document.getElementById('installStatusText');
        var bdg = document.getElementById('installStatusBadge');
        var itm = document.getElementById('settingsInstallItem');
        if (txt) txt.textContent = '✅ ইতিমধ্যে Install করা আছে';
        if (bdg) { bdg.textContent = '✅'; bdg.style.color = 'var(--success)'; }
        if (itm) { itm.style.opacity = '0.55'; itm.style.pointerEvents = 'none'; }
    });

    // pwaDoInstall — Settings button থেকে call হয়
    window.pwaDoInstall = function() {
        var prompt = _deferredPrompt || window._pwaPromptEvent;
        if (prompt) {
            prompt.prompt();
            prompt.userChoice.then(function(result) {
                _deferredPrompt = null;
                window._pwaPromptEvent = null;
                if (result.outcome === 'accepted') {
                    pwaDismiss();
                } else {
                    _showManualSteps();
                }
            }).catch(function() {
                _deferredPrompt = null;
                _showManualSteps();
            });
        } else {
            _showManualSteps();
        }
    };

    function _showManualSteps() {
        var andEl = document.getElementById('pwaAndroidContent');
        if (!andEl) return;
        andEl.innerHTML =
            '<div style="padding:2px 0 8px;">'
          + '<div style="font-weight:700;font-size:0.92rem;color:var(--text-main);margin-bottom:10px;">📲 Home Screen-এ Add করুন</div>'
          + '<div style="font-size:0.82rem;color:var(--text-muted);line-height:1.9;">'
          + '📱 <strong style="color:var(--text-main);">Chrome:</strong> Menu (⋮) → Add to Home screen<br>'
          + '📱 <strong style="color:var(--text-main);">Samsung:</strong> Menu → Add page to → Home screen<br>'
          + '📱 <strong style="color:var(--text-main);">Firefox:</strong> Menu → Install<br>'
          + '🍎 <strong style="color:var(--text-main);">iOS Safari:</strong> Share ⎋ → Add to Home Screen'
          + '</div>'
          + '</div>'
          + '<button class="pwa-install-btn" style="width:100%;margin-top:8px;" onclick="pwaDismiss()">✓ বুঝেছি</button>';
    }

    // pwaDismiss — শুধু overlay বন্ধ, কোনো timer নেই
    window.pwaDismiss = function() {
        var el = document.getElementById('pwaInstallOverlay');
        if (el) el.classList.remove('show');
    };

    // ── helpers ──────────────────────────────────────────────
    function _isStandalone() {
        return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
            || window.navigator.standalone === true;
    }

    // "Not now" — overlay বন্ধ + একই session-এ আর auto-show হবে না
    window.pwaNotNow = function() {
        try { sessionStorage.setItem('pwa_autoprompt_dismissed', '1'); } catch (e) {}
        window.pwaDismiss();
    };

    // Auto-prompt content (Install + Not now)
    function _renderAutoPrompt() {
        var andEl = document.getElementById('pwaAndroidContent');
        if (!andEl) return;
        andEl.innerHTML =
            '<div class="pwa-top-row">'
          + '  <img src="icon.png" alt="Blood Arena" class="pwa-app-icon">'
          + '  <div class="pwa-install-titles"><strong>Blood Arena</strong><span>Home Screen-এ Add করুন</span></div>'
          + '  <div class="pwa-top-btns">'
          + '    <button class="pwa-install-btn" onclick="pwaDoInstall()">📲 Install</button>'
          + '    <button class="pwa-dismiss-btn" onclick="pwaNotNow()">Not now</button>'
          + '  </div>'
          + '</div>'
          + '<div class="pwa-features">'
          + '  <span class="pwa-feat-pill">⚡ দ্রুত লোড</span>'
          + '  <span class="pwa-feat-pill">📵 Offline</span>'
          + '  <span class="pwa-feat-pill">🔔 Notification</span>'
          + '  <span class="pwa-feat-pill">📱 App Feel</span>'
          + '</div>';
    }

    // Site load-এর ৩ সেকেন্ড পর auto install prompt (Chrome/Android)
    window.addEventListener('load', function() {
        setTimeout(function() {
            if (_isStandalone()) return;                 // ইতিমধ্যে app হিসেবে চলছে
            try { if (sessionStorage.getItem('pwa_autoprompt_dismissed')) return; } catch (e) {}
            // beforeinstallprompt না এলে install করার মতো কিছু নেই → skip
            if (!(_deferredPrompt || window._pwaPromptEvent)) return;
            var el = document.getElementById('pwaInstallOverlay');
            if (!el || el.classList.contains('show')) return;
            _renderAutoPrompt();
            el.classList.add('show');
        }, 3000);
    });
})();


  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(function(reg) {
            console.log('[Blood Arena SW] Registered, scope:', reg.scope);

            // ── One-time cleanup: পুরনো root-scoped firebase-messaging-sw.js সরাও ──
            // আগের version এটিকে scope '/' এ register করত, যা sw.js-এর সাথে
            // সংঘর্ষ করে background push নষ্ট করত। শুধু root-scoped FCM SW সরানো হয়;
            // নতুন dedicated-scope FCM SW (/firebase-cloud-messaging-push-scope) থাকে।
            try {
                if (!sessionStorage.getItem('_fcm_scope_cleaned')) {
                    navigator.serviceWorker.getRegistrations().then(function(regs){
                        regs.forEach(function(r){
                            var su = (r.active && r.active.scriptURL) || '';
                            var sc = r.scope || '';
                            if (su.indexOf('firebase-messaging-sw.js') !== -1 &&
                                /\/$/.test(sc) && sc.indexOf('push-scope') === -1) {
                                r.unregister();
                            }
                        });
                    }).catch(function(){});
                    sessionStorage.setItem('_fcm_scope_cleaned', '1');
                }
            } catch(e) {}

            // SW update check — প্রতি ৩০ মিনিটে একবার, ঘন ঘন করলে reload loop হয়
            setInterval(function() { reg.update(); }, 1800000);

            // ── Save push subscription to server (device_id included) ──
            function savePushSubToServer(sub) {
                if (!sub) return;
                try {
                    var key  = sub.getKey ? sub.getKey('p256dh') : null;
                    var auth = sub.getKey ? sub.getKey('auth')   : null;
                    if (!key || !auth) return;
                    var p256dh = btoa(String.fromCharCode.apply(null, new Uint8Array(key)));
                    var authStr= btoa(String.fromCharCode.apply(null, new Uint8Array(auth)));
                    var fd = new FormData();
                    fd.append('save_push_sub', '1');
                    fd.append('endpoint',  sub.endpoint);
                    fd.append('p256dh',    p256dh);
                    fd.append('auth',      authStr);
                    fd.append('device_id', getDeviceId());
                    fd.append('csrf_token', CSRF_TOKEN);
                    fetch(_AJAX_URL, {method:'POST', body:fd}).catch(function(){});
                } catch(e) {}
            }

            // Try to get existing subscription, save if exists
            reg.pushManager.getSubscription().then(function(sub) {
                if (sub) { savePushSubToServer(sub); return; }
                // If notification permission granted but not subscribed, subscribe now
                // Note: requires VAPID for production; for now save endpoint for device tracking
                if (Notification.permission === 'granted') {
                    // Use a dummy applicationServerKey for local/device tracking only
                    // This allows us to collect device IDs even without full VAPID push
                    var fakeKey = new Uint8Array(65);
                    fakeKey[0] = 4; // uncompressed point prefix
                    for (var i = 1; i < 65; i++) fakeKey[i] = i;
                    reg.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: fakeKey
                    }).then(savePushSubToServer).catch(function(){
                        // Subscribe failed (no VAPID) — that's OK, device_id tracked via other tables
                    });
                }
            }).catch(function(){});

            // Re-save when permission is granted (user enables from Settings)
            var _prevPerm = Notification.permission;
            setInterval(function(){
                if (Notification.permission === 'granted' && _prevPerm !== 'granted') {
                    _prevPerm = 'granted';
                    reg.pushManager.getSubscription().then(function(sub){
                        if (sub) savePushSubToServer(sub);
                    });
                }
            }, 3000);

            // ── Update detection → "নতুন আপডেট" banner ──────────────────
            // sw.js v5.9 install-এ আর skipWaiting করে না → নতুন SW "waiting"-এ
            // বসে থাকে। এখানে detect করে নিচের banner দেখাই। User "রিফ্রেশ" চাপলে
            // SKIP_WAITING পাঠাই → activate → controllerchange (নিচের handler) →
            // একবার reload। User-gated বলে reload loop হয় না।
            function _baShowUpdateBanner(worker) {
                if (!worker || document.getElementById('baUpdateOverlay')) return;

                // keyframes + styles একবারই inject করি
                if (!document.getElementById('baUpdateCss')) {
                    var st = document.createElement('style');
                    st.id = 'baUpdateCss';
                    st.textContent =
                        '@keyframes baUpFade{from{opacity:0}to{opacity:1}}' +
                        '@keyframes baUpPop{0%{opacity:0;transform:translateY(16px) scale(.9)}100%{opacity:1;transform:translateY(0) scale(1)}}' +
                        '@keyframes baUpGlow{0%,100%{box-shadow:0 0 0 0 rgba(224,36,36,.5)}50%{box-shadow:0 0 0 16px rgba(224,36,36,0)}}' +
                        '#baUpdateOverlay{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:22px;background:rgba(2,6,23,.62);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:baUpFade .25s ease both;font-family:inherit}' +
                        '#baUpdateCard{width:100%;max-width:338px;text-align:center;color:#f1f5f9;background:linear-gradient(162deg,#1e293b,#0f172a);border:1px solid rgba(239,68,68,.3);border-radius:24px;padding:28px 22px 20px;box-shadow:0 24px 64px rgba(0,0,0,.6);animation:baUpPop .38s cubic-bezier(.2,.85,.25,1) both}' +
                        '#baUpdateCard .ic{width:66px;height:66px;margin:0 auto 16px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:2rem;background:linear-gradient(135deg,#ef4444,#b91c1c);animation:baUpGlow 2.1s ease-in-out infinite}' +
                        '#baUpdateCard h3{margin:0 0 8px;font-size:1.2rem;font-weight:800;color:#fff}' +
                        '#baUpdateCard p{margin:0 0 22px;font-size:.9rem;line-height:1.65;color:#9aa7bd}' +
                        '#baUpdateCard .pri{width:100%;border:none;cursor:pointer;color:#fff;font-weight:800;font-size:1rem;border-radius:14px;padding:14px;font-family:inherit;background:linear-gradient(135deg,#e02424,#b91c1c);box-shadow:0 8px 22px rgba(220,38,38,.42);transition:transform .12s ease}' +
                        '#baUpdateCard .pri:active{transform:scale(.97)}';
                    document.head.appendChild(st);
                }

                var ov = document.createElement('div');
                ov.id = 'baUpdateOverlay';
                ov.setAttribute('role', 'alertdialog');
                ov.setAttribute('aria-label', 'নতুন আপডেট');
                ov.innerHTML =
                    '<div id="baUpdateCard">' +
                        '<div class="ic">🔄</div>' +
                        '<h3>নতুন আপডেট এসেছে</h3>' +
                        '<p>Blood Arena-এর সর্বশেষ ভার্সন প্রস্তুত। সবচেয়ে নতুন তথ্য দেখতে একবার রিফ্রেশ করুন।</p>' +
                        '<button type="button" class="pri" id="baUpdateBtn">🔄 রিফ্রেশ করুন</button>' +
                    '</div>';
                (document.body || document.documentElement).appendChild(ov);
                if (document.body) document.body.style.overflow = 'hidden'; // forced — dismiss নেই

                // একমাত্র পথ: রিফ্রেশ। SKIP_WAITING → activate → controllerchange → একবার reload।
                // reload-এর পর নতুন SW-ই controller, waiting আর নেই — তাই modal আর আসে না
                // (পরের নতুন version deploy হওয়া পর্যন্ত)। অর্থাৎ একবার করলেই যথেষ্ট।
                ov.querySelector('#baUpdateBtn').addEventListener('click', function() {
                    this.disabled = true;
                    this.textContent = '⏳ হচ্ছে…';
                    try { worker.postMessage({ type: 'SKIP_WAITING' }); }
                    catch (e) { window.location.reload(); }
                });
            }

            // এই load-এর আগেই একটি নতুন SW waiting থাকলে banner দেখাও
            if (reg.waiting && navigator.serviceWorker.controller) {
                _baShowUpdateBanner(reg.waiting);
            }
            // load চলাকালীন নতুন SW install হলে banner দেখাও
            reg.addEventListener('updatefound', function() {
                var nw = reg.installing;
                if (!nw) return;
                nw.addEventListener('statechange', function() {
                    // installed + আগে থেকে controller আছে = update (first install নয়)
                    if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                        _baShowUpdateBanner(nw);
                    }
                });
            });
        })
        .catch(function(err) { console.warn('[SW] Registration failed:', err); });

      // Handle SW messages
      navigator.serviceWorker.addEventListener('message', function(event) {
          if (event.data && event.data.type === 'SYNC_COMPLETE') {
              startLiveNotif && startLiveNotif();
          }
      });

// ── controllerchange: sw.js update হলে একবার reload ──
// sessionStorage দিয়ে guard — একই session-এ দ্বিতীয়বার reload করবে না।
// firebase-messaging-sw.js register → controllerchange trigger হলে ignore করো।
(function() {
    var _reloadedThisSession = false;
    try { _reloadedThisSession = !!sessionStorage.getItem('_sw_reloaded'); } catch(e){}

    navigator.serviceWorker.addEventListener('controllerchange', function() {
        if (_reloadedThisSession) return; // ইতিমধ্যে একবার reload হয়েছে — ignore
        var ctrl = navigator.serviceWorker.controller;
        if (!ctrl || !ctrl.scriptURL) return;
        // firebase-messaging-sw.js এর controllerchange ignore করো
        if (ctrl.scriptURL.indexOf('firebase-messaging-sw.js') !== -1) return;
        // শুধু sw.js-এর জন্য reload করো
        if (ctrl.scriptURL.indexOf('/sw.js') === -1) return;
        // sessionStorage-এ mark করো যাতে reload loop না হয়
        try { sessionStorage.setItem('_sw_reloaded', '1'); } catch(e){}
        _reloadedThisSession = true;
        var pl = document.getElementById('pageLoader');
        if (pl) pl.classList.add('loader-show');
        window.location.reload();
    });
})();
    }); // end load
  } // end if serviceWorker

// ── Firebase FCM: auto-init token if permission already granted ──
window.addEventListener('load', function() {
  try {
    if (typeof _initFcmToken === 'function' && Notification.permission === 'granted') {
      setTimeout(_initFcmToken, 2000); // slight delay so SW is ready
    }
  } catch(e) {}
  // Firebase v9 compat automatically uses /firebase-messaging-sw.js from root
  // Manual registration not needed — just ensure file exists at root

  // Active Requests is now its own page (always visible on desktop) — prime its
  // list once so it isn't stuck on the loading placeholder before first visit.
  try { if (typeof loadBloodRequests === 'function') loadBloodRequests(); } catch(e) {}
});

// ============================================================
// 🌐 APP LANGUAGE SYSTEM — বাংলা ↔ English
// ============================================================
(function() { return; // ⛔ superseded by the dictionary-driven i18n engine appended at end of file
    var TRANSLATIONS = {
        en: {
            // Settings panel
            'lang-setting-label': 'App Language',
            'lang-setting-sub': 'বাংলা / English',
            'lang-badge-bn': 'বাংলা',
            'lang-badge-en': 'English',
            // Settings panel title
            'settings-title': '⚙️ Settings',
            // Settings items
            'setting-theme-label': 'Dark / Light Mode',
            'setting-theme-sub': 'Toggle night mode on/off',
            'setting-sound-label': 'Notification Sound',
            'setting-sound-sub': 'Registration & notification sound',
            'setting-vibr-label': 'Vibration',
            'setting-vibr-sub': 'Button & notification vibration',
            'setting-autoscroll-label': 'Auto Scroll After Call',
            'setting-autoscroll-sub': 'Jumps to next donor after calling',
            'setting-zoom-label': 'Donor Card Text Size',
            'setting-zoom-sub': 'Font size of donor list',
            'setting-notif-label': 'Browser Notifications',
            'setting-notif-sub': 'Get notified for new blood requests',
            'setting-loc-label': 'Location Permission',
            'setting-loc-sub': 'Required to find nearby donors',
            'setting-about-label': 'About Us',
            'setting-about-sub': 'Learn about Blood Arena',
            'setting-terms-label': 'Terms & Conditions',
            'setting-terms-sub': 'Read our terms & policy',
            'setting-install-label': 'Install App',
            'setting-install-sub': 'Add to Home Screen',
            'setting-faq-label': 'FAQ',
            'setting-faq-sub': 'Frequently asked questions',
            'setting-clear-label': 'Clear App Data',
            'setting-clear-sub': 'Clears cache, token & settings, then reloads',
            // Donation reminder card in settings
            'setting-donation-reminder-title': 'Donated Blood? Update Now!',
            'setting-donation-reminder-body': 'On the same day you donate, go to "Update My Info" and tap <strong style="color:var(--text-main);">"I just donated blood 🩸"</strong>. This updates your donation count & badge and lets others know you\'re temporarily unavailable.',
            'setting-donation-reminder-btn': '✏️ Open Update My Info →',
            // Home page hero
            'hero-lbl-donors': 'Total Donors',
            'hero-lbl-avail': 'Available Now',
            'hero-lbl-register': 'Register',
            // Emergency banner
            'emergency-banner-h4': 'Need blood urgently?',
            'emergency-banner-p': 'Post an emergency request — all donors will see it',
            'emergency-banner-view-btn': '📋 View Active Requests',
            'emergency-banner-req-btn': '🆘 Emergency Request',
            // Notif panel
            'notif-tab-blood': '🆘 Blood Request',
            'notif-tab-svc': '⚙️ Services',
            'notif-subhdr-active': '🆘 Active Requests',
            'notif-subhdr-svc': '⚙️ Service Notifications',
            'notif-svc-hint': '← swipe to remove',
            'notif-svc-del-all': '🗑 Delete All',
            'notif-empty-blood': 'No active requests',
            'notif-empty-svc': 'No service notifications',
            // Request section
            'req-tab-all': '🩸 All',
            'req-tab-mine': '👤 My Requests',
            // Sponsor banner
            'sponsor-banner-text': 'Interested in sponsoring this initiative? Contact us at: ',
            // Nav labels
            'nav-home': 'Home',
            'nav-donors': 'Donors',
            'nav-register': 'Register',
            'nav-nearby': 'Nearby',
            'nav-stats': 'Stats',
            'nav-settings': 'Settings',
            // Page headers
            'page-hdr-home': '🩸 Blood Arena',
            'page-hdr-register': '📝 Registration',
        },
        bn: {
            'lang-setting-label': 'App Language',
            'lang-setting-sub': 'বাংলা / English',
            'lang-badge-bn': 'বাংলা',
            'lang-badge-en': 'বাংলা',
            'settings-title': '⚙️ Settings',
            'setting-theme-label': 'Dark / Light Mode',
            'setting-theme-sub': 'Night mode চালু/বন্ধ করুন',
            'setting-sound-label': 'Notification Sound',
            'setting-sound-sub': 'Registration ও notification sound',
            'setting-vibr-label': 'Vibration',
            'setting-vibr-sub': 'Button ও notification vibration',
            'setting-autoscroll-label': 'Auto Scroll After Call',
            'setting-autoscroll-sub': 'Call করলে next donor-এ চলে যাবে',
            'setting-zoom-label': 'Donor Card Text Size',
            'setting-zoom-sub': 'Donor list এর লেখার সাইজ',
            'setting-notif-label': 'Browser Notifications',
            'setting-notif-sub': 'নতুন blood request এলে জানুন',
            'setting-loc-label': 'Location Permission',
            'setting-loc-sub': 'Nearby donors খুঁজতে দরকার',
            'setting-about-label': 'আমাদের কথা',
            'setting-about-sub': 'Blood Arena সম্পর্কে জানুন',
            'setting-terms-label': 'শর্তাবলী ও নীতিমালা',
            'setting-terms-sub': 'Terms & Conditions পড়ুন',
            'setting-install-label': 'App হিসেবে Install করুন',
            'setting-install-sub': 'Home Screen-এ Add করুন',
            'setting-faq-label': 'প্রশ্ন ও উত্তর (FAQ)',
            'setting-faq-sub': 'সাধারণ প্রশ্নের উত্তর দেখুন',
            'setting-clear-label': 'Clear App Data',
            'setting-clear-sub': 'Cache, token ও settings মুছে fresh reload নেবে',
            'setting-donation-reminder-title': 'রক্ত দিয়েছেন? এখনই Update করুন!',
            'setting-donation-reminder-body': 'রক্ত দেওয়ার <strong style="color:var(--text-main);">সাথে সাথে বা একই দিনের মধ্যে</strong> "Update My Info"-এ গিয়ে <strong style="color:var(--text-main);">"আমি এইমাত্র রক্ত দিয়েছি 🩸"</strong> বাটন চাপুন।<br>এতে আপনার donation count ও badge update হবে এবং অন্যরা জানবে আপনি এখন available নন।',
            'setting-donation-reminder-btn': '✏️ Update My Info খুলুন →',
            'hero-lbl-donors': 'মোট Donors',
            'hero-lbl-avail': 'Available Now',
            'hero-lbl-register': 'Register',
            'emergency-banner-h4': 'জরুরি রক্তের প্রয়োজন?',
            'emergency-banner-p': 'Emergency request করুন — সব donor দেখতে পাবে',
            'emergency-banner-view-btn': '📋 Active Requests দেখুন',
            'emergency-banner-req-btn': '🆘 Emergency Request',
            'notif-tab-blood': '🆘 Blood Request',
            'notif-tab-svc': '⚙️ Services',
            'notif-subhdr-active': '🆘 Active Requests',
            'notif-subhdr-svc': '⚙️ Service Notifications',
            'notif-svc-hint': '← swipe করে remove করুন',
            'notif-svc-del-all': '🗑 সব মুছুন',
            'notif-empty-blood': 'কোনো active request নেই',
            'notif-empty-svc': 'কোনো service notification নেই',
            'req-tab-all': '🩸 সব',
            'req-tab-mine': '👤 আমার Request',
            'sponsor-banner-text': 'আমাদের এই মহৎ উদ্যোগে স্পন্সর হিসেবে যুক্ত হতে আগ্রহী হলে, দয়া করে এই নাম্বারে যোগাযোগ করুন: ',
            'nav-home': 'Home',
            'nav-donors': 'Donors',
            'nav-register': 'Register',
            'nav-nearby': 'Nearby',
            'nav-stats': 'Stats',
            'nav-settings': 'Settings',
            'page-hdr-home': '🩸 Blood Arena',
            'page-hdr-register': '📝 রেজিস্ট্রেশন',
        }
    };

    // Map of i18n key → {selector, property}
    var I18N_MAP = [
        // Settings items
        { key: 'setting-theme-label',   sel: '.si-theme .settings-item-label',       prop: 'innerHTML' },
        { key: 'setting-theme-sub',     sel: '.si-theme .settings-item-sub',         prop: 'innerHTML' },
        { key: 'setting-sound-label',   sel: '.si-sound .settings-item-label',       prop: 'innerHTML' },
        { key: 'setting-sound-sub',     sel: '.si-sound .settings-item-sub',         prop: 'innerHTML' },
        { key: 'setting-vibr-label',    sel: '.si-vibr .settings-item-label',        prop: 'innerHTML' },
        { key: 'setting-vibr-sub',      sel: '.si-vibr .settings-item-sub',          prop: 'innerHTML' },
        { key: 'setting-autoscroll-label', sel: '.si-autoscroll .settings-item-label', prop: 'innerHTML' },
        { key: 'setting-autoscroll-sub',   sel: '.si-autoscroll .settings-item-sub',   prop: 'innerHTML' },
        { key: 'setting-zoom-label',    sel: '.si-zoom .settings-item-label',        prop: 'innerHTML' },
        { key: 'setting-zoom-sub',      sel: '.si-zoom .settings-item-sub',          prop: 'innerHTML' },
        { key: 'setting-notif-label',   sel: '.si-notif .settings-item-label',       prop: 'innerHTML' },
        { key: 'setting-loc-label',     sel: '.si-loc .settings-item-label',         prop: 'innerHTML' },
        { key: 'setting-loc-sub',       sel: '.si-loc .settings-item-sub',           prop: 'innerHTML' },
        { key: 'setting-about-label',   sel: '.si-about .settings-item-label',       prop: 'innerHTML' },
        { key: 'setting-about-sub',     sel: '.si-about .settings-item-sub',         prop: 'innerHTML' },
        { key: 'setting-terms-label',   sel: '.si-terms .settings-item-label',       prop: 'innerHTML' },
        { key: 'setting-terms-sub',     sel: '.si-terms .settings-item-sub',         prop: 'innerHTML' },
        { key: 'setting-install-label', sel: '.si-install .settings-item-label',     prop: 'innerHTML' },
        { key: 'setting-faq-label',     sel: '.si-faq .settings-item-label',         prop: 'innerHTML' },
        { key: 'setting-faq-sub',       sel: '.si-faq .settings-item-sub',           prop: 'innerHTML' },
        { key: 'setting-clear-label',   sel: '.si-clear .settings-item-label',       prop: 'innerHTML' },
        { key: 'setting-clear-sub',     sel: '.si-clear .settings-item-sub',         prop: 'innerHTML' },
        // Hero labels
        { key: 'hero-lbl-donors',       sel: '.home-hero-stat:nth-child(1) .home-hero-lbl', prop: 'textContent' },
        { key: 'hero-lbl-avail',        sel: '.home-hero-stat:nth-child(3) .home-hero-lbl', prop: 'textContent' },
        { key: 'hero-lbl-register',     sel: '.home-hero-stat:nth-child(5) .home-hero-lbl', prop: 'textContent' },
        // Emergency banner
        { key: 'emergency-banner-h4',   sel: '.emergency-banner-text h4',            prop: 'textContent' },
        { key: 'emergency-banner-p',    sel: '.emergency-banner-text p',             prop: 'textContent' },
        { key: 'emergency-banner-view-btn', sel: '.btn-view-requests',               prop: 'textContent' },
        { key: 'emergency-banner-req-btn',  sel: '.btn-emergency',                   prop: 'textContent' },
        // Notif panel
        { key: 'notif-tab-blood',       sel: '#nTabBlood',                           prop: 'childNodes[0].nodeValue', special: 'nTabBlood' },
        { key: 'notif-svc-hint',        sel: '.svc-notif-hint',                      prop: 'textContent' },
        // Request tabs
        { key: 'req-tab-all',           sel: '#reqTab_all',                          prop: 'textContent' },
        { key: 'req-tab-mine',          sel: '#reqTab_mine',                         prop: 'textContent' },
        // Nav
        { key: 'nav-home',      sel: '#mbn-home span:last-child',     prop: 'textContent' },
        { key: 'nav-donors',    sel: '#mbn-donors span:last-child',   prop: 'textContent' },
        { key: 'nav-register',  sel: '#mbn-register span:last-child', prop: 'textContent' },
        { key: 'nav-nearby',    sel: '#mbn-nearby span:last-child',   prop: 'textContent' },
        { key: 'nav-stats',     sel: '#mbn-more span:last-child',     prop: 'textContent' },
        { key: 'nav-settings',  sel: '#mbn-settings span:last-child', prop: 'textContent' },
    ];

    var _currentLang = 'bn';

    function _applyLang(lang) {
        var T = TRANSLATIONS[lang];
        if (!T) return;
        _currentLang = lang;

        // Apply generic mappings
        I18N_MAP.forEach(function(item) {
            try {
                var els = document.querySelectorAll(item.sel);
                els.forEach(function(el) {
                    if (item.prop === 'innerHTML') {
                        el.innerHTML = T[item.key] || el.innerHTML;
                    } else if (item.prop === 'textContent') {
                        el.textContent = T[item.key] || el.textContent;
                    }
                });
            } catch(e) {}
        });

        // Special: notif tab blood (has a child badge span)
        try {
            var nTabBlood = document.getElementById('nTabBlood');
            if (nTabBlood) {
                var badge = nTabBlood.querySelector('.notif-tab-badge');
                nTabBlood.textContent = T['notif-tab-blood'] || '';
                if (badge) nTabBlood.appendChild(badge);
            }
            var nTabSvc = document.getElementById('nTabSvc');
            if (nTabSvc) {
                var badge2 = nTabSvc.querySelector('.notif-tab-badge');
                nTabSvc.textContent = T['notif-tab-svc'] || '';
                if (badge2) nTabSvc.appendChild(badge2);
            }
            // Delete all button
            var delAllBtn = document.querySelector('.svc-delete-all-btn');
            if (delAllBtn) delAllBtn.textContent = T['notif-svc-del-all'] || delAllBtn.textContent;
        } catch(e) {}

        // Settings: donation reminder card
        try {
            var reminderTitle = document.querySelector('.si-donation-reminder-title');
            if (reminderTitle) reminderTitle.innerHTML = T['setting-donation-reminder-title'] || reminderTitle.innerHTML;
            var reminderBody = document.querySelector('.si-donation-reminder-body');
            if (reminderBody) reminderBody.innerHTML = T['setting-donation-reminder-body'] || reminderBody.innerHTML;
            var reminderBtn = document.querySelector('.si-donation-reminder-btn');
            if (reminderBtn) reminderBtn.textContent = T['setting-donation-reminder-btn'] || reminderBtn.textContent;
        } catch(e) {}

        // Lang badge in settings
        try {
            var badge = document.getElementById('langCurrentBadge');
            if (badge) badge.textContent = (lang === 'en') ? T['lang-badge-en'] : T['lang-badge-bn'];
            var lbl = document.getElementById('langSettingLabel');
            if (lbl) lbl.textContent = T['lang-setting-label'] || lbl.textContent;
            var sub = document.getElementById('langSettingSubLabel');
            if (sub) sub.textContent = T['lang-setting-sub'] || sub.textContent;
        } catch(e) {}

        // Page headers (app-page-header spans)
        try {
            var pageHdrs = document.querySelectorAll('.app-page-header');
            pageHdrs.forEach(function(h) {
                var icon = h.querySelector('.ph-icon');
                var badge = h.querySelector('.app-version-badge');
                var iconTxt = icon ? icon.textContent : '';
                var badgeTxt = badge ? badge.textContent : '';
                var pageId = h.closest('.app-page') ? h.closest('.app-page').id : '';
                var keyMap = { 'page-home': 'page-hdr-home', 'page-register': 'page-hdr-register' };
                if (pageId && keyMap[pageId] && T[keyMap[pageId]]) {
                    h.innerHTML = '';
                    if (icon) { icon.textContent = iconTxt; h.appendChild(icon); }
                    h.appendChild(document.createTextNode(' ' + T[keyMap[pageId]].replace(/^[🩸📝]\s*/, '')));
                    if (badge) h.appendChild(badge);
                }
            });
        } catch(e) {}

        // Notif panel empty states
        try {
            var nList = document.getElementById('nList');
            if (nList && nList.querySelector('.notif-empty')) {
                nList.querySelector('.notif-empty').textContent = T['notif-empty-blood'] || '';
            }
            var nSvcList = document.getElementById('nSvcList');
            if (nSvcList && nSvcList.querySelector('.notif-empty')) {
                nSvcList.querySelector('.notif-empty').textContent = T['notif-empty-svc'] || '';
            }
        } catch(e) {}

        // Save to localStorage
        try { localStorage.setItem('ba_lang', lang); } catch(e) {}
    }

    // Public toggle function
    window.toggleAppLanguage = function() {
        var newLang = (_currentLang === 'bn') ? 'en' : 'bn';
        _applyLang(newLang);
        // Haptic feedback
        try { if (navigator.vibrate && window._vibration !== false) navigator.vibrate(30); } catch(e) {}
    };

    // Init on load
    document.addEventListener('DOMContentLoaded', function() {
        var saved = 'bn';
        try { saved = localStorage.getItem('ba_lang') || 'bn'; } catch(e) {}
        _applyLang(saved);
    });
})();

// ============================================================
// 🌐 APP LANGUAGE SYSTEM — বাংলা ↔ English (dictionary-driven engine)
// ============================================================
// Translates the whole rendered DOM via a BN→EN dictionary (window.BA_I18N),
// with a MutationObserver so dynamically-inserted content (toasts, innerHTML,
// server `msg` strings) is translated too. The original Bangla is cached
// per-node, so switching back to বাংলা restores it byte-for-byte. Default
// language stays 'bn'; in 'bn' mode the engine is a no-op (zero overhead).
(function() {
    var I18N     = window.BA_I18N || {};
    var DICT     = I18N.bn2en   || {};
    var PATTERNS = I18N.patterns || [];   // [{ re: RegExp, en: '… $1 …' }]
    var ATTRS    = ['placeholder', 'title', 'aria-label', 'value'];
    var BN_RE    = /[ঀ-৿]/;
    var SKIP     = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1 };

    var _origText = new WeakMap();   // textNode -> original nodeValue (BN)
    var _origAttr = new WeakMap();   // element  -> { attrName: originalValue }
    var _currentLang = 'bn';
    var _observer = null;
    var _applying = false;

    function _hasBangla(s) { return BN_RE.test(s); }

    // NFC-normalized dict, built lazily. The DOM text (from PHP templates) and
    // the dict keys can sit in different Unicode normalization forms (composed
    // vs decomposed Bangla), so an exact byte match silently fails. Normalizing
    // both sides to NFC reconciles them (e.g. the long About Us paragraphs).
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

    // Look up a trimmed Bangla string → English (exact map first, then patterns).
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
        } else {                       // bn — restore original
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

    // ---- public API ---------------------------------------------------------
    // t(bn): for strings that never enter the observed DOM (Notification, title…).
    window.t = function(bn) {
        if (_currentLang !== 'en' || bn == null) return bn;
        var en = _translate(String(bn).replace(/^\s+|\s+$/g, ''));
        return (en == null) ? bn : en;
    };

    window.toggleAppLanguage = function() {
        _setLang(_currentLang === 'bn' ? 'en' : 'bn');
        try { if (navigator.vibrate && window._vibration !== false) navigator.vibrate(30); } catch (e) {}
    };

    window.getAppLang = function() { return _currentLang; };

    document.addEventListener('DOMContentLoaded', function() {
        var saved = 'bn';
        try { saved = localStorage.getItem('ba_lang') || 'bn'; } catch (e) {}
        _setLang(saved);
    });
})();
