// ── Reg Telegram — Contact-Share verify (no manual OTP typing) ──
var _regTgPollTimer = null;
var _regTgToken = null;

function regTgSendOtp() {
  if (_regTgPollTimer) { clearInterval(_regTgPollTimer); _regTgPollTimer = null; }
  _authBusy(true, 'regTgSendOtpBtn');
  _verifyPost('tg_send_otp', {}).then(function(res){
    _authBusy(false, 'regTgSendOtpBtn');
    if (res && res.status === 'open_bot' && res.link) {
      _regTgToken = res.token;
      var link = res.link;
      var div = document.getElementById('regTgOpenBotDiv');
      if (div) div.style.display = 'block';
      var a = document.getElementById('regTgOpenBotBtn');
      if (a) a.href = link;
      var status = document.getElementById('regTgPollStatus');
      if (status) {
        status.style.display = 'block';
        status.innerHTML = '⏳ Telegram-এ গিয়ে "Share My Number" বাটনে চাপ দিন...';
      }
      try { window.open(link, '_blank'); } catch(e){}
      _authToast('Telegram খুলুন — "Share My Number" বাটনে চাপ দিন।', 'info');
      _regTgStartPolling(res.token);
    } else {
      _authToast((res && res.msg) ? res.msg : 'Telegram verify শুরু করা যায়নি。', 'error');
    }
  }).catch(function(){
    _authBusy(false, 'regTgSendOtpBtn');
    _authToast('নেটওয়ার্ক সমস্যা।', 'error');
  });
}

function _regTgStartPolling(token) {
  if (_regTgPollTimer) clearInterval(_regTgPollTimer);
  var elapsed = 0;
  _regTgPollTimer = setInterval(function(){
    elapsed += 2000;
    var fd = new FormData();
    fd.append('tg_check_verify', '1');
    fd.append('token', token);
    fd.append('csrf_token', (typeof CSRF_TOKEN !== 'undefined') ? CSRF_TOKEN : '');
    fetch(window.location.origin + window.location.pathname, { method:'POST', body:fd })
      .then(function(r){ return (typeof safeJSON === 'function') ? safeJSON(r) : r.json(); })
      .then(function(res){
        if (res && res.status === 'verified') {
          clearInterval(_regTgPollTimer);
          _regTgPollTimer = null;
          var status = document.getElementById('regTgPollStatus');
          if (status) { status.innerHTML = '✅ Verified!'; status.style.color = '#10b981'; }
          _onVerifySuccess('telegram', '✅ Telegram দিয়ে verify সম্পন্ন!', res.phone);
        } else if (res && res.status === 'expired') {
          clearInterval(_regTgPollTimer);
          _regTgPollTimer = null;
          var status = document.getElementById('regTgPollStatus');
          if (status) { status.innerHTML = '⏰ সময় শেষ। আবার চেষ্টা করুন।'; status.style.color = '#ef4444'; }
          _authToast('সময় শেষ। আবার "Telegram দিয়ে Verify করুন" চাপুন।', 'error');
        }
      }).catch(function(){});
    if (elapsed > 300000 && _regTgPollTimer) {
      clearInterval(_regTgPollTimer);
      _regTgPollTimer = null;
    }
  }, 2000);
}

// ── Reg Telegram — কোড যাচাই (REMOVED: contact-share) ──// ============================================================
// 🛡️ CSRF SELF-HEAL — first PWA-launch session/token desync recovery
// ------------------------------------------------------------
// প্রথমবার PWA খুললে (home-screen icon / notification থেকে) top-level navigation-এ
// session cookie বাদ পড়তে পারত → page-এ baked CSRF_TOKEN আর server session-এর
// token মিলত না → প্রতিটি POST "Security check failed" দিত, এমনকি silent
// login-restore POST-ও fail করত (manual refresh ছাড়া ঠিক হত না)।
// এই wrapper fetch-কে ঘিরে রাখে: কোনো same-origin POST যদি 403 "Security check
// failed" পায়, /?csrf=1 থেকে fresh token এনে FormData আপডেট করে একবার নিজে retry
// করে। সবার আগে বসে যাতে head-init-এর নিজের POST-ও (silent restore / FCM) heal হয়।
// SameSite=Lax মূল কারণ ঠিক করে; এটা safety-net — refresh ছাড়াই কাজ চলে।
// ============================================================
(function(){
  if (window._baFetchWrapped || !window.fetch) return;
  window._baFetchWrapped = true;
  var _origFetch  = window.fetch.bind(window);
  var _ajaxUrl    = function(){ return window.location.origin + window.location.pathname; };
  var _refreshing = null;

  function _isCsrfForm(b){
    return (typeof FormData !== 'undefined') && (b instanceof FormData) && b.has('csrf_token');
  }

  // একই সময়ে অনেক POST fail করলেও token একবারই আনি (shared in-flight promise)।
  function _refreshToken(){
    if (_refreshing) return _refreshing;
    _refreshing = _origFetch(_ajaxUrl() + '?csrf=1', { credentials:'same-origin', cache:'no-store' })
      .then(function(r){ return (r && r.ok) ? r.json() : null; })
      .then(function(j){
        var tok = (j && j.token) ? j.token : null;
        if (tok) window._baCsrfLive = tok;   // CSRF_TOKEN const — তাই live token আলাদা রাখি
        return tok;
      })
      .catch(function(){ return null; })
      .then(function(tok){ _refreshing = null; return tok; });
    return _refreshing;
  }

  window.fetch = function(input, init){
    init = init || {};
    var body = init.body;
    // একবার heal হলে পরের সব POST-এ live token আগেই বসিয়ে দাও — আর fail করবে না।
    if (window._baCsrfLive && _isCsrfForm(body)) {
      try { body.set('csrf_token', window._baCsrfLive); } catch(e){}
    }
    return _origFetch(input, init).then(function(res){
      if (!res || res.status !== 403 || !_isCsrfForm(body)) return res;
      // 403 হলেও আসলেই CSRF কিনা body দেখে নিশ্চিত হই (clone — caller যেন original পড়তে পারে)।
      return res.clone().text().then(function(txt){
        if (!txt || txt.indexOf('Security check') === -1) return res;
        return _refreshToken().then(function(tok){
          if (!tok) return res;                   // token আনা গেল না → original error ফেরত
          try { body.set('csrf_token', tok); } catch(e){ return res; }
          return _origFetch(input, init);         // একবারই retry — fresh token-এ
        });
      }).catch(function(){ return res; });
    });
  };
})();

// ── Firebase config (from config.php) ────────────────────
const _firebaseConfig = {
  apiKey:            "(window.BA_CONFIG.firebase["apiKey"] || "")",
  authDomain:        "(window.BA_CONFIG.firebase["authDomain"] || "")",
  projectId:         "(window.BA_CONFIG.firebase["projectId"] || "")",
  storageBucket:     "(window.BA_CONFIG.firebase["storageBucket"] || "")",
  messagingSenderId: "(window.BA_CONFIG.firebase["messagingSenderId"] || "")",
  appId:             "(window.BA_CONFIG.firebase["appId"] || "")",
  measurementId:     "(window.BA_CONFIG.firebase["measurementId"] || "")"
};
const _VAPID_KEY = "(window.BA_CONFIG.firebase["vapidKey"] || "")";

var _fbApp, _fbMessaging;
try {
  if (!firebase.apps.length) {
    _fbApp = firebase.initializeApp(_firebaseConfig);
  } else {
    _fbApp = firebase.app();
  }
  _fbMessaging = firebase.messaging();
} catch(e) {
  console.warn('[FCM] Init failed:', e);
}

// Save FCM token to server
function _saveFcmToken(token) {
  if (!token) return;
  try {
    // _AJAX_URL may not be defined yet (head script) — always compute directly
    var _url = window.location.origin + window.location.pathname;
    var fd = new FormData();
    fd.append('save_fcm_token', '1');
    fd.append('fcm_token', token);
    fd.append('device_id', (typeof getDeviceId === 'function') ? getDeviceId() : '');
    fd.append('csrf_token', (typeof CSRF_TOKEN !== 'undefined') ? CSRF_TOKEN : '');
    fetch(_url, {method:'POST', body:fd}).catch(function(){});
  } catch(e) {}
}

// Get FCM token when permission granted
// ── FIX v4: firebase-messaging-sw.js কে নিজস্ব scope-এ register করা হয়।
// আগে scope '/' এ sw.js (cache SW) এর সাথে সংঘর্ষ হত — তাই app closed
// থাকলে background push আসত না। এখন আলাদা scope-এ bind করায় ঠিক হয়েছে।
function _initFcmToken() {
  if (!_fbMessaging) return;
  if (!navigator.serviceWorker) return;

  // ── FIX: firebase-messaging-sw.js কে নিজস্ব scope-এ register করো ──
  // আগে এটি scope '/' এ register হত — সেখানে sw.js (cache SW) ও বসে।
  // দুটো SW একই scope '/' দখলের চেষ্টা করায় শেষেরটা control নিত।
  // cache SW control নিলে FCM background handler বন্ধ → app/browser closed
  // থাকলে push আসত না। এখন আলাদা scope দেওয়ায় দুটোই পাশাপাশি বাঁচে এবং
  // background push সবসময় firebase-messaging-sw.js handle করে।
  var FCM_SCOPE = '/firebase-cloud-messaging-push-scope';
  navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: FCM_SCOPE })
    .then(function(swReg) {
      return _fbMessaging.getToken({
        vapidKey: _VAPID_KEY,
        serviceWorkerRegistration: swReg
      });
    })
    .then(function(token) {
      if (token) {
        console.log('[FCM] Token obtained ✅ bound to firebase-messaging-sw.js (dedicated scope)');
        _saveFcmToken(token);
      } else {
        console.warn('[FCM] No token — notification permission দিন');
      }
    })
    .catch(function(err) {
      console.warn('[FCM] getToken failed:', err);
    });
}

// Foreground message handler — same tag as PHP FCM push so browser deduplicates
if (_fbMessaging) {
  _fbMessaging.onMessage(function(payload) {
    try {
      var n = payload.notification || {};
      var d = payload.data || {};
      var url = (d.url) ? d.url : '(window.BA_CONFIG.siteUrl || "")/?tab=emergency';
      // Use same tag as PHP FCM V1 push ('blood-req-{id}') — browser replaces duplicate
      var notifTag = d.request_id ? ('blood-req-' + d.request_id) : (n.tag || 'blood-req-fcm');
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(function(reg) {
          reg.showNotification(n.title || '🆘 Blood Arena', {
            body:    n.body || '',
            icon:    n.icon || '/icon.png',
            badge:   '/?badge_icon=1',
            tag:     notifTag,
            renotify: false,
            requireInteraction: false,
            data:    { url: url }
          });
        }).catch(function(){});
      } else {
        try { new Notification(n.title || '🆘 Blood Arena', { body: n.body, icon: '/icon.png', tag: notifTag }); } catch(e){}
      }
    } catch(e) {}
  });
}

// ════════════════════════════════════════════════════════════
// 🔐 FIREBASE AUTH — Google sign-in
// ════════════════════════════════════════════════════════════
var _fbAuth;
try { if (_fbApp && firebase.auth) _fbAuth = firebase.auth(); } catch(e) { console.warn('[Auth] init failed', e); }

// সার্ভারে ID token পাঠিয়ে session তৈরি করো
function _postAuthToServer(idToken) {
  var url = window.location.origin + window.location.pathname;
  var fd = new FormData();
  fd.append('firebase_auth', '1');
  fd.append('id_token', idToken);
  fd.append('device_id', (typeof getDeviceId === 'function') ? getDeviceId() : '');
  fd.append('csrf_token', (typeof CSRF_TOKEN !== 'undefined') ? CSRF_TOKEN : '');
  return fetch(url, { method:'POST', body:fd })
    .then(function(r){ return (typeof safeJSON === 'function') ? safeJSON(r) : r.json(); });
}

function _authToast(msg, type) {
  if (typeof showToast === 'function') showToast(msg, type || 'info');
}

function _authBusy(on, btnId) {
  var b = document.getElementById(btnId);
  if (b) b.disabled = !!on;
}

// ── OTP cooldown countdown (server is source of truth; this is UX only) ──
//  btnId = Send button, labelBase = বাটনের স্বাভাবিক লেখা, lsKey = localStorage key
//  (modal বন্ধ/খুললেও countdown টিকে থাকে), triesId = "X বার বাকি" span (optional)।
function _otpFmt(s) {
  var m = Math.floor(s / 60), ss = s % 60;
  return m + ':' + (ss < 10 ? '0' : '') + ss;
}
function _otpCountdown(btnId, seconds, labelBase, lsKey) {
  var b = document.getElementById(btnId);
  if (!b) return;
  if (b._otpTimer) { clearInterval(b._otpTimer); b._otpTimer = null; }
  seconds = parseInt(seconds, 10) || 0;
  if (seconds <= 0) { b.disabled = false; b.textContent = labelBase; return; }
  if (lsKey) { try { localStorage.setItem(lsKey, String(Date.now() + seconds * 1000)); } catch(e){} }
  b.disabled = true;
  function tick() {
    b.textContent = labelBase + ' (' + _otpFmt(seconds) + ')';
    if (seconds <= 0) {
      clearInterval(b._otpTimer); b._otpTimer = null;
      b.disabled = false; b.textContent = labelBase;
      if (lsKey) { try { localStorage.removeItem(lsKey); } catch(e){} }
      return;
    }
    seconds--;
  }
  tick();
  b._otpTimer = setInterval(tick, 1000);
}
// modal খোলার সময় কল করো — আগের cooldown বাকি থাকলে আবার চালু করে
function _otpResumeCooldown(btnId, labelBase, lsKey) {
  var end = 0;
  try { end = parseInt(localStorage.getItem(lsKey) || '0', 10) || 0; } catch(e){}
  var left = Math.ceil((end - Date.now()) / 1000);
  if (left > 0) _otpCountdown(btnId, left, labelBase, lsKey);
}
// "এই ঘণ্টায় আর N বার" দেখাও
function _otpTriesLeft(spanId, n) {
  var el = document.getElementById(spanId);
  if (!el) return;
  if (n == null) { el.textContent = ''; return; }
  el.textContent = (n > 0) ? ('এই ঘণ্টায় আর ' + n + ' বার OTP নেওয়া যাবে।') : 'এই ঘণ্টার সীমা শেষ।';
}


// ── সব Google বাটনের (auth modal + registration page) busy state ──
function _googleBtnsBusy(on) {
  ['authGoogleBtn','regGoogleBtn'].forEach(function(id){
    var b = document.getElementById(id);
    if (b) b.disabled = !!on;
  });
}

// ── "অনুগ্রহ করে অপেক্ষা করুন" overlay — Google সাইন-ইন প্রসেস হওয়ার সময় ──
//  redirect থেকে ফিরলে / popup বন্ধ হওয়ার পর প্রোফাইল লোড না হওয়া পর্যন্ত দেখায়।
function _tt(bn) { return (typeof t === 'function') ? t(bn) : bn; }
function _authWait(on, title, sub) {
  var el = document.getElementById('authWaitOverlay');
  if (!el) return;
  if (on) {
    if (title) { var ti = document.getElementById('authWaitTitle'); if (ti) ti.textContent = _tt(title); }
    if (sub)   { var su = document.getElementById('authWaitSub');   if (su) su.textContent = _tt(sub); }
    el.classList.add('show'); el.setAttribute('aria-hidden', 'false');
  } else {
    el.classList.remove('show'); el.setAttribute('aria-hidden', 'true');
  }
}
function _gRedirectFlag(set) {
  try { set ? sessionStorage.setItem('ba_g_redirect', '1') : sessionStorage.removeItem('ba_g_redirect'); } catch (e) {}
}
// redirect থেকে ফিরে এলে DOM ready হওয়ামাত্রই overlay দেখাও (getRedirectResult resolve হওয়ার আগেই)
function _maybeShowRedirectWait() {
  var pending = false;
  try { pending = sessionStorage.getItem('ba_g_redirect') === '1'; } catch (e) {}
  if (!pending) return;
  _authWait(true, 'সাইন ইন সম্পন্ন হচ্ছে…', 'অনুগ্রহ করে অপেক্ষা করুন, প্রোফাইল লোড হচ্ছে।');
  // failsafe — কোনো কারণে complete না হলে overlay যেন আটকে না থাকে
  setTimeout(function () { _authWait(false); }, 20000);
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _maybeShowRedirectWait);
} else { _maybeShowRedirectWait(); }

// standalone PWA / iOS / in-app browser-এ popup ব্লক হয় — সেক্ষেত্রে redirect লাগে
function _isStandalonePWA() {
  try {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
        || window.navigator.standalone === true;
  } catch(e) { return false; }
}

// শুধু iOS-Safari standalone (হোম-স্ক্রিনে যোগ করা) মোডে popup একেবারেই খোলে না।
// Android/Desktop-এ installed PWA-তে popup ঠিকঠাক কাজ করে — তাই সেখানে popup-ই ব্যবহার করি।
// কারণ: Firebase-এর signInWithRedirect modern browser-এ third-party storage partitioning-এর
// জন্য ভেঙে যায় (auth state authDomain-এ আটকে থাকে, ফিরে এসে getRedirectResult() null দেয়,
// ফলে PWA-তে লগইন সম্পূর্ণ হয় না)। তাই popup-ই Firebase-এর প্রস্তাবিত নির্ভরযোগ্য পথ।
function _isIOSStandalone() {
  try {
    var ua = navigator.userAgent || '';
    var isIOS = /iPad|iPhone|iPod/.test(ua)
             || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS
    return isIOS && window.navigator.standalone === true;
  } catch(e) { return false; }
}

// ── Google Sign-in (popup; ব্যর্থ হলে redirect fallback) ──
function authGoogleSignIn() {
  if (!_fbAuth) { _authToast('Auth এখন উপলব্ধ নয়।', 'error'); return; }
  var provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  _googleBtnsBusy(true);

  // শুধু iOS standalone-এ popup খোলে না → সেখানেই বাধ্য হয়ে redirect।
  // Android/Desktop installed PWA-তে popup ব্যবহার হবে (redirect PWA-তে অনির্ভরযোগ্য)।
  if (_isIOSStandalone()) {
    _gRedirectFlag(true);
    _authWait(true, 'Google-এ নিয়ে যাওয়া হচ্ছে…', 'অনুগ্রহ করে অপেক্ষা করুন।');
    _fbAuth.signInWithRedirect(provider).catch(function(err){
      _authWait(false); _gRedirectFlag(false);
      _googleBtnsBusy(false);
      console.warn('[Auth] Google redirect', err);
      _authToast('Google সাইন-ইন শুরু করা যায়নি।', 'error');
    });
    return;
  }

  _fbAuth.signInWithPopup(provider)
    .then(function(result){ _authWait(true, 'প্রোফাইল লোড হচ্ছে…', 'অনুগ্রহ করে অপেক্ষা করুন।'); return result.user.getIdToken(); })
    .then(function(idToken){ return _postAuthToServer(idToken); })
    .then(function(res){
      _googleBtnsBusy(false);
      if (res && res.status === 'success') _onAuthSuccess(res);
      else { _authWait(false); _authToast((res && res.msg) ? res.msg : 'সাইন-ইন ব্যর্থ।', 'error'); }
    })
    .catch(function(err){
      _authWait(false);
      console.warn('[Auth] Google popup', err);
      if (err && err.code === 'auth/popup-closed-by-user') { _googleBtnsBusy(false); return; }
      // popup ব্লক / এই environment-এ unsupported হলে redirect-এ fallback করো
      var fallback = ['auth/popup-blocked','auth/cancelled-popup-request',
                      'auth/operation-not-supported-in-this-environment','auth/web-storage-unsupported'];
      if (err && fallback.indexOf(err.code) !== -1) {
        _gRedirectFlag(true);
        _authWait(true, 'Google-এ নিয়ে যাওয়া হচ্ছে…', 'অনুগ্রহ করে অপেক্ষা করুন।');
        _fbAuth.signInWithRedirect(provider).catch(function(e2){
          _authWait(false); _gRedirectFlag(false);
          _googleBtnsBusy(false);
          console.warn('[Auth] Google redirect fallback', e2);
          _authToast('Google সাইন-ইন ব্যর্থ হয়েছে।', 'error');
        });
        return;
      }
      _googleBtnsBusy(false);
      // এই domain Firebase Console-এ authorized না থাকলে এই error আসে
      if (err && err.code === 'auth/unauthorized-domain') {
        _authToast('এই ডোমেইনটি Firebase-এ অনুমোদিত নয়। Console → Authentication → Settings → Authorized domains-এ যোগ করুন।', 'error');
        return;
      }
      // অন্য যেকোনো error-এ আসল কারণ দেখাও যাতে নির্ণয় করা যায়
      _authToast('Google সাইন-ইন ব্যর্থ: ' + ((err && (err.code || err.message)) || 'unknown'), 'error');
    });
}

// ── redirect থেকে ফিরলে sign-in সম্পন্ন করো (page load-এ একবার চলে) ──
function _completeGoogleRedirect() {
  if (!_fbAuth || typeof _fbAuth.getRedirectResult !== 'function') return;
  _fbAuth.getRedirectResult()
    .then(function(result){
      if (!result || !result.user) { _authWait(false); _gRedirectFlag(false); return; } // redirect থেকে আসেনি
      _googleBtnsBusy(true);
      _authWait(true, 'প্রোফাইল লোড হচ্ছে…', 'অনুগ্রহ করে অপেক্ষা করুন।');
      return result.user.getIdToken()
        .then(function(idToken){ return _postAuthToServer(idToken); })
        .then(function(res){
          _googleBtnsBusy(false);
          _gRedirectFlag(false);
          if (res && res.status === 'success') _onAuthSuccess(res);
          else { _authWait(false); _authToast((res && res.msg) ? res.msg : 'সাইন-ইন ব্যর্থ।', 'error'); }
        });
    })
    .catch(function(err){
      _googleBtnsBusy(false);
      _authWait(false); _gRedirectFlag(false);
      console.warn('[Auth] redirect result', err);
      if (err && err.code === 'auth/unauthorized-domain') {
        _authToast('এই ডোমেইনটি Firebase-এ অনুমোদিত নয়। Console → Authentication → Settings → Authorized domains-এ যোগ করুন।', 'error');
        return;
      }
      _authToast('Google সাইন-ইন সম্পন্ন হয়নি: ' + ((err && (err.code || err.message)) || 'unknown'), 'error');
    });
}
try { _completeGoogleRedirect(); } catch(e){ console.warn('[Auth] redirect init', e); }

// ════════════════════════════════════════════════════════════════════
// 🔁 SILENT SESSION RESTORE — একবার সাইন-ইন করলে চিরকাল signed-in
//   সমস্যা: "logged-in" অবস্থা আসলে server-এর PHP session ($_SESSION)।
//   PHP idle session কিছুক্ষণ (gc_maxlifetime) পর মুছে দেয় / cookie মেয়াদ
//   শেষ হয় → reload-এ BA_AUTH null → "logged out" দেখায়, সার্ভার অ্যাকশন
//   ব্যর্থ হয় → বারবার সাইন-ইন করতে হয়।
//   সমাধান: Firebase ব্যবহারকারীকে ব্রাউজারে স্থায়ীভাবে (LOCAL persistence)
//   মনে রাখে — manually logout/clear না করা পর্যন্ত। তাই server session না
//   থাকলে Firebase-এর persisted user দিয়ে নীরবে token পাঠিয়ে session আবার
//   বানিয়ে ফেলি। ব্যবহারকারী কিছুই টের পায় না।
// ════════════════════════════════════════════════════════════════════

// persistence স্পষ্টভাবে LOCAL — ব্রাউজার/PWA বন্ধ করলেও Firebase user থাকে
try {
  if (_fbAuth && _fbAuth.setPersistence && firebase.auth && firebase.auth.Auth) {
    _fbAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function(){});
  }
} catch(e) { console.warn('[Auth] setPersistence', e); }

// server session জীবিত কিনা — BA_AUTH (PHP থেকে inject) বা সদ্য-তৈরি flag
function _serverSessionAlive() {
  try { if (typeof BA_AUTH !== 'undefined' && BA_AUTH) return true; } catch(e){}
  return !!window._baServerSession;
}

// app.js (BA_AUTH + CSRF_TOKEN) লোড হওয়া পর্যন্ত অপেক্ষা — head-init আগে চলে
function _whenAppReady(cb, tries) {
  tries = tries || 0;
  if (typeof BA_AUTH !== 'undefined' && typeof CSRF_TOKEN !== 'undefined') { cb(); return; }
  if (tries > 40) { cb(); return; } // ~6s ceiling — তবু একবার চেষ্টা করি
  setTimeout(function(){ _whenAppReady(cb, tries + 1); }, 150);
}

var _baSilentReauthDone = false;
function _silentRestoreSession(user) {
  if (_baSilentReauthDone) return;        // প্রতি page-load-এ একবারই
  if (window._baLoggingOut) return;       // logout চলছে — হাত দিও না
  if (!user) return;                      // Firebase-এ কেউ নেই → কিছু করার নেই
  // interactive sign-in (popup/redirect) চলমান থাকলে সেটাই session বানাবে
  try { if (sessionStorage.getItem('ba_g_redirect') === '1') return; } catch(e){}
  if (_serverSessionAlive()) return;      // session আছে → দরকার নেই
  _baSilentReauthDone = true;
  user.getIdToken()
    .then(function(idToken){ return _postAuthToServer(idToken); })
    .then(function(res){
      if (res && res.status === 'success') {
        window._baServerSession = true;
        try { localStorage.setItem('ba_auth', JSON.stringify({
          provider: res.provider, email: res.email, phone: res.phone, name: res.name, photo: res.photo,
          verified: !!res.verified, verify_channel: res.verify_channel || null,
          verify_phone: res.verify_phone || res.phone || null, has_donor: !!res.has_donor
        })); } catch(e){}
        // BA_AUTH const — runtime-এ বদলানো যায় না; _renderAuthState localStorage থেকেও নেয়
        if (typeof _renderAuthState === 'function') _renderAuthState();
      } else {
        // token invalid/expired হলে আবার চেষ্টার সুযোগ রাখি
        _baSilentReauthDone = false;
      }
    })
    .catch(function(err){ _baSilentReauthDone = false; console.warn('[Auth] silent restore', err); });
}

try {
  if (_fbAuth && _fbAuth.onAuthStateChanged) {
    _fbAuth.onAuthStateChanged(function(user){
      _whenAppReady(function(){ _silentRestoreSession(user); });
    });
  }
} catch(e) { console.warn('[Auth] onAuthStateChanged init', e); }

// ── সফল login হলে ──
function _onAuthSuccess(res) {
  window._baServerSession = true; // session তৈরি হয়েছে — silent restore-কে duplicate করতে দিও না
  _authWait(false); _gRedirectFlag(false);
  try { localStorage.setItem('ba_auth', JSON.stringify({
    provider: res.provider, email: res.email, phone: res.phone, name: res.name, photo: res.photo,
    verified: !!res.verified, verify_channel: res.verify_channel || null,
    verify_phone: res.verify_phone || res.phone || null, has_donor: !!res.has_donor
  })); } catch(e){}
  if (typeof closeAuthModal === 'function') closeAuthModal();
  var who = res.name || res.email || res.phone || 'User';
  _authToast('✅ স্বাগতম, ' + who + '!', 'success');
  if (typeof _renderAuthState === 'function') _renderAuthState();

  // ── Registration tab context: update step indicator (no page reload) ──
  var isRegTab = document.getElementById('tab0') && document.getElementById('tab0').classList.contains('active');
  if (isRegTab) {
    // Update step indicator
    var stepInd = document.getElementById('regStepIndicator');
    if (stepInd) stepInd.style.display = 'flex';
    if (typeof regUpdateSteps === 'function') {
      if (res.verified) {
        // Already verified → step 1+2 done, step 3 active
        regUpdateSteps(3);
      } else {
        // Signed in but not yet verified → step 1 done, step 2 active
        regUpdateSteps(2);
      }
    }
    // If already registered → show regAlreadyRegistered (handled by _renderAuthState)
    // No redirect, no reload — stay on same page
  }

  // Auto-resume a pending Emergency Request (user tapped it while signed out).
  var _emgPending = window._pendingEmergencyRequest;
  try { if (sessionStorage.getItem('ba_pending_emg') === '1') _emgPending = true; } catch(e){}
  if (_emgPending) {
    window._pendingEmergencyRequest = false;
    try { sessionStorage.removeItem('ba_pending_emg'); } catch(e){}
    if (typeof openBloodRequestModal === 'function') {
      setTimeout(function(){ openBloodRequestModal(); }, 300);
    }
    return;
  }
  // verified না হলে account bind করতে উৎসাহ দাও (call করতে লাগবে)
  // Registration tab-এ inline verify panel (step 2) থাকে, তাই modal popup unnecessary
  if (!res.verified && typeof _promptBindIfUnverified === 'function') {
    var _isRegTab = document.getElementById('tab0') && document.getElementById('tab0').classList.contains('active');
    if (!_isRegTab) {
      setTimeout(function(){ _promptBindIfUnverified(); }, 900);
    }
  }
  // donor হিসেবে register করা না থাকলে registration section-এ scroll করো (no page reload)
  if (!res.linked_donor && res.phone && isRegTab) {
    var prompt = document.getElementById('regAuthPrompt');
    if (prompt) {
      setTimeout(function(){ prompt.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 600);
    }
  } else if (!res.linked_donor && res.phone && typeof appSwitchPage === 'function') {
    setTimeout(function(){ appSwitchPage('register'); }, 800);
  }
}

// ── ba_auth localStorage-এ verified flag আপডেট করো (bind সফল হলে) ──
function _setLocalVerified(channel, phone) {
  try {
    var a = JSON.parse(localStorage.getItem('ba_auth') || 'null') || {};
    a.verified = true; a.verify_channel = channel || a.verify_channel || null;
    if (phone) a.verify_phone = phone;
    localStorage.setItem('ba_auth', JSON.stringify(a));
  } catch(e){}
  try { if (typeof BA_AUTH !== 'undefined' && BA_AUTH) { BA_AUTH.verified = true; BA_AUTH.verify_channel = channel; if (phone) BA_AUTH.verify_phone = phone; } } catch(e){}
}

// ── Logout ──
// লগ-আউট মানেই full clean: Firebase sign-out → server session শেষ →
// সব localStorage/sessionStorage মুছে → Service Worker unregister + caches clear →
// cache-busting param দিয়ে hard reload। যাতে কোনো cached/stale data থেকে না যায়।
function authLogout() {
  // একাধিকবার ক্লিক হলে duplicate চালাবে না
  if (window._baLoggingOut) return;
  window._baLoggingOut = true;

  // loader দেখাও (থাকলে)
  try {
    var pl = document.getElementById('pageLoader');
    if (pl) pl.classList.add('loader-show');
  } catch(e){}

  // Firebase persisted user মুছে ফেলা reload-এর আগে শেষ হওয়া আবশ্যক —
  // নইলে নতুন silent-restore লজিক persisted user দিয়ে session আবার বানিয়ে
  // ফেলবে আর logout "উল্টে" যাবে। তাই signOut promise টা await করি।
  var fbSignOut = Promise.resolve();
  try { if (_fbAuth) fbSignOut = _fbAuth.signOut().catch(function(){}); } catch(e){}

  var url = window.location.origin + window.location.pathname;

  // server session শেষ করার POST — reload-এর আগে শেষ হওয়া জরুরি
  var fd = new FormData();
  fd.append('firebase_logout', '1');
  fd.append('csrf_token', (typeof CSRF_TOKEN !== 'undefined') ? CSRF_TOKEN : '');
  var serverLogout = fetch(url, { method:'POST', body:fd }).catch(function(){});

  // সব client-side storage মুছে দাও
  try { localStorage.clear(); } catch(e){}
  try { sessionStorage.clear(); } catch(e){}

  // Service Worker unregister + সব Cache API caches মুছে দাও
  var clearCaches = Promise.resolve();
  try {
    if ('serviceWorker' in navigator) {
      clearCaches = navigator.serviceWorker.getRegistrations()
        .then(function(regs){ return Promise.all(regs.map(function(r){ return r.unregister(); })); })
        .catch(function(){});
    }
    if ('caches' in window) {
      var c = caches.keys()
        .then(function(keys){ return Promise.all(keys.map(function(k){ return caches.delete(k); })); })
        .catch(function(){});
      clearCaches = Promise.all([clearCaches, c]);
    }
  } catch(e){}

  // সব শেষ হলে cache-busting param দিয়ে hard reload
  Promise.all([fbSignOut, serverLogout, clearCaches]).catch(function(){}).then(function(){
    var bust = window.location.origin + window.location.pathname + '?_cache_bust=' + Date.now();
    window.location.replace(bust);
  });
}

// ════════════════════════════════════════════════════════════════════
// 🔗 ACCOUNT VERIFICATION — Telegram (প্রস্তাবিত) + WhatsApp bot OTP
//   দুটোই একই flow: নম্বর দাও → bot কোড পাঠায় → কোড বসাও → verified।
//   bind না করলে account unverified — blood request করা যাবে, call নয়।
// ════════════════════════════════════════════════════════════════════
function _verifyPost(field, extra) {
  var url = window.location.origin + window.location.pathname;
  var fd = new FormData();
  fd.append(field, '1');
  fd.append('csrf_token', (typeof CSRF_TOKEN !== 'undefined') ? CSRF_TOKEN : '');
  if (extra) Object.keys(extra).forEach(function(k){ fd.append(k, extra[k]); });
  return fetch(url, { method:'POST', body:fd })
    .then(function(r){ return (typeof safeJSON === 'function') ? safeJSON(r) : r.json(); });
}

// সফল bind হলে সবখানে verified state ছড়িয়ে দাও
function _onVerifySuccess(channel, msg, phone) {
  _setLocalVerified(channel, phone);
  _authToast(msg || '✅ অ্যাকাউন্ট verified!', 'success');

  // ── Inline registration verify path (no modal) ──
  var inlinePanel = document.getElementById('regInlineVerifyPanel');
  if (inlinePanel && inlinePanel.style.display !== 'none' && inlinePanel.style.display !== '') {
    // Hide the inline panel with animation (before _renderAuthState hides regAuthPrompt)
    inlinePanel.style.opacity = '0';
    inlinePanel.style.transform = 'translateY(-10px)';
    setTimeout(function() {
      inlinePanel.style.display = 'none';
      // Now safe to sync UI state (panel animation completed)
      if (typeof _renderAuthState === 'function') _renderAuthState();
    }, 300);

    // Hide verify block
    var vBlock = document.getElementById('regVerifyBlock');
    if (vBlock) vBlock.style.display = 'none';

    // Update step indicator: step 3 active
    if (typeof regUpdateSteps === 'function') regUpdateSteps(3);

    // Show regForm with animation
    var form = document.getElementById('regForm');
    if (form && form.style.display === 'none') {
      if (typeof toggleRegForm === 'function') toggleRegForm();
    }

    // Auto-scroll to form
    setTimeout(function() {
      var container = document.getElementById('regForm');
      if (container) container.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 400);

    return;
  }

  // ── Auth modal path (existing) ──
  var am = document.getElementById('accountModal');
  if (am && am.classList.contains('active') && typeof openAccountDashboard === 'function') openAccountDashboard();
  if (typeof closeAuthModal === 'function') closeAuthModal();
  if (typeof _renderAuthState === 'function') _renderAuthState();
}

// ── Verify channel selector — একসাথে একটাই panel খোলে (Telegram বা Phone) ──
function selectVerifyChannel(ch) {
  var tgP = document.getElementById('tgPanel');
  var smsP = document.getElementById('smsPanel');
  var tgB = document.getElementById('vchTgBtn');
  var smsB = document.getElementById('vchPhoneBtn');
  if (tgP) tgP.style.display = (ch === 'tg') ? 'block' : 'none';
  if (smsP) smsP.style.display = (ch === 'phone') ? 'block' : 'none';
  if (ch === 'phone') {
    if (smsB) { smsB.style.borderColor = '#6b7280'; smsB.style.background = 'rgba(107,114,128,0.10)'; }
    if (tgB) { tgB.style.borderColor = 'var(--border-color)'; tgB.style.background = 'transparent'; }
    _smsGenerateCaptcha();
    // আগের cooldown বাকি থাকলে countdown আবার চালু করো
    _otpResumeCooldown('smsSendOtpBtn', '📱 আবার পাঠান', 'ba_otp_cd_sms');
    _otpResumeCooldown('smsResendBtn', '🔄 আবার OTP পাঠান', 'ba_otp_cd_sms');
  } else {
    if (tgB) { tgB.style.borderColor = '#229ED9'; tgB.style.background = 'rgba(34,158,217,0.10)'; }
    if (smsB) { smsB.style.borderColor = 'var(--border-color)'; smsB.style.background = 'transparent'; }
  }
}

// ── Telegram — Step 1: OTP prepare করো, deep link দিয়ে bot খোলো ──
//  মোবাইলে async .then()-এর ভেতরে window.open() ব্লক হয় (user-gesture হারায়) →
//  তাই click-এর সাথে সাথেই একটা blank tab খুলে রাখি, server response এলে সেই
//  tab-টাকে bot link-এ পাঠাই। এতে মূল সাইটের tab reload হয় না।
function tgSendOtp() {
  if (_tgPollTimer) { clearInterval(_tgPollTimer); _tgPollTimer = null; }
  _authBusy(true, 'tgSendOtpBtn');
  _verifyPost('tg_send_otp', {}).then(function(res){
    _authBusy(false, 'tgSendOtpBtn');
    if (res && res.status === 'open_bot' && res.link) {
      var link = res.link;
      var div = document.getElementById('tgOpenBotDiv');
      if (div) div.style.display = 'block';
      var a = document.getElementById('tgOpenBotBtn');
      if (a) a.href = link;
      var status = document.getElementById('tgPollStatus');
      if (status) {
        status.style.display = 'block';
        status.innerHTML = '⏳ Telegram-এ গিয়ে "Share My Number" বাটনে চাপ দিন...';
      }
      try { window.open(link, '_blank'); } catch(e){}
      _authToast('Telegram খুলুন — "Share My Number" বাটনে চাপ দিন。', 'info');
      _tgStartPolling(res.token);
    } else {
      _authToast((res && res.msg) ? res.msg : 'Telegram verify শুরু করা যায়নি。', 'error');
    }
  }).catch(function(){
    _authBusy(false, 'tgSendOtpBtn');
    _authToast('নেটওয়ার্ক সমস্যা।', 'error');
  });
}

var _tgPollTimer = null;

function _tgStartPolling(token) {
  if (_tgPollTimer) clearInterval(_tgPollTimer);
  var elapsed = 0;
  _tgPollTimer = setInterval(function(){
    elapsed += 2000;
    var fd = new FormData();
    fd.append('tg_check_verify', '1');
    fd.append('token', token);
    fd.append('csrf_token', (typeof CSRF_TOKEN !== 'undefined') ? CSRF_TOKEN : '');
    fetch(window.location.origin + window.location.pathname, { method:'POST', body:fd })
      .then(function(r){ return (typeof safeJSON === 'function') ? safeJSON(r) : r.json(); })
      .then(function(res){
        if (res && res.status === 'verified') {
          clearInterval(_tgPollTimer);
          _tgPollTimer = null;
          var status = document.getElementById('tgPollStatus');
          if (status) { status.innerHTML = '✅ Verified!'; status.style.color = '#10b981'; }
          _onVerifySuccess('telegram', '✅ Telegram দিয়ে verify সম্পন্ন!', res.phone);
        } else if (res && res.status === 'expired') {
          clearInterval(_tgPollTimer);
          _tgPollTimer = null;
          var status = document.getElementById('tgPollStatus');
          if (status) { status.innerHTML = '⏰ সময় শেষ। আবার চেষ্টা করুন。'; status.style.color = '#ef4444'; }
          _authToast('সময় শেষ। আবার "Telegram দিয়ে Verify করুন" চাপুন।', 'error');
        }
      }).catch(function(){});
    if (elapsed > 300000 && _tgPollTimer) {
      clearInterval(_tgPollTimer);
      _tgPollTimer = null;
    }
  }, 2000);
}// ── SMS — Math Captcha ──
var _smsCaptchaAnswer = 0;

function _smsGenerateCaptcha() {
  var a = Math.floor(Math.random() * 9) + 1;
  var b = Math.floor(Math.random() * 9) + 1;
  _smsCaptchaAnswer = a + b;
  var display = document.getElementById('smsCaptchaDisplay');
  if (display) display.textContent = a + ' + ' + b + ' = ?';
  var step1 = document.getElementById('smsCaptchaStep');
  if (step1) step1.style.display = '';
  var step2 = document.getElementById('smsSendStep');
  if (step2) step2.style.display = '';
  var step3 = document.getElementById('smsOtpStep');
  if (step3) step3.style.display = 'none';
  var input = document.getElementById('smsCaptchaInput');
  if (input) { input.value = ''; input.focus(); }
  var err = document.getElementById('smsCaptchaError');
  if (err) err.style.display = 'none';
  var phoneInput = document.getElementById('smsPhoneInput');
  if (phoneInput) phoneInput.value = '+880';
  var otpInput = document.getElementById('smsOtpInput');
  if (otpInput) otpInput.value = '';
  _smsCaptchaCheck();
}

function _smsCaptchaCheck() {
  var input = document.getElementById('smsCaptchaInput');
  var err = document.getElementById('smsCaptchaError');
  var btn = document.getElementById('smsSendOtpBtn');
  var val = parseInt((input ? input.value : '').trim(), 10);
  if (val === _smsCaptchaAnswer) {
    if (err) { err.style.display = 'none'; if (input) input.style.borderColor = ''; }
    if (btn) { btn.disabled = false; btn.style.background = '#6b7280'; }
  } else {
    if (val && err) { err.style.display = 'block'; if (input) input.style.borderColor = '#ef4444'; }
    if (btn) { btn.disabled = true; btn.style.background = '#9ca3af'; }
  }
}

// ── SMS — Step 1: কোড পাঠাও ──
function smsSendOtp() {
  var input = document.getElementById('smsPhoneInput');
  var phone = (input ? input.value : '').trim();
  if (/^01\d{9}$/.test(phone)) phone = '+88' + phone;
  if (!/^\+8801\d{9}$/.test(phone)) { _authToast('সঠিক বাংলাদেশি নম্বর দিন।', 'error'); return; }
  _authBusy(true, 'smsSendOtpBtn');
  _verifyPost('sms_send_otp', { phone: phone }).then(function(res){
    _authBusy(false, 'smsSendOtpBtn');
    if (res && res.status === 'success') {
      var step1 = document.getElementById('smsCaptchaStep');
      if (step1) step1.style.display = 'none';
      var step2 = document.getElementById('smsSendStep');
      if (step2) step2.style.display = 'none';
      var step3 = document.getElementById('smsOtpStep');
      if (step3) step3.style.display = 'block';
      _otpCountdown('smsSendOtpBtn', res.wait || 300, '📱 আবার পাঠান', 'ba_otp_cd_sms');
      _otpTriesLeft('smsTriesLeft', res.remaining);
      _otpCountdown('smsResendBtn', res.wait || 300, '🔄 আবার OTP পাঠান', 'ba_otp_cd_sms');
      _authToast(res.msg || '📲 SMS-এ কোড পাঠানো হয়েছে।', 'success');
    } else {
      // blocked (cooldown/hourly) — wait থাকলে countdown চালু করো
      if (res && res.wait) {
        _otpCountdown('smsSendOtpBtn', res.wait, '📱 আবার পাঠান', 'ba_otp_cd_sms');
        _otpCountdown('smsResendBtn', res.wait, '🔄 আবার OTP পাঠান', 'ba_otp_cd_sms');
        if (res.remaining != null) _otpTriesLeft('smsTriesLeft', res.remaining);
      }
      _authToast((res && res.msg) ? res.msg : 'কোড পাঠানো যায়নি।', 'error');
    }
  }).catch(function(){ _authBusy(false, 'smsSendOtpBtn'); _authToast('নেটওয়ার্ক সমস্যা।', 'error'); });
}

// ── SMS — Step 2: কোড যাচাই ──
function smsVerifyOtp() {
  var el = document.getElementById('smsOtpInput');
  var code = (el ? el.value : '').trim();
  if (!/^\d{6}$/.test(code)) { _authToast('৬-সংখ্যার কোড দিন।', 'error'); return; }
  _authBusy(true, 'smsVerifyBtn');
  _verifyPost('sms_verify_otp', { code: code }).then(function(res){
    _authBusy(false, 'smsVerifyBtn');
    if (res && res.status === 'success') _onVerifySuccess('phone', res.msg, res.phone);
    else _authToast((res && res.msg) ? res.msg : 'যাচাই ব্যর্থ।', 'error');
  }).catch(function(){ _authBusy(false, 'smsVerifyBtn'); _authToast('নেটওয়ার্ক সমস্যা।', 'error'); });
}

// ════════════════════════════════════════════════════════════════════
// 🔄 CHANGE NUMBER — Update My Info থেকে registered নম্বর বদলানোর ছোট UI
//   authModal-এর verify section reuse না করে আলাদা #changeNumberModal।
//   নতুন নম্বর Telegram contact-share দিয়ে verify হলেই donor নম্বর আপডেট হয়।
// ════════════════════════════════════════════════════════════════════

function openChangeNumberModal() {
  ['cnOpenBotDiv','cnPollStatus'].forEach(function(id){ var e=document.getElementById(id); if(e) e.style.display='none'; });
  var p = document.getElementById('cnPhoneInput'); if (p) p.value = '+880';
  var m = document.getElementById('changeNumberModal'); if (m) m.classList.add('active');
  if (typeof _cnPollTimer === 'number' && _cnPollTimer) { clearInterval(_cnPollTimer); _cnPollTimer = null; }
}
function closeChangeNumberModal() {
  var m = document.getElementById('changeNumberModal'); if (m) m.classList.remove('active');
  ['cnOpenBotDiv','cnPollStatus'].forEach(function(id){ var e=document.getElementById(id); if(e) e.style.display='none'; });
  if (typeof _cnPollTimer === 'number' && _cnPollTimer) { clearInterval(_cnPollTimer); _cnPollTimer = null; }
}

// Step 1: নতুন নম্বরে কোড পাঠাও
function cnSendOtp() {
  if (_cnPollTimer) { clearInterval(_cnPollTimer); _cnPollTimer = null; }
  var input = document.getElementById('cnPhoneInput');
  var phone = (input ? input.value : '').trim();
  if (/^01\d{9}$/.test(phone)) phone = '+88' + phone;
  if (!/^\+8801\d{9}$/.test(phone)) { _authToast('সঠিক বাংলাদেশি নম্বর দিন।', 'error'); return; }
  _authBusy(true, 'cnSendOtpBtn');
  _verifyPost('cn_send_otp', { phone: phone }).then(function(res){
    _authBusy(false, 'cnSendOtpBtn');
    if (res && res.status === 'open_bot' && res.link) {
      var link = res.link;
      var div = document.getElementById('cnOpenBotDiv');
      if (div) div.style.display = 'block';
      var a = document.getElementById('cnOpenBotBtn');
      if (a) a.href = link;
      var status = document.getElementById('cnPollStatus');
      if (status) {
        status.style.display = 'block';
        status.innerHTML = '⏳ Telegram-এ গিয়ে "Share My Number" বাটনে চাপ দিন...';
      }
      try { window.open(link, '_blank'); } catch(e){}
      _authToast('Telegram খুলুন — "Share My Number" বাটনে চাপ দিন।', 'info');
      _cnStartPolling(res.token);
    } else {
      _authToast((res && res.msg) ? res.msg : 'Telegram verify শুরু করা যায়নি।', 'error');
    }
  }).catch(function(){
    _authBusy(false, 'cnSendOtpBtn');
    _authToast('নেটওয়ার্ক সমস্যা।', 'error');
  });
}

var _cnPollTimer = null;

function _cnStartPolling(token) {
  if (_cnPollTimer) clearInterval(_cnPollTimer);
  var elapsed = 0;
  _cnPollTimer = setInterval(function(){
    elapsed += 2000;
    if (elapsed >= 300000) {
      clearInterval(_cnPollTimer); _cnPollTimer = null;
      var s = document.getElementById('cnPollStatus');
      if (s) { s.innerHTML = '⏱ সময় শেষ। আবার চেষ্টা করুন।'; s.style.color = '#ef4444'; }
      _authToast('সময় শেষ। আবার চেষ্টা করুন।', 'error');
      return;
    }
    var fd = new FormData();
    fd.append('tg_check_verify', '1');
    fd.append('token', token);
    fd.append('csrf_token', (typeof CSRF_TOKEN !== 'undefined') ? CSRF_TOKEN : '');
    fetch(window.location.origin + window.location.pathname, { method:'POST', body:fd })
      .then(function(r){ return (typeof safeJSON === 'function') ? safeJSON(r) : r.json(); })
      .then(function(res){
        if (res && res.status === 'verified') {
          clearInterval(_cnPollTimer); _cnPollTimer = null;
          var s = document.getElementById('cnPollStatus');
          if (s) { s.innerHTML = '✅ Verified!'; s.style.color = '#10b981'; }
          _authToast('✅ Telegram দিয়ে verify সম্পন্ন! নম্বর বদলানো হচ্ছে...', 'success');
          _cnApplyVerify(token);
        } else if (res && res.status === 'expired') {
          clearInterval(_cnPollTimer); _cnPollTimer = null;
          var s = document.getElementById('cnPollStatus');
          if (s) { s.innerHTML = '⏱ সময় শেষ। আবার চেষ্টা করুন।'; s.style.color = '#ef4444'; }
          _authToast('সময় শেষ। আবার চেষ্টা করুন।', 'error');
        }
      }).catch(function(){});
  }, 2000);
}

function _cnApplyVerify(token) {
  _authBusy(true, 'cnSendOtpBtn');
  _verifyPost('cn_apply_verify', { token: token }).then(function(res){
    _authBusy(false, 'cnSendOtpBtn');
    if (res && res.status === 'success') {
      var newPhone = res.phone || '';
      var disp = document.getElementById('u_phone_display'); if (disp && newPhone) disp.value = newPhone;
      _setLocalVerified('telegram', newPhone);
      _authToast(res.msg || '✅ নম্বর পরিবর্তন হয়েছে!', 'success');
      closeChangeNumberModal();
      if (typeof _renderAuthState === 'function') _renderAuthState();
    } else {
      _authToast((res && res.msg) ? res.msg : 'নম্বর বদলানো যায়নি।', 'error');
    }
  }).catch(function(){ _authBusy(false, 'cnSendOtpBtn'); _authToast('নেটওয়ার্ক সমস্যা।', 'error'); });
}

// ════════════════════════════════════════════════════════════════════
// 🔗 REGISTRATION INLINE VERIFY — registration tab-এর ভেতরেই verify
//   authModal-এর verify section-এর duplicate, কিন্তু reg* prefix IDs নিয়ে।
//   একই backend endpoints (_verifyPost) ব্যবহার করে।
// ════════════════════════════════════════════════════════════════════

// ── Reg Verify channel selector ──
function regSelectVerifyChannel(ch) {
  var tgP = document.getElementById('regTgPanel');
  var smsP = document.getElementById('regSmsPanel');
  var tgB = document.getElementById('regVchTgBtn');
  var smsB = document.getElementById('regVchPhoneBtn');
  if (tgP) tgP.style.display = (ch === 'tg') ? 'block' : 'none';
  if (smsP) smsP.style.display = (ch === 'phone') ? 'block' : 'none';
  if (ch === 'phone') {
    if (smsB) { smsB.style.borderColor = '#6b7280'; smsB.style.background = 'rgba(107,114,128,0.10)'; }
    if (tgB) { tgB.style.borderColor = 'var(--border-color)'; tgB.style.background = 'transparent'; }
    _regSmsGenerateCaptcha();
    _otpResumeCooldown('regSmsSendOtpBtn', '📱 আবার পাঠান', 'ba_otp_cd_reg_sms');
    _otpResumeCooldown('regSmsResendBtn', '🔄 আবার OTP পাঠান', 'ba_otp_cd_reg_sms');
  } else {
    if (tgB) { tgB.style.borderColor = '#229ED9'; tgB.style.background = 'rgba(34,158,217,0.10)'; }
    if (smsB) { smsB.style.borderColor = 'var(--border-color)'; smsB.style.background = 'transparent'; }
  }
}

// ── Reg SMS — Math Captcha ──
var _regSmsCaptchaAnswer = 0;

function _regSmsGenerateCaptcha() {
  var a = Math.floor(Math.random() * 9) + 1;
  var b = Math.floor(Math.random() * 9) + 1;
  _regSmsCaptchaAnswer = a + b;
  var display = document.getElementById('regSmsCaptchaDisplay');
  if (display) display.textContent = a + ' + ' + b + ' = ?';
  var step1 = document.getElementById('regSmsCaptchaStep');
  if (step1) step1.style.display = '';
  var step2 = document.getElementById('regSmsSendStep');
  if (step2) step2.style.display = '';
  var step3 = document.getElementById('regSmsOtpStep');
  if (step3) step3.style.display = 'none';
  var input = document.getElementById('regSmsCaptchaInput');
  if (input) { input.value = ''; input.focus(); }
  var err = document.getElementById('regSmsCaptchaError');
  if (err) err.style.display = 'none';
  var phoneInput = document.getElementById('regSmsPhoneInput');
  if (phoneInput) phoneInput.value = '+880';
  var otpInput = document.getElementById('regSmsOtpInput');
  if (otpInput) otpInput.value = '';
  _regSmsCaptchaCheck();
}

function _regSmsCaptchaCheck() {
  var input = document.getElementById('regSmsCaptchaInput');
  var err = document.getElementById('regSmsCaptchaError');
  var btn = document.getElementById('regSmsSendOtpBtn');
  var val = parseInt((input ? input.value : '').trim(), 10);
  if (val === _regSmsCaptchaAnswer) {
    if (err) { err.style.display = 'none'; if (input) input.style.borderColor = ''; }
    if (btn) { btn.disabled = false; btn.style.background = '#6b7280'; }
  } else {
    if (val && err) { err.style.display = 'block'; if (input) input.style.borderColor = '#ef4444'; }
    if (btn) { btn.disabled = true; btn.style.background = '#9ca3af'; }
  }
}

// ── Reg Telegram — Contact-Share verify (no manual OTP typing) ──
var _regTgPollTimer = null;
var _regTgToken = null;

function regTgSendOtp() {
  if (_regTgPollTimer) { clearInterval(_regTgPollTimer); _regTgPollTimer = null; }
  _authBusy(true, 'regTgSendOtpBtn');
  _verifyPost('tg_send_otp', {}).then(function(res){
    _authBusy(false, 'regTgSendOtpBtn');
    if (res && res.status === 'open_bot' && res.link) {
      _regTgToken = res.token;
      var link = res.link;
      var div = document.getElementById('regTgOpenBotDiv');
      if (div) div.style.display = 'block';
      var a = document.getElementById('regTgOpenBotBtn');
      if (a) a.href = link;
      var status = document.getElementById('regTgPollStatus');
      if (status) {
        status.style.display = 'block';
        status.innerHTML = '⏳ Telegram-এ গিয়ে "Share My Number" বাটনে চাপ দিন...';
      }
      try { window.open(link, '_blank'); } catch(e){}
      _authToast('Telegram খুলুন — "Share My Number" বাটনে চাপ দিন。', 'info');
      _regTgStartPolling(res.token);
    } else {
      _authToast((res && res.msg) ? res.msg : 'Telegram verify শুরু করা যায়নি।', 'error');
    }
  }).catch(function(){
    _authBusy(false, 'regTgSendOtpBtn');
    _authToast('নেটওয়ার্ক সমস্যা।', 'error');
  });
}

function _regTgStartPolling(token) {
  if (_regTgPollTimer) clearInterval(_regTgPollTimer);
  var elapsed = 0;
  _regTgPollTimer = setInterval(function(){
    elapsed += 2000;
    var fd = new FormData();
    fd.append('tg_check_verify', '1');
    fd.append('token', token);
    fd.append('csrf_token', (typeof CSRF_TOKEN !== 'undefined') ? CSRF_TOKEN : '');
    fetch(window.location.origin + window.location.pathname, { method:'POST', body:fd })
      .then(function(r){ return (typeof safeJSON === 'function') ? safeJSON(r) : r.json(); })
      .then(function(res){
        if (res && res.status === 'verified') {
          clearInterval(_regTgPollTimer);
          _regTgPollTimer = null;
          var status = document.getElementById('regTgPollStatus');
          if (status) { status.innerHTML = '✅ Verified!'; status.style.color = '#10b981'; }
          _onVerifySuccess('telegram', '✅ Telegram দিয়ে verify সম্পন্ন!', res.phone);
        } else if (res && res.status === 'expired') {
          clearInterval(_regTgPollTimer);
          _regTgPollTimer = null;
          var status = document.getElementById('regTgPollStatus');
          if (status) { status.innerHTML = '⏰ সময় শেষ। আবার চেষ্টা করুন。'; status.style.color = '#ef4444'; }
          _authToast('সময় শেষ। আবার "Telegram দিয়ে Verify করুন" চাপুন।', 'error');
        }
      }).catch(function(){});
    if (elapsed > 300000 && _regTgPollTimer) {
      clearInterval(_regTgPollTimer);
      _regTgPollTimer = null;
    }
  }, 2000);
}

// ── Reg Telegram — কোড যাচাই (REMOVED: contact-share) ──// ── Reg SMS — OTP পাঠাও ──
function regSmsSendOtp() {
  var input = document.getElementById('regSmsPhoneInput');
  var phone = (input ? input.value : '').trim();
  if (/^01\d{9}$/.test(phone)) phone = '+88' + phone;
  if (!/^\+8801\d{9}$/.test(phone)) { _authToast('সঠিক বাংলাদেশি নম্বর দিন।', 'error'); return; }
  _authBusy(true, 'regSmsSendOtpBtn');
  _verifyPost('sms_send_otp', { phone: phone }).then(function(res){
    _authBusy(false, 'regSmsSendOtpBtn');
    if (res && res.status === 'success') {
      var step1 = document.getElementById('regSmsCaptchaStep');
      if (step1) step1.style.display = 'none';
      var step2 = document.getElementById('regSmsSendStep');
      if (step2) step2.style.display = 'none';
      var step3 = document.getElementById('regSmsOtpStep');
      if (step3) step3.style.display = 'block';
      _otpCountdown('regSmsSendOtpBtn', res.wait || 300, '📱 আবার পাঠান', 'ba_otp_cd_reg_sms');
      _otpTriesLeft('regSmsTriesLeft', res.remaining);
      _otpCountdown('regSmsResendBtn', res.wait || 300, '🔄 আবার OTP পাঠান', 'ba_otp_cd_reg_sms');
      _authToast(res.msg || '📲 SMS-এ কোড পাঠানো হয়েছে।', 'success');
    } else {
      if (res && res.wait) {
        _otpCountdown('regSmsSendOtpBtn', res.wait, '📱 আবার পাঠান', 'ba_otp_cd_reg_sms');
        _otpCountdown('regSmsResendBtn', res.wait, '🔄 আবার OTP পাঠান', 'ba_otp_cd_reg_sms');
        if (res.remaining != null) _otpTriesLeft('regSmsTriesLeft', res.remaining);
      }
      _authToast((res && res.msg) ? res.msg : 'কোড পাঠানো যায়নি।', 'error');
    }
  }).catch(function(){ _authBusy(false, 'regSmsSendOtpBtn'); _authToast('নেটওয়ার্ক সমস্যা।', 'error'); });
}

// ── Reg SMS — কোড যাচাই ──
function regSmsVerifyOtp() {
  var el = document.getElementById('regSmsOtpInput');
  var code = (el ? el.value : '').trim();
  if (!/^\d{6}$/.test(code)) { _authToast('৬-সংখ্যার কোড দিন।', 'error'); return; }
  _authBusy(true, 'regSmsVerifyBtn');
  _verifyPost('sms_verify_otp', { code: code }).then(function(res){
    _authBusy(false, 'regSmsVerifyBtn');
    if (res && res.status === 'success') _onVerifySuccess('phone', res.msg, res.phone);
    else _authToast((res && res.msg) ? res.msg : 'যাচাই ব্যর্থ।', 'error');
  }).catch(function(){ _authBusy(false, 'regSmsVerifyBtn'); _authToast('নেটওয়ার্ক সমস্যা।', 'error'); });
}
