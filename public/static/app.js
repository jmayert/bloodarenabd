// ============================================================
// GLOBAL CONSTANTS — defined first, used everywhere
// ============================================================
const CSRF_TOKEN = (window.BA_CONFIG && window.BA_CONFIG.csrfToken) || '';
// Current Firebase-auth session state (from PHP) — null if logged out
const BA_AUTH = (window.BA_CONFIG && window.BA_CONFIG.auth) || {};
// AJAX endpoint — always use pathname (strips ?query from URL bar)
const _AJAX_URL = window.location.origin + window.location.pathname;

// Modern animated tick / cross SVGs for popups (drawn via CSS stroke animation)
const TICK_OK = '<svg class="tick-svg" viewBox="0 0 52 52" aria-hidden="true"><circle class="tick-svg-circle" cx="26" cy="26" r="24" fill="none"/><path class="tick-svg-mark" fill="none" d="M14 27l8 8 16-18"/></svg>';
const TICK_NO = '<svg class="tick-svg" viewBox="0 0 52 52" aria-hidden="true"><circle class="tick-svg-circle" cx="26" cy="26" r="24" fill="none"/><path class="tick-svg-mark" fill="none" d="M17 17l18 18M35 17l-18 18"/></svg>';

// ============================================================
// safeJSON — InfinityFree HTML injection থেকে সুরক্ষা
// InfinityFree response-এর আগে বা পরে HTML inject করে।
// প্রথম { বা [ থেকে শেষ } বা ] পর্যন্ত extract করে parse করা হয়।
// ============================================================
function safeJSON(r) {
    return r.text().then(function(text) {
        // Direct parse — সবচেয়ে ভালো case
        try { return JSON.parse(text); }
        catch(e) {}

        // InfinityFree আগে বা পরে HTML inject করে।
        // প্রথম { খুঁজে শেষ } পর্যন্ত নাও
        var firstObj = text.indexOf('{');
        var lastObj  = text.lastIndexOf('}');
        if (firstObj !== -1 && lastObj > firstObj) {
            try { return JSON.parse(text.substring(firstObj, lastObj + 1)); }
            catch(e2) {}
        }

        // Array response — প্রথম [ থেকে শেষ ]
        var firstArr = text.indexOf('[');
        var lastArr  = text.lastIndexOf(']');
        if (firstArr !== -1 && lastArr > firstArr) {
            try { return JSON.parse(text.substring(firstArr, lastArr + 1)); }
            catch(e3) {}
        }

        // PHP fatal error (e.g. "{main}") আগে থাকলে firstObj {main}-এর { নির্দেশ করে,
        // এবং JSON তার পরে থাকে। শেষ { থেকে শেষ } ট্রাই করো।
        var lastStart = text.lastIndexOf('{');
        if (lastStart !== -1 && lastObj > lastStart && lastStart !== firstObj) {
            try { return JSON.parse(text.substring(lastStart, lastObj + 1)); }
            catch(e4) {}
        }

        // শেষ চেষ্টা — শেষ } পর্যন্ত (পুরনো logic, fallback)
        if (lastObj > 0) {
            try { return JSON.parse(text.substring(0, lastObj + 1)); }
            catch(e5) {}
        }

        // সব fail — raw text console-এ log করো debug-এর জন্য
        console.warn('[safeJSON] parse failed. Raw response:', text.substring(0, 300));
        return { status: 'error', msg: 'Response parse করা যায়নি। আবার চেষ্টা করুন।' };
    });
}

// ============================================================
// SCROLL LOCK — prevents background scroll when any popup/overlay is open
// ============================================================
let _scrollLockCount = 0;
function lockBodyScroll() {
    _scrollLockCount++;
    if (_scrollLockCount === 1) {
        const scrollY = window.scrollY;
        document.body.style.position = 'fixed';
        document.body.style.top = '-' + scrollY + 'px';
        document.body.style.left = '0';
        document.body.style.right = '0';
        document.body.style.overflow = 'hidden';
        document.body.dataset.scrollY = scrollY;
    }
}
function unlockBodyScroll() {
    _scrollLockCount = Math.max(0, _scrollLockCount - 1);
    if (_scrollLockCount === 0) {
        const scrollY = parseInt(document.body.dataset.scrollY || '0', 10);
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.overflow = '';
        window.scrollTo(0, scrollY);
    }
}
function openOverlay(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('active');
    lockBodyScroll();
}
function closeOverlay(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const wasActive = el.classList.contains('active');
    el.classList.remove('active');
    if (wasActive) unlockBodyScroll();
}

// ── Global scroll-lock via MutationObserver on body ──
// Watches for any .popup-overlay or .settings-panel-overlay gaining/losing 'active'
(function() {
    function syncScrollLock() {
        // NOTE: #donorDetailPopup AND #callConfirmPopup are intentionally excluded —
        // locking the body (position:fixed + scrollTo-on-close) made the donor list
        // auto-scroll/jump when opening a card or tapping a card's 📞 call button.
        // Both are fixed/centered overlays, so they need no lock; leaving the page
        // unlocked keeps the clicked donor card exactly in place — no movement.
        const anyOpen = document.querySelector('.popup-overlay.active:not(#donorDetailPopup):not(#callConfirmPopup), .settings-panel-overlay.active');
        if (anyOpen) {
            if (document.body.dataset.scrollLocked !== '1') {
                document.body.dataset.scrollLocked = '1';
                const scrollY = window.scrollY;
                document.body.style.position = 'fixed';
                document.body.style.top = '-' + scrollY + 'px';
                document.body.style.left = '0';
                document.body.style.right = '0';
                document.body.style.overflow = 'hidden';
                document.body.dataset.scrollY = scrollY;
            }
        } else {
            if (document.body.dataset.scrollLocked === '1') {
                document.body.dataset.scrollLocked = '0';
                const scrollY = parseInt(document.body.dataset.scrollY || '0', 10);
                document.body.style.position = '';
                document.body.style.top = '';
                document.body.style.left = '';
                document.body.style.right = '';
                document.body.style.overflow = '';
                window.scrollTo(0, scrollY);
            }
        }
    }

    document.addEventListener('DOMContentLoaded', function() {
        const observer = new MutationObserver(syncScrollLock);
        observer.observe(document.body, { subtree: true, attributeFilter: ['class'], attributes: true });
        syncScrollLock();
    });
})();

// ── Clear App Data: strip ?_cache_bust= from URL after fresh reload ──
(function(){
    if (window.location.search.indexOf('_cache_bust=') !== -1) {
        var clean = window.location.origin + window.location.pathname;
        window.history.replaceState(null, '', clean);
    }
})();

// Prevent backdrop click closing the popup when secret code hasn't been copied yet
document.addEventListener('DOMContentLoaded', function() {
    var popupOverlay = document.getElementById('popup');
    if (popupOverlay) {
        popupOverlay.addEventListener('click', function(e) {
            if (e.target === popupOverlay) {
                // Only allow backdrop-close if: not a success popup, OR secret already copied
                if (lastStatus === 'success' && !secretCopied) {
                    // Shake the copy button to draw attention
                    var copyBtn = document.querySelector('.copy-btn');
                    if (copyBtn) {
                        copyBtn.style.animation = 'none';
                        copyBtn.offsetWidth; // reflow
                        copyBtn.style.animation = 'pulse-red 0.4s ease 3';
                        setTimeout(function() { copyBtn.style.animation = ''; }, 1200);
                    }
                    return; // Block close
                }
                closePopup();
            }
        });
    }
});

// === THEME TOGGLE LOGIC ===
// Search debounce — prevents server request on every keypress
let _searchTimer = null;
function debouncedSearch() {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => fetchFilteredData(1), 400);
}

// ============================================================
// NAVIGATION — smooth scroll + active state + mobile menu
// ============================================================
function navGo(sectionId) {
    const el = document.getElementById(sectionId);
    if (!el) return;

    // Only header now (nav bar removed)
    const hdrH = (document.querySelector('header') || {offsetHeight:76}).offsetHeight;
    const top  = el.getBoundingClientRect().top + window.scrollY - hdrH - 8;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });

    // Donors section — always trigger fresh load
    if (sectionId === 'donorListSection') fetchFilteredData(1);
}



function toggleTheme() {
    const htmlObj = document.documentElement;
    const isLight = htmlObj.getAttribute('data-theme') === 'light';
    if (isLight) {
        // Light → Dark (dark = no data-theme attribute)
        htmlObj.removeAttribute('data-theme');
        localStorage.setItem('theme', 'dark');
    } else {
        htmlObj.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
    }
    // Sync settings panel toggle state + icon
    if (typeof updateSettingsToggles === 'function') updateSettingsToggles();
    // Redraw badge donut for correct bg color
    if (typeof renderBadgeDonut === 'function' && window._lastBadgeData) renderBadgeDonut(window._lastBadgeData);
    // Update Leaflet map tile layer to match new theme
    if (leafletMap && window._mapTileLayer) {
        var _newTileUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
        leafletMap.removeLayer(window._mapTileLayer);
        window._mapTileLayer = L.tileLayer(_newTileUrl, {
            attribution: '© OpenStreetMap © CARTO',
            subdomains: 'abcd',
            maxZoom: 19
        });
        window._mapTileLayer.addTo(leafletMap);
        window._mapTileLayer.bringToBack();
        // Re-apply filters so markers use correct color after theme change
        if (_allMapMarkers.length > 0) setTimeout(function() { applyMapFilter(); }, 100);
        setTimeout(function() { if (leafletMap) leafletMap.invalidateSize(); }, 100);
    }
}
// Apply saved theme immediately on parse (light is the default)
(function(){
    if (localStorage.getItem('theme') !== 'dark') {
        document.documentElement.setAttribute('data-theme','light');
    }
})();
// Sync settings icon on load (in case page loads in light mode)
window.addEventListener('DOMContentLoaded', function() {
    if (typeof updateSettingsToggles === 'function') updateSettingsToggles();
});

// Smart location search with suggestion dropdown


document.addEventListener('mousedown', e => {
    const opt = e.target.closest('.sug-opt[data-v]');
    if (opt) {
        e.preventDefault();
        const v=opt.dataset.v, inp=opt.dataset.inp, sel=opt.dataset.sel;
        document.getElementById(inp).value = v;
        const s = document.getElementById(sel);
        if (s && s.options) { Array.from(s.options).forEach(o => { if(o.value===v) s.value=v; }); }
        else if (s) { s.value = v; }
        const sb = document.getElementById('sb_'+inp);
        if (sb) sb.classList.remove('on');
        if(sel==='locationFilter') fetchFilteredData(1);
    }
});
document.addEventListener('click', e => {
    document.querySelectorAll('.sug-list.on').forEach(b => {
        const inp = document.getElementById(b.id.replace('sb_',''));
        if(inp && !inp.contains(e.target) && !b.contains(e.target)) b.classList.remove('on');
    });
});

let locationPermissionGranted = false;
let currentLocData = "Not provided";
let tempDonorId = null;
let tempCallSourceEl = null;   // ← stores the VISIBLE donor element for auto-scroll
const _calledDonors = new Set(); // tracks donor IDs called this session
let tempName = "";
let tempLoc = "";
let lastStatus = "";
let warningAndTermsAccepted = false; 
let countdownInterval = null;
let secretCopied = false;
let countdownFinished = false;

// ── Mark a donor as called: green indicator but STILL clickable for re-call ──
function markDonorCalled(donorId) {
    if (!donorId) return;
    _calledDonors.add(String(donorId));

    // Style ALL buttons for this donor (desktop row + mobile card)
    // btn-called = green visual cue; button stays clickable so user can call again
    document.querySelectorAll(`button[onclick="prepCall('${donorId}')"]`).forEach(function(b) {
        b.classList.remove('btn-next-blink');
        b.classList.add('btn-called');
        // Red outline on the called/clicked donor card (or desktop row)
        var container = b.closest('.dc') || b.closest('.nearby-card') || b.closest('tr');
        if (container) container.classList.add('donor-called-outline');
        // Tick on left + call icon stays — user sees "called" but can still re-call
        if (b.closest('.dc')) {
            // Mobile card button: ✅ + 📞 stacked / side-by-side
            b.innerHTML = '<span style="font-size:0.65em;line-height:1;display:block;margin-bottom:1px;">✅</span>📞';
            b.title = t('আগে call করা হয়েছে — আবার tap করুন');
        } else {
            // Desktop table button: ✅ tick left, 📞 Call right
            b.innerHTML = '✅ 📞 Call';
            b.title = t('আগে call করা হয়েছে — আবার call করতে ক্লিক করুন');
        }
    });
}

// ── Find and blink the next AVAILABLE (not already called) donor button ──
function blinkNextAvailableDonor(sourceEl) {
    if (!sourceEl) return;
    // Remove old blink from any button still blinking
    document.querySelectorAll('.btn-next-blink').forEach(function(b) {
        b.classList.remove('btn-next-blink');
    });
    var next = sourceEl.nextElementSibling;
    // Walk siblings — skip hidden and already-called
    while (next) {
        if (next.style.display !== 'none' && next.offsetParent !== null) {
            // Find the call button inside this row/card
            var callBtn = next.querySelector('button[onclick^="prepCall("]');
            if (callBtn && !callBtn.classList.contains('btn-called') &&
                !callBtn.disabled && !callBtn.classList.contains('dc-call-btn-disabled')) {
                callBtn.classList.add('btn-next-blink');
                // Auto-remove blink after animation (4 repeats × 0.9s ≈ 3.7s)
                setTimeout(function() { callBtn.classList.remove('btn-next-blink'); }, 4000);
                return;
            }
        }
        next = next.nextElementSibling;
    }
}

// === TOGGLE FORM LOGIC ===
function toggleRegForm() {
    const form = document.getElementById('regForm');
    const btn = document.getElementById('toggleFormBtn');
    
    if(form.style.display === 'none') {
        form.style.display = 'block';
        setTimeout(() => {
            form.style.opacity = '1';
            form.style.transform = 'translateY(0)';
        }, 10);
        btn.innerHTML = "✖ Cancel Registration";
        btn.style.background = "var(--danger)";
        btn.style.color = "#fff";
        btn.style.boxShadow = "0 6px 20px rgba(239, 68, 68, 0.4)";
    } else {
        closeRegForm();
    }
}

function closeRegForm() {
    const form = document.getElementById('regForm');
    const btn = document.getElementById('toggleFormBtn');
    
    form.style.opacity = '0';
    form.style.transform = 'translateY(-15px)';
    
    setTimeout(() => {
        form.style.display = 'none';
    }, 400); 
    
    btn.innerHTML = "📝 Click Here to Register";
    btn.style.background = "var(--success)";
    btn.style.color = "#000";
    btn.style.boxShadow = "0 6px 20px rgba(16, 185, 129, 0.4)";
}

// ── Inline verify panel expand/collapse (registration tab) ──
function expandRegInlineVerify() {
    var panel = document.getElementById('regInlineVerifyPanel');
    if (!panel) return;
    panel.style.display = 'block';
    setTimeout(function() {
        panel.style.opacity = '1';
        panel.style.transform = 'translateY(0)';
    }, 10);
    if (typeof regSelectVerifyChannel === 'function') regSelectVerifyChannel('tg');
    setTimeout(function() {
        var container = document.getElementById('regAuthPrompt');
        if (container) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
}

// ── Step indicator update (inline verify flow) ──
function regUpdateSteps(activeStep) {
    for (var i = 1; i <= 3; i++) {
        var step = document.querySelector('.reg-step[data-step="' + i + '"]');
        if (!step) continue;
        step.classList.remove('reg-step-active', 'reg-step-done');
        if (i < activeStep) {
            step.classList.add('reg-step-done');
        } else if (i === activeStep) {
            step.classList.add('reg-step-active');
        }
    }
    // Show step indicator when steps 2+ are active
    var ind = document.getElementById('regStepIndicator');
    if (ind && activeStep >= 2) {
        ind.style.display = 'flex';
    }
}

// NAME VALIDATION
function validateName(input) {
    input.value = input.value.replace(/[^a-zA-Z\u0980-\u09FF\s]/g, '');
}

function showValidationError(msg) {
    const overlay = document.getElementById("popup");
    const icon = document.getElementById("popupIcon");
    const title = document.getElementById("popupTitle");
    const popupMsg = document.getElementById("popupMsg");
    const notice = document.getElementById("successNotice");
    const okBtn = document.getElementById("popupOkBtn");

    icon.innerHTML = TICK_NO; 
    icon.className = "tick error-tick";
    title.innerText = "Validation Error";
    popupMsg.innerText = msg;
    notice.style.display = "none";
    okBtn.innerHTML = "OK";
    okBtn.disabled = false;
    okBtn.className = "countdown-btn active";
    okBtn.onclick = closePopup;
    if (!overlay.classList.contains('active')) { overlay.classList.add("active"); lockBodyScroll(); }
    else overlay.classList.add("active");
}

// ── Gender-based privacy defaults (point #1) ──────────────────
//  Female → Hide Me ON + Allow Call OFF (default)। Male → Hide Me OFF + Allow Call ON।
//  User কোনো toggle একবার ছুঁলে gender পরিবর্তনে সেটি আর auto-reset হয় না (manual override)।
var _privTouched = { hide:false, call:false };
function syncPrivacyChk(which){
    if(which === 'hide'){
        _privTouched.hide = true;
        var c = document.getElementById('regHideMe');
        document.getElementById('regHideMeVal').value = (c && c.checked) ? '1' : '0';
    } else {
        _privTouched.call = true;
        var c2 = document.getElementById('regAllowCall');
        document.getElementById('regAllowCallVal').value = (c2 && c2.checked) ? '1' : '0';
    }
}
function applyGenderPrivacyDefaults(gender){
    var female = (gender === 'Female');
    if(!_privTouched.hide){
        var h = document.getElementById('regHideMe');
        if(h){ h.checked = female; document.getElementById('regHideMeVal').value = female ? '1' : '0'; }
    }
    if(!_privTouched.call){
        var a = document.getElementById('regAllowCall');
        if(a){ a.checked = !female; document.getElementById('regAllowCallVal').value = female ? '0' : '1'; }
    }
}

// ── Registration location autocomplete (point #3) ─────────────
//  Hospital autocomplete-এর মতো একই OSM/Nominatim provider। Select করলে location
//  field পূরণ হয় (map pick-এর মতোই text সেট করে)।
var _regLocTimer = null;
var _regLocResults = [];
function hideRegLocSuggest(){ var b=document.getElementById('regLocSuggest'); if(b){ b.style.display='none'; b.innerHTML=''; } }
function regLocAutocomplete(q){
    q=(q||'').trim();
    var box=document.getElementById('regLocSuggest');
    if(!box) return;
    if(q.length<3){ hideRegLocSuggest(); return; }
    clearTimeout(_regLocTimer);
    _regLocTimer=setTimeout(function(){
        fetch('https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&countrycodes=bd&accept-language=bn,en&q='+encodeURIComponent(q),{headers:{'Accept-Language':'bn,en'}})
        .then(function(r){return r.json();})
        .then(function(results){
            _regLocResults=results||[];
            if(!_regLocResults.length){ box.innerHTML='<div style="padding:10px 12px;font-size:0.82em;color:var(--text-muted);">কোনো ফলাফল নেই — নিজে লিখুন।</div>'; box.style.display='block'; return; }
            var esc=function(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
            box.innerHTML=_regLocResults.map(function(r,i){ var full=r.display_name||''; var sh=full.length>72?full.slice(0,72)+'…':full; return '<div style="padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--border-color);font-size:0.84em;line-height:1.4;" onmousedown="selectRegLoc('+i+')">📍 '+esc(sh)+'</div>'; }).join('');
            box.style.display='block';
        })
        .catch(function(){ hideRegLocSuggest(); });
    },450);
}
function selectRegLoc(i){
    var r=_regLocResults[i]; if(!r) return;
    var inp=document.getElementById('regExactLocation');
    if(inp) inp.value = r.display_name || inp.value;
    hideRegLocSuggest();
}

// ── Update-form location autocomplete (point #3) — same provider ──
var _uLocTimer = null;
var _uLocResults = [];
function hideULocSuggest(){ var b=document.getElementById('uLocSuggest'); if(b){ b.style.display='none'; b.innerHTML=''; } }
function uLocAutocomplete(q){
    q=(q||'').trim();
    var box=document.getElementById('uLocSuggest');
    if(!box) return;
    if(q.length<3){ hideULocSuggest(); return; }
    clearTimeout(_uLocTimer);
    _uLocTimer=setTimeout(function(){
        fetch('https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&countrycodes=bd&accept-language=bn,en&q='+encodeURIComponent(q),{headers:{'Accept-Language':'bn,en'}})
        .then(function(r){return r.json();})
        .then(function(results){
            _uLocResults=results||[];
            if(!_uLocResults.length){ box.innerHTML='<div style="padding:10px 12px;font-size:0.82em;color:var(--text-muted);">কোনো ফলাফল নেই — নিজে লিখুন।</div>'; box.style.display='block'; return; }
            var esc=function(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
            box.innerHTML=_uLocResults.map(function(r,i){ var full=r.display_name||''; var sh=full.length>72?full.slice(0,72)+'…':full; return '<div style="padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--border-color);font-size:0.84em;line-height:1.4;" onmousedown="selectULoc('+i+')">📍 '+esc(sh)+'</div>'; }).join('');
            box.style.display='block';
        })
        .catch(function(){ hideULocSuggest(); });
    },450);
}
function selectULoc(i){
    var r=_uLocResults[i]; if(!r) return;
    var inp=document.getElementById('u_location');
    if(inp) inp.value = r.display_name || inp.value;
    hideULocSuggest();
}

// REGISTRATION
function submitRegistration() {
    const name = document.querySelector('input[name="name"]').value.trim();
    const phone = document.querySelector('input[name="phone"]').value.trim();
    const locExact = document.getElementById('regExactLocation').value.trim();
    const group = document.querySelector('select[name="group"]').value;
    const lastDonation = document.getElementById('lastDonationHidden').value.trim();
    const gender = (document.getElementById('regGender') || {}).value || '';

    if (!name) return showValidationError("নাম দিতে হবে");
    if (/[^a-zA-Z\u0980-\u09FF\s]/.test(name)) return showValidationError("নামে শুধুমাত্র অক্ষর ও স্পেস থাকতে পারবে");
    if (!phone || !/^\+8801\d{9}$/.test(phone)) return showValidationError("সঠিক ফোন নম্বর দিন (+8801XXXXXXXXX)");
    if (!locExact) return showValidationError("Location লিখুন অথবা Map থেকে Pin করুন");
    if (!group) return showValidationError("রক্তের গ্রুপ নির্বাচন করুন");
    if (!gender) return showValidationError("লিঙ্গ (Male / Female) নির্বাচন করুন");
    if (!lastDonation) return showValidationError("Last Blood Donation Date দিতে হবে");

    // Use exact location directly (no dropdown)
    const finalLocation = locExact;

    checkAndGetLocation(() => {
        const form = document.getElementById('regForm');
        const formData = new FormData(form);
        formData.append('ajax_submit', '1');
        formData.set('location', finalLocation);
        formData.append('device_id', (typeof getDeviceId === 'function') ? getDeviceId() : '');
        const donCount = parseInt(document.getElementById('regDonCountHidden').value)||0;
        formData.set('total_donations_reg', donCount);

        // Show loading state
        const btn = form.querySelector('button[type="button"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:8px;"><span style="width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;display:inline-block;animation:spin 0.7s linear infinite;"></span>অনুগ্রহ করে অপেক্ষা করুন...</span>';
        btn.disabled = true;

        fetch(_AJAX_URL, { method: 'POST', body: formData })
        .then(response => safeJSON(response))
        .then(data => {
            btn.innerHTML = originalText;
            btn.disabled = false;
            
            const overlay = document.getElementById("popup");
            const icon = document.getElementById("popupIcon");
            const title = document.getElementById("popupTitle");
            const msg = document.getElementById("popupMsg");
            const notice = document.getElementById("successNotice");
            const okBtn = document.getElementById("popupOkBtn");

            if(data.status === 'success'){
                lastStatus = "";
                icon.innerHTML = TICK_OK; 
                icon.className = "tick success-tick";
                title.innerText = "✅ সফলভাবে Registered!";
                msg.innerHTML = `রক্তদান করে জীবন বাঁচানোর এই মহৎ উদ্যোগে শামিল হওয়ার জন্য আপনাকে ধন্যবাদ। আপনি Donor List-এ যুক্ত হয়ে গেছেন।
                <div style="margin-top:16px;padding:13px 15px;background:rgba(16,185,129,0.07);border:1px solid rgba(16,185,129,0.22);border-radius:12px;text-align:left;">
                  <strong style="color:var(--text-main);display:block;margin-bottom:7px;">✏️ তথ্য পরিবর্তন করতে চান?</strong>
                  <div style="font-size:0.84em;color:var(--text-muted);line-height:1.75;">
                    যেকোনো সময় <b style="color:var(--text-main);">Google</b> বা <b style="color:var(--text-main);">ফোন নম্বর</b> দিয়ে সাইন ইন করে
                    <b style="color:var(--info);">Update My Info</b> অথবা <b style="color:var(--info);">👤 আমার অ্যাকাউন্ট</b> থেকে নাম, location,
                    availability সব বদলাতে পারবেন। কোনো Secret Code মনে রাখার দরকার নেই!
                  </div>
                </div>`;
                
                notice.style.display = "none";
                document.getElementById("successSound").play();
                confetti({ particleCount: 200, spread: 120, origin: { y: 0.6 }, colors:['#dc2626', '#f59e0b', '#10b981'] });
                
                form.reset();
                _privTouched = { hide:false, call:false }; // privacy toggles → gender-default আবার সক্রিয়
                document.getElementsByName('phone')[0].value = "+880";
                setDonationNever();
                closeRegForm();
                // এই account এখন registered — register tab "Already Registered" দেখাবে
                _markHasDonorLocal();

                // OK immediately clickable — no countdown, no page reload
                okBtn.innerHTML = "✅ OK";
                okBtn.disabled = false;
                okBtn.className = "countdown-btn active";
                okBtn.onclick = function() {
                    document.getElementById("popup").classList.remove("active");
                    unlockBodyScroll();
                    fetchFilteredData(1);
                };
            } else {
                lastStatus = "error";
                icon.innerHTML = TICK_NO; 
                icon.className = "tick error-tick";
                title.innerText = "Registration Failed";
                msg.innerText = data.msg || "Something went wrong.";
                notice.style.display = "none";
                okBtn.innerHTML = "OK";
                okBtn.disabled = false;
                okBtn.className = "countdown-btn active";
                okBtn.onclick = closePopup;
            }
            overlay.classList.add("active");
        })
        .catch(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
            
            const overlay = document.getElementById("popup");
            const icon = document.getElementById("popupIcon");
            const title = document.getElementById("popupTitle");
            const msg = document.getElementById("popupMsg");
            const okBtn = document.getElementById("popupOkBtn");
            icon.innerHTML = TICK_NO; 
            icon.className = "tick error-tick";
            title.innerText = "Network Error";
            msg.innerText = "Server connection failed. Please check your internet.";
            okBtn.innerHTML = "OK";
            okBtn.disabled = false;
            okBtn.className = "countdown-btn active";
            okBtn.onclick = closePopup;
            overlay.classList.add("active");
        });
    });
}

function startCountdown(btn, onDone) {
    if(countdownInterval) clearInterval(countdownInterval);
    let timeLeft = 5;
    btn.innerHTML = `OK (${timeLeft})`;
    btn.disabled = true;
    btn.className = "countdown-btn";
    
    countdownInterval = setInterval(() => {
        timeLeft--;
        btn.innerHTML = `OK (${timeLeft})`;
        if(timeLeft <= 0){
            clearInterval(countdownInterval);
            countdownFinished = true;
            btn.innerHTML = "OK";
            if(secretCopied) {
                btn.disabled = false;
                btn.className = "countdown-btn active";
                if (onDone) btn.onclick = onDone;
            }
        }
    }, 1000);
}

function closePopup(){
    const el = document.getElementById("popup");
    if (el && el.classList.contains('active')) { el.classList.remove("active"); unlockBodyScroll(); }
    lastStatus = ""; 
}

function closeAboutUs(){
    closeInfoPage();
}

// NOTE: These now route to the dedicated info pages in #infoPageOverlay.
// (The onboarding consent flow uses showTerms()/termsPopupOverlay directly and is unaffected.)
function openTermsModal() {
    openInfoPage('privacy');
}

function openAboutUsModal() {
    openInfoPage('about');
}

// DELETE ACCOUNT MODAL
function openDeleteAccountModal() {
    var m = document.getElementById('deleteAccountModal');
    if (!m) return;
    // Reset
    var inp = document.getElementById('del_account_confirm');
    if (inp) inp.value = '';
    var e1 = document.getElementById('del_account_confirm_err');
    if (e1) e1.style.display = 'none';
    var e2 = document.getElementById('del_account_server_err');
    if (e2) e2.style.display = 'none';
    var sp = document.getElementById('del_account_spinner');
    if (sp) sp.style.display = 'none';
    var btn = document.getElementById('del_account_btn');
    if (btn) { btn.disabled = false; btn.style.display = 'block'; btn.textContent = '🗑️ হ্যাঁ, আমার সকল তথ্য মুছে দিন'; }
    m.classList.add('active'); lockBodyScroll();
}
function closeDeleteAccountModal() {
    var m = document.getElementById('deleteAccountModal');
    if (m) m.classList.remove('active'); unlockBodyScroll();
}
function submitFullDeleteAccount() {
    var inp = document.getElementById('del_account_confirm');
    var confirmVal = inp ? inp.value.trim() : '';
    var errEl = document.getElementById('del_account_confirm_err');
    var serverErr = document.getElementById('del_account_server_err');
    var spinner = document.getElementById('del_account_spinner');
    var btn = document.getElementById('del_account_btn');

    if (serverErr) serverErr.style.display = 'none';
    if (confirmVal !== 'মুছে ফেলুন' && confirmVal !== 'DELETE') {
        if (errEl) { errEl.textContent = '❌ নিশ্চিত করতে "মুছে ফেলুন" লিখুন।'; errEl.style.display = 'block'; }
        return;
    }
    if (errEl) errEl.style.display = 'none';
    if (btn) { btn.style.display = 'none'; }
    if (spinner) spinner.style.display = 'block';

    var fd = new FormData();
    fd.append('delete_donor', '1');
    fd.append('confirm', confirmVal);
    fd.append('csrf_token', CSRF_TOKEN);

    fetch(_AJAX_URL, {method:'POST', body:fd})
    .then(safeJSON)
    .then(function(d){
        if (d && d.status === 'success') {
            showToast(d.msg || '✅ আপনার অ্যাকাউন্ট সম্পূর্ণ মুছে ফেলা হয়েছে।', 'success');
            closeDeleteAccountModal();
            // অ্যাকাউন্ট সম্পূর্ণ মুছে ফেলা হয়েছে — logout-এর মতোই full clean:
            // Firebase persisted user sign-out + সব storage/caches মুছে hard reload।
            // নইলে persisted Firebase user দিয়ে silent-restore আবার session বানিয়ে ফেলে।
            setTimeout(function(){
                if (typeof authLogout === 'function') { authLogout(); return; }
                // fallback — authLogout না থাকলে অন্তত persisted user/storage মুছি
                try { window._baLoggingOut = true; } catch(e){}
                try { if (typeof _fbAuth !== 'undefined' && _fbAuth) _fbAuth.signOut(); } catch(e){}
                try { localStorage.clear(); sessionStorage.clear(); } catch(e){}
                window.location.replace(window.location.origin + window.location.pathname + '?_cache_bust=' + Date.now());
            }, 1200);
        } else {
            if (spinner) spinner.style.display = 'none';
            if (btn) { btn.style.display = 'block'; btn.disabled = false; btn.textContent = '🗑️ হ্যাঁ, আমার সকল তথ্য মুছে দিন'; }
            if (serverErr) { serverErr.textContent = (d && d.msg) ? d.msg : '❌ ব্যর্থ হয়েছে। আবার চেষ্টা করুন।'; serverErr.style.display = 'block'; }
        }
    })
    .catch(function(){
        if (spinner) spinner.style.display = 'none';
        if (btn) { btn.style.display = 'block'; btn.disabled = false; btn.textContent = '🗑️ হ্যাঁ, আমার সকল তথ্য মুছে দিন'; }
        if (serverErr) { serverErr.textContent = '❌ Network error। আবার চেষ্টা করুন।'; serverErr.style.display = 'block'; }
    });
}

function submitDeleteDonor() {
    openDeleteAccountModal();
}

// UPDATE FORM
function submitUpdate() {
    const name    = document.getElementById('u_name').value.trim();
    const locArea = document.getElementById('u_location').value;
    const last    = document.getElementById('u_last').value.trim();
    const regGeo       = (document.getElementById('u_reg_geo') || {value:''}).value.trim();
    
    if(!name)    return showValidationError("নাম দিতে হবে");
    if(/[^a-zA-Z\u0980-\u09FF\s]/.test(name)) return showValidationError("নামে শুধুমাত্র অক্ষর ও স্পেস থাকতে পারবে");
    if(!locArea  || !locArea.trim())  return showValidationError("লোকেশন লিখতে হবে");
    if(!last)    return showValidationError("Last Blood Donation Date দিতে হবে");

    const finalLocation = locArea.trim();
    const willing       = document.getElementById('u_willing').value;
    const justDonated   = document.getElementById('u_just_donated').value;

    const fd = new FormData();
    fd.append('ajax_update',      '1');
    fd.append('name',             name);
    fd.append('location',         finalLocation);
    fd.append('last_donation',    last);
    fd.append('willing_to_donate',willing);
    fd.append('hide_me',    (document.getElementById('u_hide_me')    && document.getElementById('u_hide_me').checked)    ? '1' : '0');
    fd.append('allow_call', (document.getElementById('u_allow_call') && document.getElementById('u_allow_call').checked) ? '1' : '0');
    fd.append('just_donated',     justDonated);
    if(regGeo)     fd.append('reg_geo_update', regGeo);
    fd.append('device_id',        (typeof getDeviceId === 'function') ? getDeviceId() : '');
    fd.append('csrf_token',       CSRF_TOKEN);

    fetch(_AJAX_URL, {method:'POST', body:fd})
    .then(safeJSON)
    .then(data => {
        const overlay = document.getElementById("popup");
        const icon    = document.getElementById("popupIcon");
        const title   = document.getElementById("popupTitle");
        const msg     = document.getElementById("popupMsg");
        const notice  = document.getElementById("successNotice");
        const okBtn   = document.getElementById("popupOkBtn");

        if(data.status === "success"){
            icon.innerHTML = TICK_OK;
            icon.className = "tick success-tick";
            title.innerText = "Update Successful";

            msg.innerText = data.msg;
            notice.style.display = "none";
            okBtn.innerHTML = "OK"; okBtn.disabled = false;
            okBtn.className = "countdown-btn active";
            okBtn.onclick = () => {
                document.getElementById("popup").classList.remove("active");
                unlockBodyScroll();
                location.reload();
            };

            // Update badge card live
            if(data.total_donations !== undefined) {
                updateBadgeCard(data.total_donations, data.badge_icon, data.badge_level);
            }
            // Reset just_donated flag
            document.getElementById('u_just_donated').value = '0';
        } else {
            icon.innerHTML = TICK_NO;
            icon.className = "tick error-tick";
            title.innerText = "Update Failed";
            msg.innerText = data.msg;
            notice.style.display = "none";
            okBtn.innerHTML = "OK"; okBtn.disabled = false;
            okBtn.className = "countdown-btn active";
            // Re-enable justDonatedBtn so user can retry
            const jdb = document.getElementById('justDonatedBtn');
            if(jdb && document.getElementById('u_just_donated').value === '1'){
                jdb.disabled = false; jdb.style.opacity = ''; jdb.style.cursor = '';
            }
            okBtn.onclick = () => {
                document.getElementById("popup").classList.remove("active");
                unlockBodyScroll();
            };
        }
        overlay.classList.add("active");
    })
    .catch(() => {
        const jdb = document.getElementById('justDonatedBtn');
        if(jdb && document.getElementById('u_just_donated').value === '1'){
            jdb.disabled = false; jdb.style.opacity = ''; jdb.style.cursor = '';
        }
        showValidationError("Network error। Internet connection চেক করুন।");
    });
}

// CALLER & REPORT

function submitReport() {
    const phone = document.getElementById('repDonorPhone').value.trim();
    const hInfo = document.getElementById('harasserInfo').value.trim();
    const comment = document.getElementById('reportComment').value.trim();

    if(!phone) return showValidationError("দাতার ফোন নম্বর দিন");
    if(!hInfo) return showValidationError("হয়রানিকারীর তথ্য দিন");
    if(!comment) return showValidationError("অভিযোগ লিখুন");

    const formData = new FormData();
    formData.append('submit_report', '1');
    formData.append('donor_phone', phone);
    formData.append('harasser_info', hInfo);
    formData.append('report_comment', comment);
    formData.append('csrf_token', CSRF_TOKEN);

    fetch(_AJAX_URL, { method: 'POST', body: formData })
    .then(r => r.text())
    .then(res => {
        const raw = res.trim();
        if (raw === 'success') {
            // Close report popup properly
            const rp = document.getElementById('reportPopup');
            if (rp && rp.classList.contains('active')) {
                rp.classList.remove('active');
                unlockBodyScroll();
            }
            // Show success using the standard popup (no ugly alert)
            const overlay = document.getElementById("popup");
            const icon    = document.getElementById("popupIcon");
            const title   = document.getElementById("popupTitle");
            const msg     = document.getElementById("popupMsg");
            const notice  = document.getElementById("successNotice");
            const okBtn   = document.getElementById("popupOkBtn");
            icon.innerHTML = TICK_OK; icon.className = "tick success-tick";
            title.innerText = "রিপোর্ট সফলভাবে জমা হয়েছে";
            msg.innerText   = "আপনার অভিযোগটি গ্রহণ করা হয়েছে। অ্যাডমিন দ্রুত ব্যবস্থা নেবেন।";
            notice.style.display = "none";
            okBtn.innerHTML = "OK"; okBtn.disabled = false;
            okBtn.className = "countdown-btn active";
            okBtn.onclick = closePopup;
            overlay.classList.add("active");
            // Clear the report form
            document.getElementById('repDonorPhone').value = '';
            document.getElementById('harasserInfo').value  = '';
            document.getElementById('reportComment').value = '';
        } else {
            // Server returned a JSON error
            try {
                const d = JSON.parse(raw);
                showValidationError(d.msg || "রিপোর্ট পাঠাতে সমস্যা হয়েছে।");
            } catch(e) {
                showValidationError("রিপোর্ট পাঠাতে সমস্যা হয়েছে। আবার চেষ্টা করুন।");
            }
        }
    })
    .catch(() => showValidationError("Network error। Internet connection চেক করুন।"));
}

// ============================================================
// GPS PERMISSION — soft prompt, non-blocking
// ============================================================
let _gpsCallback = null;
let _gpsContext  = 'general';

function gpsAllow() {
    document.getElementById('gpsPermPrompt').classList.remove('active');
    _saveDeviceId('loc_allow');
    if (!navigator.geolocation) { const cb = _gpsCallback; _gpsCallback = null; if (cb) cb(); return; }
    navigator.geolocation.getCurrentPosition(
        function(pos) {
            currentLocData = 'Lat: ' + pos.coords.latitude + ', Lon: ' + pos.coords.longitude;
            locationPermissionGranted = true;
            const geoEl = document.getElementById('reg_geo_location');
            if (geoEl) geoEl.value = currentLocData;
            const cb = _gpsCallback; _gpsCallback = null; if (cb) cb();
        },
        function() {
            currentLocData = 'Not provided';
            const cb = _gpsCallback; _gpsCallback = null; if (cb) cb();
        },
        { timeout: 12000, enableHighAccuracy: true }
    );
}

function gpsSkip() {
    document.getElementById('gpsPermPrompt').classList.remove('active');
    _saveDeviceId('loc_deny');
    currentLocData = 'Not provided';
    const cb = _gpsCallback; _gpsCallback = null; if (cb) cb();
}

function requestGPSWithPrompt(context, callback) {
    _gpsCallback = callback;
    _gpsContext  = context;
    const msgs = {
        call:      'কল করার আগে আপনার Location log করা হবে — জালিয়াতি প্রতিরোধের জন্য।',
        register:  'Registration-এর সময় আপনার GPS Location সংরক্ষণ করা হবে।',
        emergency: 'Emergency request-এর সাথে আপনার Location log করা হবে।',
        general:   'আপনার location log করা হবে — শুধুমাত্র নিরাপত্তার জন্য।'
    };
    if (!navigator.geolocation) { const cb = _gpsCallback; _gpsCallback = null; if (cb) cb(); return; }
    
    // Try permissions API first (modern browsers)
    if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({name:'geolocation'}).then(function(r) {
            if (r.state === 'granted') {
                // Already granted — get location silently
                navigator.geolocation.getCurrentPosition(
                    function(pos) {
                        currentLocData = 'Lat: ' + pos.coords.latitude + ', Lon: ' + pos.coords.longitude;
                        locationPermissionGranted = true;
                        const geoEl = document.getElementById('reg_geo_location');
                        if (geoEl) geoEl.value = currentLocData;
                        const cb = _gpsCallback; _gpsCallback = null; if (cb) cb();
                    },
                    function() { const cb = _gpsCallback; _gpsCallback = null; if (cb) cb(); },
                    { timeout: 8000, enableHighAccuracy: false }
                );
                return;
            }
            if (r.state === 'denied') {
                // Denied — collect device ID silently, skip and proceed
                _saveDeviceId('loc_deny');
                currentLocData = 'Not provided';
                const cb = _gpsCallback; _gpsCallback = null; if (cb) cb();
                return;
            }
            // 'prompt' — show our friendly UI first
            const msgEl = document.getElementById('gpsPromptMsg');
            if (msgEl) msgEl.textContent = msgs[context] || msgs.general;
            document.getElementById('gpsPermPrompt').classList.add('active');
        }).catch(function() {
            // permissions API not supported — try directly
            navigator.geolocation.getCurrentPosition(
                function(pos) {
                    currentLocData = 'Lat: ' + pos.coords.latitude + ', Lon: ' + pos.coords.longitude;
                    locationPermissionGranted = true;
                    const geoEl = document.getElementById('reg_geo_location');
                    if (geoEl) geoEl.value = currentLocData;
                    const cb = _gpsCallback; _gpsCallback = null; if (cb) cb();
                },
                function() { currentLocData = 'Not provided'; const cb = _gpsCallback; _gpsCallback = null; if (cb) cb(); },
                { timeout: 8000, enableHighAccuracy: false }
            );
        });
    } else {
        // No permissions API — show prompt anyway if not yet asked
        const msgEl = document.getElementById('gpsPromptMsg');
        if (msgEl) msgEl.textContent = msgs[context] || msgs.general;
        document.getElementById('gpsPermPrompt').classList.add('active');
    }
}

function requestLocationAgain() {
    requestGPSWithPrompt('general', function() {
        const overlay = document.getElementById('locationBlockedOverlay');
        if (overlay) { overlay.style.display = 'none'; document.body.style.overflow = 'auto'; }
        if (tempDonorId) prepCall(tempDonorId);
    });
}

function checkAndGetLocation(callback) {
    requestGPSWithPrompt('register', callback);
}

// ============================================================
// LEAFLET MAP PICKER (replaces broken Google Maps iframe)
// ============================================================
let _mapPickerMap = null;
let _mapPickerMarker = null;

function openMapPicker() {
    const modal   = document.getElementById('mapPickerModal');
    const loading = document.getElementById('mapPickerLoading');
    const resultEl = document.getElementById('mapPickerResult');
    modal.classList.add('active');
    loading.style.display = 'flex';
    resultEl.value = '';

    // Wait for Leaflet to be ready
    function initPickerMap() {
        if (typeof L === 'undefined') { setTimeout(initPickerMap, 400); return; }
        loading.style.display = 'none';

        const mapDiv = document.getElementById('leafletMapPicker');
        if (!_mapPickerMap) {
            // Default center: Dhaka, Bangladesh
            _mapPickerMap = L.map('leafletMapPicker', { zoomControl: true }).setView([23.7735, 90.3742], 13);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                attribution: '© OpenStreetMap © CARTO',
                subdomains: 'abcd',
                maxZoom: 19
            }).addTo(_mapPickerMap);

            // Click handler — drop a pin and reverse geocode
            _mapPickerMap.on('click', function(e) {
                const lat = e.latlng.lat.toFixed(6);
                const lng = e.latlng.lng.toFixed(6);

                if (_mapPickerMarker) {
                    _mapPickerMarker.setLatLng(e.latlng);
                } else {
                    _mapPickerMarker = L.marker(e.latlng, { draggable: true }).addTo(_mapPickerMap);
                    _mapPickerMarker.on('dragend', function() {
                        const p = _mapPickerMarker.getLatLng();
                        doReverseGeocode(p.lat.toFixed(6), p.lng.toFixed(6));
                    });
                }
                doReverseGeocode(lat, lng);
            });
        } else {
            // Reset marker on re-open
            if (_mapPickerMarker) { _mapPickerMap.removeLayer(_mapPickerMarker); _mapPickerMarker = null; }
        }
        // Force resize in case modal was hidden
        setTimeout(() => { if (_mapPickerMap) _mapPickerMap.invalidateSize(); }, 400);

        // Try to centre on user location
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function(pos) {
                _mapPickerMap.setView([pos.coords.latitude, pos.coords.longitude], 15);
            }, null, { timeout: 5000 });
        }
    }
    setTimeout(initPickerMap, 150);
}

function doReverseGeocode(lat, lng) {
    const resultEl = document.getElementById('mapPickerResult');
    resultEl.value = `Lat: ${lat}, Lon: ${lng} (লোড হচ্ছে...)`;
    // Use Nominatim (free, no key required)
    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=en`, {
        headers: { 'Accept-Language': 'en' }
    })
    .then(r => r.json())
    .then(d => {
        const addr = d.address || {};
        const parts = [
            addr.road || addr.neighbourhood || addr.suburb,
            addr.city_district || addr.suburb || addr.town || addr.city,
            addr.city || addr.county
        ].filter(Boolean);
        const readable = parts.length ? parts.join(', ') : d.display_name;
        if (resultEl) resultEl.value = readable;
        if (_mapPickerMarker) _mapPickerMarker.bindPopup(`📍 ${readable}`).openPopup();
    })
    .catch(() => {
        if (resultEl) resultEl.value = `Lat: ${lat}, Lon: ${lng}`;
    });
}

function mapGoToMyLocation() {
    const btn = document.getElementById('mapMyLocBtn');
    if (!_mapPickerMap || !navigator.geolocation) {
        showToast('GPS পাওয়া যাচ্ছে না।', 'error'); return;
    }
    if (btn) btn.textContent = '⏳';
    navigator.geolocation.getCurrentPosition(function(pos) {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        _mapPickerMap.setView([lat, lng], 16);
        const latlng = L.latLng(lat, lng);
        if (_mapPickerMarker) {
            _mapPickerMarker.setLatLng(latlng);
        } else {
            _mapPickerMarker = L.marker(latlng, { draggable: true }).addTo(_mapPickerMap);
            _mapPickerMarker.on('dragend', function() {
                const p = _mapPickerMarker.getLatLng();
                doReverseGeocode(p.lat.toFixed(6), p.lng.toFixed(6));
            });
        }
        doReverseGeocode(lat.toFixed(6), lng.toFixed(6));
        if (btn) btn.textContent = '📍';
    }, function() {
        if (btn) btn.textContent = '📍';
        showToast('Location পাওয়া যায়নি। Browser-এ Permission দিন।', 'warning');
    }, { timeout: 8000, enableHighAccuracy: true });
}

function doMapSearch() {
    const q = (document.getElementById('mapSearchInput') || {}).value;
    if (!q || !q.trim()) return;
    const searchBtn = document.querySelector('#mapPickerModal [onclick="doMapSearch()"]');
    if (searchBtn) { searchBtn.textContent = '⏳'; searchBtn.disabled = true; }
    // Use Nominatim geocoding
    fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(q.trim() + ', Dhaka, Bangladesh') + '&limit=1&accept-language=en', {
        headers: { 'Accept-Language': 'en' }
    })
    .then(r => r.json())
    .then(results => {
        if (searchBtn) { searchBtn.textContent = '🔍 খুঁজুন'; searchBtn.disabled = false; }
        if (!results || !results.length) {
            // Try without Bangladesh filter
            return fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(q.trim()) + '&limit=1&accept-language=en', {
                headers: { 'Accept-Language': 'en' }
            })
                .then(r => r.json())
                .then(r2 => {
                    if (!r2 || !r2.length) { showToast('এলাকা খুঁজে পাওয়া যায়নি। অন্য নাম দিন।', 'warning'); return; }
                    _applyMapSearchResult(r2[0]);
                });
        }
        _applyMapSearchResult(results[0]);
    })
    .catch(() => {
        if (searchBtn) { searchBtn.textContent = '🔍 খুঁজুন'; searchBtn.disabled = false; }
        showToast('Search কাজ করছে না। Internet চেক করুন।', 'error');
    });
}

function _applyMapSearchResult(result) {
    if (!_mapPickerMap || !result) return;
    const lat = parseFloat(result.lat), lng = parseFloat(result.lon);
    _mapPickerMap.setView([lat, lng], 16);
    const latlng = L.latLng(lat, lng);
    if (_mapPickerMarker) {
        _mapPickerMarker.setLatLng(latlng);
    } else {
        _mapPickerMarker = L.marker(latlng, { draggable: true }).addTo(_mapPickerMap);
        _mapPickerMarker.on('dragend', function() {
            const p = _mapPickerMarker.getLatLng();
            doReverseGeocode(p.lat.toFixed(6), p.lng.toFixed(6));
        });
    }
    doReverseGeocode(lat.toFixed(6), lng.toFixed(6));
}

function closeMapPicker() {
    document.getElementById('mapPickerModal').classList.remove('active');
    // Invalidate size to prevent grey tiles next open
    if (_mapPickerMap) setTimeout(() => _mapPickerMap.invalidateSize(), 400);
}

function useMapPickerLocation() {
    const val = document.getElementById('mapPickerResult').value.trim();
    if (!val || val.includes('লোড হচ্ছে')) { showValidationError('Map-এ ক্লিক করুন অথবা location লিখুন।'); return; }
    const exactEl = document.getElementById('regExactLocation');
    if (exactEl) exactEl.value = val;
    closeMapPicker();
}


// CALL FUNCTIONS
function prepCall(donorId) {
    vibrateIfOn([30, 15, 30]);
    // ── Verification gate: সাইন ইন করা না থাকলে / unverified হলে call আটকাও ──
    //  (server-side get_phone/log_call এটিই enforce করে — এটি শুধু UX।)
    if (!_isSignedIn()) {
        showToast('📞 কল করতে আগে সাইন ইন করুন।', 'info');
        if (typeof openAuthModal === 'function') openAuthModal();
        return;
    }
    if (!_isVerified()) {
        showToast('🔒 কল করতে Telegram বা SMS দিয়ে অ্যাকাউন্ট verify করুন।', 'info');
        if (typeof openVerifyModal === 'function') openVerifyModal();
        return;
    }
    // ── Active-request gate: active emergency request ছাড়া call করা যাবে না।
    //  না থাকলে prefilled request form খোলে; submit-এর পর এই donor-এ ফিরে আসে।
    requireActiveRequest('call', donorId, function(){ _prepCallProceed(donorId); });
}

// Continuation of prepCall — runs only after the active-request gate passes.
function _prepCallProceed(donorId) {
    tempDonorId = donorId;
    tempCallSourceEl = null;

    // ── FIX: Desktop <tr> ও Mobile .dc দুটোতেই একই onclick button থাকে।
    // querySelector সবসময় DOM-এ প্রথমটা (প্রায়ই hidden desktop row) নিত,
    // তাই auto-scroll সবসময় same donor-এ আটকে থাকত।
    // offsetParent চেক করে শুধু VISIBLE button খুঁজে নেওয়া হচ্ছে।
    const allBtns = document.querySelectorAll(`button[onclick="prepCall('${donorId}')"]`);
    let btn = null;
    for (const b of allBtns) {
        if (b.offsetParent !== null) { btn = b; break; }
    }

    if (btn) {
        const row  = btn.closest('tr');
        const card = btn.closest('.dc') || btn.closest('.nearby-card');
        if (row) {
            tempCallSourceEl = row;
            tempName = row.cells[1] ? row.cells[1].innerText.trim() : "Donor";
            tempLoc  = row.cells[4] ? row.cells[4].innerText.trim() : "N/A";
        } else if (card) {
            tempCallSourceEl = card;
            tempName = (card.querySelector('.dc-name') || {}).innerText || "Donor";
            tempLoc  = (card.querySelector('.dc-loc')  || {}).innerText || "N/A";
        }
    }

    // ── Caller identity = verified account (আর আলাদা popup-এ চাওয়া হয় না) ──
    //  সাইন-ইন + verified গেট উপরে পাস হয়েছে, তাই verified নম্বরই caller।
    //  log_call server-side session থেকে নম্বর নেয় — এখানে শুধু confirm popup UX।
    const _a = (typeof _authState === 'function') ? _authState() : null;
    const callerPhone = (_a && (_a.verify_phone || _a.phone)) || '';
    const callerName  = (_a && _a.name) || callerPhone;
    showConfirmPopup(callerName, callerPhone);
    // ── Pre-fetch phone number in background — ready before user taps Call ──
    // Without this: user taps Call → ⏳ wait for fetch → then dials (noticeable delay).
    // With this: fetch starts NOW during confirm popup display (~300-800ms head start).
    var _prefetchId = String(donorId);
    var _pd = new FormData();
    _pd.append('get_phone','1'); _pd.append('id', donorId);
    _pd.append('csrf_token', CSRF_TOKEN);
    window._prefetchedPhone = null;
    window._prefetchDonorId = _prefetchId;
    fetch(_AJAX_URL, {method:'POST', body:_pd})
        .then(function(r){ return r.text(); })
        .then(function(raw){
            var phone = raw.trim();
            if (/^\+8801\d{9}$/.test(phone) && window._prefetchDonorId === _prefetchId) {
                window._prefetchedPhone = phone;
            }
        }).catch(function(){});

    // GPS in background — ready by the time user taps Call button
    if (navigator.geolocation && !currentLocData) {
        navigator.geolocation.getCurrentPosition(
            function(p){ currentLocData = 'Lat:'+p.coords.latitude+',Lon:'+p.coords.longitude; },
            function(){},
            { timeout:5000, enableHighAccuracy:false, maximumAge:120000 }
        );
    }
}

function showConfirmPopup(callerName, callerPhone) {
    document.getElementById("confDonorName").innerText = tempName || "Donor";
    document.getElementById("confDonorLoc").innerText = tempLoc || "N/A";
    document.getElementById("callConfirmPopup").classList.add("active");

    function execContact(type) {
        const callBtn = document.getElementById("finalCallBtn");
        const waBtn   = document.getElementById("finalWaBtn");
        callBtn.innerHTML = "⏳"; callBtn.disabled = true;
        waBtn.innerHTML   = "⏳"; waBtn.disabled   = true;

        // ── Use pre-fetched phone if ready; otherwise fetch now ──
        var _cachedPhone = (window._prefetchedPhone && window._prefetchDonorId === String(tempDonorId))
                            ? window._prefetchedPhone : null;

        var _doCall = function(phone) {
            callBtn.innerHTML = "📞 Call"; callBtn.disabled = false;
            waBtn.innerHTML   = "💬 WhatsApp"; waBtn.disabled   = false;
            // server verification gate — stale client state হলে এখানে ধরা পড়ে
            if (phone === 'unverified') {
                document.getElementById("callConfirmPopup").classList.remove("active");
                showToast('🔒 কল করতে Telegram বা SMS দিয়ে অ্যাকাউন্ট verify করুন।', 'info');
                if (typeof openVerifyModal === 'function') openVerifyModal();
                return;
            }
            // server active-request gate — stale client state হলে এখানে ধরা পড়ে
            if (phone === 'need_request') {
                document.getElementById("callConfirmPopup").classList.remove("active");
                _openRequestFormForDonor('call', tempDonorId);
                return;
            }
            // Allow Call OFF → নম্বর দেওয়া হয় না; Request flow-এ পাঠাও (point #3)
            if (phone === 'request_only') {
                document.getElementById("callConfirmPopup").classList.remove("active");
                prepRequest(tempDonorId);
                return;
            }
            if (!phone || !/^\+8801\d{9}$/.test(phone)) {
                showToast('দাতার তথ্য পাওয়া যায়নি। আবার চেষ্টা করুন।', 'error'); return;
            }

            // ── log_call fire-and-forget ──
            const ld = new FormData();
            ld.append('log_call','1'); ld.append('donor_id', tempDonorId);
            ld.append('caller_name', callerName); ld.append('caller_phone', callerPhone);
            ld.append('location_data', currentLocData);
            ld.append('csrf_token', CSRF_TOKEN);
            fetch(_AJAX_URL, {method:'POST', body:ld}).catch(function(){});

            // ── Mark this donor as called (green button) & blink next available ──
            //  NOTE: no auto-scroll here — clicking Call must NOT move the page.
            var _sourceEl = tempCallSourceEl; // save before cleanup
            markDonorCalled(tempDonorId);
            if (_sourceEl) blinkNextAvailableDonor(_sourceEl);

            // ── Close popup ──
            // callConfirmPopup is excluded from the body scroll-lock (see syncScrollLock),
            // so closing it does NOT scrollTo/jump — the clicked card stays exactly in place.
            document.getElementById("callConfirmPopup").classList.remove("active");
            tempCallSourceEl = null;

            // ── Dial LAST — after popup close so mobile suspension won't cancel it ──
            if (type === 'wa') {
                window.open("https://wa.me/" + phone.replace('+',''), "_blank");
            } else {
                window.location.href = "tel:" + phone;
            }
        }; // end _doCall

        // ── Use cache if phone already fetched, else fetch now ──
        if (_cachedPhone) {
            _doCall(_cachedPhone);
        } else {
            const pd = new FormData();
            pd.append('get_phone','1'); pd.append('id', tempDonorId);
            pd.append('csrf_token', CSRF_TOKEN);
            fetch(_AJAX_URL, {method:'POST', body:pd})
                .then(function(r){ return r.text(); })
                .then(function(raw){ _doCall(raw.trim()); })
                .catch(function(){
                    callBtn.innerHTML = "📞 Call"; callBtn.disabled = false;
                    waBtn.innerHTML   = "💬 WhatsApp"; waBtn.disabled = false;
                    showToast('Network error। Internet connection চেক করুন।', 'error');
        });
    }

}

    document.getElementById("finalCallBtn").onclick = function(){ execContact('call'); };
    document.getElementById("finalWaBtn").onclick   = function(){ execContact('wa'); };
}

// ── Request flow (Allow Call OFF → contact request, point #3) ──
function prepRequest(donorId){
    if (typeof vibrateIfOn === 'function') vibrateIfOn([30,15,30]);
    if (!_isSignedIn()) {
        showToast('✉️ Request পাঠাতে আগে সাইন ইন করুন।', 'info');
        if (typeof openAuthModal === 'function') openAuthModal();
        return;
    }
    if (!_isVerified()) {
        showToast('🔒 Request পাঠাতে Telegram বা SMS দিয়ে অ্যাকাউন্ট verify করুন।', 'info');
        if (typeof openVerifyModal === 'function') openVerifyModal();
        return;
    }
    // ── Active-request gate (Call-এর মতোই) ──
    requireActiveRequest('request', donorId, function(){ _prepRequestProceed(donorId); });
}

function _prepRequestProceed(donorId){
    document.getElementById('contactReqDonorId').value = String(donorId);
    document.getElementById('contactReqMsg').value = '';
    var btn = document.getElementById('contactReqSendBtn');
    if(btn){ btn.disabled = false; btn.innerHTML = '✉️ Request পাঠান'; }
    document.getElementById('contactReqModal').classList.add('active');
}
function closeContactReqModal(){
    var m = document.getElementById('contactReqModal');
    if(m) m.classList.remove('active');
}
function sendContactRequest(){
    var donorId = document.getElementById('contactReqDonorId').value;
    var msg = document.getElementById('contactReqMsg').value.trim();
    if(!donorId) return;
    var btn = document.getElementById('contactReqSendBtn');
    if(btn){ btn.disabled = true; btn.innerHTML = '⏳ পাঠানো হচ্ছে...'; }
    var fd = new FormData();
    fd.append('send_contact_request','1');
    fd.append('donor_id', donorId);
    fd.append('message', msg);
    fd.append('csrf_token', CSRF_TOKEN);
    fetch(_AJAX_URL, {method:'POST', body:fd})
    .then(safeJSON)
    .then(function(d){
        if(btn){ btn.disabled = false; btn.innerHTML = '✉️ Request পাঠান'; }
        closeContactReqModal();
        if(d && d.status === 'success'){ showToast(d.msg || '✅ Request পাঠানো হয়েছে।', 'info'); }
        else if (d && d.code === 'need_request'){ _openRequestFormForDonor('request', donorId); }
        else if (d && d.code === 'need_profile'){ showToast(d.msg || 'Request পাঠাতে verified প্রোফাইল দরকার।', 'warning'); }
        else { showToast((d && d.msg) || 'Request পাঠাতে ব্যর্থ।', 'error'); }
    })
    .catch(function(){
        if(btn){ btn.disabled = false; btn.innerHTML = '✉️ Request পাঠান'; }
        showToast('Network error। আবার চেষ্টা করুন।', 'error');
    });
}

function openGeneralReportModal() {
    document.getElementById('repDonorPhone').value = "";
    document.getElementById('reportPopup').classList.add('active');
}

function handleNameFocus() {
    if (!warningAndTermsAccepted) {
        document.getElementById('warningPopupOverlay').classList.add('active');
        document.querySelector('input[name="name"]').blur();
    }
}

function showTerms() {
    document.getElementById('warningPopupOverlay').classList.remove('active');
    document.getElementById('termsPopupOverlay').classList.add('active');
}

function dismissAllPopups() {
    document.getElementById('termsPopupOverlay').classList.remove('active');
    document.getElementById('warningPopupOverlay').classList.remove('active');
    warningAndTermsAccepted = true; 
    document.querySelector('input[name="name"]').focus();
    
    // Automatically open form if not opened
    if(document.getElementById('regForm').style.display === 'none'){
        toggleRegForm();
    }
}

// QUICK FILTER + PAGINATION RESET
// RESET ALL FILTERS
function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('groupFilter').value = 'All';
    document.getElementById('statusFilter').value = 'All';
    document.getElementById('locationFilter').value = 'All';
    const df = document.getElementById('donatedFilter');
    if (df) df.value = '0';
    const bf = document.getElementById('badgeFilter');
    if (bf) bf.value = 'All';
    // Reset quick filter buttons
    document.querySelectorAll('.shift-btn').forEach(b => b.classList.remove('active'));
    const allBtn = document.querySelector('.shift-btn');
    if (allBtn) allBtn.classList.add('active');
    fetchFilteredData(1);
}

function quickFilter(group) {
    const _df = document.getElementById('donatedFilter');
    if (_df) _df.value = '0';
    document.getElementById('groupFilter').value = group;
    if(group !== 'All') {
        document.getElementById('statusFilter').value = 'Available';
    } else {
        document.getElementById('statusFilter').value = 'All';
    }
    
    const buttons = document.querySelectorAll('.shift-btn');
    buttons.forEach(btn => {
        // FIX: exact match — আগে .includes() ছিল, তাই 'B+' সিলেক্ট করলে
        // 'AB+' ও active হয়ে যেত (substring match)। একইভাবে 'B-' → 'AB-'।
        const label = btn.innerText.trim();
        const isMatch = (group === 'All')
            ? (label === 'All Groups' || label === 'All')
            : (label === group);
        btn.classList.toggle('active', isMatch);
    });

    fetchFilteredData(1);
    
    // Scroll to table — instant to avoid janky smooth scroll on mobile
    const section = document.getElementById('donorListSection');
    const y = section.getBoundingClientRect().top + window.pageYOffset - 70;
    window.scrollTo({ top: y });
}

// ── Stats (Analytics) KPI cards → jump to the matching donor view ──
// total → all donors · available → Available only · unavailable → Not Willing
// donated → recently-donated list (sorted by last donation date) · requests → Active Requests
function kpiGoto(type) {
    if (type === 'requests') {
        appSwitchPage('requests');   // dedicated Active Requests page (loads its own data)
        return;
    }

    // Donor-list views — set filters first, then switch (appSwitchPage triggers the fetch)
    const g  = document.getElementById('groupFilter');
    const s  = document.getElementById('statusFilter');
    const b  = document.getElementById('badgeFilter');
    const se = document.getElementById('searchInput');
    const df = document.getElementById('donatedFilter');
    if (g)  g.value  = 'All';
    if (b)  b.value  = 'All';
    if (se) se.value = '';
    if (df) df.value = '0';
    if (s)  s.value  = 'All';

    if (type === 'available')        { if (s) s.value = 'Available'; }
    else if (type === 'unavailable') { if (s) s.value = 'Unavailable'; }
    else if (type === 'donated')     { if (df) df.value = '1'; }
    // 'total' → all defaults

    appSwitchPage('donors');
    fetchFilteredData(1);
}

// FULL AJAX WITH PAGINATION & LOCATION FILTER
// ── PERFORMANCE: abort previous filter requests ──
let _filterController = null;

function changeDonorsPerPage(val) {
    try { localStorage.setItem('donors_per_page', String(val)); } catch(e){}
    fetchFilteredData(1, true);
}

function fetchFilteredData(page = 1, doScroll = false) {
    if (_filterController) _filterController.abort();
    _filterController = new AbortController();
    var perPage = parseInt(localStorage.getItem('donors_per_page')) || 20;
    const group    = document.getElementById('groupFilter').value;
    const search   = document.getElementById('searchInput').value;
    const status   = document.getElementById('statusFilter').value;
    const location = document.getElementById('locationFilter').value;
    const badge    = document.getElementById('badgeFilter')?.value || 'All';
    const donated  = document.getElementById('donatedFilter')?.value || '0';

    const tableBody = document.getElementById('donorTableBody');
    const cardsBody = document.getElementById('donorCardsBody');

    // Skeleton for table
    let skeletonHtml = '';
    for (let i = 0; i < 5; i++) { 
        skeletonHtml += `<tr class="skeleton-row"><td colspan="7"><div class="skeleton"></div></td></tr>`;
    }
    tableBody.innerHTML = skeletonHtml;

    // Skeleton for mobile cards
    let cardSkel = '';
    for (let i = 0; i < 4; i++) {
        cardSkel += `<div class="dc dc-skeleton"><div class="skeleton" style="height:18px;margin-bottom:8px;width:60%;"></div><div class="skeleton" style="height:14px;margin-bottom:8px;width:80%;"></div><div class="skeleton" style="height:44px;border-radius:10px;"></div></div>`;
    }
    cardsBody.innerHTML = cardSkel;

    const formData = new FormData();
    formData.append('ajax_filter', '1');
    formData.append('filter_group', group);
    formData.append('search_query', search);
    formData.append('filter_status', status);
    formData.append('filter_location', location);
    formData.append('filter_badge', badge);
    formData.append('filter_donated', donated);
    formData.append('page', page);
    formData.append('per_page', perPage);
    formData.append('csrf_token', CSRF_TOKEN);

    fetch(_AJAX_URL, { method: 'POST', body: formData, signal: _filterController.signal })
    .then(response => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return safeJSON(response);
    })
    .then(data => {
        tableBody.innerHTML  = data.table  || `<tr><td colspan='7' class='no-data'>✖ কোনো রক্তদাতা পাওয়া যায়নি।</td></tr>`;
        cardsBody.innerHTML  = data.cards  || `<div class='no-data' style='text-align:center;padding:30px;'>✖ কোনো রক্তদাতা পাওয়া যায়নি।</div>`;
        const pagEl = document.getElementById('paginationSection');
        if (pagEl && data.pagination) pagEl.innerHTML = data.pagination;

        // Update stat cards + hero bar with fresh global counts from server
        if (data.counts) {
            const groupMap = {'A+':'Aplus','A-':'Aminus','B+':'Bplus','B-':'Bminus','AB+':'ABplus','AB-':'ABminus','O+':'Oplus','O-':'Ominus'};
            for (const [g, id] of Object.entries(groupMap)) {
                const el = document.getElementById('count-' + id);
                if (el) {
                    const cnt = data.counts[g] || 0;
                    el.textContent = '🩸 ' + cnt + ' Available';
                }
            }
            // Also update hero bar available count
            if (typeof data.total_available !== 'undefined') {
                const heroAvail = document.getElementById('heroAvailDonors');
                if (heroAvail) heroAvail.textContent = data.total_available;
            }
        }

        // Save current page to localStorage for page-memory feature
        try { localStorage.setItem('donors_current_page', String(page)); } catch(e){}

        // Update bottom nav active state — only if currently on donors page
        if (_currentPage === 'donors') updateBottomNav('donors');

        if (doScroll) {
            const target = document.getElementById('donorListSection');
            if (target) {
                const offset = target.getBoundingClientRect().top + window.scrollY - 72;
                window.scrollTo({ top: offset, behavior: 'smooth' });
            }
        }
    })
    .catch(e => {
        if (e && e.name === 'AbortError') return; // ignore aborted requests
        // List load fail → আবার চেষ্টা করুন বাটনে full page reload
        var _retryInner =
            "<div style='text-align:center;padding:28px 16px;'>" +
              "<div style='font-size:1.8rem;margin-bottom:8px;'>⚠️</div>" +
              "<p style='margin:0 0 16px;color:var(--text-muted);line-height:1.6;'>রক্তদাতার তালিকা লোড করা যায়নি।<br>ইন্টারনেট চেক করে আবার চেষ্টা করুন।</p>" +
              "<button type='button' onclick='location.reload()' " +
                "style='background:linear-gradient(135deg,#e02424,#b91c1c);color:#fff;border:none;border-radius:12px;padding:11px 24px;font-size:.92rem;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(220,38,38,.35);'>🔄 আবার চেষ্টা করুন</button>" +
            "</div>";
        tableBody.innerHTML = "<tr><td colspan='7' style='padding:0;border:none;background:transparent;'>" + _retryInner + "</td></tr>";
        cardsBody.innerHTML = _retryInner;
    });
}

// TAB SWITCH
function switchTab(n) {
    vibrateIfOn([12]);
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#regSection .tab-btn').forEach(b => b.classList.remove('active'));
    const tabEl = document.getElementById('tab'+n);
    if (tabEl) tabEl.classList.add('active');
    const btns = document.querySelectorAll('#regSection .tab-btn');
    if (btns[n]) btns[n].classList.add('active');
}

// "Already Registered" panel থেকে — Update My Info ট্যাবে গিয়ে তথ্য লোড করো
function goToUpdateMyInfo() {
    switchTab(1);
    try { document.getElementById('regSection').scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch(e){}
    if (typeof loadMyDonorInfo === 'function') loadMyDonorInfo();
}

// fresh registration সফল হলে has_donor flag সেট করে register tab flip করো (reload ছাড়াই)
function _markHasDonorLocal() {
    try { if (typeof BA_AUTH !== 'undefined' && BA_AUTH) BA_AUTH.has_donor = true; } catch(e){}
    try {
        var a = JSON.parse(localStorage.getItem('ba_auth') || 'null');
        if (a) { a.has_donor = true; localStorage.setItem('ba_auth', JSON.stringify(a)); }
    } catch(e){}
    if (typeof _renderAuthState === 'function') _renderAuthState();
}

// সাইন-ইন করা account-এর নিজের donor record auto-load করে (secret code লাগে না)
function loadMyDonorInfo() {
    // সাইন ইন না থাকলে আগে auth modal খোলো
    if (!_isSignedIn()) {
        showToast('তথ্য দেখতে/বদলাতে আগে সাইন ইন করুন।', 'info');
        if (typeof openAuthModal === 'function') openAuthModal();
        return;
    }

    const fd = new FormData();
    fd.append('load_my_donor', '1');
    fd.append('csrf_token', CSRF_TOKEN);

    fetch(_AJAX_URL, {method:'POST', body:fd})
    .then(safeJSON)
    .then(data => {
        if (data && data.status === 'error') {
            if (data.code === 'auth_required') {
                if (typeof openAuthModal === 'function') openAuthModal();
                return;
            }
            if (data.code === 'no_donor') {
                // donor profile নেই — registration tab-এ পাঠাও
                showToast('আপনার কোনো donor profile নেই। আগে রেজিস্ট্রেশন করুন।', 'info');
                if (typeof switchTab === 'function') switchTab(0);
                return;
            }
            showValidationError(data.msg || 'তথ্য আনা যায়নি।');
            return;
        }
        try {
            _loadUpdateFields(data);
        } catch(jsErr) {
            console.error('[loadMyDonorInfo] JS error in _loadUpdateFields:', jsErr);
            showValidationError("কিছু একটা সমস্যা হয়েছে। পেজ Refresh করে আবার চেষ্টা করুন।");
        }
    })
    .catch(netErr => {
        console.error('[loadMyDonorInfo] fetch error:', netErr);
        showValidationError("Network error। Internet connection চেক করুন আবার চেষ্টা করুন।");
    });
}

function _loadUpdateFields(data) {
    if(data.status === "success"){
        document.getElementById('updateFields').style.display = 'block';
        document.getElementById('u_name').value = data.name;
        var _uPhone = document.getElementById('u_phone_display');
        if (_uPhone) _uPhone.value = data.phone || '';

        // Privacy toggles — current saved state (point #1)
        var _uh = document.getElementById('u_hide_me');    if(_uh) _uh.checked = (parseInt(data.hide_me) === 1);
        var _ua = document.getElementById('u_allow_call'); if(_ua) _ua.checked = (data.allow_call !== 0 && data.allow_call !== '0');

        // Parse Location — defensive null check (uExactLocation may not exist in all builds)
        let fullLoc = data.location || '';
        let parts = fullLoc.split(" - ");
        let areaVal  = parts[0] ? parts[0].trim() : fullLoc;
        let exactVal = parts.length > 1 ? parts.slice(1).join(" - ").trim() : "";
        const uLocEl = document.getElementById('u_location');
        if (uLocEl) uLocEl.value = areaVal;
        const uExactEl = document.getElementById('uExactLocation');
        if (uExactEl) uExactEl.value = exactVal;

        // Smart date picker
        if(!data.last_donation || data.last_donation === 'no') {
            setUpdateDonationNever();
        } else {
            var parts2 = data.last_donation.split('/');
            if(parts2.length === 3) {
                setUpdateDonationDate(parts2[2]+'-'+parts2[1]+'-'+parts2[0]);
            } else {
                setUpdateDonationNever();
            }
        }

        // Willing toggle
        setWilling(data.willing || 'yes');

        // Badge card
        document.getElementById('donorBadgeCard').style.display = 'block';
        updateBadgeCard(data.total_donations || 0, data.badge_icon, data.badge_level);

        // 120-day lock
        checkJustDonatedLock(data.last_donation);

        document.getElementById('updateFields').scrollIntoView({ block: 'center' });
    } else {
        showValidationError(data.msg || "❔ সার্ট কোড সঠিক নয় বা খুঁজে পাওয়া যায়নি।");
    }
}

// ── Change 5: Just Donated 120-day lock ────────────────────
function checkJustDonatedLock(lastDonation) {
    const btn     = document.getElementById('justDonatedBtn');
    const lockMsg = document.getElementById('justDonatedLockMsg');
    if(!btn) return;

    if(!lastDonation || lastDonation === 'no') {
        // Never donated — unlock
        btn.disabled = false;
        btn.style.opacity = '';
        btn.style.cursor  = '';
        btn.innerHTML = '🩸 আমি এইমাত্র রক্ত দিয়েছি — Update করুন';
        lockMsg.style.display = 'none';
        return;
    }

    // Parse dd/mm/yyyy
    var parts = lastDonation.split('/');
    if(parts.length !== 3) { btn.disabled = false; lockMsg.style.display='none'; return; }
    var lastDate = new Date(parts[2], parts[1]-1, parts[0]);
    var now      = new Date();
    var diffDays = Math.floor((now - lastDate) / (1000*60*60*24));
    var remaining = 120 - diffDays;

    if(remaining > 0) {
        btn.disabled      = true;
        btn.style.opacity = '0.45';
        btn.style.cursor  = 'not-allowed';
        btn.innerHTML     = '⏳ রক্তদানের ১২০ দিন হয়নি';
        lockMsg.style.display = 'block';
        lockMsg.textContent   = '⚠️ শেষ রক্তদানের পর আরও ' + remaining + ' দিন বাকি। (' + lastDonation + ' থেকে ১২০ দিন)';
    } else {
        btn.disabled = false;
        btn.style.opacity = '';
        btn.style.cursor  = '';
        btn.innerHTML = '🩸 আমি এইমাত্র রক্ত দিয়েছি — Update করুন';
        lockMsg.style.display = 'none';
    }
}

function updateBadgeCard(total, icon, level) {
    document.getElementById('badgeIconBig').textContent = icon || '🌱';
    document.getElementById('badgeLevelName').textContent = (icon||'🌱') + ' ' + (level||'New') + ' Donor';
    document.getElementById('badgeDonations').textContent = total + ' টি রক্তদান';
    let next, needed, progressPct;
    if(total < 2)      { next='Active'; needed=2; progressPct=(total/2)*100; }
    else if(total < 5) { next='Hero';   needed=5; progressPct=(total/5)*100; }
    else if(total < 10){ next='Legend'; needed=10; progressPct=(total/10)*100; }
    else               { next='MAX';    needed=10; progressPct=100; }
    document.getElementById('badgeProgressFill').style.width = progressPct + '%';
    document.getElementById('badgeNextLabel').textContent = next === 'MAX' ? '🏆 সর্বোচ্চ স্তর!' : `পরের Badge: ${next} (${needed-total} আর দরকার)`;
}

// ── Change 4: Smart date picker for update form ─────────────
function setUpdateDonationNever() {
    document.getElementById('u_last').value = 'no';
    document.getElementById('uSdNeverBtn').classList.add('sd-active');
    document.getElementById('uSdDateBtn').classList.remove('sd-active');
    document.getElementById('uSdDatePickerWrap').style.display = 'none';
    document.getElementById('uSdNeverMsg').style.display = 'block';
}
function setUpdateDonationDate(presetISO) {
    document.getElementById('uSdNeverBtn').classList.remove('sd-active');
    document.getElementById('uSdDateBtn').classList.add('sd-active');
    document.getElementById('uSdDatePickerWrap').style.display = 'block';
    document.getElementById('uSdNeverMsg').style.display = 'none';
    var today = new Date().toISOString().split('T')[0];
    var inp = document.getElementById('uSdDateInput');
    inp.max = today; inp.min = '1940-01-01';
    if(presetISO) {
        inp.value = presetISO;
        syncUpdateDonationDate(presetISO);
    } else if(!inp.value) {
        inp.value = today;
        syncUpdateDonationDate(today);
    }
}
function syncUpdateDonationDate(val) {
    if(!val) return;
    var p = val.split('-');
    if(p.length === 3) {
        document.getElementById('u_last').value = p[2]+'/'+p[1]+'/'+p[0];
    }
}

// ── Change 4: Map picker for update form ────────────────────
let _updateMapPickerMap    = null;
let _updateMapPickerMarker = null;

function openUpdateMapPicker() {
    // Reuse the same modal — just swap the confirm handler
    const modal   = document.getElementById('mapPickerModal');
    const loading = document.getElementById('mapPickerLoading');
    const resultEl = document.getElementById('mapPickerResult');
    modal.classList.add('active');
    loading.style.display = 'flex';
    resultEl.value = '';

    // Override the confirm button to fill update form
    const confirmBtn = modal.querySelector('[onclick="useMapPickerLocation()"]');
    if(confirmBtn) confirmBtn.setAttribute('onclick','useUpdateMapPickerLocation()');

    function initUpdatePickerMap() {
        if(typeof L === 'undefined') { setTimeout(initUpdatePickerMap, 400); return; }
        loading.style.display = 'none';
        if(!_mapPickerMap) {
            _mapPickerMap = L.map('leafletMapPicker', {zoomControl:true}).setView([23.7735, 90.3742], 13);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                attribution: '© OpenStreetMap © CARTO', subdomains:'abcd', maxZoom:19
            }).addTo(_mapPickerMap);
            _mapPickerMap.on('click', function(e) {
                const lat = e.latlng.lat.toFixed(6), lng = e.latlng.lng.toFixed(6);
                if(_mapPickerMarker) { _mapPickerMarker.setLatLng(e.latlng); }
                else {
                    _mapPickerMarker = L.marker(e.latlng, {draggable:true}).addTo(_mapPickerMap);
                    _mapPickerMarker.on('dragend', function() {
                        const p = _mapPickerMarker.getLatLng();
                        doReverseGeocode(p.lat.toFixed(6), p.lng.toFixed(6));
                    });
                }
                doReverseGeocode(lat, lng);
            });
        } else {
            if(_mapPickerMarker) { _mapPickerMap.removeLayer(_mapPickerMarker); _mapPickerMarker = null; }
        }
        setTimeout(()=>{ if(_mapPickerMap) _mapPickerMap.invalidateSize(); }, 400);
        if(navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function(pos){
                _mapPickerMap.setView([pos.coords.latitude, pos.coords.longitude], 15);
            }, null, {timeout:5000});
        }
    }
    setTimeout(initUpdatePickerMap, 150);
}

function useUpdateMapPickerLocation() {
    const val = document.getElementById('mapPickerResult').value.trim();
    if(!val || val.includes('লোড হচ্ছে')) { showValidationError('Map-এ ক্লিক করুন অথবা location লিখুন।'); return; }
    // Fill update form location field
    document.getElementById('u_location').value = val;
    // Save geo coordinates
    if(_mapPickerMarker) {
        const p = _mapPickerMarker.getLatLng();
        document.getElementById('u_reg_geo').value = 'Lat: '+p.lat.toFixed(6)+', Lon: '+p.lng.toFixed(6);
    }
    // Restore original confirm button handler
    const modal = document.getElementById('mapPickerModal');
    const confirmBtn = modal.querySelector('[onclick="useUpdateMapPickerLocation()"]');
    if(confirmBtn) confirmBtn.setAttribute('onclick','useMapPickerLocation()');
    closeMapPicker();
}

function setWilling(val) {
    document.getElementById('u_willing').value = val;
    const yBtn = document.getElementById('willingYesBtn');
    const nBtn = document.getElementById('willingNoBtn');
    const note = document.getElementById('willingNote');
    if(val === 'yes') {
        yBtn.classList.add('active'); nBtn.classList.remove('active');
        note.textContent = '✅ আপনি Available হিসেবে তালিকায় থাকবেন।';
        note.style.color = '#059669';
    } else {
        nBtn.classList.add('active'); yBtn.classList.remove('active');
        note.textContent = '⛔ আপনি Unavailable হিসেবে mark হবেন। যেকোনো সময় পরিবর্তন করা যাবে।';
        note.style.color = '#ef4444';
    }
}

// ── Donation verification ───────────────────────────────────────────
//  Registration-এর পর donation count বাড়ানোর একমাত্র উপায়: রক্ত নেওয়ার পর
//  requester যে 6-সংখ্যার Code দেন সেটি এখানে দিলে count +১ হয় (কমে না)।
//  পুরোনো free self-report "+1" সরিয়ে এই code-verified flow আনা হয়েছে।
function triggerJustDonated() {
    openDcodeModal();
}
function openDcodeModal() {
    var m   = document.getElementById('dcodeModal');
    if(!m) return;
    var inp = document.getElementById('dcodeInput');
    var err = document.getElementById('dcodeModalErr');
    var btn = document.getElementById('dcodeSubmitBtn');
    if(inp) inp.value = '';
    if(err){ err.style.display = 'none'; err.textContent = ''; }
    if(btn){ btn.disabled = false; btn.innerHTML = '✅ যাচাই করুন'; }
    m.style.display = 'flex';
    if(typeof lockBodyScroll === 'function') lockBodyScroll();
    setTimeout(function(){
        if(inp){ inp.focus();
            inp.onkeydown = function(e){ if(e.key === 'Enter'){ e.preventDefault(); submitDonationCode(); } };
        }
    }, 60);
}
function closeDcodeModal() {
    var m = document.getElementById('dcodeModal');
    if(m) m.style.display = 'none';
    if(typeof unlockBodyScroll === 'function') unlockBodyScroll();
}
function submitDonationCode() {
    var inp = document.getElementById('dcodeInput');
    var err = document.getElementById('dcodeModalErr');
    var btn = document.getElementById('dcodeSubmitBtn');
    var code = (inp ? inp.value : '').trim();
    function showErr(msg){ if(err){ err.textContent = msg; err.style.display = 'block'; } }
    if(!/^[0-9]{6}$/.test(code)){ showErr('⚠️ সঠিক 6-সংখ্যার Code দিন।'); if(inp) inp.focus(); return; }
    if(err) err.style.display = 'none';
    if(btn){ btn.disabled = true; btn.innerHTML = '⏳ যাচাই হচ্ছে...'; }
    var fd = new FormData();
    fd.append('redeem_donation_code', '1');
    fd.append('code', code);
    fd.append('device_id', (typeof getDeviceId === 'function') ? getDeviceId() : '');
    fd.append('csrf_token', CSRF_TOKEN);
    fetch(_AJAX_URL, {method:'POST', body:fd})
    .then(safeJSON)
    .then(function(d){
        if(d && d.status === 'success'){
            if(typeof updateBadgeCard === 'function' && d.total_donations !== undefined){
                updateBadgeCard(d.total_donations, d.badge_icon, d.badge_level);
            }
            closeDcodeModal();
            showToast(d.msg || '🎉 ধন্যবাদ! Donation count +১ হয়েছে।', 'success');
            // availability / history / badge সব পুরোপুরি reflect করতে হালকা reload
            setTimeout(function(){ location.reload(); }, 1400);
        } else {
            if(btn){ btn.disabled = false; btn.innerHTML = '✅ যাচাই করুন'; }
            showErr((d && d.msg) ? d.msg : '❌ যাচাই ব্যর্থ হয়েছে।');
        }
    })
    .catch(function(){
        if(btn){ btn.disabled = false; btn.innerHTML = '✅ যাচাই করুন'; }
        showErr('❌ Network error। আবার চেষ্টা করুন।');
    });
}

// ── Off-platform (self-reported) donation ───────────────────────────
//  Code নেই এমন রক্তদান যোগ করার modal। backend 120-দিনের medical gate দিয়ে
//  যাচাই করে; এখানে শুধু তারিখ খালি/ভবিষ্যৎ কিনা সেটুকু client-side চেক।
function openOffDonateModal() {
    var m   = document.getElementById('offDonateModal');
    if(!m) return;
    var dt  = document.getElementById('offDonateDate');
    var pl  = document.getElementById('offDonatePlace');
    var err = document.getElementById('offDonateErr');
    var btn = document.getElementById('offDonateSubmitBtn');
    // default value = আজ; max = আজ (ভবিষ্যৎ আটকাই)
    var todayStr = new Date().toISOString().slice(0, 10);
    if(dt){ dt.max = todayStr; dt.value = todayStr; }
    if(pl) pl.value = '';
    if(err){ err.style.display = 'none'; err.textContent = ''; }
    if(btn){ btn.disabled = false; btn.innerHTML = '✅ যোগ করুন'; }
    m.style.display = 'flex';
    if(typeof lockBodyScroll === 'function') lockBodyScroll();
}
function closeOffDonateModal() {
    var m = document.getElementById('offDonateModal');
    if(m) m.style.display = 'none';
    if(typeof unlockBodyScroll === 'function') unlockBodyScroll();
}
function submitOffDonation() {
    var dt  = document.getElementById('offDonateDate');
    var pl  = document.getElementById('offDonatePlace');
    var err = document.getElementById('offDonateErr');
    var btn = document.getElementById('offDonateSubmitBtn');
    var date  = dt ? dt.value : '';
    var place = pl ? pl.value.trim() : '';
    function showErr(msg){ if(err){ err.textContent = msg; err.style.display = 'block'; } }
    if(!date){ showErr('⚠️ রক্তদানের তারিখ দিন।'); if(dt) dt.focus(); return; }
    var todayStr = new Date().toISOString().slice(0, 10);
    if(date > todayStr){ showErr('⚠️ ভবিষ্যতের তারিখ দেওয়া যাবে না।'); return; }
    if(err) err.style.display = 'none';
    if(btn){ btn.disabled = true; btn.innerHTML = '⏳ যোগ হচ্ছে...'; }
    var fd = new FormData();
    fd.append('add_offplatform_donation', '1');
    fd.append('donation_date', date);
    fd.append('place', place);
    fd.append('csrf_token', CSRF_TOKEN);
    fetch(_AJAX_URL, {method:'POST', body:fd})
    .then(safeJSON)
    .then(function(d){
        if(d && d.status === 'success'){
            if(typeof updateBadgeCard === 'function' && d.total_donations !== undefined){
                updateBadgeCard(d.total_donations, d.badge_icon, d.badge_level);
            }
            closeOffDonateModal();
            showToast(d.msg || '🎉 ধন্যবাদ! Donation যোগ হয়েছে।', 'success');
            // availability / history / badge সব reflect করতে হালকা reload
            setTimeout(function(){ location.reload(); }, 1400);
        } else {
            if(btn){ btn.disabled = false; btn.innerHTML = '✅ যোগ করুন'; }
            showErr((d && d.msg) ? d.msg : '❌ যোগ করা যায়নি।');
        }
    })
    .catch(function(){
        if(btn){ btn.disabled = false; btn.innerHTML = '✅ যোগ করুন'; }
        showErr('❌ Network error। আবার চেষ্টা করুন।');
    });
}

// PAGE LOAD → AUTO FETCH FIRST PAGE (pagination always works)
window.onload = function() {
    // ── Splash screen — single-load progress (0 → 100% in one load) ──
    (function() {
        var splash   = document.getElementById('pwaSplash');
        var pl       = document.getElementById('pageLoader');
        if (pl) pl.classList.remove('loader-show');
        if (!splash) return;

        var gear    = document.getElementById('splashGear');
        var fill    = document.getElementById('splashProgressFill');
        var pct     = document.getElementById('splashPercent');
        var rlLabel = document.getElementById('splashReloadLabel');

        var isStandalone = window.matchMedia('(display-mode: standalone)').matches
                        || window.navigator.standalone === true;

        // Clean up any leftover step key from the old 2-reload scheme
        try { sessionStorage.removeItem('_splash_step'); } catch(e){}

        // Single load: always 0 → 100%
        var startPct = 0;
        var endPct   = 100;

        if (rlLabel) rlLabel.textContent = '';

        // Pre-fill bar to startPct instantly
        if (fill) fill.style.transition = 'none';
        if (fill) fill.style.width = startPct + '%';
        if (pct)  pct.textContent = startPct + '%';

        var _animFrame;
        var _startTime = performance.now();
        var TOTAL_MS   = isStandalone ? 350 : 850;

        function easeInOut(t) {
            return t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
        }

        function animProgress(now) {
            var elapsed  = now - _startTime;
            var t        = Math.min(elapsed / TOTAL_MS, 1);
            var progress = Math.round(startPct + easeInOut(t) * (endPct - startPct));
            if (fill) {
                fill.style.transition = 'none';
                fill.style.width = progress + '%';
            }
            if (pct) pct.textContent = progress + '%';

            if (gear) {
                var speed = 1.8 - 1.5 * easeInOut(t);
                gear.style.animation = 'splashNameSlide 0.4s 0.5s ease both, gearSpin ' + speed.toFixed(2) + 's linear infinite';
            }

            if (t < 1) {
                _animFrame = requestAnimationFrame(animProgress);
            } else {
                splash.classList.add('splash-hide');
                setTimeout(function() { splash.classList.add('splash-done'); }, 480);
            }
        }

        if (isStandalone) {
            if (fill) fill.style.width = '100%';
            if (pct)  pct.textContent  = '100%';
            if (rlLabel) rlLabel.textContent = '';
            splash.classList.add('splash-hide');
            setTimeout(function() { splash.classList.add('splash-done'); }, 360);
            return;
        }

        requestAnimationFrame(animProgress);
    })();

    fetchFilteredData(1);
    loadAnalytics();
    startAnalyticsAutoRefresh();
    
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('page') && parseInt(urlParams.get('page')) > 1) {
        document.getElementById("donorListSection").scrollIntoView();
    }
    
    // Mobile: always start on home page
    if (window.innerWidth <= 650) {
        document.querySelectorAll('.app-page').forEach(function(p){ p.classList.remove('page-active'); });
        var home = document.getElementById('page-home');
        if (home) home.classList.add('page-active');
        _currentPage = 'home';
        updateBottomNav('home');
    }
};

// ============================================================
// ANALYTICS
// ============================================================
const BLOOD_COLORS = {
    'A+':'#e74c3c','A-':'#c0392b','B+':'#3498db','B-':'#2980b9',
    'AB+':'#9b59b6','AB-':'#6c3483','O+':'#f39c12','O-':'#e67e22'
};
const BADGE_COLORS = { 'New':'#10b981','Active':'#3b82f6','Hero':'#8b5cf6','Legend':'#f59e0b' };

// ── refreshHomeCounts: lightweight hero bar + stat card refresh ──
// Called when user navigates back to Home tab — avoids showing stale 0 counts.
// Does NOT redraw charts (that's loadAnalytics). Just updates numbers.
function refreshHomeCounts() {
    const loadEls = _homeNumEls();
    _setNumsLoading(loadEls, true); // shimmer while refreshing (slow network)
    const fd = new FormData();
    fd.append('get_analytics','1');
    fd.append('csrf_token', CSRF_TOKEN);
    fetch(_AJAX_URL, {method:'POST', body:fd})
    .then(safeJSON)
    .then(d => {
        // Bad/incomplete payload → drop shimmer, keep prior values, never write NaN
        if (!d || !isFinite(Number(d.total))) { _setNumsLoading(loadEls, false); return; }
        const hTotal = document.getElementById('heroTotalDonors');
        const hAvail = document.getElementById('heroAvailDonors');
        if (hTotal) { hTotal.classList.remove('num-loading'); hTotal.textContent = d.total || 0; }
        if (hAvail) { hAvail.classList.remove('num-loading'); hAvail.textContent = d.available || 0; }
        if (d.by_group_avail) {
            const gm = {'A+':'Aplus','A-':'Aminus','B+':'Bplus','B-':'Bminus',
                        'AB+':'ABplus','AB-':'ABminus','O+':'Oplus','O-':'Ominus'};
            for (const [g, id] of Object.entries(gm)) {
                const el = document.getElementById('count-' + id);
                if (el) { el.classList.remove('num-loading'); el.textContent = '🩸 ' + (d.by_group_avail[g] || 0) + ' Available'; }
            }
        }
        _setNumsLoading(loadEls, false); // safety net
    }).catch(function(){ _setNumsLoading(loadEls, false); });
}

function loadAnalytics() {
    const loadEls = _kpiNumEls().concat(_homeNumEls());
    _setNumsLoading(loadEls, true); // show shimmer while fetching (slow network)
    const fd = new FormData();
    fd.append('get_analytics','1');
    fd.append('csrf_token', CSRF_TOKEN);
    fetch(_AJAX_URL,{method:'POST',body:fd})
    .then(safeJSON)
    .then(d => {
        // Bad/incomplete payload (slow net, truncated JSON) → drop shimmer, never write NaN
        if (!d || !isFinite(Number(d.total))) { _setNumsLoading(loadEls, false); return; }
        // KPIs — updates every .analytics-section instance (home embed + standalone page)
        animateAn('kpiTotal', d.total);
        animateAn('kpiAvail', d.available);
        animateAn('kpiUnav',  d.unavailable);
        animateAn('kpiCalls', d.total_calls || 0);
        animateAn('kpiReq',       d.active_requests   || 0);
        animateAn('kpiFulfilled', d.fulfilled_requests || 0);
        // Update home hero bar
        const hTotal = document.getElementById('heroTotalDonors');
        const hAvail = document.getElementById('heroAvailDonors');
        if (hTotal) animateNum('heroTotalDonors', d.total);
        if (hAvail) animateNum('heroAvailDonors', d.available);
        // ── Update stat cards (live counts per blood group) ──
        if (d.by_group_avail) {
            const groupMap = {'A+':'Aplus','A-':'Aminus','B+':'Bplus','B-':'Bminus','AB+':'ABplus','AB-':'ABminus','O+':'Oplus','O-':'Ominus'};
            for (const [g, id] of Object.entries(groupMap)) {
                const el = document.getElementById('count-' + id);
                if (el) {
                    const cnt = d.by_group_avail[g] || 0;
                    el.classList.remove('num-loading');
                    el.textContent = '🩸 ' + cnt + ' Available';
                }
            }
        }
        // Blood group bar chart
        renderBarChart(d.by_group);
        // Badge donut
        renderBadgeDonut(d.by_badge);
        // Location chart
        renderLocChart(d.by_loc);
        _setNumsLoading(loadEls, false); // safety net — clear any remaining shimmer
    }).catch((err)=>{
        _setNumsLoading(loadEls, false); // network/parse error → restore, no NaN
        console.error('Analytics error:', err);
    });
}

// Auto-refresh analytics + stat cards every 60 seconds
let _analyticsRefreshTimer = null;
function startAnalyticsAutoRefresh() {
    if (_analyticsRefreshTimer) clearInterval(_analyticsRefreshTimer);
    _analyticsRefreshTimer = setInterval(function() {
        if (!document.hidden) loadAnalytics();
    }, 60000);
}
// Restart timer when tab becomes visible again (prevents stale data)
document.addEventListener('visibilitychange', function() {
    if (!document.hidden && _analyticsRefreshTimer) {
        clearInterval(_analyticsRefreshTimer);
        _analyticsRefreshTimer = null;
        startAnalyticsAutoRefresh();
    }
});

function animateNum(id, target) {
    animateNumEl(document.getElementById(id), target);
}

// ── Count shimmer helpers ──
// KPI / hero / stat-card number elements that should show a loading shimmer
// while analytics data is in flight (instead of flashing "NaN"/stale on slow net).
function _kpiNumEls() {
    return Array.prototype.slice.call(document.querySelectorAll('.analytics-section [data-an^="kpi"]'));
}
function _homeNumEls() {
    var els = [];
    ['heroTotalDonors','heroAvailDonors'].forEach(function(id){ var e = document.getElementById(id); if (e) els.push(e); });
    document.querySelectorAll('.stat-card .count[id^="count-"]').forEach(function(e){ els.push(e); });
    return els;
}
function _setNumsLoading(els, on) {
    els.forEach(function(e){ if (e) e.classList.toggle('num-loading', !!on); });
}

// Animate a specific element's number (used for the data-an analytics instances).
function animateNumEl(el, target) {
    if(!el) return;
    target = Number(target);
    if(!isFinite(target)) return; // invalid/slow data — keep shimmer, never write "NaN"
    el.classList.remove('num-loading');
    let startTime = null, duration = 900;
    function step(ts) {
        if(!startTime) startTime = ts;
        let progress = Math.min((ts-startTime)/duration, 1);
        let ease = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(ease * target).toLocaleString();
        if(progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// Animate the same KPI across every analytics instance (home embed + standalone page).
function animateAn(name, target) {
    document.querySelectorAll('.analytics-section [data-an="'+name+'"]').forEach(function(el){
        animateNumEl(el, target);
    });
}

function renderBarChart(byGroup) {
    const wraps = document.querySelectorAll('.analytics-section [data-an="bgChart"]');
    if(!wraps.length) return;
    const max = Math.max(...Object.values(byGroup), 1);
    const groups = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];
    const html = groups.map(g => {
        const cnt = byGroup[g] || 0;
        const pct = Math.round((cnt/max)*100);
        const col = BLOOD_COLORS[g] || '#6b7280';
        return `<div class="bar-row">
            <span class="bar-label" style="color:${col};">${g}</span>
            <div class="bar-track">
                <div class="bar-fill" style="width:${pct}%;background:${col};">
                    <span class="bar-count">${cnt}</span>
                </div>
            </div>
        </div>`;
    }).join('');
    wraps.forEach(w => { w.innerHTML = html; });
}

function renderBadgeDonut(byBadge) {
    window._lastBadgeData = byBadge; // cache for theme-switch redraw
    document.querySelectorAll('.analytics-section').forEach(function(root){
        const canvas = root.querySelector('[data-an="badgeDonut"]');
        const legend = root.querySelector('[data-an="badgeLegend"]');
        if(!canvas || !legend) return;
        _drawBadgeDonut(canvas, legend, byBadge);
    });
}

function _drawBadgeDonut(canvas, legend, byBadge) {
    const ctx = canvas.getContext('2d');
    const levels = ['New','Active','Hero','Legend'];
    const vals = levels.map(l => byBadge[l] || 0);
    const total = vals.reduce((a,b)=>a+b,0) || 1;
    const colors = levels.map(l => BADGE_COLORS[l]);
    const icons  = {'New':'🌱','Active':'⭐','Hero':'🦸','Legend':'👑'};

    // Draw donut
    let startAngle = -Math.PI/2;
    const cx=90, cy=90, outerR=80, innerR=50;
    ctx.clearRect(0,0,180,180);
    vals.forEach((v,i) => {
        const sweep = (v/total)*2*Math.PI;
        ctx.beginPath();
        ctx.moveTo(cx,cy);
        ctx.arc(cx,cy,outerR,startAngle,startAngle+sweep);
        ctx.closePath();
        ctx.fillStyle = colors[i];
        ctx.fill();
        startAngle += sweep;
    });
    // Inner circle (donut hole)
    ctx.beginPath();
    ctx.arc(cx,cy,innerR,0,2*Math.PI);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-main').trim() || '#0f1115';
    ctx.fill();
    // Center text
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-main').trim() || '#fff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(total, cx, cy);

    legend.innerHTML = levels.map((l,i) =>
        `<div class="badge-legend-item"><div class="badge-legend-dot" style="background:${colors[i]};"></div>${icons[l]} ${l} (${vals[i]})</div>`
    ).join('');
}

function renderLocChart(byLoc) {
    const wraps = document.querySelectorAll('.analytics-section [data-an="locChart"]');
    if(!wraps.length || !byLoc.length) return;
    const max = byLoc[0].cnt || 1;
    const html = byLoc.map(r => {
        const pct = Math.round((r.cnt/max)*100);
        return `<div class="loc-row">
            <span class="loc-name" title="${r.area}">${r.area}</span>
            <div class="loc-bar-track">
                <div class="loc-bar-fill" style="width:${pct}%;">
                    <span class="loc-count">${r.cnt}</span>
                </div>
            </div>
        </div>`;
    }).join('');
    wraps.forEach(w => { w.innerHTML = html; });
}

// ============================================================
// MAP (Leaflet.js — OpenStreetMap)
// ============================================================
let leafletMap = null;
let _allMapMarkers = []; // store all fetched markers for client-side filtering
let _mapFilterGroup  = 'All';
let _mapFilterStatus = 'All';

// ── Nearby Requests map helpers (point #4) ───────────────────
//  Urgency অনুযায়ী রঙ + popup (verified badge + সরাসরি Call — point #4 অনুযায়ী
//  request pin সবসময় direct Call দেখায়, request-এর contact number দিয়ে)।
function _reqMapColor(urg){
    return urg === 'Critical' ? '#dc2626' : (urg === 'Medium' ? '#3b82f6' : '#f59e0b');
}
function _reqMapPopup(m){
    var color = _reqMapColor(m.urgency);
    var esc = function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
    var verified = m.verified
        ? '<span style="color:#10b981;font-weight:700;">✅ Verified Location</span>'
        : '<span style="color:#f59e0b;font-weight:700;">⚠️ Unverified Location</span>';
    var contact = String(m.contact||'').replace(/[^0-9+]/g,'');
    var callBtn = /^\+8801\d{9}$/.test(contact)
        ? '<a href="tel:' + contact + '" style="display:inline-block;margin-top:8px;padding:7px 14px;background:#dc2626;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;">📞 Call করুন</a>'
        : '';
    return '<div style="font-family:sans-serif; min-width:200px;">' +
        '<span style="display:inline-block;background:' + color + ';color:#fff;font-size:0.72em;font-weight:700;padding:2px 8px;border-radius:6px;">' + esc(m.urgency) + '</span> ' +
        '<span style="color:' + color + '; font-weight:700;">🩸 ' + esc(m.group) + '</span><br>' +
        '<strong style="font-size:1em;">🏥 ' + esc(m.hospital) + '</strong><br>' +
        '<small>👤 রোগী: ' + esc(m.patient) + ' · ' + esc(m.bags) + ' ব্যাগ</small><br>' +
        (m.note ? '<small>📝 ' + esc(m.note) + '</small><br>' : '') +
        '<small>' + verified + '</small><br>' +
        callBtn +
        '</div>';
}

function setMapFilter(type, val, btn) {
    if (type === 'group') {
        _mapFilterGroup = val;
        document.querySelectorAll('#mapGroupPills .map-pill').forEach(function(b){ b.classList.remove('active'); });
    } else {
        _mapFilterStatus = val;
        document.querySelectorAll('#mapStatusPills .map-pill').forEach(function(b){ b.classList.remove('active'); });
    }
    if (btn) btn.classList.add('active');
    // If map already loaded, re-apply filter without re-fetching
    if (_allMapMarkers.length > 0) {
        applyMapFilter();
    }
}

function applyMapFilter() {
    if (!leafletMap) return;
    // Remove existing markers
    leafletMap.eachLayer(function(l) {
        if (l instanceof L.CircleMarker) leafletMap.removeLayer(l);
    });
    const filtered = _allMapMarkers.filter(function(m) {
        return _mapFilterGroup === 'All' || m.group === _mapFilterGroup;
    });
    const infoEl = document.getElementById('mapFilterInfo');
    if (infoEl) {
        if (_mapFilterGroup !== 'All') {
            infoEl.style.display = 'block';
            infoEl.textContent = '🔍 ' + filtered.length + ' টি request দেখাচ্ছে (মোট ' + _allMapMarkers.length + ' টির মধ্যে)';
        } else {
            infoEl.style.display = 'none';
        }
    }
    const bounds = [];
    filtered.forEach(function(m) {
        const circle = L.circleMarker([m.lat, m.lng], {
            radius: 10, fillColor: _reqMapColor(m.urgency), color: '#fff',
            weight: 2, opacity: 1, fillOpacity: 0.9
        }).addTo(leafletMap);
        circle.bindPopup(_reqMapPopup(m));
        bounds.push([m.lat, m.lng]);
    });
    if (bounds.length && filtered.length !== _allMapMarkers.length) {
        leafletMap.fitBounds(bounds, {padding:[30,30], maxZoom:14});
    }
}

function loadMap() {
    const placeholder = document.getElementById('mapPlaceholder');
    const mapDiv = document.getElementById('leafletMap');
    const legend = document.getElementById('mapLegend');

    if(typeof L === 'undefined') {
        placeholder.innerHTML = '<div style="font-size:2rem;">⏳</div><p>Leaflet লোড হচ্ছে, একটু অপেক্ষা করুন...</p>';
        setTimeout(loadMap, 800);
        return;
    }

    placeholder.innerHTML = '<div style="font-size:2rem;">⏳</div><p>Map লোড হচ্ছে...</p>';

    const fd = new FormData();
    fd.append('get_map_data','1');
    fd.append('csrf_token', CSRF_TOKEN);

    fetch(_AJAX_URL,{method:'POST',body:fd})
    .then(safeJSON)
    .then(markers => {
        if(!markers.length) {
            placeholder.innerHTML = '<div style="font-size:2rem;">🩸</div><p>এই মুহূর্তে map-এ দেখানোর মতো কোনো active request নেই।<br><small style="color:var(--text-muted);">(শুধু verified/geo-tagged request map-এ আসে)</small></p>';
            return;
        }
        placeholder.style.display = 'none';
        mapDiv.style.display = 'block';
        legend.style.display = 'flex';

        // Store all markers for client-side filtering
        _allMapMarkers = markers;

        // Init Leaflet map
        if(!leafletMap) {
            leafletMap = L.map('leafletMap', {zoomControl:true}).setView([23.8103, 90.4125], 10);
            window._mapTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                attribution: '© OpenStreetMap © CARTO',
                subdomains: 'abcd',
                maxZoom: 19
            }).addTo(leafletMap);
        } else {
            leafletMap.eachLayer(function(l) {
                if(l instanceof L.CircleMarker) leafletMap.removeLayer(l);
            });
        }

        // Fix blank map
        const _doInvalidate = () => { if(leafletMap) leafletMap.invalidateSize(); };
        if(typeof ResizeObserver !== 'undefined') {
            const _ro = new ResizeObserver((entries, obs) => {
                if(mapDiv.offsetWidth > 0 && mapDiv.offsetHeight > 0) {
                    _doInvalidate(); obs.disconnect();
                }
            });
            _ro.observe(mapDiv);
            setTimeout(_doInvalidate, 400);
        } else {
            setTimeout(_doInvalidate, 300);
            setTimeout(_doInvalidate, 500);
        }

        // Render all request markers (respecting any pre-set group filter)
        const bounds = [];
        markers.forEach(function(m) {
            const groupOk = _mapFilterGroup === 'All' || m.group === _mapFilterGroup;
            if (!groupOk) return;
            const circle = L.circleMarker([m.lat, m.lng], {
                radius: 10, fillColor: _reqMapColor(m.urgency), color: '#fff',
                weight: 2, opacity: 1, fillOpacity: 0.9
            }).addTo(leafletMap);
            circle.bindPopup(_reqMapPopup(m));
            bounds.push([m.lat, m.lng]);
        });
        if(bounds.length) leafletMap.fitBounds(bounds, {padding:[30,30]});

        // Update filter info
        const infoEl = document.getElementById('mapFilterInfo');
        if (infoEl && (_mapFilterGroup !== 'All')) {
            infoEl.style.display = 'block';
            infoEl.textContent = '🔍 ' + bounds.length + ' টি request দেখাচ্ছে (মোট ' + markers.length + ' টির মধ্যে)';
        }
    }).catch(() => {
        placeholder.innerHTML = '<p style="color:#ef4444;">Map লোড করতে সমস্যা হয়েছে।</p>';
    });
}

// ══════════════════════════════════════════════════════════════
// NOTIFICATION PROMPT — global functions, no closure
// ══════════════════════════════════════════════════════════════
function notifWasDismissed() {
    try {
        var raw = localStorage.getItem('notif_dismissed');
        if (!raw) return false;
        // Legacy value '1' — clear and treat as not dismissed
        if (raw === '1') { localStorage.removeItem('notif_dismissed'); return false; }
        var data = JSON.parse(raw);
        if (data.until && Date.now() < data.until) return true;
        localStorage.removeItem('notif_dismissed'); // expired
        return false;
    } catch(e) { return false; }
}

var _notifRetryCount = 0;
function maybeShowNotifPrompt() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') return;
    if (Notification.permission === 'denied') return;
    if (notifWasDismissed()) return;
    // If PWA overlay visible, retry — but max 4 times (12s total), then show anyway
    var pwaOverlay = document.getElementById('pwaInstallOverlay');
    if (pwaOverlay && pwaOverlay.classList.contains('show') && _notifRetryCount < 4) {
        _notifRetryCount++;
        setTimeout(maybeShowNotifPrompt, 3000); return;
    }
    var p = document.getElementById('notifPrompt');
    if (!p) return;
    requestAnimationFrame(function() { p.classList.add('np-show'); });
}

// Trigger 4s after page loads — completely independent of DOMContentLoaded
setTimeout(maybeShowNotifPrompt, 4000);

// ══════════════════════════════════════════════════════════════
// POPUP STACKING FIX
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
    const popupIds = [
        'callConfirmPopup',
        'reportPopup',
        'contactReqModal',        // new: Allow Call OFF → Request flow
        'warningPopupOverlay',
        'termsPopupOverlay',
        'aboutUsPopupOverlay',
        'locationBlockedOverlay',
        'bloodReqModal',
        'requestSecretCodeModal', // new: request secret code
        'getSecretCodeModal',     // new: get secret code by ref
        'adminMsgModal',          // new: message to admin
        'mapPickerModal',
        'gpsPermPrompt',
        'faqModal',
        'popup'  // must be last
    ];
    popupIds.forEach(function(id) {
        const el = document.getElementById(id);
        if (el) document.body.appendChild(el);
    });

    // ── Notification permission prompt ──────────────────────────
    // Shows after 4s. Retries every 3s if PWA is currently open (non-blocking).
    // GPS prompt: 9s পরে — notification prompt settle হওয়ার পরে
    setTimeout(function() {
        if (navigator.geolocation && !localStorage.getItem('gps_prompted')) {
            var pwaOverlay = document.getElementById('pwaInstallOverlay');
            var pwaVisible = pwaOverlay && pwaOverlay.classList.contains('show');
            var notifP = document.getElementById('notifPrompt');
            var notifVisible = notifP && notifP.style.display !== 'none';
            if (!pwaVisible && !notifVisible) {
                showGpsPrompt();
            } else {
                setTimeout(showGpsPrompt, 5000);
            }
        }
    }, 9000);

    function showGpsPrompt() {
        if (navigator.geolocation && !localStorage.getItem('gps_prompted')) {
            localStorage.setItem('gps_prompted', '1');
            const msgEl = document.getElementById('gpsPromptMsg');
            if (msgEl) msgEl.textContent = 'Nearby Donors feature ও Call log-এর জন্য আপনার Location দরকার। Allow করলে কাছের রক্তদাতা খুঁজে পাবেন।';
            const el = document.getElementById('gpsPermPrompt');
            if (el) el.classList.add('active');
        }
    }
});

// ============================================================
// FEATURE: EMERGENCY BLOOD REQUESTS
// ============================================================
// ── PERFORMANCE: debounce utility ──
function _debounce(fn, ms) {
    let t;
    return function(...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
}

// ── Offline / Online Alert ─────────────────────────────────
(function() {
    var _alert = null;
    function getAlert() {
        if (!_alert) _alert = document.getElementById('offlineAlert');
        return _alert;
    }
    function showOffline() {
        var el = getAlert();
        if (el) el.classList.add('show');
    }
    function showOnline() {
        var el = getAlert();
        if (el) {
            el.classList.remove('show');
            // Silently refresh donor list when connection restored
            setTimeout(function() {
                if (typeof fetchFilteredData === 'function') fetchFilteredData(1);
            }, 500);
        }
    }
    window.addEventListener('offline', showOffline);
    window.addEventListener('online',  showOnline);
    // Check on load
    if (!navigator.onLine) showOffline();

    // Smart retry — test connection before reloading
    window.offlineRetry = function(btn) {
        if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
        fetch(_AJAX_URL, { method: 'HEAD', cache: 'no-store' })
            .then(function(r) {
                if (r.ok) {
                    window.location.reload();
                } else {
                    if (btn) { btn.disabled = false; btn.textContent = '🔄 Retry'; }
                }
            })
            .catch(function() {
                if (btn) { btn.disabled = false; btn.textContent = '🔄 Retry'; }
            });
    };
})();

// ── Pull to Refresh — half-screen pull needed (THRESHOLD = window.innerHeight/2) ──
(function() {
    var ptr = null, startY = 0, pulling = false, triggered = false;
    function getPtr() { if (!ptr) ptr = document.getElementById('ptrIndicator'); return ptr; }
    var THRESHOLD = 0; // set on first touch

    document.addEventListener('touchstart', function(e) {
        if (window.scrollY > 4) return;
        startY    = e.touches[0].clientY;
        THRESHOLD = Math.round(window.innerHeight * 0.45); // half screen
        pulling   = true;
        triggered = false;
    }, {passive: true});

    document.addEventListener('touchmove', function(e) {
        if (!pulling) return;
        var dy = e.touches[0].clientY - startY;
        if (dy < 10) return;
        var el = getPtr();
        if (el) {
            var prog = Math.min(dy / THRESHOLD, 1);
            el.classList.add('ptr-visible');
            el.classList.remove('ptr-spinning');
            var svg = el.querySelector('svg');
            if (svg) svg.style.transform = 'rotate(' + Math.round(prog * 300) + 'deg)';
        }
        if (dy >= THRESHOLD && !triggered) {
            triggered = true;
            if (el) el.classList.add('ptr-spinning');
            vibrateIfOn([22]);
        }
    }, {passive: true});

    document.addEventListener('touchend', function() {
        if (!pulling) return;
        pulling = false;
        var el = getPtr();
        if (triggered) {
            setTimeout(function() { window.location.reload(); }, 280);
        } else {
            if (el) {
                el.classList.remove('ptr-visible');
                var svg = el.querySelector('svg');
                if (svg) svg.style.transform = '';
            }
        }
    });
})();

// ── Fresh content on app reopen / resume ───────────────────
// PWA reopen বা tab-switch-এ browser প্রায়ই frozen snapshot (bfcache) দেখায়,
// যা service worker bypass করে — তাই page network-first হওয়া সত্ত্বেও পুরনো
// data দেখাতে পারে। pull-to-refresh = location.reload() বলে refresh-এ ঠিক হয়।
// নিচের logic সেই manual refresh স্বয়ংক্রিয় করে, offline snapshot নষ্ট না করে।
(function() {
    // bfcache থেকে restore → পুরো page একটা frozen snapshot। online হলে fresh
    // navigation-এর জন্য reload (offline হলে snapshot-ই রাখি — তখন কাজে লাগে)।
    window.addEventListener('pageshow', function(e) {
        if (e.persisted && navigator.onLine) window.location.reload();
    });

    // অনেকক্ষণ background-এ থেকে আবার foreground এলে full reload ছাড়াই dynamic
    // content (donor list + analytics) চুপচাপ refresh করি। দ্রুত tab-switch ignore।
    var _hiddenAt = 0;
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) { _hiddenAt = Date.now(); return; }
        if (!_hiddenAt) return;
        var awayMs = Date.now() - _hiddenAt;
        _hiddenAt = 0;
        if (awayMs < 60000) return;        // <১ মিনিট দূরে থাকলে কিছু করি না
        if (!navigator.onLine) return;     // offline → যা আছে তাই থাক
        try { if (typeof fetchFilteredData === 'function') fetchFilteredData(1); } catch (e) {}
        try { if (typeof loadAnalytics === 'function') loadAnalytics(); } catch (e) {}
    });
})();

// ── Network Live Status Dot ────────────────────────────────
(function() {
    var _dot = null;
    function getDot() { if (!_dot) _dot = document.getElementById('netStatusDot'); return _dot; }
    function updateDot() {
        var el = getDot(); if (!el) return;
        if (navigator.onLine) {
            el.classList.remove('net-offline');
            el.innerHTML = 'LIVE';
            el.title = 'Network: Online';
        } else {
            el.classList.add('net-offline');
            el.innerHTML = 'OFF';
            el.title = 'Network: Offline';
        }
    }
    window.addEventListener('online',  updateDot);
    window.addEventListener('offline', updateDot);
    updateDot();
})();

// ── Settings Reload Button ─────────────────────────────────
function settingsReload() {
    var btn = document.querySelector('.settings-reload-btn');
    if (btn) {
        btn.classList.remove('spinning');
        void btn.offsetWidth; // reflow to restart animation
        btn.classList.add('spinning');
        setTimeout(function() { btn.classList.remove('spinning'); }, 500);
    }
    // Close settings then reload
    if (typeof closeSettingsPanel === 'function') closeSettingsPanel();
    setTimeout(function() { window.location.reload(true); }, 200);
}



// File input change → enforce max 2 + show chosen count/oversize warning.
function onReqDocsChange(input){
    var hint = document.getElementById('req_docs_hint');
    var files = input && input.files ? Array.from(input.files) : [];
    if (files.length > 2) {
        if (typeof showValidationError === 'function') showValidationError('সর্বোচ্চ ২টি ছবি দেওয়া যাবে — প্রথম ২টি রাখা হলো।');
        try { var dt = new DataTransfer(); files.slice(0,2).forEach(function(f){ dt.items.add(f); }); input.files = dt.files; files = Array.from(input.files); } catch(e) {}
    }
    var over = files.find(function(f){ return f.size > 5*1024*1024; });
    if (hint) {
        if (over) hint.innerHTML = '<span style="color:#ef4444;">⚠️ ' + over.name + ' — ৫MB-এর বেশি</span>';
        else if (files.length) hint.textContent = '✅ ' + files.length + 'টি ছবি নির্বাচিত · server-এ compress হবে';
        else hint.textContent = 'JPG / PNG / WEBP / HEIC · প্রতিটি ৫MB পর্যন্ত · server-এ compress হবে';
    }
}

// Set when a signed-out user taps Emergency Request — after they sign in, the
// request form auto-reopens so they continue seamlessly.
var _pendingEmergencyRequest = false;
function openBloodRequestModal(opts){
    // Require sign-in BEFORE showing the form. The backend enforces requireAuth()
    // anyway, so without this the user fills the whole form + uploads images and
    // only then fails. Gate here, prompt Google/phone sign-in, then auto-resume.
    if (typeof _isSignedIn === 'function' && !_isSignedIn()) {
        showToast('Emergency request পাঠাতে আগে সাইন ইন করুন।', 'info');
        _pendingEmergencyRequest = true;
        // Persist too, so the iOS-standalone redirect sign-in (which reloads the
        // page and wipes the in-memory flag) can still auto-resume.
        try { sessionStorage.setItem('ba_pending_emg', '1'); } catch(e){}
        if (typeof openAuthModal === 'function') openAuthModal();
        return;
    }
    document.getElementById('req_group').value = '';
    var _ra = document.getElementById('req_required_at'); if (_ra) _ra.value = '';
    var _di = document.getElementById('req_docs');
    if (_di) { _di.value = ''; var _dh = document.getElementById('req_docs_hint'); if (_dh) _dh.textContent = 'JPG / PNG / WEBP / HEIC · প্রতিটি ৫MB পর্যন্ত · server-এ compress হবে'; }
    // Clear previously selected group button
    document.querySelectorAll('#reqGroupGrid .req-group-btn').forEach(function(b){ b.classList.remove('selected'); });
    // Reset any leftover upload-progress / button state from a previous attempt
    _resetReqUploadProgress();
    var _sb = document.querySelector('#bloodReqSheet button[onclick="submitBloodRequest()"]');
    if (_sb) { _sb.disabled = false; _sb.innerHTML = '🆘 Send Request'; }
    var _hosp = document.getElementById('req_hospital'); if(_hosp) _hosp.value='';
    if (typeof _resetHospitalLoc === 'function') _resetHospitalLoc();
    if (typeof hideHospitalSuggest === 'function') hideHospitalSuggest();
    // ── Prefill (gate flow only): donor card-এর blood group + verified phone ──
    if (opts && opts.prefillGroup) {
        var _wantG = String(opts.prefillGroup);
        document.querySelectorAll('#reqGroupGrid button').forEach(function(b){
            if ((b.textContent || '').trim() === _wantG) selectReqGroup(b, _wantG);
        });
    }
    if (opts) {
        var _a = (typeof _authState === 'function') ? _authState() : null;
        var _ph = (_a && (_a.verify_phone || _a.phone)) || '';
        var _ct = document.getElementById('req_contact');
        if (_ct && /^\+8801\d{9}$/.test(_ph) && (!_ct.value || _ct.value === '+8801')) _ct.value = _ph;
    }
    document.getElementById('bloodReqModal').classList.add('active');
}

// ── Upload-progress helpers (blood request form) ─────────────
function _resetReqUploadProgress(){
    var w = document.getElementById('reqUploadProgWrap');
    var b = document.getElementById('reqUploadProgBar');
    var t = document.getElementById('reqUploadProgTxt');
    if (w) w.style.display = 'none';
    if (b) b.style.width = '0%';
    if (t) t.textContent = 'আপলোড হচ্ছে... 0%';
}
function _setReqUploadProgress(pct, label){
    var b = document.getElementById('reqUploadProgBar');
    var t = document.getElementById('reqUploadProgTxt');
    if (b) b.style.width = pct + '%';
    if (t) t.textContent = label;
}

function closeBloodReqModal(){
    document.getElementById('bloodReqModal').classList.remove('active');
    // FIX: ensure scroll lock released when modal closes (MutationObserver may lag)
    _forceUnlockBodyScroll();
}

function selectReqGroup(btn, group){
    document.querySelectorAll('#reqGroupGrid button').forEach(function(b){ b.classList.remove('selected'); });
    btn.classList.add('selected');
    document.getElementById('req_group').value = group;
}

// ── Hospital location autocomplete (point #5) ─────────────────
//  Nearby page-এর মতো একই Leaflet/OSM (Nominatim) provider। List থেকে select করলে
//  hospital_lat/lng + verified_location=1 সেট হয়; নিজে টাইপ করলে coords থাকে না →
//  verified_location=0 (Unverified)। অনুরোধ-প্রতি লুকানো hidden field-এ মান রাখা হয়।
var _hospSearchTimer = null;
var _hospResults = [];
function _resetHospitalLoc(){
    var la = document.getElementById('req_hospital_lat'); if(la) la.value='';
    var ln = document.getElementById('req_hospital_lng'); if(ln) ln.value='';
    var vf = document.getElementById('req_verified_loc'); if(vf) vf.value='0';
    var st = document.getElementById('hospitalLocStatus');
    if(st){ st.innerHTML='📍 list থেকে select করলে location <b>Verified</b> হবে; নিজে টাইপ করলে <b>Unverified</b>।'; st.style.color='var(--text-muted)'; }
}
function hideHospitalSuggest(){
    var box = document.getElementById('hospitalSuggest');
    if(box){ box.style.display='none'; box.innerHTML=''; }
}
function hospitalAutocomplete(q){
    _resetHospitalLoc(); // টাইপ করা মানে আগের verified selection বাতিল
    q = (q||'').trim();
    var box = document.getElementById('hospitalSuggest');
    if(!box) return;
    if(q.length < 3){ hideHospitalSuggest(); return; }
    clearTimeout(_hospSearchTimer);
    _hospSearchTimer = setTimeout(function(){
        fetch('https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&countrycodes=bd&accept-language=bn,en&q='+encodeURIComponent(q), {
            headers: { 'Accept-Language':'bn,en' }
        })
        .then(function(r){ return r.json(); })
        .then(function(results){
            _hospResults = results || [];
            if(!_hospResults.length){
                box.innerHTML = '<div style="padding:10px 12px;font-size:0.82em;color:var(--text-muted);">কোনো ফলাফল নেই — নিজে লিখুন (Unverified থাকবে)।</div>';
                box.style.display='block'; return;
            }
            var esc = function(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
            box.innerHTML = _hospResults.map(function(r, i){
                var full = r.display_name || '';
                var short = full.length > 72 ? full.slice(0,72)+'…' : full;
                return '<div class="hosp-opt" style="padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--border-color);font-size:0.84em;line-height:1.4;" onmousedown="selectHospital('+i+')">🏥 '+esc(short)+'</div>';
            }).join('');
            box.style.display='block';
        })
        .catch(function(){ hideHospitalSuggest(); });
    }, 450);
}
function selectHospital(i){
    var r = _hospResults[i];
    if(!r) return;
    var inp = document.getElementById('req_hospital');
    // POI name থাকলে concise নাম, নাহলে পুরো display_name
    if(inp) inp.value = r.name ? r.name : (r.display_name || inp.value);
    document.getElementById('req_hospital_lat').value = parseFloat(r.lat);
    document.getElementById('req_hospital_lng').value = parseFloat(r.lon);
    document.getElementById('req_verified_loc').value = '1';
    var st = document.getElementById('hospitalLocStatus');
    if(st){ st.innerHTML='✅ <b>Verified Location</b> — map থেকে নির্বাচিত।'; st.style.color='#10b981'; }
    hideHospitalSuggest();
}

function submitBloodRequest(){
    // রক্তের অনুরোধ পাঠাতে সাইন ইন আবশ্যক (Google / ফোন)
    if (!_isSignedIn()) {
        showValidationError('রক্তের অনুরোধ পাঠাতে আগে সাইন ইন করুন (Google অথবা ফোন নম্বর দিয়ে)।');
        closeBloodReqModal();
        if (typeof openAuthModal === 'function') setTimeout(openAuthModal, 300);
        return;
    }
    const patient  = document.getElementById('req_patient').value.trim();
    const group    = document.getElementById('req_group').value;
    const hospital = document.getElementById('req_hospital').value.trim();
    const contact  = document.getElementById('req_contact').value.trim();
    const urgency  = document.getElementById('req_urgency').value;
    const bags     = document.getElementById('req_bags').value;
    const note     = document.getElementById('req_note').value.trim();
    const requiredAt = document.getElementById('req_required_at').value; // "YYYY-MM-DDTHH:mm" or ''

    // ── ALL validation runs FIRST, before the button is disabled ──
    // (পুরনো bug: button disable করার পরে file-validation fail করলে button
    //  permanently locked হয়ে যেত। এখন সব check submit শুরুর আগেই।)
    if(!patient||!group||!hospital){ showValidationError('রোগীর নাম, blood group ও হাসপাতাল দিতে হবে।'); return; }
    if(!/^\+8801\d{9}$/.test(contact)){ showValidationError('সঠিক যোগাযোগ নম্বর দিন (+8801XXXXXXXXX)।'); return; }
    if(!requiredAt){ showValidationError('কখন রক্ত প্রয়োজন তা দিন।'); return; }

    const docInput = document.getElementById('req_docs');
    const docFiles = docInput && docInput.files ? Array.from(docInput.files) : [];
    if (docFiles.length < 1) { showValidationError('ছবি / প্রেসক্রিপশন দিন (কমপক্ষে ১টি আবশ্যক)।'); return; }
    if (docFiles.length > 2) { showValidationError('সর্বোচ্চ ২টি ছবি দেওয়া যাবে।'); return; }
    for (const f of docFiles) {
        if (f.size > 5 * 1024 * 1024) { showValidationError('প্রতিটি ছবি ৫MB-এর কম হতে হবে: ' + f.name); return; }
    }

    // ── FIX: GPS fire-and-forget — do NOT block submit on GPS ──
    // requestGPSWithPrompt caused a popup + wait before submit, making form feel frozen.
    // GPS captured silently in background; submit fires immediately.
    if (navigator.geolocation && (!currentLocData || currentLocData === 'Not provided')) {
        navigator.geolocation.getCurrentPosition(
            function(p){ currentLocData = 'Lat:'+p.coords.latitude+',Lon:'+p.coords.longitude; },
            function(){},
            { timeout:4000, enableHighAccuracy:false, maximumAge:120000 }
        );
    }

    const submitBtn = document.querySelector('#bloodReqSheet button[onclick="submitBloodRequest()"]');
    const hasFiles  = docFiles.length > 0;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = hasFiles ? '⏳ আপলোড হচ্ছে...' : '⏳ পাঠানো হচ্ছে...'; }
    // ছবি থাকলে progress bar দেখাও; না থাকলে শুধু "পাঠানো হচ্ছে" state.
    if (hasFiles) { document.getElementById('reqUploadProgWrap').style.display = 'block'; _setReqUploadProgress(0, 'আপলোড হচ্ছে... 0%'); }
    else { _resetReqUploadProgress(); }

    const fd = new FormData();
    fd.append('submit_blood_request','1');
    fd.append('patient_name', patient);
    fd.append('req_blood_group', group);
    fd.append('hospital', hospital);
    fd.append('req_contact', contact);
    fd.append('urgency', urgency);
    fd.append('bags_needed', bags);
    fd.append('req_note', note);
    fd.append('required_at', requiredAt);
    fd.append('hospital_lat', (document.getElementById('req_hospital_lat')||{}).value || '');
    fd.append('hospital_lng', (document.getElementById('req_hospital_lng')||{}).value || '');
    fd.append('verified_location', (document.getElementById('req_verified_loc')||{}).value || '0');
    fd.append('req_location', currentLocData);
    fd.append('device_id', (typeof getDeviceId === 'function') ? getDeviceId() : '');
    fd.append('csrf_token', CSRF_TOKEN);
    docFiles.slice(0, 2).forEach(function(f){ fd.append('req_docs[]', f, f.name); });

    var resetBtn = function(){
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '🆘 Send Request'; }
        _resetReqUploadProgress();
    };

    // ── XHR (not fetch) so we can report real upload progress ──
    //  fetch() upload progress দেখাতে পারে না; তাই XMLHttpRequest ব্যবহার।
    //  ফাইল upload শেষ হলে (100%) "Send করা হচ্ছে..." দেখায়, তারপর server response।
    var xhr = new XMLHttpRequest();
    xhr.open('POST', _AJAX_URL, true);

    if (hasFiles && xhr.upload) {
        xhr.upload.onprogress = function(e){
            if (!e.lengthComputable) return;
            var pct = Math.round((e.loaded / e.total) * 100);
            if (pct >= 100) {
                _setReqUploadProgress(100, '✅ আপলোড সম্পূর্ণ — Send করা হচ্ছে...');
                if (submitBtn) submitBtn.innerHTML = '⏳ Send করা হচ্ছে...';
            } else {
                _setReqUploadProgress(pct, 'আপলোড হচ্ছে... ' + pct + '%');
            }
        };
    }

    xhr.onload = function(){
        resetBtn();
        var d;
        try { d = JSON.parse(xhr.responseText); } catch(e){ d = null; }
        if (!d) { showValidationError('সার্ভার থেকে ভুল উত্তর। আবার চেষ্টা করুন।'); return; }
        closeBloodReqModal();
        if(d.status==='success'){
            document.getElementById('req_patient').value = '';
            document.getElementById('req_group').value = '';
            document.getElementById('req_hospital').value = '';
            if (typeof _resetHospitalLoc === 'function') _resetHospitalLoc();
            document.getElementById('req_contact').value = '+8801';
            document.getElementById('req_urgency').value = 'High';
            document.getElementById('req_bags').value = '1';
            document.getElementById('req_note').value = '';
            document.getElementById('req_required_at').value = '';
            var _di = document.getElementById('req_docs');
            if (_di) { _di.value = ''; var _dh = document.getElementById('req_docs_hint'); if (_dh) _dh.textContent = 'JPG / PNG / WEBP / HEIC · প্রতিটি ৫MB পর্যন্ত · server-এ compress হবে'; }
            document.querySelectorAll('#reqGroupGrid .req-group-btn').forEach(function(b){ b.classList.remove('selected'); });
            _hasActiveReq = true;
            if (typeof refreshMyReqIds === 'function') refreshMyReqIds();
            if (_pendingDonorAction) {
                // Gate flow: don't jump to the Requests page — return to the donor
                // card still on screen and re-run Call/Request (gate now passes).
                var _resume = _pendingDonorAction; _pendingDonorAction = null;
                showToast('✅ Request পাঠানো হয়েছে — এখন donor-কে যোগাযোগ করা হচ্ছে…', 'success');
                setTimeout(function(){
                    if (_resume.action === 'call') prepCall(_resume.donorId);
                    else prepRequest(_resume.donorId);
                }, 400);
            } else {
                appSwitchPage('requests');   // jump to the Active Requests page (reloads the list)
                // Request is tied to the signed-in account — manage/delete it from the
                // "👤 আমার Request" tab here or the Account Dashboard. No token needed.
                showToast('✅ Emergency request পাঠানো হয়েছে! "👤 আমার Request" tab থেকে যেকোনো সময় মুছতে পারবেন।', 'success');
            }
        } else {
            showValidationError(d.msg||'ব্যর্থ হয়েছে। আবার চেষ্টা করুন।');
        }
    };
    xhr.onerror = function(){
        resetBtn();
        showValidationError('Network error। Internet connection চেক করুন।');
    };
    xhr.send(fd);
}

// Kept for backward-compat: Active Requests is now a dedicated page, not an
// inline toggle — route any caller to the page.
function toggleRequestSection(){
    appSwitchPage('requests');
}

// ── My Requests (account-owned) ───────────────────────────────
// Ownership is derived from the signed-in account (auth_uid) via the
// get_my_requests endpoint — no client-side token storage.
var _myReqIds = new Set();
function isMyRequest(id){ return _myReqIds.has(String(id)); }
// ── Active-request gate state ──────────────────────────────────
//  Donor-কে Call/Request করার আগে signed-in user-এর অন্তত একটি Active
//  emergency request থাকতে হবে (server-ও enforce করে)। null = এখনো অজানা।
var _hasActiveReq = null;
//  গেট আটকালে request form submit-এর পরে এই donor-এ auto-return করা হয়।
var _pendingDonorAction = null; // {action:'call'|'request', donorId, group}
// Refresh the set of request IDs owned by the signed-in account, then re-filter.
function refreshMyReqIds(cb){
    if (typeof _isSignedIn === 'function' && !_isSignedIn()) {
        _myReqIds = new Set();
        _hasActiveReq = false;
        if (typeof applyReqFilter === 'function') applyReqFilter();
        if (cb) cb();
        return;
    }
    var fd = new FormData();
    fd.append('get_my_requests', '1');
    fd.append('csrf_token', CSRF_TOKEN);
    fetch(_AJAX_URL, {method:'POST', body:fd})
        .then(safeJSON)
        .then(function(res){
            var rows = (res && res.status === 'success' && Array.isArray(res.requests)) ? res.requests : [];
            _myReqIds = new Set(rows.map(function(r){ return String(r.id); }));
            _hasActiveReq = _myReqIds.size > 0;
        })
        .catch(function(){ /* keep previous set on error */ })
        .then(function(){
            if (typeof applyReqFilter === 'function') applyReqFilter();
            if (cb) cb();
        });
}

// ── Donor blood group from the visible card/row (prefill the request form) ──
//  Desktop row → .blood-badge ; mobile/nearby card → .dc-badge। regex দিয়ে
//  "A+ / O- …" normalize করা হয় যাতে অতিরিক্ত text/whitespace থাকলেও ঠিক থাকে।
function _donorGroupFromCard(donorId){
    var id = String(donorId);
    var btns = document.querySelectorAll(
        'button[onclick="prepCall(\'' + id + '\')"], button[onclick="prepRequest(\'' + id + '\')"]');
    var btn = null;
    for (var i = 0; i < btns.length; i++){ if (btns[i].offsetParent !== null){ btn = btns[i]; break; } }
    if (!btn && btns.length) btn = btns[0];
    if (!btn) return '';
    var card = btn.closest('.dc') || btn.closest('.nearby-card') || btn.closest('tr');
    if (!card) return '';
    var badge = card.querySelector('.dc-badge, .blood-badge');
    var txt = badge ? (badge.textContent || '') : '';
    var m = txt.replace(/\s+/g, '').match(/(AB|A|B|O)([+\-])/i);
    return m ? (m[1].toUpperCase() + m[2]) : '';
}

// ── Active-request gate ────────────────────────────────────────
//  onOk() চলবে কেবল active request থাকলে; নাহলে prefilled emergency form
//  খোলে আর submit-এর পরে auto-return করার জন্য donor মনে রাখে।
//  (sign-in + verified caller আগেই যাচাই করে।)
function requireActiveRequest(action, donorId, onOk){
    if (_hasActiveReq === true){ onOk(); return; }
    refreshMyReqIds(function(){           // block করার আগে server থেকে fresh truth
        if (_hasActiveReq === true){ onOk(); return; }
        _openRequestFormForDonor(action, donorId);
    });
}

function _openRequestFormForDonor(action, donorId){
    _pendingDonorAction = { action: action, donorId: String(donorId), group: _donorGroupFromCard(donorId) };
    if (typeof showToast === 'function')
        showToast('🆘 Donor-কে যোগাযোগ করতে আগে একটি Emergency Request পাঠান।', 'info');
    if (typeof openBloodRequestModal === 'function')
        openBloodRequestModal({ prefillGroup: _pendingDonorAction.group });
}

// ── Active filter state ────────────────────────────────────────
var _reqAllData    = [];
var _reqTabMode    = 'all';
var _reqGroupFilter = '';

function setReqTab(mode){
    _reqTabMode = mode;
    var allBtn  = document.getElementById('reqTab_all');
    var mineBtn = document.getElementById('reqTab_mine');
    if(allBtn)  allBtn.classList.toggle('req-tab-active',  mode === 'all');
    if(mineBtn) mineBtn.classList.toggle('req-tab-active', mode === 'mine');
    if(mode === 'mine'){
        // Pull the latest account-owned request IDs; applyReqFilter runs inside.
        refreshMyReqIds();
    } else {
        applyReqFilter();
    }
}

function setReqGroupFilter(group){
    _reqGroupFilter = (_reqGroupFilter === group) ? '' : group;
    document.querySelectorAll('.req-bg-chip').forEach(function(b){
        b.classList.toggle('chip-active', b.dataset.group === _reqGroupFilter);
    });
    var clearBtn = document.getElementById('reqBgFilterClear');
    if(clearBtn) clearBtn.style.display = _reqGroupFilter ? 'inline-block' : 'none';
    applyReqFilter();
}

function clearReqGroupFilter(){
    _reqGroupFilter = '';
    document.querySelectorAll('.req-bg-chip').forEach(function(b){ b.classList.remove('chip-active'); });
    var clearBtn = document.getElementById('reqBgFilterClear');
    if(clearBtn) clearBtn.style.display = 'none';
    applyReqFilter();
}

function applyReqFilter(){
    var filtered = _reqAllData;
    if(_reqTabMode === 'mine') filtered = filtered.filter(function(r){ return isMyRequest(r.id); });
    if(_reqGroupFilter)        filtered = filtered.filter(function(r){ return r.blood_group === _reqGroupFilter; });
    renderReqGrid(filtered, _reqTabMode === 'mine');
}

// Render the expandable image-attachment block for a request card.
// docs = ['?req_doc=tok', ...]. Hidden until the card is clicked (see toggleReqCardDocs).
// Thumbnails open the full-screen zoom lightbox via openReqImage().
function reqDocThumbs(docs){
    if(!docs || !docs.length) return '';
    var base = (typeof _AJAX_URL === 'string') ? _AJAX_URL : '';
    var imgs = docs.slice(0,2).map(function(u){
        // docs come as relative '?req_doc=tok' — anchor to the AJAX base so the
        // image always resolves to index.php regardless of current SPA route.
        var abs = base + String(u);
        var safe = abs.replace(/"/g,'&quot;').replace(/'/g,'&#39;');
        return '<img class="req-doc-thumb" src="'+safe+'" alt="রোগীর ছবি" loading="lazy" '
             + 'onclick="event.stopPropagation();openReqImage(\''+safe+'\')">';
    }).join('');
    var label = docs.length > 1 ? (docs.length + 'টি Prescription দেখুন') : 'Prescription দেখুন';
    return '<div class="req-card-attach-hint" onclick="event.stopPropagation();toggleReqCardDocs(this)">'
         +     '📋 <span>'+label+'</span> <span class="chev">▾</span>'
         +   '</div>'
         +   '<div class="req-doc-thumbs"><div class="req-doc-thumbs-inner">'+imgs+'</div></div>';
}

// Toggle the expandable thumbnail strip on a request card.
// Accepts either the card itself or any descendant (e.g. the 📎 hint).
function toggleReqCardDocs(el){
    var card = el.classList && el.classList.contains('req-card') ? el : el.closest('.req-card');
    if(card) card.classList.toggle('docs-open');
}

// ── Full-screen image zoom lightbox ──────────────────────────────────
function openReqImage(src){
    var box = document.getElementById('reqImgLightbox');
    var img = document.getElementById('reqImgFull');
    if(!box || !img) return;
    box.classList.remove('zoomed');
    img.src = src;
    box.classList.add('show');
    document.body.style.overflow = 'hidden';
}
function closeReqImage(e){
    // Only close when clicking the backdrop / close button — not the image itself
    if(e){
        var t = e.target;
        if(t && t.id === 'reqImgFull') return;
    }
    var box = document.getElementById('reqImgLightbox');
    var img = document.getElementById('reqImgFull');
    if(!box) return;
    box.classList.remove('show','zoomed');
    document.body.style.overflow = '';
    if(img) setTimeout(function(){ if(!box.classList.contains('show')) img.src=''; }, 250);
}
function toggleReqImageZoom(e){
    if(e) e.stopPropagation();
    var box = document.getElementById('reqImgLightbox');
    if(box) box.classList.toggle('zoomed');
}
// Esc closes the lightbox
document.addEventListener('keydown', function(e){
    if(e.key === 'Escape'){
        var box = document.getElementById('reqImgLightbox');
        if(box && box.classList.contains('show')) closeReqImage();
    }
});

function renderReqGrid(reqs, showDeleteBtns) {
    var grid = document.getElementById('reqGrid');
    if(!grid) return;
    if(!reqs.length){
        var signedIn = (typeof _isSignedIn !== 'function') || _isSignedIn();
        var emptyMsg = (_reqTabMode === 'mine')
            ? (signedIn
                ? '<div style="font-size:2.5rem;margin-bottom:10px;">📭</div>'
                  +'<p style="font-weight:700;color:var(--text-main);">আপনার কোনো active Request নেই</p>'
                  +'<p style="font-size:0.82em;margin-top:5px;color:var(--text-muted);">জরুরি প্রয়োজনে উপরের 🆘 বাটনে ক্লিক করে Request পাঠান।</p>'
                : '<div style="font-size:2.5rem;margin-bottom:10px;">🔒</div>'
                  +'<p style="font-weight:700;color:var(--text-main);">নিজের Request দেখতে সাইন ইন করুন</p>'
                  +'<p style="font-size:0.82em;margin-top:5px;color:var(--text-muted);">Google অথবা ফোন নম্বর দিয়ে সাইন ইন করলে আপনার পাঠানো Request এখানে দেখাবে।</p>'
                  +'<button onclick="if(typeof openAuthModal===\'function\')openAuthModal()" style="margin-top:14px;width:auto!important;min-height:unset!important;padding:9px 18px;background:rgba(220,38,38,0.1);border:1px solid rgba(220,38,38,0.3);color:var(--danger);border-radius:20px;font-size:0.82em;font-weight:700;box-shadow:none;">🔑 সাইন ইন করুন</button>')
            : '<div style="font-size:3rem;margin-bottom:10px;">🕊️</div><p style="font-weight:600;color:var(--text-main);">এখন কোনো active request নেই</p><p style="font-size:0.85em;margin-top:5px;color:var(--text-muted);">জরুরি প্রয়োজনে উপরের 🆘 বাটনে ক্লিক করুন</p>';
        grid.innerHTML = '<div style="text-align:center;padding:40px;grid-column:1/-1;">' + emptyMsg + '</div>';
        return;
    }
    var urgencyClass = {Critical:'critical', High:'high', Medium:'medium'};
    var urgencyIcon  = {Critical:'🔴', High:'🟠', Medium:'🔵'};
    var timeAgo = function(dt){
        var unix = parseInt(dt, 10);
        var ms   = isNaN(unix) ? new Date(dt).getTime() : unix * 1000;
        var diff = Math.floor((Date.now() - ms) / 60000);
        if (isNaN(diff) || diff < 1) return 'এইমাত্র';
        if (diff < 60)               return diff + 'মিনিট আগে';
        if (diff < 1440)             return Math.floor(diff / 60) + 'ঘণ্টা আগে';
        return Math.floor(diff / 1440) + 'দিন আগে';
    };
    var escHtml = function(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); };
    var fmtRequiredAt = function(ts){
        var unix = parseInt(ts, 10);
        if (!unix || isNaN(unix)) return '';
        try { return new Date(unix * 1000).toLocaleString('bn-BD', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}); }
        catch(e){ return new Date(unix * 1000).toLocaleString(); }
    };
    grid.innerHTML = reqs.map(function(r){
        var mine = isMyRequest(r.id);
        var deleteBtn = mine
            ? '<button onclick="event.stopPropagation();deleteMyAccountRequest('+r.id+', this)" style="margin-top:8px;width:100%;padding:9px;background:rgba(220,38,38,0.07);border:1px solid rgba(220,38,38,0.35);color:var(--danger);border-radius:10px;font-size:0.82em;cursor:pointer;font-weight:700;min-height:unset;box-shadow:none;margin-top:8px;">🗑️ আমার Request মুছুন</button>'
            : '';
        var myBadge = mine ? '<span style="font-size:0.7em;background:rgba(220,38,38,0.12);color:var(--danger);border-radius:20px;padding:2px 8px;font-weight:700;margin-left:6px;">👤 আমার</span>' : '';
        var hasDocs = (r.docs && r.docs.length) ? '1' : '0';
        var cardClick = hasDocs === '1' ? ' onclick="toggleReqCardDocs(this)"' : '';
        return '<div class="req-card '+(urgencyClass[r.urgency]||'high')+'" data-has-docs="'+hasDocs+'"'+cardClick+'>'
            +'<div style="display:flex;justify-content:space-between;align-items:flex-start;">'
            +'<span class="req-card-urgency '+(urgencyClass[r.urgency]||'high')+'">'+(urgencyIcon[r.urgency]||'')+' '+escHtml(r.urgency)+'</span>'
            +'<span style="font-size:0.75em;color:var(--text-muted);">'+timeAgo(r.created_at)+'</span>'
            +'</div>'
            +'<div class="req-card-group">🩸 '+escHtml(r.blood_group)+myBadge+'</div>'
            +'<div class="req-card-name">👤 '+escHtml(r.patient_name)+'</div>'
            +'<div class="req-card-hosp">🏥 '+escHtml(r.hospital)+'</div>'
            +'<div style="font-size:0.74em;margin:3px 0 0;font-weight:700;color:'+(parseInt(r.verified_location)?'#10b981':'#f59e0b')+';">'+(parseInt(r.verified_location)?'✅ Verified Location':'⚠️ Unverified Location')+'</div>'
            +'<div class="req-card-meta">'
            +'<span class="req-tag">🩸 '+escHtml(r.bags_needed)+' ব্যাগ</span>'
            +(r.required_at ? '<span class="req-tag">⏰ '+escHtml(fmtRequiredAt(r.required_at))+'</span>' : '')
            +(r.note ? '<span class="req-tag">📝 '+escHtml(r.note)+'</span>' : '')
            +'</div>'
            +reqDocThumbs(r.docs)
            +'<button class="req-call-btn" onclick="event.stopPropagation();window.location=\'tel:'+escHtml(r.contact)+'\'">📞 '+escHtml(r.contact)+' — এখনই Call করুন</button>'
            +deleteBtn
            +'</div>';
    }).join('');
}

function loadBloodRequests(){
    var fd = new FormData();
    fd.append('get_blood_requests','1');
    fd.append('csrf_token', CSRF_TOKEN);

    fetch(_AJAX_URL,{method:'POST',body:fd})
    .then(safeJSON)
    .then(function(reqs){
        _reqAllData = reqs;
        // Refresh account ownership so "👤 আমার" badge + delete buttons show on every tab
        // (refreshMyReqIds calls applyReqFilter once it resolves).
        refreshMyReqIds();
    }).catch(function(){
        document.getElementById('reqGrid').innerHTML = '<div style="text-align:center;padding:20px;color:var(--danger);grid-column:1/-1;">❌ লোড করতে সমস্যা</div>';
    });
}

// Safety: unlock body scroll if no popup-overlay or settings panel is open
function _forceUnlockBodyScroll() {
    setTimeout(function() {
        var anyOpen = document.querySelector('.popup-overlay.active, .settings-panel-overlay.active');
        if (!anyOpen) {
            // FIX: also reset _scrollLockCount so counter never stays stuck at >0
            _scrollLockCount = 0;
            document.body.dataset.scrollLocked = '0';
            var scrollY = parseInt(document.body.dataset.scrollY || '0', 10);
            document.body.style.position = '';
            document.body.style.top      = '';
            document.body.style.left     = '';
            document.body.style.right    = '';
            document.body.style.overflow = '';
            window.scrollTo(0, scrollY);
        }
    }, 50);
}

// ============================================================
// FEATURE: NEARBY DONORS (GPS)
// ============================================================
function loadNearbyDonors(){
    const btn = document.getElementById('nearbyLoadBtn');
    const results = document.getElementById('nearbyResults');
    btn.textContent = '⏳ Location নিচ্ছে...';
    btn.disabled = true;

    if(!navigator.geolocation){
        btn.textContent='📡 খুঁজুন'; btn.disabled=false;
        results.innerHTML='<div class="nearby-empty" style="grid-column:1/-1;"><div style="font-size:2.5rem;">😢</div><p>আপনার browser Geolocation সাপোর্ট করে না।</p></div>';
        return;
    }
    navigator.geolocation.getCurrentPosition(pos=>{
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        btn.textContent = '⏳ Donors খুঁজছে...';

        const fd = new FormData();
        fd.append('get_nearby_donors','1');
        fd.append('lat', lat);
        fd.append('lng', lng);
        fd.append('radius', document.getElementById('nearbyRadius').value);
        fd.append('filter_group', document.getElementById('nearbyGroupFilter').value);
        fd.append('filter_status', document.getElementById('nearbyStatusFilter') ? document.getElementById('nearbyStatusFilter').value : 'All');
        fd.append('csrf_token', CSRF_TOKEN);

        fetch(_AJAX_URL,{method:'POST',body:fd})
        .then(safeJSON)
        .then(d=>{
            btn.textContent='🔄 আবার খুঁজুন'; btn.disabled=false;
            if(d.status!=='success'){ results.innerHTML=`<div class="nearby-empty" style="grid-column:1/-1;">❌ ${d.msg}</div>`; return; }
            if(!d.donors.length){
                results.innerHTML=`<div class="nearby-empty" style="grid-column:1/-1;">
                    <div style="font-size:2.5rem;margin-bottom:10px;">🔍</div>
                    <p style="font-weight:600;">এই এলাকায় কোনো donor পাওয়া যায়নি</p>
                    <p style="font-size:0.85em;color:var(--text-muted);margin-top:5px;">Radius বাড়িয়ে আবার চেষ্টা করুন</p>
                </div>`; return;
            }
            const stCls = {Available:'available', Unavailable:'unavailable', 'Not Available':'notavailable'};
            const stIcon= {Available:'✔', Unavailable:'⛔', 'Not Available':'✖'};
            const bgMap = {'A+':'Aplus','A-':'Aminus','B+':'Bplus','B-':'Bminus','AB+':'ABplus','AB-':'ABminus','O+':'Oplus','O-':'Ominus'};
            results.innerHTML = d.donors.map(dn=>{
                const isAvail = dn.status === 'Available';
                const bgClass = 'blood-' + (bgMap[dn.group] || dn.group.replace(/[^a-zA-Z]/g,''));
                // Call / Request (point #3): available + allow_call → 📞; available + !allow_call → ✉️ Request; নাহলে 🚫
                const callBtn = !isAvail
                    ? `<button class="dc-call-btn-disabled" disabled title="দাতা এখন Available নেই" aria-label="Not available">🚫</button>`
                    : (parseInt(dn.allow_call) === 0
                        ? `<button class="dc-call-btn dc-req-btn unselectable" onclick="prepRequest('${dn.id}')" aria-label="Request donor">✉️</button>`
                        : `<button class="dc-call-btn unselectable" onclick="prepCall('${dn.id}')" aria-label="Call donor">📞</button>`);
                const stText = dn.status === 'Available' ? 'Available' : dn.status === 'Unavailable' ? 'Not Willing' : 'Not Available';
                // Location line (point #2): hidden হলে এক লাইনেই "📍 Location Hidden · <broad area>"
                //  — reg-location text আলাদা দেখানো হয় না; visible হলে full address।
                const locLine = dn.hidden
                    ? `<div class="dc-loc" style="color:#6366f1;">📍 Location Hidden${dn.loc ? ' · ' + dn.loc : ''}</div>`
                    : `<div class="dc-loc">📍 ${dn.loc}</div>`;
                return `<div class="dc">
                    <div class="dc-badge-wrap">
                        <span class="dc-badge ${bgClass}">${dn.group}</span>
                    </div>
                    <div class="dc-info">
                        <div class="dc-name">${dn.name} <span style="font-size:0.85em;opacity:0.85;">${dn.badge_icon||''}</span></div>
                        <span class="${stCls[dn.status]||'available'} dc-status-badge">${stIcon[dn.status]||'✔'} ${stText}</span>
                        ${locLine}
                        <div class="dc-last">📏 ${dn.dist} km দূরে (আনুমানিক)</div>
                    </div>
                    ${callBtn}
                </div>`;
            }).join('');
        }).catch(()=>{ results.innerHTML='<div class="nearby-empty" style="grid-column:1/-1;">❌ Network error. আবার চেষ্টা করুন।</div>'; btn.textContent='📡 খুঁজুন'; btn.disabled=false; });
    }, err=>{
        btn.textContent='📡 খুঁজুন'; btn.disabled=false;
        let msg = '📍 Location পাওয়া যায়নি।';
        if(err.code===1) msg = '📍 Location permission দিন। Settings এ গিয়ে Allow করুন।';
        results.innerHTML=`<div class="nearby-empty" style="grid-column:1/-1;">
            <div style="font-size:2.5rem;margin-bottom:10px;">📍</div>
            <p style="font-weight:600;">${msg}</p>
            <button class="req-call-btn" style="margin-top:12px;" onclick="loadNearbyDonors()">🔄 আবার চেষ্টা করুন</button>
        </div>`;
    },{timeout:15000, enableHighAccuracy:true});
}

// ============================================================
// FEATURE: NEARBY REQUESTS (GPS) — কাছের জরুরি রক্তের অনুরোধ
//  Nearby Donors-এর সমান্তরাল। GPS দিলে দূরত্ব-ভিত্তিক; denied/no-GPS হলে
//  server সব active request fallback হিসেবে দেয় (fallback=true)।
// ============================================================
function loadNearbyRequests(){
    const btn = document.getElementById('nearbyReqLoadBtn');
    const results = document.getElementById('nearbyReqResults');
    if(!results) return;
    if(btn){ btn.textContent = '⏳ Location নিচ্ছে...'; btn.disabled = true; }

    var _run = function(lat, lng){
        if(btn){ btn.textContent = '⏳ Requests খুঁজছে...'; }
        const fd = new FormData();
        fd.append('get_nearby_requests','1');
        if(lat != null && lng != null){ fd.append('lat', lat); fd.append('lng', lng); }
        fd.append('radius', (document.getElementById('nearbyReqRadius')||{}).value || '5');
        fd.append('filter_group', (document.getElementById('nearbyReqGroupFilter')||{}).value || 'All');
        fd.append('csrf_token', CSRF_TOKEN);
        fetch(_AJAX_URL,{method:'POST',body:fd})
        .then(safeJSON)
        .then(function(d){
            if(btn){ btn.textContent = '🔄 আবার খুঁজুন'; btn.disabled = false; }
            if(!d || d.status !== 'success'){
                results.innerHTML = '<div class="nearby-empty" style="grid-column:1/-1;">❌ '+((d&&d.msg)||'লোড করতে সমস্যা')+'</div>';
                return;
            }
            _renderNearbyRequests(d.requests || [], !!d.fallback, (lat != null));
        })
        .catch(function(){
            if(btn){ btn.textContent = '📡 খুঁজুন'; btn.disabled = false; }
            results.innerHTML = '<div class="nearby-empty" style="grid-column:1/-1;">❌ Network error. আবার চেষ্টা করুন।</div>';
        });
    };

    if(!navigator.geolocation){ _run(null, null); return; } // GPS নেই → fallback
    navigator.geolocation.getCurrentPosition(
        function(pos){ _run(pos.coords.latitude, pos.coords.longitude); },
        function(){ _run(null, null); },   // denied/unavailable → server fallback (সব active)
        { timeout:15000, enableHighAccuracy:true }
    );
}

// Render nearby-request cards (reuses .req-card look). Data is server-escaped
// (esc()) — injected directly, same trust model as Nearby Donors.
function _renderNearbyRequests(reqs, fallback, hadGps){
    const results = document.getElementById('nearbyReqResults');
    if(!results) return;
    if(!reqs.length){
        results.innerHTML = '<div class="nearby-empty" style="grid-column:1/-1;">'
            + '<div style="font-size:2.5rem;margin-bottom:10px;">🕊️</div>'
            + '<p style="font-weight:600;">এই মুহূর্তে কোনো active request নেই</p>'
            + '<p style="font-size:0.85em;color:var(--text-muted);margin-top:5px;">পরে আবার দেখুন</p></div>';
        return;
    }
    const urgencyClass = {Critical:'critical', High:'high', Medium:'medium'};
    const urgencyIcon  = {Critical:'🔴', High:'🟠', Medium:'🔵'};
    const timeAgo = function(dt){
        var unix = parseInt(dt,10);
        var ms = isNaN(unix) ? Date.parse(dt) : unix*1000;
        var diff = Math.floor((Date.now()-ms)/60000);
        if(isNaN(diff) || diff < 1) return 'এইমাত্র';
        if(diff < 60)   return diff+'মিনিট আগে';
        if(diff < 1440) return Math.floor(diff/60)+'ঘণ্টা আগে';
        return Math.floor(diff/1440)+'দিন আগে';
    };
    const fmtReq = function(ts){
        var unix = parseInt(ts,10);
        if(!unix || isNaN(unix)) return '';
        try { return new Date(unix*1000).toLocaleString('bn-BD',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}); }
        catch(e){ return new Date(unix*1000).toLocaleString(); }
    };
    var note = fallback
        ? '<div style="grid-column:1/-1;font-size:0.8em;color:var(--text-muted);background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:10px;padding:9px 12px;margin-bottom:2px;line-height:1.5;">📍 '
          + (hadGps ? 'কাছাকাছি geo-tagged request নেই — সব active request দেখানো হচ্ছে।' : 'Location ছাড়া — সব active request দেখানো হচ্ছে।')
          + '</div>'
        : '';
    results.innerHTML = note + reqs.map(function(r){
        var uc = urgencyClass[r.urgency] || 'high';
        var distLine = (r.dist != null)
            ? '<div class="req-card-hosp">📏 '+r.dist+' km দূরে (আনুমানিক)</div>'
            : '';
        return '<div class="req-card '+uc+'">'
            + '<div style="display:flex;justify-content:space-between;align-items:flex-start;">'
            +   '<span class="req-card-urgency '+uc+'">'+(urgencyIcon[r.urgency]||'')+' '+r.urgency+'</span>'
            +   '<span style="font-size:0.75em;color:var(--text-muted);">'+timeAgo(r.created_at)+'</span>'
            + '</div>'
            + '<div class="req-card-group">🩸 '+r.blood_group+'</div>'
            + '<div class="req-card-name">👤 '+r.patient_name+'</div>'
            + '<div class="req-card-hosp">🏥 '+r.hospital+'</div>'
            + distLine
            + '<div style="font-size:0.74em;margin:3px 0 0;font-weight:700;color:'+(parseInt(r.verified_location)?'#10b981':'#f59e0b')+';">'+(parseInt(r.verified_location)?'✅ Verified Location':'⚠️ Unverified Location')+'</div>'
            + '<div class="req-card-meta">'
            +   '<span class="req-tag">🩸 '+r.bags_needed+' ব্যাগ</span>'
            +   (r.required_at ? '<span class="req-tag">⏰ '+fmtReq(r.required_at)+'</span>' : '')
            +   (r.note ? '<span class="req-tag">📝 '+r.note+'</span>' : '')
            + '</div>'
            + '<button class="req-call-btn" onclick="window.location=\'tel:'+r.contact+'\'">📞 '+r.contact+' — এখনই Call করুন</button>'
            + '</div>';
    }).join('');
}

// ============================================================
// LIVE NOTIFICATION SYSTEM — 30s polling, toast, bell
// ============================================================
let _lnTimer = null;
let _seenIds  = new Set();

function toggleNPanel() {
    var p = document.getElementById('nPanel');
    if (!p) return;
    p.classList.toggle('show');
    if (p.classList.contains('show')) {
        var badge = document.getElementById('nBadge');
        if (badge) badge.classList.remove('on');
        // Clear PWA app icon badge when the user opens the panel
        if ('clearAppBadge' in navigator && 'Notification' in window && Notification.permission === 'granted') {
            navigator.clearAppBadge().catch(function(){});
        }
        // Always refresh incoming contact requests; also refresh the service
        // list when that tab is the active one.
        if (typeof _loadContactRequests === 'function') _loadContactRequests();
        if (typeof _currentNTab !== 'undefined' && _currentNTab === 'service' && typeof _loadSvcNotifs === 'function') _loadSvcNotifs();
        _focusPanel();
    }
    // aria-expanded, scroll-lock and the live-time ticker are handled centrally
    // by the panel observer below, so every open/close path stays in sync.
}
document.addEventListener('click', function(e){
    // Close notification panel — check bell wrap AND panel itself
    const w = document.getElementById('nBellWrap');
    const p = document.getElementById('nPanel');
    if(p && p.classList.contains('show')) {
        if((!w || !w.contains(e.target)) && !p.contains(e.target)) {
            p.classList.remove('show');
        }
    }
    // Close mobile nav
    const nav = document.getElementById('siteNav');
    if (nav && !nav.contains(e.target)) {
        const links = document.getElementById('navLinks');
        if (links && links.classList.contains('open')) {
            links.classList.remove('open');
            document.body.style.overflow = '';
        }
    }
});

// Escape closes the notification panel and returns focus to the bell (a11y).
// The panel observer handles aria-expanded / scroll-unlock / ticker on close.
document.addEventListener('keydown', function(e){
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    var p = document.getElementById('nPanel');
    if (p && p.classList.contains('show')) {
        p.classList.remove('show');
        var bell = document.getElementById('nBell');
        if (bell) { try { bell.focus(); } catch(err){} }
    }
});

function showToast(r, type) {
    const wrap = document.getElementById('toastWrap');
    if(!wrap) return;
    // If called with a plain string (e.g. GPS error), show simple toast
    if (typeof r === 'string') {
        const el = document.createElement('div');
        el.className = 'toast-item';
        const ico = type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
        el.innerHTML = '<div class="toast-ico">' + ico + '</div>'
            + '<div class="toast-bd"><div class="toast-sub" style="color:var(--text-main);font-size:0.88em;">' + r + '</div></div>'
            + '<button class="toast-x" onclick="var t=this.closest(\'.toast-item\');t.classList.add(\'bye\');setTimeout(function(){t.remove()},260)">✕</button>';
        wrap.appendChild(el);
        setTimeout(function(){ if(el.parentNode){el.classList.add('bye');setTimeout(function(){el.remove();},260);} }, 4000);
        return;
    }
    // Blood request object toast — শুধু in-app toast, system notification showSystemNotif() করে
    const icons={Critical:'🔴',High:'🟠',Medium:'🔵'};
    const el = document.createElement('div');
    el.className = 'toast-item';
    el.innerHTML = '<div class="toast-ico">🆘</div>'
        + '<div class="toast-bd">'
        + '<div class="toast-ttl">' + (icons[r.urgency]||'🟠') + ' ' + (r.urgency||'') + ' — ' + (r.blood_group||'') + ' রক্ত দরকার!</div>'
        + '<div class="toast-sub">🏥 ' + (r.hospital||'') + '<br>📞 ' + (r.contact||'') + '</div>'
        + '</div>'
        + '<button class="toast-x" onclick="var t=this.closest(\'.toast-item\');t.classList.add(\'bye\');setTimeout(function(){t.remove()},260)">✕</button>';
    wrap.appendChild(el);
    setTimeout(function(){ if(el.parentNode){el.classList.add('bye');setTimeout(function(){el.remove();},260);} }, 7000);
    // FIX: system notification সরানো হয়েছে — showSystemNotif() এখন এটা handle করে
    // Play notification sound for new blood requests
    if (localStorage.getItem('sound_off') !== '1') {
        try {
            const s = document.getElementById('successSound');
            if (s) { s.currentTime = 0; s.play().catch(function(){}); }
        } catch(e) {}
    }
}

// ── Mark-as-read — localStorage-এ read request IDs রাখি ──────
var _readIds = (function(){
    try { return new Set(JSON.parse(localStorage.getItem('notif_read_ids') || '[]')); }
    catch(e) { return new Set(); }
})();
function _saveReadIds() {
    try { localStorage.setItem('notif_read_ids', JSON.stringify([..._readIds])); } catch(e) {}
}
function markNotifRead(reqId) {
    _readIds.add(String(reqId));
    _saveReadIds();
    // Panel re-render — current data থেকে unread গুলো দেখাও
    refreshNPanel(_reqAllData || []);
}
function markAllNotifRead() {
    (_reqAllData || []).forEach(function(r){ _readIds.add(String(r.id)); });
    _saveReadIds();
    refreshNPanel(_reqAllData || []);
}

// ============================================================
// NOTIFICATION PANEL — shared helpers
// ============================================================
// Escape server-supplied text before it lands in innerHTML.
function _escHtml(s){
    return String(s == null ? '' : s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
// Friendly empty state — replaces the fragile .notif-empty:first-line trick.
function _emptyState(ico, title, sub){
    return '<div class="notif-empty">'
        + '<div class="notif-empty-ico">' + ico + '</div>'
        + '<div class="notif-empty-title">' + title + '</div>'
        + (sub ? '<div class="notif-empty-sub">' + sub + '</div>' : '')
        + '</div>';
}
// Unified bell badge — THE single place the bell number is computed. Both
// 30s pollers (blood + service) call this, so they can no longer fight over
// #nBadge (old bug: blood-only vs blood+svc → flicker; service→0 left the
// bell stuck). Deleting a request drops bloodUnread here too, so the bell
// clears the instant the request leaves _reqAllData.
function updateBellBadge(){
    var badge = document.getElementById('nBadge');
    var panel = document.getElementById('nPanel');
    if (!badge) return;
    var bloodUnread = (_reqAllData    || []).filter(function(r){ return !_readIds.has(String(r.id)); }).length;
    var svcUnread   = (_svcNotifsData || []).filter(function(n){ return !n.is_read; }).length;
    var total = bloodUnread + svcUnread;
    var open  = !!(panel && panel.classList.contains('show'));
    if (total > 0){
        badge.textContent = total > 9 ? '9+' : String(total);
        if (open) badge.classList.remove('on'); else badge.classList.add('on');
    } else {
        badge.textContent = '';
        badge.classList.remove('on');
    }
    if ('Notification' in window && Notification.permission === 'granted'){
        if (total > 0 && 'setAppBadge' in navigator) navigator.setAppBadge(total).catch(function(){});
        else if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(function(){});
    }
}
// Live-aging timestamps — re-stamp visible relative times every 60s while the
// panel is open (started/stopped by the panel observer + toggleNPanel).
var _nTimeTimer = null;
function _startNTimeTicker(){ if (!_nTimeTimer) _nTimeTimer = setInterval(_restampTimes, 60000); }
function _stopNTimeTicker(){ if (_nTimeTimer){ clearInterval(_nTimeTimer); _nTimeTimer = null; } }
function _restampTimes(){
    document.querySelectorAll('#nSvcList .svc-notif-time[data-ts]').forEach(function(el){
        var ts = parseInt(el.getAttribute('data-ts'), 10);
        if (ts && typeof _relTime === 'function') el.textContent = _relTime(ts);
    });
    document.querySelectorAll('#nContactReqList [data-cts]').forEach(function(el){
        var ts = parseInt(el.getAttribute('data-cts'), 10);
        if (ts && typeof _ctTimeAgo === 'function') el.textContent = _ctTimeAgo(ts);
    });
}
// a11y: drop keyboard focus into the panel when it opens.
function _focusPanel(){
    setTimeout(function(){
        var p = document.getElementById('nPanel');
        if (!p || !p.classList.contains('show')) return;
        var t = p.querySelector('.notif-tab-btn.active') || p.querySelector('button');
        if (t){ try { t.focus(); } catch(e){} }
    }, 30);
}
// "More below" scroll hint — toggle a bottom fade when the panel can scroll
// further down (so users can tell there's clipped/long content to scroll to).
function _updateNScrollHint(){
    var p = document.getElementById('nPanel');
    if (!p) return;
    p.classList.toggle('can-scroll-down', (p.scrollHeight - p.clientHeight - p.scrollTop) > 6);
}
var _hintRaf = false;
function _scheduleHint(){
    if (_hintRaf) return; _hintRaf = true;
    requestAnimationFrame(function(){ _hintRaf = false; _updateNScrollHint(); });
}

function refreshNPanel(reqs) {
    const list  = document.getElementById('nList');
    const count = document.getElementById('nCount');
    if(!list) return;

    // Read filter — read করা IDs বাদ দাও
    const unread = reqs.filter(function(r){ return !_readIds.has(String(r.id)); });

    if(!unread.length) {
        list.innerHTML = (reqs.length && _readIds.size)
            ? _emptyState('✅', 'সব পড়া হয়েছে', 'নতুন request এলে এখানে দেখা যাবে')
            : _emptyState('🆘', 'কোনো active request নেই', 'নতুন emergency request এলে সাথে সাথে এখানে আসবে');
        if(count) count.textContent = '';
        var btb0 = document.getElementById('nTabBloodBadge');
        if (btb0) btb0.style.display = 'none';
        updateBellBadge();
        return;
    }

    if(count) count.textContent = unread.length + 'টি unread';
    const icons = {Critical:'🔴', High:'🟠', Medium:'🔵'};

    list.innerHTML = unread.map(function(r){
        return '<div class="notif-row">'
            + '<div class="notif-row-left" onclick="toggleRequestSection();document.getElementById(\'nPanel\').classList.remove(\'show\')">'
            + '<div class="notif-row-grp">' + _escHtml(r.blood_group) + ' <span style="font-size:0.55em;font-weight:700;">' + (icons[r.urgency]||'') + ' ' + _escHtml(r.urgency) + '</span></div>'
            + '<div class="notif-row-info">🏥 ' + _escHtml(r.hospital) + '<br>📞 ' + _escHtml(r.contact) + '</div>'
            + '</div>'
            + '<button class="notif-mark-btn" onclick="event.stopPropagation();markNotifRead(' + r.id + ')" title="Mark as read">✓ Read</button>'
            + '</div>';
    }).join('');

    // Mark All Read button
    list.innerHTML += '<button class="notif-panel-mark-all" onclick="markAllNotifRead()">✓ সব Mark as Read করুন</button>';

    // Blood tab badge
    var bloodTabBadge = document.getElementById('nTabBloodBadge');
    if (bloodTabBadge) {
        bloodTabBadge.textContent = unread.length;
        bloodTabBadge.style.display = '';
    }
    updateBellBadge();
}

function startLiveNotif() {
    if(_lnTimer) return;
    function poll() {
        // Tab hidden থাকলে poll করব না — network save
        if (document.hidden) return;
        var fd = new FormData();
        fd.append('get_blood_requests','1');
        fd.append('csrf_token', CSRF_TOKEN);
        fetch(_AJAX_URL,{method:'POST',body:fd})
        .then(safeJSON)
        .then(function(reqs){
            var newOnes = reqs.filter(function(r){return !_seenIds.has(String(r.id));});
            if(_seenIds.size>0 && newOnes.length>0) {
                // FIX: showToast বদলে showSystemNotif — in-app toast বন্ধ,
                // শুধু phone notification panel-এ system notification যাবে
                newOnes.forEach(function(r){ showSystemNotif(r); });
                triggerBellRing();
                // নতুন request এলে read list থেকে সরাও — unread হিসেবে দেখাবে
                newOnes.forEach(function(r){ _readIds.delete(String(r.id)); });
                _saveReadIds();
            }
            reqs.forEach(function(r){_seenIds.add(String(r.id));});
            // _reqAllData সব সময় update রাখো — refreshNPanel এটা ব্যবহার করে
            _reqAllData = reqs;
            refreshNPanel(reqs);
            // Re-render the Active Requests grid only while its page is on screen
            // (mobile: page-active; desktop: all pages are always visible).
            var reqPage = document.getElementById('page-requests');
            var reqVisible = reqPage && (reqPage.classList.contains('page-active') || window.innerWidth > 650);
            if(reqVisible) {
                applyReqFilter();
            }
        }).catch(function(){});
    }
    poll();
    _lnTimer = setInterval(poll, 30000);
    // Tab visible হলে immediately poll করি
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) poll();
    });
}
window.addEventListener('load', startLiveNotif);
window.addEventListener('load', startSvcNotifPoll);

// ============================================================
// DEVICE ID — localStorage UUID, persistent per browser
// Save হয় exactly একবার — same ID থাকলে আর পাঠায় না।
// Cache clear বা নতুন browser = নতুন ID = আবার একবার save।
// ============================================================
function getDeviceId() {
    var id = localStorage.getItem('ba_device_id');
    if (!id) {
        id = 'dev_' + Math.random().toString(36).substr(2,9) + '_' + Date.now().toString(36);
        localStorage.setItem('ba_device_id', id);
    }
    return id;
}

(function() {
    window.addEventListener('load', function() {
        var currentId  = getDeviceId();
        var lastSavedId = localStorage.getItem('ba_device_saved_id');
        if (lastSavedId === currentId) return; // same ID — already saved, skip
        setTimeout(function() {
            _saveDeviceId('first_visit');
            localStorage.setItem('ba_device_saved_id', currentId);
        }, 800);
    });
})();
// ============================================================
// NOTIFICATION PANEL — 2-TAB SYSTEM
// ============================================================
var _currentNTab = 'blood'; // 'blood' | 'service'

function switchNTab(tab) {
    _currentNTab = tab;
    var bloodBtn  = document.getElementById('nTabBlood');
    var svcBtn    = document.getElementById('nTabSvc');
    var bloodCont = document.getElementById('nTabBloodContent');
    var svcCont   = document.getElementById('nTabSvcContent');
    var isBlood = (tab === 'blood');
    if (bloodBtn) {
        bloodBtn.classList.toggle('active', isBlood);
        bloodBtn.setAttribute('aria-selected', isBlood ? 'true' : 'false');
        bloodBtn.tabIndex = isBlood ? 0 : -1;
    }
    if (svcBtn) {
        svcBtn.classList.toggle('active', !isBlood);
        svcBtn.setAttribute('aria-selected', !isBlood ? 'true' : 'false');
        svcBtn.tabIndex = !isBlood ? 0 : -1;
    }
    if (bloodCont) bloodCont.style.display = isBlood ? '' : 'none';
    if (svcCont)   svcCont.style.display   = isBlood ? 'none' : '';
    if (!isBlood) {
        // Load fresh service notifs when the tab is opened
        _loadSvcNotifs();
    }
}

// Arrow-key roving between the two notification tabs (a11y, role=tablist).
['nTabBlood','nTabSvc'].forEach(function(id){
    var btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('keydown', function(e){
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            switchNTab(_currentNTab === 'blood' ? 'service' : 'blood');
            var next = document.getElementById(_currentNTab === 'blood' ? 'nTabBlood' : 'nTabSvc');
            if (next) { try { next.focus(); } catch(err){} }
        }
    });
});

// (The old toggleNPanel override was removed — the single toggleNPanel above
//  now handles tab-aware reloads, and the observer below owns the rest.)

// Panel observer — the ONE place that reacts to the panel opening/closing.
// Every open/close path (toggle, outside-click, Escape, row-click) flips the
// 'show' class, so all side-effects live here: background scroll-lock,
// aria-expanded, the live-time ticker, and a final badge recompute on close.
(function(){
    var p = document.getElementById('nPanel');
    if (!p || !window.MutationObserver) return;
    var _savedY = 0, _locked = false;
    function lock() {
        if (_locked) return;
        _locked = true;
        _savedY = window.scrollY || window.pageYOffset || 0;
        document.body.style.top = '-' + _savedY + 'px';
        document.body.classList.add('npanel-scroll-lock');
    }
    function unlock() {
        if (!_locked) return;
        _locked = false;
        document.body.classList.remove('npanel-scroll-lock');
        document.body.style.top = '';
        window.scrollTo(0, _savedY);
    }
    new MutationObserver(function(){
        var open = p.classList.contains('show');
        var bell = document.getElementById('nBell');
        if (bell) bell.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) { lock(); _startNTimeTicker(); _scheduleHint(); }
        else { unlock(); _stopNTimeTicker(); updateBellBadge(); }
    }).observe(p, { attributes: true, attributeFilter: ['class'] });

    // "More below" hint: recompute on scroll, on resize, and whenever the panel's
    // content height changes (polls, mark-read, filter, tab switch).
    p.addEventListener('scroll', _scheduleHint, { passive: true });
    window.addEventListener('resize', _scheduleHint);
    new MutationObserver(_scheduleHint).observe(p, { childList: true, subtree: true });
})();

// ============================================================
// SERVICE NOTIFICATIONS — device-specific, polls every 30s
// ============================================================
var _svcNotifTimer = null;
var _svcNotifsData = [];

function startSvcNotifPoll() {
    if (_svcNotifTimer) return;
    _loadSvcNotifs();
    _svcNotifTimer = setInterval(function() {
        if (!document.hidden) _loadSvcNotifs();
    }, 30000);
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) _loadSvcNotifs();
    });
}

function _loadSvcNotifs() {
    if (typeof _loadContactRequests === 'function') _loadContactRequests();
    var fd = new FormData();
    fd.append('get_service_notifs', '1');
    fd.append('device_id', getDeviceId());
    fd.append('csrf_token', CSRF_TOKEN);
    fetch(_AJAX_URL, {method:'POST', body:fd})
    .then(safeJSON)
    .then(function(notifs) {
        // Read notifications filter — server থেকে আসা read items render করে না
        _svcNotifsData = (notifs || []).filter(function(n){ return !n.is_read; });
        _renderSvcNotifs(_svcNotifsData);
        _updateSvcBadge(_svcNotifsData);
        // Trigger bell ring for new unread service notifs
        var unread = _svcNotifsData.filter(function(n){ return !n.is_read; });
        if (unread.length > 0) triggerBellRing();
    }).catch(function(){});
}

// Service-notif type → icon + left-accent colour group (shared by render paths).
var _svcIconMap = {
    'secret_reset':'🔑', 'location_on':'📍', 'notif_on':'🔔',
    'secret_code_ready':'✅', 'info':'ℹ️', 'warning':'⚠️', 'admin_reply':'💬',
    'welcome':'🎉', 'donor_called':'📞', 'blood_request':'🆘', 'contact_request':'🩸',
    'donation_verified':'🎉', 'code_redeemed':'✅'
};
var _svcAccentMap = {
    'blood_request':'red', 'warning':'red',
    'contact_request':'pink',
    'donation_verified':'green', 'code_redeemed':'green', 'secret_code_ready':'green',
    'notif_on':'green', 'location_on':'green', 'welcome':'green',
    'donor_called':'blue', 'admin_reply':'blue', 'info':'blue'
};
// Ids already shown, so freshly-arrived notifs can pulse once (mirrors the
// blood "new request" detection). Empty on first paint → no pulse on load.
var _svcSeenIds = new Set();

// Build a single service-notif row's HTML (escaped). `fresh` adds the pulse.
function _svcRowHtml(n, fresh) {
    var icon   = _svcIconMap[n.type] || 'ℹ️';
    var accent = _svcAccentMap[n.type] || 'grey';
    var rel    = n.ts ? _relTime(n.ts) : '';
    var abs    = n.ts ? new Date(n.ts * 1000).toLocaleString('bn-BD') : '';
    var unreadCls = !n.is_read ? ' unread' : '';
    var freshCls  = fresh ? ' just-arrived' : '';
    var readBtn = !n.is_read
        ? '<button class="svc-notif-read-btn" onclick="event.stopPropagation();markSvcNotifRead(' + n.id + ')" title="Mark as read">✓ পড়েছি</button>'
        : '';
    var delBtn = '<button class="svc-notif-del-btn" onclick="event.stopPropagation();deleteSvcNotif(' + n.id + ')" title="মুছুন" aria-label="Delete notification">🗑</button>';
    return '<div class="svc-notif-row accent-' + accent + unreadCls + freshCls + '" id="svcn_' + n.id + '" data-type="' + _escHtml(n.type||'') + '">'
        + '<div class="svc-notif-icon">' + icon + '</div>'
        + '<div class="svc-notif-body">'
        + '<div class="svc-notif-msg">' + _escHtml(n.message || '') + '</div>'
        + '<div class="svc-notif-time" data-ts="' + (n.ts || '') + '" title="' + _escHtml(abs) + '">' + rel + '</div>'
        + '</div>'
        + '<div class="svc-notif-actions">' + readBtn + delBtn + '</div>'
        + '</div>';
}

// All / Unread view filter (Services tab). Data stays intact in _svcNotifsData.
var _svcFilter = 'all'; // 'all' | 'unread'
function setSvcFilter(mode){
    _svcFilter = (mode === 'unread') ? 'unread' : 'all';
    var a = document.getElementById('svcFilterAll');
    var u = document.getElementById('svcFilterUnread');
    if (a) a.classList.toggle('active', _svcFilter === 'all');
    if (u) u.classList.toggle('active', _svcFilter === 'unread');
    _renderSvcNotifs(_svcNotifsData || []);
}

function _renderSvcNotifs(notifs) {
    var list = document.getElementById('nSvcList');
    if (!list) return;
    var countEl = document.getElementById('nSvcCount');
    var unread = notifs.filter(function(n){ return !n.is_read; });
    if (countEl) countEl.textContent = unread.length ? unread.length + 'টি unread' : '';

    // Apply the All/Unread view filter (the count above always reflects unread).
    var view = (_svcFilter === 'unread') ? unread : notifs;

    if (!view.length) {
        list.innerHTML = (_svcFilter === 'unread' && notifs.length)
            ? _emptyState('✅', 'কোনো unread নেই', 'সব notification পড়া হয়েছে')
            : _emptyState('🔔', 'কোনো notification নেই', 'নতুন আপডেট এলে এখানে দেখা যাবে');
        notifs.forEach(function(n){ _svcSeenIds.add(String(n.id)); });
        return;
    }

    var primed = _svcSeenIds.size > 0; // don't pulse the very first batch
    var rowOf  = function(n){ return _svcRowHtml(n, primed && !_svcSeenIds.has(String(n.id))); };
    // Unread first, then newest first (server already sends ts DESC).
    var byUnreadThenNew = function(a, b){
        var ar = a.is_read ? 1 : 0, br = b.is_read ? 1 : 0;
        if (ar !== br) return ar - br;
        return (b.ts || 0) - (a.ts || 0);
    };

    // Group by Today / Earlier (local start-of-day). Labels only show when the
    // list actually spans both — a lone group needs no header.
    var sod = new Date(); sod.setHours(0,0,0,0);
    var startOfToday = Math.floor(sod.getTime() / 1000);
    var today = [], earlier = [];
    view.forEach(function(n){ ((n.ts||0) >= startOfToday ? today : earlier).push(n); });
    today.sort(byUnreadThenNew); earlier.sort(byUnreadThenNew);
    var split = today.length && earlier.length;

    var html = '';
    if (today.length)   html += (split ? '<div class="notif-group-label">আজ</div>'   : '') + today.map(rowOf).join('');
    if (earlier.length) html += (split ? '<div class="notif-group-label">আগের</div>' : '') + earlier.map(rowOf).join('');
    list.innerHTML = html;

    // Remember what we've shown so the next render only pulses genuinely-new ids.
    notifs.forEach(function(n){ _svcSeenIds.add(String(n.id)); });

    // Attach swipe-to-dismiss (touch only — desktop uses the hover 🗑 button).
    list.querySelectorAll('.svc-notif-row').forEach(function(row) {
        _attachSwipeDismiss(row);
    });

    if (unread.length) {
        list.innerHTML += '<button class="notif-panel-mark-all" onclick="markAllSvcNotifsRead()" style="margin-top:4px;">✓ সব Read করুন</button>';
    }
}

// Relative time in Bangla ("এইমাত্র", "৫ মিনিট আগে", "২ ঘণ্টা আগে", ...)
function _relTime(ts) {
    var bn = function(num){ return String(num).replace(/[0-9]/g, function(d){ return '০১২৩৪৫৬৭৮৯'[+d]; }); };
    var s = Math.max(0, Math.floor(Date.now()/1000 - ts));
    if (s < 45) return 'এইমাত্র';
    var m = Math.floor(s/60);
    if (m < 60) return bn(m) + ' মিনিট আগে';
    var h = Math.floor(m/60);
    if (h < 24) return bn(h) + ' ঘণ্টা আগে';
    var d = Math.floor(h/24);
    if (d < 7) return bn(d) + ' দিন আগে';
    return new Date(ts*1000).toLocaleDateString('bn-BD', {day:'numeric', month:'long'});
}

// ── Incoming contact requests (donor side, point #3 / #8) ─────
//  Allow Call OFF donor-এর কাছে আসা request। Accept করলে requester-এর নাম+phone
//  দেখা যায় (server শুধু accepted হলেই phone পাঠায়), donor নিজে যোগাযোগ করে।
var _contactReqData = [];
function _loadContactRequests(){
    var section = document.getElementById('nContactReqSection');
    if(typeof _isSignedIn==='function' && !_isSignedIn()){ if(section) section.style.display='none'; return; }
    var fd = new FormData();
    fd.append('get_my_contact_requests','1');
    fd.append('csrf_token', CSRF_TOKEN);
    fetch(_AJAX_URL,{method:'POST',body:fd})
    .then(safeJSON)
    .then(function(d){
        if(!d || d.status!=='success'){ if(section) section.style.display='none'; return; }
        _contactReqData = d.requests || [];
        _renderContactRequests();
    }).catch(function(){});
}
function _renderContactRequests(){
    var section = document.getElementById('nContactReqSection');
    var list = document.getElementById('nContactReqList');
    var cnt  = document.getElementById('nContactReqCount');
    if(!section || !list) return;
    if(!_contactReqData.length){ section.style.display='none'; list.innerHTML=''; if(cnt) cnt.textContent=''; return; }
    section.style.display='block';
    var pending = _contactReqData.filter(function(r){ return r.status==='pending'; }).length;
    if(cnt) cnt.textContent = pending ? (pending+'টি নতুন') : '';
    list.innerHTML = _contactReqData.map(function(r){
        var head = '<div class="creq-head">'
            + '<strong class="creq-title">🩸 '+_escHtml(r.blood_group||'')+' · '+_escHtml(r.requester_name||'একজন')+'</strong>'
            + '<span class="creq-time" data-cts="'+(parseInt(r.created_at,10)||'')+'">'+_ctTimeAgo(r.created_at)+'</span></div>';
        var msg = r.message ? '<div class="creq-msg">📝 '+_escHtml(r.message)+'</div>' : '';
        var action;
        if(r.status==='accepted' && r.requester_phone){
            action = '<a class="creq-call" href="tel:'+_escHtml(r.requester_phone)+'">📞 '+_escHtml(r.requester_phone)+' — Call করুন</a>';
        } else if(r.status==='accepted'){
            action = '<div class="creq-accepted">✅ Accepted</div>';
        } else {
            action = '<div class="creq-actions">'
                + '<button class="creq-accept" onclick="acceptContactRequest('+r.id+')">✅ Accept ও যোগাযোগ</button>'
                + '<button class="creq-decline" onclick="declineContactRequest('+r.id+')" aria-label="Decline">✖</button></div>';
        }
        return '<div class="creq-card">'+head+msg+action+'</div>';
    }).join('');
}

// Compact relative time for contact-request cards ("এইমাত্র / ৫মি আগে / ...").
function _ctTimeAgo(ts){
    var u = parseInt(ts,10); if(!u) return '';
    var diff = Math.floor((Date.now()-u*1000)/60000);
    if(diff<1)    return 'এইমাত্র';
    if(diff<60)   return diff+'মি আগে';
    if(diff<1440) return Math.floor(diff/60)+'ঘ আগে';
    return Math.floor(diff/1440)+'দিন আগে';
}
function acceptContactRequest(id){
    var fd = new FormData();
    fd.append('act_contact_request','1'); fd.append('request_id', id); fd.append('act','accept');
    fd.append('csrf_token', CSRF_TOKEN);
    fetch(_AJAX_URL,{method:'POST',body:fd})
    .then(safeJSON)
    .then(function(d){
        if(d && d.status==='success'){
            for(var i=0;i<_contactReqData.length;i++){ if(_contactReqData[i].id==id){ _contactReqData[i].status='accepted'; _contactReqData[i].requester_phone=d.requester_phone; break; } }
            _renderContactRequests();
            showToast(d.msg||'✅ Accept হয়েছে।','info');
        } else { showToast((d&&d.msg)||'ব্যর্থ হয়েছে।','error'); }
    }).catch(function(){ showToast('Network error।','error'); });
}
function declineContactRequest(id){
    var fd = new FormData();
    fd.append('act_contact_request','1'); fd.append('request_id', id); fd.append('act','decline');
    fd.append('csrf_token', CSRF_TOKEN);
    fetch(_AJAX_URL,{method:'POST',body:fd})
    .then(safeJSON)
    .then(function(d){
        if(d && d.status==='success'){ _contactReqData = _contactReqData.filter(function(r){ return r.id != id; }); _renderContactRequests(); }
        else { showToast((d&&d.msg)||'ব্যর্থ হয়েছে।','error'); }
    }).catch(function(){ showToast('Network error।','error'); });
}

// Swipe-to-dismiss — TOUCH ONLY (Pointer Events gated to pointerType==='touch').
// Desktop deletes via the hover 🗑 button instead, so mouse text-selection can
// no longer trigger an accidental swipe. Only mostly-horizontal drags count, so
// vertical scrolling (touch-action:pan-y) still works.
function _attachSwipeDismiss(el) {
    if (!window.PointerEvent) return; // graceful: the 🗑 button still works
    var startX = 0, startY = 0, curX = 0, swiping = false;
    function onDown(e) {
        if (e.pointerType !== 'touch') return;
        startX = e.clientX; startY = e.clientY; curX = 0; swiping = true;
    }
    function onMove(e) {
        if (!swiping || e.pointerType !== 'touch') return;
        curX = e.clientX - startX;
        var dy = Math.abs(e.clientY - startY);
        if (curX > 10 && curX > dy) { // right-swipe, mostly-horizontal only
            el.style.transform = 'translateX(' + Math.min(curX, 120) + 'px)';
            el.style.opacity = String(1 - curX / 200);
        }
    }
    function onUp() {
        if (!swiping) return;
        swiping = false;
        if (curX > 80) {
            var m = el.id.match(/svcn_(\d+)/);
            if (m) { deleteSvcNotif(parseInt(m[1], 10)); return; }
        }
        el.style.transform = '';
        el.style.opacity = '';
    }
    el.addEventListener('pointerdown',   onDown);
    el.addEventListener('pointermove',   onMove);
    el.addEventListener('pointerup',     onUp);
    el.addEventListener('pointercancel', onUp);
}

// Show the empty state once the last service-notif row is gone (single delete
// only removes its DOM node; this keeps the panel consistent without a poll).
function _afterSvcRemoval() {
    var list = document.getElementById('nSvcList');
    if (list && !list.querySelector('.svc-notif-row')) _renderSvcNotifs([]);
}

function deleteSvcNotif(id) {
    var el = document.getElementById('svcn_' + id);
    if (el) {
        el.classList.add('swiping-out');
        setTimeout(function() {
            if (el.parentNode) el.parentNode.removeChild(el);
            _afterSvcRemoval();
        }, 320);
    }
    _svcNotifsData = (_svcNotifsData || []).filter(function(n){ return n.id != id; });
    _updateSvcBadge(_svcNotifsData);
    _deleteSvcNotifServer(id); // ← permanently delete
}

function deleteAllSvcNotifs() {
    var list = document.getElementById('nSvcList');
    if (list) {
        list.querySelectorAll('.svc-notif-row').forEach(function(row) {
            row.classList.add('swiping-out');
        });
        setTimeout(function() {
            _svcNotifsData = [];
            _renderSvcNotifs([]);
            _updateSvcBadge([]);
        }, 320);
    }
    _deleteSvcNotifServer(0, true); // del_all=true
}

function _updateSvcBadge(notifs) {
    var badge  = document.getElementById('nTabSvcBadge');
    var unread = notifs.filter(function(n){ return !n.is_read; });
    if (badge) {
        if (unread.length) { badge.textContent = unread.length; badge.style.display = ''; }
        else { badge.style.display = 'none'; }
    }
    // The bell number is computed in ONE place now (blood + service combined).
    updateBellBadge();
}

function _markSvcNotifReadServer(id) {
    var fd = new FormData();
    fd.append('mark_service_notif_read', '1');
    fd.append('notif_id', id);
    fd.append('device_id', getDeviceId());
    fd.append('csrf_token', CSRF_TOKEN);
    fetch(_AJAX_URL, {method:'POST', body:fd}).catch(function(){});
}

// Bell থেকে মুছলে DB থেকে permanently delete — পরের poll এ আর আসবে না
function _deleteSvcNotifServer(id, delAll) {
    var fd = new FormData();
    fd.append('delete_service_notif', '1');
    fd.append('device_id', getDeviceId());
    fd.append('csrf_token', CSRF_TOKEN);
    if (delAll) {
        fd.append('del_all', '1');
    } else {
        fd.append('notif_id', id);
    }
    fetch(_AJAX_URL, {method:'POST', body:fd}).catch(function(){});
}

function markSvcNotifRead(id) {
    // Optimistic UI — local state update, NO re-fetch
    // (re-fetch করলে server থেকে সব notification ফিরে আসে — এটাই bug ছিল)
    _svcNotifsData = (_svcNotifsData || []).map(function(n){
        return n.id == id ? Object.assign({}, n, {is_read: 1}) : n;
    });
    _renderSvcNotifs(_svcNotifsData);
    _updateSvcBadge(_svcNotifsData);
    _markSvcNotifReadServer(id);
}

function markAllSvcNotifsRead() {
    var hadUnread = (_svcNotifsData || []).some(function(n){ return !n.is_read; });
    if (!hadUnread) return;
    // Local state once → render once → badge once (was N renders + N fetches).
    _svcNotifsData = (_svcNotifsData || []).map(function(n){
        return n.is_read ? n : Object.assign({}, n, {is_read: 1});
    });
    _renderSvcNotifs(_svcNotifsData);
    _updateSvcBadge(_svcNotifsData);
    // Single server round-trip via the new mark_all branch.
    var fd = new FormData();
    fd.append('mark_service_notif_read', '1');
    fd.append('mark_all', '1');
    fd.append('device_id', getDeviceId());
    fd.append('csrf_token', CSRF_TOKEN);
    fetch(_AJAX_URL, {method:'POST', body:fd}).catch(function(){});
}

// Send a service push notification to a device (called from admin panel side via PHP)
// Also: show system browser notification for service notifs
function _showSvcSystemNotif(msg, type) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    var iconMap = {'secret_reset':'🔑','secret_code_ready':'✅','location_on':'📍','notif_on':'🔔'};
    var icon = iconMap[type] || 'ℹ️';
    var opts = {
        body: msg,
        icon: '/?badge_icon=1',
        badge: '/?badge_icon=1',
        tag: 'svc_' + type + '_' + Date.now(),
        vibrate: [100, 50, 100],
        requireInteraction: false
    };
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(function(reg) {
            reg.showNotification(icon + ' Blood Arena — Service', opts).catch(function(){});
        });
    }
}

// ============================================================
// ADMIN MESSAGE MODAL
// ============================================================
function openAdminMessageModal() {
    // signed-in হলে name/phone prefill করো (account dashboard থেকে খুললে সুবিধা)
    var _auth = null;
    try { _auth = (typeof BA_AUTH !== 'undefined' && BA_AUTH) ? BA_AUTH : JSON.parse(localStorage.getItem('ba_auth') || 'null'); } catch(e){}
    document.getElementById('adm_sender_name').value = (_auth && _auth.name) ? _auth.name : '';
    document.getElementById('adm_sender_phone').value = (_auth && _auth.phone && /^\+8801\d{9}$/.test(_auth.phone)) ? _auth.phone : '+8801';
    document.getElementById('adm_sender_msg').value = '';
    document.getElementById('adm_msg_error').style.display = 'none';
    document.getElementById('adm_msg_success').style.display = 'none';
    var btn = document.getElementById('adm_msg_btn');
    if (btn) { btn.disabled = false; btn.textContent = '📤 পাঠান'; }
    openOverlay('adminMsgModal');
}

function closeAdminMsgModal() {
    closeOverlay('adminMsgModal');
}

function submitAdminMessage() {
    var name  = document.getElementById('adm_sender_name').value.trim();
    var phone = document.getElementById('adm_sender_phone').value.trim();
    var msg   = document.getElementById('adm_sender_msg').value.trim();
    var errEl = document.getElementById('adm_msg_error');
    var sucEl = document.getElementById('adm_msg_success');
    var btn   = document.getElementById('adm_msg_btn');
    errEl.style.display = 'none';
    sucEl.style.display = 'none';

    if (!name) { errEl.textContent = '❌ নাম দিন।'; errEl.style.display = 'block'; return; }
    if (!/^\+8801\d{9}$/.test(phone)) { errEl.textContent = '❌ সঠিক ফোন নম্বর দিন (+8801XXXXXXXXX)।'; errEl.style.display = 'block'; return; }
    if (!msg || msg.length < 5) { errEl.textContent = '❌ Message লিখুন (কমপক্ষে ৫ অক্ষর)।'; errEl.style.display = 'block'; return; }

    btn.disabled = true; btn.textContent = '⏳ পাঠানো হচ্ছে...';
    var fd = new FormData();
    fd.append('submit_admin_message', '1');
    fd.append('sender_name', name);
    fd.append('sender_phone', phone);
    fd.append('message', msg);
    fd.append('device_id', getDeviceId());
    fd.append('csrf_token', CSRF_TOKEN);

    fetch(_AJAX_URL, {method:'POST', body:fd})
    .then(safeJSON)
    .then(function(d) {
        btn.disabled = false; btn.textContent = '📤 পাঠান';
        if (d.status === 'success') {
            sucEl.textContent = d.msg || '✅ ধন্যবাদ! বার্তা পাঠানো হয়েছে।';
            sucEl.style.display = 'block';
            btn.disabled = true; btn.textContent = '✅ পাঠানো হয়েছে';
            document.getElementById('adm_sender_msg').value = '';
            // Start polling for admin reply
            _startAdminReplyPoll();
        } else {
            errEl.textContent = d.msg || '❌ কিছু ভুল হয়েছে।';
            errEl.style.display = 'block';
        }
    }).catch(function() {
        btn.disabled = false; btn.textContent = '📤 পাঠান';
        errEl.textContent = '❌ Network error। আবার চেষ্টা করুন।';
        errEl.style.display = 'block';
    });
}

// ── Admin Reply Polling — device-specific ────────────────
var _adminReplyTimer = null;
var _adminReplySeen = (function(){
    try { return new Set(JSON.parse(localStorage.getItem('adm_reply_seen')||'[]')); }
    catch(e){ return new Set(); }
})();
function _saveAdminReplySeen() {
    try { localStorage.setItem('adm_reply_seen', JSON.stringify([..._adminReplySeen])); } catch(e){}
}

function _startAdminReplyPoll() {
    if (_adminReplyTimer) return;
    _pollAdminReplies();
    _adminReplyTimer = setInterval(function() {
        if (!document.hidden) _pollAdminReplies();
    }, 30000);
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) _pollAdminReplies();
    });
}

function _pollAdminReplies() {
    var fd = new FormData();
    fd.append('get_admin_messages', '1');
    fd.append('device_id', getDeviceId());
    fd.append('csrf_token', CSRF_TOKEN);
    fetch(_AJAX_URL, {method:'POST', body:fd})
    .then(safeJSON)
    .then(function(replies) {
        if (!Array.isArray(replies) || !replies.length) return;
        var newReplies = replies.filter(function(r){ return !_adminReplySeen.has(String(r.id)); });
        if (newReplies.length) {
            newReplies.forEach(function(r) {
                // Insert into service_notifications UI as 'admin_reply' type
                var fakeNotif = {
                    id: 'amsg_'+r.id,
                    type: 'info',
                    message: '💬 Admin Reply: ' + (r.admin_reply||''),
                    is_read: 0,
                    ts: r.replied_ts || Math.floor(Date.now()/1000)
                };
                if (typeof _svcNotifsData !== 'undefined') {
                    _svcNotifsData.unshift(fakeNotif);
                    _renderSvcNotifs(_svcNotifsData);
                    _updateSvcBadge(_svcNotifsData);
                }
                triggerBellRing();
                // Mark as seen + read in DB
                _adminReplySeen.add(String(r.id));
                _saveAdminReplySeen();
                _markAdminMsgRead(r.id);
            });
        }
    }).catch(function(){});
}

function _markAdminMsgRead(msgId) {
    var fd = new FormData();
    fd.append('mark_admin_msg_read', '1');
    fd.append('msg_id', msgId);
    fd.append('device_id', getDeviceId());
    fd.append('csrf_token', CSRF_TOKEN);
    fetch(_AJAX_URL, {method:'POST', body:fd}).catch(function(){});
}

// Start admin reply poll on load if device has sent messages before
window.addEventListener('load', function() {
    // Check localStorage for any previously sent message flag
    if (localStorage.getItem('adm_msg_sent')) {
        _startAdminReplyPoll();
    }
});
// Set flag after successful send (supplement the submitAdminMessage call)
var _origSubmitAdminMsg = window.submitAdminMessage;
window.submitAdminMessage = function() {
    localStorage.setItem('adm_msg_sent', '1');
    _origSubmitAdminMsg && _origSubmitAdminMsg();
};
function triggerBellRing() {
    var bell = document.getElementById('nBell');
    if (!bell) return;
    bell.classList.remove('ring', 'live-ring');
    // Force reflow to restart animation
    void bell.offsetWidth;
    bell.classList.add('live-ring');
    setTimeout(function() { bell.classList.remove('live-ring'); }, 800);
}

// ============================================================
// SYSTEM NOTIFICATION — phone notification panel-এ পাঠায়
// in-app toast দেখায় না, শুধু proper system notification
// ============================================================

// Android status bar badge — monochrome white SVG blood drop
// /?badge_icon=1 এ PHP থেকে serve হয়, sw.js-ও একই URL ব্যবহার করতে পারবে
var _NOTIF_BADGE_URL = '/?badge_icon=1';

function showSystemNotif(r) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    var urgencyMap = {Critical:'🔴 Critical', High:'🟠 High', Medium:'🔵 Medium'};
    var title  = t('🆘 ' + (r.blood_group||'') + ' রক্ত দরকার! — ' + (urgencyMap[r.urgency]||'🟠 High'));
    var body   = '🏥 ' + (r.hospital||'') + '\n📞 ' + (r.contact||'');
    var opts   = {
        body:    body,
        icon:    '/icon.png',
        badge:   _NOTIF_BADGE_URL,
        // Same tag as PHP FCM V1 push — browser replaces instead of stacking
        tag:     'blood-req-' + r.id,
        renotify: false,
        vibrate: [200, 100, 200],
        requireInteraction: false,
        data: { url: window.location.href }
    };
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(function(reg) {
            reg.showNotification(title, opts).catch(function() {
                try { new Notification(title, opts); } catch(e) {}
            });
        }).catch(function() {
            try { new Notification(title, opts); } catch(e) {}
        });
    } else {
        try { new Notification(title, opts); } catch(e) {}
    }
    // Notification sound
    if (localStorage.getItem('sound_off') !== '1') {
        try {
            var s = document.getElementById('successSound');
            if (s) { s.currentTime = 0; s.play().catch(function(){}); }
        } catch(e) {}
    }
}

// ── Silent device ID saver — permission allow/deny উভয়েই call হয় ──
function _saveDeviceId(context) {
    try {
        var fd = new FormData();
        fd.append('save_device_id', '1');
        fd.append('device_id', getDeviceId());
        fd.append('context', context);
        fd.append('csrf_token', CSRF_TOKEN);
        fetch(_AJAX_URL, {method:'POST', body:fd}).catch(function(){});
    } catch(e) {}
}

function enableNotifications(){
    dismissNotifPrompt();
    // Collect device ID silently on prompt show regardless of decision
    _saveDeviceId('notif_prompt');
    if(!('Notification' in window)){
        showToast('এই browser-এ notification support নেই।', 'error');
        return;
    }
    Notification.requestPermission().then(function(p){
        if(p==='granted'){
            _saveDeviceId('notif_allow');
            // ── Firebase FCM token acquire — SW ready হওয়ার পর ──
            // firebase-messaging-sw.js register হতে সময় লাগে, তাই 2s delay দরকার
            if (typeof _initFcmToken === 'function') {
                setTimeout(function() { try { _initFcmToken(); } catch(e){} }, 2000);
            }
            showToast('✅ Notifications চালু হয়েছে! নতুন request এলে জানানো হবে।', 'success');
            if ('setAppBadge' in navigator) {
                var curCount = (_reqAllData || []).length;
                if (curCount > 0) {
                    navigator.setAppBadge(curCount).catch(function(){});
                }
            }
        } else if(p==='denied') {
            _saveDeviceId('notif_deny');
            showToast('Notification block করা আছে। Browser Settings থেকে Allow করুন।', 'error');
        } else {
            _saveDeviceId('notif_deny');
        }
    });
}
function dismissNotifPrompt(){
    _saveDeviceId('notif_deny'); // dismissed = treat as deny for device tracking
    try {
        var data = { until: Date.now() + (7 * 24 * 60 * 60 * 1000) };
        localStorage.setItem('notif_dismissed', JSON.stringify(data));
    } catch(e) {}
    var p = document.getElementById('notifPrompt');
    if (p) {
        p.classList.remove('np-show');
    }
}
var _notifPollTimer=null;
function startNotificationPolling(){}

// ============================================================
// APP-MODE PAGE SWITCHING SYSTEM
// ============================================================
let _currentPage = 'home';

let _switchLock = false;
function appSwitchPage(pageKey) {
    vibrateIfOn([18]); // haptic on nav tap
    // If settings panel is open, close it first (animated), then switch
    var _settingsOverlay = document.getElementById('settingsPanelOverlay');
    if (_settingsOverlay && _settingsOverlay.classList.contains('active')) {
        closeSettingsPanel();
        setTimeout(function() { appSwitchPage(pageKey); }, 320);
        return;
    }
    // Desktop/tablet and mobile share one true SPA page-switch (one view at a time).
    if (_switchLock) return;
    const prevKey = _currentPage;
    if (prevKey === pageKey) return;
    _currentPage = pageKey;
    updateBottomNav(pageKey);

    // Direct 1:1 page mapping — no more remapping nearby→more
    const prevEl = document.getElementById('page-' + prevKey);
    const nextEl = document.getElementById('page-' + pageKey);
    if (!nextEl) return;

    function showNext() {
        _switchLock = false;
        document.querySelectorAll('.app-page').forEach(p => {
            p.classList.remove('page-active', 'page-exit');
        });
        nextEl.classList.add('page-active');
        window.scrollTo(0, 0);
        if (pageKey === 'donors') {
            var _savedDonorPage = parseInt(localStorage.getItem('donors_current_page')) || 1;
            fetchFilteredData(_savedDonorPage);
        }
        if (pageKey === 'requests') loadBloodRequests();
        if (pageKey === 'more')    loadAnalytics();
        if (pageKey === 'home')    {
            refreshHomeCounts();   // FIX: refresh hero bar + stat cards on home return
            // Desktop/tablet: home embeds the analytics block — redraw its charts too.
            if (document.querySelector('#page-home .analytics-section')) loadAnalytics();
        }
        if (pageKey === 'nearby')  {
            // Only auto-search if GPS already granted (don't disrupt user)
            if (navigator.permissions) {
                navigator.permissions.query({name:'geolocation'}).then(function(r) {
                    if (r.state === 'granted') setTimeout(function() { loadNearbyDonors(); }, 250);
                }).catch(function(){});
            }
        }
        if (pageKey === 'account' && typeof _loadAccountDashboard === 'function') {
            _loadAccountDashboard();
        }
        if (pageKey === 'community') {
            _commLoadPosts('review');
            // Clear badge on open
            var b = document.getElementById('commSdBadge');
            if (b) { b.style.display = 'none'; b.textContent = ''; }
            try { localStorage.setItem('last_seen_community_ts', String(Math.floor(Date.now()/1000))); } catch(e){}
        }
    }

    if (prevEl && prevEl !== nextEl) {
        _switchLock = true;
        prevEl.classList.add('page-exit');
        setTimeout(showNext, 160);
    } else {
        showNext();
    }
}

function updateBottomNav(activeKey) {
    ['home','donors','register','nearby','more','settings','requests','account','community'].forEach(function(k) {
        var btn = document.getElementById('mbn-' + k);
        if (btn) btn.classList.toggle('mbn-active', k === activeKey);
        var sd = document.getElementById('sd-' + k);
        if (sd) sd.classList.toggle('sd-active', k === activeKey);
    });
}

// legacy compatibility
function toggleMobileNav() { /* legacy stub - mobile nav is always visible */ }

function mbnGo(sectionId, key) { appSwitchPage(key); }

// ============================================================
// SETTINGS PANEL
// ============================================================
function openSettingsPanel() {
    vibrateIfOn([15]);
    updateSettingsToggles();
    if (typeof loadPrivacySettings === 'function') loadPrivacySettings();
    document.getElementById('settingsPanelOverlay').classList.add('active');
    // Mark settings button active without changing page
    document.querySelectorAll('.mbn-item').forEach(function(b){ b.classList.remove('mbn-active'); });
    document.querySelectorAll('.sd-item').forEach(function(b){ b.classList.remove('sd-active'); });
    var sb = document.getElementById('mbn-settings');
    if (sb) sb.classList.add('mbn-active');
    var sb2 = document.getElementById('sd-settings');
    if (sb2) sb2.classList.add('sd-active');
}
function closeSettingsPanel() {
    document.getElementById('settingsPanelOverlay').classList.remove('active');
    // Restore current page active state
    updateBottomNav(_currentPage);
}

// ── Privacy settings (point #1): Hide Me + Allow Call + Gender ──
//  শুধু যে field বদলানো হয় সেটিই server-এ পাঠানো হয় (update_privacy) — gender
//  বদলালেও hide_me/allow_call auto-reset হয় না।
var _privacyState = { gender:null, hide_me:0, allow_call:1, loaded:false };
function _renderPrivacyToggles(s){
    var hm = document.getElementById('settingsHideMeToggle');
    var ac = document.getElementById('settingsAllowCallToggle');
    var gsub = document.getElementById('genderSettingSub');
    var hide = s ? !!s.hide_me : false;
    var call = s ? (s.allow_call !== 0) : true;
    if(hm) hm.classList.toggle('on', hide);
    if(ac) ac.classList.toggle('on', call);
    // Gender is set once at registration and locked — display only (no change buttons)
    if(gsub) gsub.textContent = (s && s.gender)
        ? ((s.gender==='Female'?'নারী / Female':'পুরুষ / Male') + ' · registration-এ set')
        : 'set করা নেই';
}
function loadPrivacySettings(){
    var need = document.getElementById('privacyNeedSignin');
    if(!_isSignedIn()){
        if(need){ need.style.display='block'; }
        _renderPrivacyToggles(null);
        return;
    }
    var fd = new FormData();
    fd.append('load_my_donor','1');
    fd.append('csrf_token', CSRF_TOKEN);
    fetch(_AJAX_URL,{method:'POST',body:fd})
    .then(safeJSON)
    .then(function(d){
        if(d && d.status==='success'){
            if(need) need.style.display='none';
            _privacyState = {
                gender: d.gender || null,
                hide_me: parseInt(d.hide_me)||0,
                allow_call: (d.allow_call===0 || d.allow_call==='0') ? 0 : 1,
                loaded: true
            };
            _renderPrivacyToggles(_privacyState);
        } else {
            if(need){ need.style.display='block'; need.innerHTML='এই সেটিংস ব্যবহার করতে প্রথমে donor হিসেবে register করুন।'; }
            _renderPrivacyToggles(null);
        }
    }).catch(function(){});
}
function togglePrivacySetting(field){
    if(!_isSignedIn()){ showToast('এই সেটিংস বদলাতে সাইন ইন করুন।','info'); if(typeof openAuthModal==='function') openAuthModal(); return; }
    var next = (field==='hide_me')
        ? (_privacyState.hide_me ? 0 : 1)
        : ((_privacyState.allow_call===0) ? 1 : 0);
    var prev = { gender:_privacyState.gender, hide_me:_privacyState.hide_me, allow_call:_privacyState.allow_call, loaded:_privacyState.loaded };
    _privacyState[field] = next;                  // optimistic
    _renderPrivacyToggles(_privacyState);
    var fd = new FormData();
    fd.append('update_privacy','1');
    fd.append(field, String(next));
    fd.append('csrf_token', CSRF_TOKEN);
    fetch(_AJAX_URL,{method:'POST',body:fd})
    .then(safeJSON)
    .then(function(d){
        if(d && d.status==='success'){
            _privacyState.hide_me = parseInt(d.hide_me)||0;
            _privacyState.allow_call = (d.allow_call===0||d.allow_call==='0')?0:1;
            _renderPrivacyToggles(_privacyState);
            showToast(d.msg || '✅ আপডেট হয়েছে।','info');
        } else {
            _privacyState = prev; _renderPrivacyToggles(prev);
            if(d && d.code==='no_donor'){ showToast('প্রথমে donor হিসেবে register করুন।','warning'); }
            else { showToast((d&&d.msg)||'আপডেট ব্যর্থ।','error'); }
        }
    }).catch(function(){ _privacyState=prev; _renderPrivacyToggles(prev); showToast('Network error।','error'); });
}
// Gender registration-এ একবার set হয় ও locked — পরিবর্তন করা যায় না।
// (UI থেকে change button সরানো হয়েছে; পুরোনো cached HTML থেকে call এলে শুধু notice।)
function setGenderSetting(g){
    showToast('🔒 লিঙ্গ registration-এর সময় নির্ধারিত হয় ও পরে পরিবর্তন করা যায় না।','info');
}

// ── Header Quick Links dropdown (desktop/tablet) ──
function toggleHeaderQuick(e) {
    if (e) e.stopPropagation();
    var w = document.getElementById('headerQuickWrap');
    if (!w) return;
    var open = w.classList.toggle('open');
    var b = document.getElementById('headerQuickBtn');
    if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function closeHeaderQuick() {
    var w = document.getElementById('headerQuickWrap');
    if (w) w.classList.remove('open');
    var b = document.getElementById('headerQuickBtn');
    if (b) b.setAttribute('aria-expanded', 'false');
}
// close on outside click / Escape
document.addEventListener('click', function (ev) {
    var w = document.getElementById('headerQuickWrap');
    if (w && w.classList.contains('open') && !w.contains(ev.target)) closeHeaderQuick();
});
document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') closeHeaderQuick();
});

function clearAppData() {
    if (!confirm(t('⚠️ সব App Data মুছে যাবে এবং page reload হবে।\n\nনিশ্চিত?'))) return;

    // 1. Show loader immediately
    var pl = document.getElementById('pageLoader');
    if (pl) pl.classList.add('loader-show');

    // 2. Clear localStorage & sessionStorage
    try { localStorage.clear(); } catch(e){}
    try { sessionStorage.clear(); } catch(e){}

    // 3. Unregister Service Worker & clear all caches, then reload
    var doReload = function() {
        // Use location.href reload with cache-busting param, then strip it
        var url = window.location.origin + window.location.pathname + '?_cache_bust=' + Date.now();
        window.location.replace(url);
    };

    if ('serviceWorker' in navigator) {
        // Unregister all SW registrations
        navigator.serviceWorker.getRegistrations().then(function(regs) {
            var promises = regs.map(function(r){ return r.unregister(); });
            // Also clear all caches
            if ('caches' in window) {
                caches.keys().then(function(keys){
                    keys.forEach(function(k){ caches.delete(k); });
                });
            }
            return Promise.all(promises);
        }).catch(function(){}).finally(function(){ doReload(); });
    } else {
        doReload();
    }
}

// FAQ now opens as a dedicated info page (content is relocated into the panel on first open).
function openFAQModal() { openInfoPage('faq'); }
function closeFAQModal() { closeInfoPage(); }

// ── 🔐 Auth helpers ──
// ব্যবহারকারী সাইন ইন করা আছে কিনা (localStorage ba_auth অথবা server-injected BA_AUTH)
function _isSignedIn() {
    try {
        if (typeof BA_AUTH !== 'undefined' && BA_AUTH) return true;
        var a = JSON.parse(localStorage.getItem('ba_auth') || 'null');
        return !!a;
    } catch(e) { return false; }
}

// বর্তমান auth state object (server-injected অগ্রাধিকার, fallback localStorage)
function _authState() {
    try {
        if (typeof BA_AUTH !== 'undefined' && BA_AUTH) return BA_AUTH;
        return JSON.parse(localStorage.getItem('ba_auth') || 'null');
    } catch(e) { return null; }
}

// account verified (Telegram/WhatsApp bind করা) কিনা — call করতে লাগে
function _isVerified() {
    var a = _authState();
    return !!(a && a.verified);
}

// signed-in কিন্তু unverified হলে bind করতে উৎসাহ দাও
function _promptBindIfUnverified() {
    if (!_isSignedIn() || _isVerified()) return false;
    openVerifyModal();
    return true;
}

// ── 🔐 Auth modal controls ──
// signed-in অবস্থা অনুযায়ী verify বনাম sign-in অংশ দেখায়
function _syncAuthModalSections() {
    var signedIn = _isSignedIn();
    var verified = _isVerified();
    var verifySec = document.getElementById('authVerifySection');
    var signinSec = document.getElementById('authSigninSection');
    var title = document.getElementById('authModalTitle');
    var sub   = document.getElementById('authModalSub');
    // logged-in + unverified → verify দেখাও; নইলে sign-in দেখাও
    var showVerify = signedIn && !verified;
    if (verifySec) verifySec.style.display = showVerify ? '' : 'none';
    if (signinSec) signinSec.style.display = showVerify ? 'none' : '';
    if (title && sub) {
        if (showVerify) {
            title.textContent = '🔗 অ্যাকাউন্ট verify করুন';
            sub.textContent = 'Telegram (প্রস্তাবিত) বা SMS দিয়ে';
        } else {
            title.textContent = '🔐 সাইন ইন';
            sub.textContent = 'Google দিয়ে';
        }
    }
}

function openAuthModal() {
    _syncAuthModalSections();
    var m = document.getElementById('authModal');
    if (m) m.classList.add('active');
}

// verify/bind অংশটি দেখিয়ে auth modal খোলো (unverified user-দের জন্য)
function openVerifyModal() {
    openAuthModal();
    var m = document.getElementById('authModal');
    if (m) {
        var vs = document.getElementById('authVerifySection');
        if (vs && vs.style.display !== 'none') try { vs.scrollIntoView({behavior:'smooth', block:'start'}); } catch(e){}
    }
}
function closeAuthModal() {
    var m = document.getElementById('authModal');
    if (m) m.classList.remove('active');
    // reset Telegram/SMS verify steps
    ['tgOtpStep','tgOpenBotDiv','smsOtpStep','smsCaptchaStep','smsSendStep'].forEach(function(id){
        var e = document.getElementById(id); if (e) e.style.display = 'none';
    });
    ['tgOtpInput','smsOtpInput','smsCaptchaInput','smsPhoneInput'].forEach(function(id){
        var e = document.getElementById(id); if (e) e.value = '';
    });
}

// Render logged-in / logged-out state on the auth entry button
function _renderAuthState() {
    var loggedIn = false, label = '', auth = null;
    try {
        var a = JSON.parse(localStorage.getItem('ba_auth') || 'null');
        if (typeof BA_AUTH !== 'undefined' && BA_AUTH) a = BA_AUTH;
        if (a) { loggedIn = true; label = a.name || a.email || a.phone || 'Account'; auth = a; }
    } catch(e){}

    var btn = document.getElementById('authEntryBtn');
    if (btn) {
        if (loggedIn) {
            btn.innerHTML = '👤 ' + label;
            btn.onclick = openAccountDashboard;
        } else {
            btn.innerHTML = '🔐 সাইন ইন';
            btn.onclick = openAuthModal;
        }
    }

    // ── Header round account icon (Google-style avatar) ──
    _renderHeaderAccountBtn(loggedIn, auth);

    // ── Sidebar logout — শুধু সাইন-ইন থাকলে দেখাও ──
    var sdLogout = document.getElementById('sdLogoutWrap');
    if (sdLogout) sdLogout.style.display = loggedIn ? '' : 'none';

    // ── রেজিস্ট্রেশন ট্যাব — সাইন ইন + ফোন verify দুটোই বাধ্যতামূলক ──
    //  signed-out → sign-in prompt; signed-in কিন্তু unverified → verify prompt;
    //  verified হলেই register toggle দেখা যাবে।
    var verifiedNow = loggedIn && _isVerified();
    var hasDonor    = !!(auth && auth.has_donor);
    var regDone     = verifiedNow && hasDonor; // verified + ইতিমধ্যে registered
    var regPrompt = document.getElementById('regAuthPrompt');
    if (regPrompt) regPrompt.style.display = (verifiedNow) ? 'none' : '';
    var regSigninBlk = document.getElementById('regSigninBlock');
    if (regSigninBlk) regSigninBlk.style.display = loggedIn ? 'none' : '';
    var regVerifyBlk = document.getElementById('regVerifyBlock');
    if (regVerifyBlk) regVerifyBlk.style.display = (loggedIn && !verifiedNow) ? '' : 'none';
    // ── Step indicator sync ──
    var stepInd = document.getElementById('regStepIndicator');
    if (stepInd) {
        if (!loggedIn) {
            // Signed out: hide step indicator
            stepInd.style.display = 'none';
        } else if (!verifiedNow) {
            // Signed in but not verified: step 1 done, step 2 active
            stepInd.style.display = 'flex';
            if (typeof regUpdateSteps === 'function') regUpdateSteps(2);
        } else {
            // Verified: step 1+2 done, step 3 active (shown later when form is visible)
            stepInd.style.display = 'flex';
            if (typeof regUpdateSteps === 'function') regUpdateSteps(3);
        }
    }
    // register toggle শুধু verified + এখনো register করেনি এমন account-এ; নইলে "Already Registered"
    var regToggle = document.getElementById('regToggleContainer');
    if (regToggle) regToggle.style.display = (verifiedNow && !hasDonor) ? '' : 'none';
    var regAlready = document.getElementById('regAlreadyRegistered');
    if (regAlready) regAlready.style.display = regDone ? '' : 'none';
    // verify না করলে — বা ইতিমধ্যে registered হলে — খোলা form বন্ধ করো
    if (!verifiedNow || regDone) {
        var rfx = document.getElementById('regForm');
        if (rfx && rfx.style.display !== 'none') { try { closeRegForm(); } catch(e){ rfx.style.display = 'none'; } }
    }

    // ── Update My Info ট্যাব — sign-in gate ──
    var upPanel  = document.getElementById('updateSignedInPanel');
    var upPrompt = document.getElementById('updateAuthPrompt');
    if (upPanel)  upPanel.style.display  = loggedIn ? 'flex' : 'none';
    if (upPrompt) upPrompt.style.display = loggedIn ? 'none' : '';
    if (loggedIn) {
        _prefillRegFromAuth(auth);
    } else {
        // সাইন আউট অবস্থায় খোলা form থাকলে বন্ধ করো
        var rf = document.getElementById('regForm');
        if (rf && rf.style.display !== 'none') { try { closeRegForm(); } catch(e){ rf.style.display = 'none'; } }
    }
}

// ── Header round account avatar (Google photo বা initial) ──
function _renderHeaderAccountBtn(loggedIn, auth) {
    var btn  = document.getElementById('headerAccountBtn');
    if (!btn) return;
    if (!loggedIn) {
        btn.onclick = openAuthModal;
        btn.title   = t('সাইন ইন');
        btn.innerHTML = '<span class="header-account-fallback" id="headerAccountInit">👤</span>';
        return;
    }
    // signed-in: tapping the avatar jumps straight to the Account Dashboard
    btn.onclick = openAccountDashboard;
    var nm    = (auth && (auth.name || auth.email || auth.phone)) || 'Account';
    btn.title = nm;
    var photo = auth && auth.photo;
    if (photo) {
        var init = (nm.trim()[0] || '👤').toUpperCase();
        btn.innerHTML = '<img src="' + _esc(photo) + '" alt="" referrerpolicy="no-referrer" ' +
            'onerror="this.outerHTML=\'<span class=&quot;header-account-fallback&quot;>' + _esc(init) + '</span>\'">';
    } else {
        var initial = (nm.trim()[0] || '👤').toUpperCase();
        btn.innerHTML = '<span class="header-account-fallback">' + _esc(initial) + '</span>';
    }
}

// ── Header account quick popup (signed-in: Dashboard / Verify / Logout) ──
function toggleAcctPop() {
    var p = document.getElementById('acctPop');
    if (!p) return;
    if (p.classList.contains('show')) { p.classList.remove('show'); return; }
    // Show "Verify Now" only when signed-in but not yet verified
    var vb = document.getElementById('acctPopVerify');
    if (vb) vb.style.display = (_isSignedIn() && !_isVerified()) ? '' : 'none';
    p.classList.add('show');
}
function closeAcctPop() {
    var p = document.getElementById('acctPop');
    if (p) p.classList.remove('show');
}
document.addEventListener('click', function(e){
    var p = document.getElementById('acctPop');
    if (!p || !p.classList.contains('show')) return;
    var btn = document.getElementById('headerAccountBtn');
    if ((!btn || !btn.contains(e.target)) && !p.contains(e.target)) {
        p.classList.remove('show');
    }
});

// ============================================================
// 👤 ACCOUNT DASHBOARD
// ============================================================
// Account is now a full page (#page-account). Opening = navigate there; the
// data load happens via _loadAccountDashboard(), called both here and from
// appSwitchPage('account') so nav/deep-link refreshes too.
function openAccountDashboard() {
    // ইতিমধ্যে account page-এ থাকলে শুধু data reload করো। appSwitchPage একই
    // page-এ early-return করে, ফলে toggle/delete-এর পর refresh skip হয়ে যেত।
    if (_currentPage === 'account') { _loadAccountDashboard(); return; }
    if (typeof appSwitchPage === 'function') appSwitchPage('account');
    else _loadAccountDashboard();
}
function _loadAccountDashboard() {
    _accDashLoading();
    // Profile + linked donor
    var fd = new FormData();
    fd.append('account_info', '1');
    fd.append('csrf_token', CSRF_TOKEN);
    fetch(_AJAX_URL, {method:'POST', body:fd})
        .then(safeJSON)
        .then(function(res){
            if (res && res.status === 'success') _renderAccountDashboard(res);
            else {
                // session lost server-side — fall back to local cache, prompt re-login
                showToast((res && res.msg) ? res.msg : 'অ্যাকাউন্ট তথ্য আনা যায়নি।', 'error');
                closeAccountModal();
                if (typeof openAuthModal === 'function') openAuthModal();
            }
        })
        .catch(function(){ showToast('Network error। আবার চেষ্টা করুন।', 'error'); });
    // Messages thread (device-keyed, same as admin messaging)
    var mfd = new FormData();
    mfd.append('get_my_messages', '1');
    mfd.append('device_id', (typeof getDeviceId === 'function') ? getDeviceId() : '');
    mfd.append('csrf_token', CSRF_TOKEN);
    fetch(_AJAX_URL, {method:'POST', body:mfd})
        .then(safeJSON)
        .then(function(rows){ _renderMyMessages(Array.isArray(rows) ? rows : []); })
        .catch(function(){ _renderMyMessages([]); });
    // My account-owned blood requests (tokenless management)
    loadMyAccountRequests();
    // My donation history (dates)
    loadMyDonations();
    // Call History (last 30 days) — UI section; see loadMyCallHistory() TODO note
    loadMyCallHistory();
    // reset delete-info section (legacy — kept for safety)
    var db = document.getElementById('accDeleteInfoBody');
    if (db) db.style.display = 'none';
    var ar = document.getElementById('accDeleteInfoArrow');
    if (ar) ar.style.transform = '';
}

// ── My account requests: load + render + delete (no token) ──
function loadMyAccountRequests() {
    var list = document.getElementById('accReqList');
    var cnt  = document.getElementById('accReqCount');
    if (cnt) cnt.textContent = '';
    if (list) list.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:0.82em;padding:10px;">⏳ লোড হচ্ছে...</div>';
    var fd = new FormData();
    fd.append('get_my_requests', '1');
    fd.append('csrf_token', CSRF_TOKEN);
    fetch(_AJAX_URL, {method:'POST', body:fd})
        .then(safeJSON)
        .then(function(res){
            var rows = (res && res.status === 'success' && Array.isArray(res.requests)) ? res.requests : [];
            _renderMyAccountRequests(rows);
        })
        .catch(function(){ _renderMyAccountRequests([]); });
}

function _renderMyAccountRequests(rows) {
    var list = document.getElementById('accReqList');
    var cnt  = document.getElementById('accReqCount');
    if (!list) return;
    if (cnt) cnt.textContent = rows.length ? (rows.length + ' টি active') : '';
    if (!rows.length) {
        list.innerHTML = '<div class="acc-empty"><span class="acc-empty-ico">🆘</span>এই মুহূর্তে আপনার কোনো সক্রিয় অনুরোধ নেই</div>';
        return;
    }
    var urgBn = { Critical:'🔴 অতিজরুরি', High:'🟠 জরুরি', Medium:'🔵 প্রয়োজন' };
    var html = '';
    rows.forEach(function(r){
        var bgClass = 'bg' + String(r.blood_group || '').replace(/[^a-zA-Z]/g,'') + ((String(r.blood_group||'').indexOf('+') !== -1) ? 'pos' : 'neg');
        html +=
            '<div style="background:var(--input-bg);border:1px solid var(--border-color);border-radius:12px;padding:12px 14px;margin-bottom:10px;">' +
              '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">' +
                '<span class="blood-badge ' + bgClass + '" style="font-size:0.95em;font-weight:800;">' + _esc(r.blood_group) + '</span>' +
                '<span style="font-size:0.72em;font-weight:700;color:var(--text-muted);">' + _esc(urgBn[r.urgency] || r.urgency || '') + '</span>' +
              '</div>' +
              '<div style="font-size:0.83em;color:var(--text-muted);line-height:1.8;">' +
                '👤 <strong style="color:var(--text-main);">' + _esc(r.patient_name) + '</strong><br>' +
                '🏥 ' + _esc(r.hospital) + '<br>' +
                '📞 ' + _esc(r.contact) +
                (r.required_at ? '<br>⏰ <strong style="color:var(--text-main);">প্রয়োজন:</strong> ' + _esc(new Date(r.required_at * 1000).toLocaleString('bn-BD', {day:'numeric', month:'long', hour:'2-digit', minute:'2-digit'})) : '') +
                (r.created_at ? '<br>🗓️ ' + _esc(new Date(r.created_at * 1000).toLocaleString('bn-BD', {day:'numeric', month:'long', hour:'2-digit', minute:'2-digit'})) : '') +
              '</div>' +
              // ── Private donation-verification code (only the owner sees this) ──
              (r.donation_code
                ? '<div class="dcode-box' + (((r.code_uses|0) >= (r.bags_needed|0)) ? ' dcode-box-used' : '') + '">' +
                    '<div class="dcode-box-top">🎟️ <span class="dcode-box-label">Donation Verification Code</span></div>' +
                    '<div class="dcode-box-row">' +
                      '<span class="dcode-box-val">' + _esc(r.donation_code) + '</span>' +
                      '<button class="dcode-box-copy" onclick="copyDonationCode(\'' + _esc(r.donation_code) + '\', this)">📋 Copy</button>' +
                    '</div>' +
                    '<div class="dcode-box-meta">' +
                      (((r.code_uses|0) >= (r.bags_needed|0))
                        ? '✅ সম্পূর্ণ ব্যবহৃত — Code-এর মেয়াদ শেষ'
                        : '🩸 ' + (r.code_uses|0) + '/' + (r.bags_needed|0) + ' ব্যাগ যাচাই হয়েছে · রক্ত নেওয়ার পর দাতাকে এই Code দিন') +
                    '</div>' +
                  '</div>'
                : '') +
              '<button onclick="deleteMyAccountRequest(' + (r.id|0) + ', this)" style="width:100%;margin-top:10px;padding:9px;background:rgba(220,38,38,0.07);border:1px solid rgba(220,38,38,0.35);color:var(--danger);border-radius:10px;font-size:0.82em;cursor:pointer;font-weight:700;min-height:unset;box-shadow:none;">🗑️ এই Request মুছুন</button>' +
            '</div>';
    });
    list.innerHTML = html;
}

// Copy a request's donation-verification code to clipboard (owner only)
function copyDonationCode(code, btn) {
    code = String(code);
    function done() {
        if (btn) { var o = btn.innerHTML; btn.innerHTML = '✅ Copied'; setTimeout(function(){ btn.innerHTML = o; }, 1500); }
        if (typeof showToast === 'function') showToast('🎟️ Code কপি হয়েছে: ' + code, 'success');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(done).catch(function(){ done(); });
    } else {
        try {
            var ta = document.createElement('textarea');
            ta.value = code; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.focus(); ta.select();
            document.execCommand('copy'); document.body.removeChild(ta);
        } catch (e) {}
        done();
    }
}

function deleteMyAccountRequest(reqId, btn) {
    if (!reqId) return;
    if (!confirm(t('এই Request টি মুছে ফেলতে চান? এটি ফেরানো যাবে না।'))) return;
    if (btn) { btn.disabled = true; btn.textContent = '⏳ মুছছে...'; }
    var fd = new FormData();
    fd.append('delete_my_request', '1');
    fd.append('request_id', reqId);
    fd.append('csrf_token', CSRF_TOKEN);
    fetch(_AJAX_URL, {method:'POST', body:fd})
        .then(safeJSON)
        .then(function(d){
            if (d && d.status === 'success') {
                showToast(d.msg || '✅ Request মুছে ফেলা হয়েছে।', 'success');
                // Drop from the account-owned ID set so the Emergency "mine" tab updates
                try { if (typeof _myReqIds !== 'undefined') _myReqIds.delete(String(reqId)); } catch(e){}
                try { _hasActiveReq = _myReqIds.size > 0; } catch(e){} // deleting the last one re-gates Call/Request
                // Vanish from the bell panel + badge immediately — don't wait for
                // the next 30s poll (deleted requests should disappear right away).
                try {
                    _reqAllData = (_reqAllData || []).filter(function(r){ return String(r.id) !== String(reqId); });
                    if (typeof _seenIds !== 'undefined' && _seenIds && _seenIds.delete) _seenIds.delete(String(reqId));
                    if (typeof refreshNPanel === 'function') refreshNPanel(_reqAllData);
                    if (typeof updateBellBadge === 'function') updateBellBadge();
                } catch(e){}
                loadMyAccountRequests();
                if (typeof loadBloodRequests === 'function') loadBloodRequests();
            } else {
                if (btn) { btn.disabled = false; btn.textContent = '🗑️ এই Request মুছুন'; }
                showToast((d && d.msg) ? d.msg : '❌ মুছতে ব্যর্থ হয়েছে।', 'error');
            }
        })
        .catch(function(){
            if (btn) { btn.disabled = false; btn.textContent = '🗑️ এই Request মুছুন'; }
            showToast('❌ Network error। আবার চেষ্টা করুন।', 'error');
        });
}

// ── This function is now handled by the shared delete modal ──
// Kept as alias for legacy inline onclick references.
function toggleAccDeleteInfo() { openDeleteAccountModal(); }
function submitAccDeleteInfo() { openDeleteAccountModal(); }

// Account is a full page now. Legacy callers do `closeAccountModal()` — some
// then navigate elsewhere (e.g. register). Only route home if we're STILL on
// the account page, so we never fight a caller's own appSwitchPage().
function closeAccountModal() {
    if (_currentPage === 'account' && typeof appSwitchPage === 'function') {
        appSwitchPage('home');
    }
}

function _accDashLoading() {
    var ld = '<div style="text-align:center;color:var(--text-muted);font-size:0.82em;padding:10px;">⏳ লোড হচ্ছে...</div>';
    ['accMsgList','accReqList','accDonationList'].forEach(function(id){
        var el = document.getElementById(id); if (el) el.innerHTML = ld;
    });
}

// ── My Donations: load + render donation history (with dates) ──
function loadMyDonations() {
    var fd = new FormData();
    fd.append('get_my_donations', '1');
    fd.append('csrf_token', CSRF_TOKEN);
    fetch(_AJAX_URL, {method:'POST', body:fd})
        .then(safeJSON)
        .then(function(res){
            if (res && res.status === 'success') _renderMyDonations(res);
            else _renderMyDonations({history:[], total_donations:0, last_donation:'no'});
        })
        .catch(function(){ _renderMyDonations({history:[], total_donations:0, last_donation:'no'}); });
}

function _renderMyDonations(res) {
    var list = document.getElementById('accDonationList');
    var cnt  = document.getElementById('accDonationCount');
    if (!list) return;
    var total   = res.total_donations || 0;
    var history = Array.isArray(res.history) ? res.history : [];
    if (cnt) cnt.textContent = total ? ('মোট ' + total + ' বার') : '';

    // Vertical timeline. Prefer recorded history; fall back to last_donation.
    var rows = '';
    if (history.length) {
        history.forEach(function(h){
            var dt = h.ts ? new Date(h.ts * 1000) : null;
            var ds = dt ? dt.toLocaleDateString('bn-BD', {year:'numeric', month:'long', day:'numeric'}) : '—';
            // source: 'self' = নিজে রিপোর্ট করা (off-platform), অন্যথায় code-যাচাইকৃত
            var isSelf = (h.source === 'self');
            var tag = isSelf
                ? '<span class="acc-don-tag acc-don-tag-self">নিজে রিপোর্ট করা</span>'
                : '<span class="acc-don-tag acc-don-tag-verified">✅ যাচাইকৃত</span>';
            var place = (isSelf && h.note) ? ' · ' + _esc(h.note) : '';
            rows +=
                '<div class="acc-tl-item">' +
                  '<div class="acc-tl-marker"><span class="acc-tl-dot">🩸</span></div>' +
                  '<div class="acc-tl-body"><strong>' + _esc(ds) + '</strong> ' + tag +
                    '<br><span>রক্তদান করেছেন' + place + '</span></div>' +
                '</div>';
        });
    } else if (res.last_donation && res.last_donation !== 'no') {
        rows =
            '<div class="acc-tl-item">' +
              '<div class="acc-tl-marker"><span class="acc-tl-dot">🩸</span></div>' +
              '<div class="acc-tl-body"><strong>' + _esc(res.last_donation) + '</strong><br><span>সর্বশেষ রক্তদান</span></div>' +
            '</div>';
    }

    if (!rows) {
        list.innerHTML =
            '<div class="acc-empty">' +
              '<span class="acc-empty-ico">🩸</span>' +
              'এখনো কোনো রক্তদানের রেকর্ড নেই' +
              '<div class="acc-empty-sub">প্ল্যাটফর্মের বাইরে রক্ত দিয়ে থাকলে নিচে যোগ করুন</div>' +
              '<button class="acc-empty-btn" onclick="openOffDonateModal()">✚ বাইরের রক্তদান যোগ করুন</button>' +
            '</div>';
        return;
    }
    list.innerHTML = '<div class="acc-timeline">' + rows + '</div>';
}

function _renderAccountDashboard(res) {
    var a = res.auth || {};
    var d = res.donor;
    var name = a.name || a.email || a.phone || 'User';
    var setTxt = function(id, val){ var el = document.getElementById(id); if (el) el.textContent = val; };
    var show   = function(id, on){ var el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; };

    // ── Avatar (photo → initials on crimson) ──
    var av = document.getElementById('accAvatar');
    if (av) {
        if (a.photo) {
            var init = (name.trim()[0] || '?').toUpperCase();
            av.innerHTML = '<img src="' + _esc(a.photo) + '" alt="" referrerpolicy="no-referrer" ' +
                'style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" ' +
                'onerror="this.parentNode.textContent=\'' + _esc(init) + '\'">';
        } else {
            av.textContent = (name.trim()[0] || '?').toUpperCase();
        }
    }
    setTxt('accName', name);

    // ── Provider pill ──
    var prov = document.getElementById('accProvider');
    if (prov) {
        prov.className = 'acc-pill ' + (a.provider === 'phone' ? 'acc-pill-green' : 'acc-pill-blue');
        prov.textContent = (a.provider === 'phone') ? '📱 ফোন' : '🔵 Google';
    }

    // ── Contact rows ──
    setTxt('accEmail', a.email || '—');
    // Number used to VERIFY the account (Telegram/WhatsApp/phone-OTP), else Firebase sign-in phone.
    setTxt('accPhone', a.verify_phone || a.phone || '—');
    setTxt('accMemberSince', a.member_since || '—');

    // ── Verified / unverified pill + bind banner ──
    var vb = document.getElementById('accVerifyBadge');
    if (vb) {
        if (a.verified) {
            var chLabel = (a.verify_channel === 'telegram') ? '✈️ Telegram'
                        : (a.verify_channel === 'whatsapp') ? '🟢 WhatsApp'
                        : (a.provider === 'phone') ? '📱 ফোন' : '';
            vb.className = 'acc-pill acc-pill-green';
            vb.textContent = '✅ Verified' + (chLabel ? ' · ' + chLabel : '');
        } else {
            vb.className = 'acc-pill acc-pill-amber';
            vb.textContent = '⚠️ Unverified';
        }
        vb.style.display = '';
    }
    show('accVerifyBanner', !a.verified);

    // ── Donor-dependent UI: blood badge, level pill, location, stats, eligibility, toggle ──
    var bgBadge    = document.getElementById('accBloodBadge');
    var levelBadge = document.getElementById('accLevelBadge');
    if (d) {
        if (bgBadge)    { bgBadge.textContent = d.blood_group || '—'; bgBadge.style.display = ''; }
        if (levelBadge) { levelBadge.textContent = (d.badge_icon ? d.badge_icon + ' ' : '') + (d.badge_level || ''); levelBadge.style.display = (d.badge_level ? '' : 'none'); }
        if (d.location) { setTxt('accLocation', d.location); show('accLocationRow', true); } else { show('accLocationRow', false); }

        // Stat card — total donations + last donation date
        setTxt('accStatTotal', (d.total_donations != null ? d.total_donations : 0));
        var lastDon = (d.last_donation && d.last_donation !== 'no') ? d.last_donation : '';
        setTxt('accStatLast', lastDon ? ('🗓️ ' + lastDon) : 'এখনো রেকর্ড নেই');

        // Eligibility ring (120-day cooldown — matches server getLiveStatus())
        _renderEligibilityRing(d.last_donation);

        // Availability segmented toggle — calls the SAME existing set_willing endpoint
        var notWilling = (d.willing === 'no');
        var segYes = document.getElementById('accSegYes');
        var segNo  = document.getElementById('accSegNo');
        if (segYes) segYes.className = 'acc-seg-btn seg-yes' + (notWilling ? '' : ' is-active');
        if (segNo)  segNo.className  = 'acc-seg-btn seg-no'  + (notWilling ? ' is-active' : '');

        show('accStatsRow', true);
        show('accActionRow', true);
        show('accDonorCta', false);
    } else {
        if (bgBadge) bgBadge.style.display = 'none';
        if (levelBadge) levelBadge.style.display = 'none';
        show('accLocationRow', false);
        show('accStatsRow', false);
        show('accActionRow', false);
        var cta = document.getElementById('accDonorCta');
        if (cta) {
            cta.innerHTML =
                '<div class="acc-empty" style="border-style:solid;">' +
                  '<span class="acc-empty-ico">🩸</span>' +
                  '<span style="color:var(--text-main);font-weight:500;">আপনি এখনো রক্তদাতা হিসেবে নিবন্ধিত নন</span>' +
                  '<div class="acc-empty-sub">রক্তদাতা হিসেবে যুক্ত হয়ে জীবন বাঁচাতে সাহায্য করুন</div>' +
                  '<button class="acc-empty-btn" style="background:var(--success);" onclick="appSwitchPage(\'register\'); setTimeout(function(){ try{switchTab(0);}catch(e){} },220);">📝 রক্তদাতা হিসেবে যুক্ত হোন</button>' +
                '</div>';
            cta.style.display = '';
        }
    }
}

// ── Eligibility ring — SVG donut showing 120-day donation-cooldown progress.
//    lastStr is 'd/m/Y' or 'no'/'' (from account_info donor.last_donation).
//    No last donation OR cooldown passed → full green "ready"; else amber + days left.
function _renderEligibilityRing(lastStr) {
    var ringEl = document.getElementById('accEligRing');
    var textEl = document.getElementById('accEligText');
    if (!ringEl) return;
    var INTERVAL = 120; // days — consistent with the backend cooldown rule
    var hasLast = lastStr && lastStr !== 'no';
    var daysSince = null;
    if (hasLast) {
        var m = String(lastStr).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m) {
            var then = new Date(+m[3], (+m[2]) - 1, +m[1]).getTime();
            daysSince = Math.floor((Date.now() - then) / 86400000);
        }
    }
    var pct, color, center, caption;
    if (!hasLast || daysSince === null || daysSince >= INTERVAL) {
        pct = 1; color = 'var(--success)';
        center = '✓';
        caption = '<strong>এখনই রক্তদানে প্রস্তুত</strong>';
    } else {
        var left = INTERVAL - daysSince;
        pct = Math.max(0.04, Math.min(1, daysSince / INTERVAL));
        color = '#f59e0b';
        center = left + '<span style="font-size:0.62em;"> দিন</span>';
        caption = 'আর <strong>' + left + '</strong> দিন পর<br>আবার দিতে পারবেন';
    }
    var R = 26, C = 2 * Math.PI * R, off = C * (1 - pct);
    ringEl.innerHTML =
        '<svg width="64" height="64" viewBox="0 0 64 64">' +
          '<circle cx="32" cy="32" r="' + R + '" fill="none" stroke="var(--border-color)" stroke-width="6"></circle>' +
          '<circle cx="32" cy="32" r="' + R + '" fill="none" stroke="' + color + '" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"></circle>' +
        '</svg>' +
        '<div class="acc-ring-center" style="color:' + color + ';">' + center + '</div>';
    if (textEl) textEl.innerHTML = caption;
}

// ── Account Dashboard থেকে এক ট্যাপে willing/not-willing toggle ──
function setMyWilling(val) {
    var segYes = document.getElementById('accSegYes');
    var segNo  = document.getElementById('accSegNo');
    // double-tap রোধে request চলাকালীন দুটো segment-ই disable
    if (segYes) segYes.disabled = true;
    if (segNo)  segNo.disabled = true;
    var fd = new FormData();
    fd.append('set_willing', '1');
    fd.append('willing', val);
    fd.append('csrf_token', CSRF_TOKEN);
    fetch(_AJAX_URL, {method:'POST', body:fd})
        .then(safeJSON)
        .then(function(res){
            if (segYes) segYes.disabled = false;
            if (segNo)  segNo.disabled = false;
            if (res && res.status === 'success') {
                // server যা সেভ করল সেটাই authoritative — segmented control সাথে সাথে update
                // (full reload ছাড়াই, _renderAccountDashboard-এর একই logic)
                var notWilling = (res.willing === 'no');
                if (segYes) segYes.className = 'acc-seg-btn seg-yes' + (notWilling ? '' : ' is-active');
                if (segNo)  segNo.className  = 'acc-seg-btn seg-no'  + (notWilling ? ' is-active' : '');
                showToast(notWilling ? '🚫 ঠিক আছে — এখন আপনি "এখন পারছি না" হিসেবে দেখাবেন।'
                                     : '✅ এখন থেকে আপনি "রক্ত দিতে পারি" হিসেবে দেখাবেন।', 'success');
            } else {
                showToast((res && res.msg) ? res.msg : 'পরিবর্তন করা যায়নি।', 'error');
            }
        })
        .catch(function(){
            if (segYes) segYes.disabled = false;
            if (segNo)  segNo.disabled = false;
            showToast('Network error। আবার চেষ্টা করুন।', 'error');
        });
}

function _renderMyMessages(rows) {
    var ml = document.getElementById('accMsgList');
    if (!ml) return;
    if (!rows.length) {
        ml.innerHTML = '<div class="acc-empty"><span class="acc-empty-ico">💬</span>এখনো কোনো message নেই<div class="acc-empty-sub">Admin-কে কিছু জানাতে উপরের "✚ নতুন" বাটনে চাপুন</div></div>';
        return;
    }
    var html = '';
    rows.forEach(function(r){
        html += '<div style="margin-bottom:12px;">';
        // user's own message (right-aligned bubble)
        html += '<div style="display:flex;justify-content:flex-end;">' +
                  '<div style="max-width:85%;background:var(--primary-red);color:#fff;padding:8px 12px;border-radius:14px 14px 4px 14px;font-size:0.82em;line-height:1.5;word-break:break-word;">' + _esc(r.message || '') + '</div>' +
                '</div>';
        if (r.admin_reply) {
            html += '<div style="display:flex;justify-content:flex-start;margin-top:5px;">' +
                      '<div style="max-width:85%;background:var(--input-bg);border:1px solid var(--border-color);color:var(--text-main);padding:8px 12px;border-radius:14px 14px 14px 4px;font-size:0.82em;line-height:1.5;word-break:break-word;">' +
                        '<span style="font-size:0.85em;font-weight:700;color:var(--info);">👨‍⚕️ Admin</span><br>' + _esc(r.admin_reply) +
                      '</div>' +
                    '</div>';
        } else {
            html += '<div style="display:flex;justify-content:flex-start;margin-top:4px;"><span style="font-size:0.72em;color:var(--text-muted);font-style:italic;">⏳ Reply-এর অপেক্ষায়...</span></div>';
        }
        html += '</div>';
    });
    ml.innerHTML = html;
}

// ── Call History (last 30 days) ─────────────────────────────────────
// IMPORTANT: there is currently NO read-endpoint for a user's own calls,
// so this renders the empty state only — NO new API / table / schema is
// added here. The EXISTING `call_logs` table already stores every
// reveal/call (donor_id, caller_phone, caller_location, created_at).
// To make this live without inventing data:
//   1) add an AJAX action (e.g. get_my_calls) returning this account's rows
//      — caller_phone = session verify_phone (outgoing) OR donor_id = my
//        donor id (incoming) — limited to the last 30 days; then
//   2) replace the empty render in loadMyCallHistory() with a fetch that
//      passes the rows to _renderCallHistory() (it already builds the list,
//      counter badge and Clear-History button for that data shape).
// Clear History → add a clear_my_calls delete action, call it from
// clearMyCallHistory(). 30-day retention/cleanup can reuse existing jobs.
function loadMyCallHistory() {
    // No endpoint yet → show empty state. (Wire the fetch here once get_my_calls exists.)
    _renderCallHistory([]);
}

function _renderCallHistory(rows) {
    var list = document.getElementById('accCallList');
    var cnt  = document.getElementById('accCallCount');
    var clr  = document.getElementById('accCallClearBtn');
    if (!list) return;
    rows = Array.isArray(rows) ? rows : [];
    // Defensive 30-day window (backend should also filter).
    var cutoff = (Date.now() / 1000) - (30 * 86400);
    rows = rows.filter(function(c){ return !c.ts || c.ts >= cutoff; });
    if (cnt) { if (rows.length) { cnt.textContent = rows.length + ' Calls'; cnt.style.display = ''; } else cnt.style.display = 'none'; }
    if (clr) clr.style.display = rows.length ? '' : 'none';

    if (!rows.length) {
        list.innerHTML =
            '<div class="acc-empty">' +
              '<span class="acc-empty-ico">📞</span>' +
              'গত ৩০ দিনে কোনো কল রেকর্ড নেই' +
              '<div class="acc-empty-sub">দাতাকে call করলে এখানে গত ৩০ দিনের কল দেখা যাবে</div>' +
            '</div>';
        return;
    }
    var html = '';
    rows.forEach(function(c){
        var incoming = (c.direction === 'in' || c.direction === 'incoming');
        var dir = incoming ? '<span style="color:var(--info);">📥 Incoming</span>'
                           : '<span style="color:var(--success);">📤 Outgoing</span>';
        var when = c.ts ? new Date(c.ts * 1000).toLocaleString('bn-BD', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}) : '';
        var bg = c.blood_group ? ' <span class="blood-badge" style="font-size:0.78em;font-weight:500;">' + _esc(c.blood_group) + '</span>' : '';
        var inner =
            '<span style="font-size:1.1em;">📞</span>' +
            '<div style="flex:1;min-width:0;font-size:0.83em;line-height:1.5;">' +
              '<strong style="color:var(--text-main);font-weight:500;">' + _esc(c.name || c.caller_name || '—') + '</strong>' + bg + '<br>' +
              '<span style="color:var(--text-muted);">' + dir + ' · ' + _esc(when) + (c.duration ? ' · ' + _esc(c.duration) : '') + '</span>' +
            '</div>';
        // Link to the related donor/request when an existing URL is supplied.
        if (c.url) {
            html += '<a href="' + _esc(c.url) + '" class="acc-card" style="text-decoration:none;padding:10px 12px;margin-bottom:8px;display:flex;align-items:center;gap:10px;">' + inner + '</a>';
        } else {
            html += '<div class="acc-card" style="padding:10px 12px;margin-bottom:8px;display:flex;align-items:center;gap:10px;">' + inner + '</div>';
        }
    });
    list.innerHTML = html;
}

function clearMyCallHistory() {
    // TODO(backend): no clear_my_calls endpoint exists yet. When added, POST it
    //   here (with CSRF_TOKEN) then call loadMyCallHistory() on success. This
    //   button is only shown when entries exist, so it is inert until then.
}

// ছোট HTML-escape helper (XSS রোধে)
function _esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// signed-in Google অ্যাকাউন্ট থেকে registration form prefill
function _prefillRegFromAuth(auth) {
    try {
        if (!auth) return;
        var form = document.getElementById('regForm');
        if (!form) return;
        var nameEl = form.querySelector('input[name="name"]');
        if (nameEl && !nameEl.value && auth.name) nameEl.value = auth.name;
        var phoneEl = form.querySelector('input[name="phone"]');
        if (!phoneEl) return;
        // verify করতে যে নম্বরটি ব্যবহার হয়েছে (Telegram/WhatsApp bind, নইলে phone-OTP)
        //  সেটিই বসাও ও lock করো — register করতে verify বাধ্যতামূলক, তাই নম্বর সবসময় locked।
        var verifiedPhone = auth.verify_phone || auth.phone || '';
        if (verifiedPhone && /^\+8801\d{9}$/.test(verifiedPhone)) {
            phoneEl.value = verifiedPhone;
            phoneEl.readOnly = true;
            phoneEl.setAttribute('readonly', 'readonly');
            phoneEl.classList.add('locked-field');
            phoneEl.title = 'এই নম্বরটি আপনার verify করা নম্বর — পরিবর্তন করা যাবে না';
        } else {
            // verified নম্বর না থাকলে editable (register gate তবু আটকাবে)
            phoneEl.readOnly = false;
            phoneEl.removeAttribute('readonly');
            phoneEl.classList.remove('locked-field');
            phoneEl.removeAttribute('title');
        }
    } catch(e){}
}
document.addEventListener('DOMContentLoaded', function(){ try { _renderAuthState(); } catch(e){} });
function toggleFaq(qEl) {
    vibrateIfOn([10]);
    const a = qEl.nextElementSibling;
    if (!a) return;
    const isOpen = a.classList.contains('open');
    // Close all
    document.querySelectorAll('.faq-a.open').forEach(function(el){ 
        el.classList.remove('open');
        const arrow = el.previousElementSibling && el.previousElementSibling.querySelector('.faq-arrow');
        if (arrow) { arrow.style.transform=''; arrow.style.color=''; }
    });
    if (!isOpen) {
        a.classList.add('open');
        const arrow = qEl.querySelector('.faq-arrow');
        if (arrow) { arrow.style.transform='rotate(90deg)'; arrow.style.color='var(--primary-red)'; }
    }
}
function closeSettings(e) {
    if (e.target === document.getElementById('settingsPanelOverlay')) closeSettingsPanel();
}

// ============================================================
// HAMBURGER SIDE DRAWER (mobile)
// ============================================================
function openSideDrawer() {
    vibrateIfOn([15]);
    openOverlay('sideDrawerOverlay');
}
function closeSideDrawer(e) {
    // When used as an overlay onclick handler, only close on scrim taps (not drawer-content taps)
    if (e && e.target && e.target !== document.getElementById('sideDrawerOverlay')) return;
    closeOverlay('sideDrawerOverlay');
}

// ============================================================
// INFO PAGES (About / Privacy & Policy / FAQ / Our Sponsor)
// Single full-screen overlay; the matching panel is revealed by key.
// ============================================================
var _infoTitles = {
    about:   'আমাদের কথা',
    privacy: 'গোপনীয়তা ও নীতিমালা',
    faq:     'প্রশ্ন ও উত্তর',
    sponsor: 'আমাদের স্পন্সর',
    donate:  'Donate Us'
};
function copyDonateNumber() {
    var el = document.getElementById('donateBkashNum');
    var num = el ? el.textContent.trim() : '01518981827';
    function done() { showToast('bKash number কপি হয়েছে: ' + num, 'info'); vibrateIfOn([15]); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(num).then(done).catch(function(){ done(); });
    } else {
        var ta = document.createElement('textarea');
        ta.value = num; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch(e) {}
        document.body.removeChild(ta); done();
    }
}
// Relocate existing modal content into the panel on first open (single source of truth).
function _infoEnsureContent(key) {
    var dst, src;
    if (key === 'about') {
        dst = document.getElementById('infoAboutContent');
        if (dst && !dst.children.length) {
            src = document.querySelector('#aboutUsPopupOverlay .scroll-content');
            if (src) dst.appendChild(src);
        }
    } else if (key === 'faq') {
        dst = document.getElementById('infoFaqContent');
        if (dst && !dst.children.length) {
            src = document.querySelector('#faqModal .scroll-content');
            if (src) { src.style.maxHeight = ''; src.style.padding = ''; src.style.overflowY = ''; dst.appendChild(src); }
        }
    }
}
function openInfoPage(key) {
    vibrateIfOn([15]);
    // If the drawer is open, close it first (no scroll-unlock fight — info overlay re-locks)
    closeOverlay('sideDrawerOverlay');
    _infoEnsureContent(key);
    document.querySelectorAll('#infoPageOverlay .info-panel').forEach(function(p) {
        p.style.display = (p.getAttribute('data-info') === key) ? 'block' : 'none';
    });
    var title = document.getElementById('infoPageTitle');
    if (title) {
        var tt = _infoTitles[key] || 'Info';
        title.textContent = (typeof window.t === 'function') ? window.t(tt) : tt;
    }
    var ov = document.getElementById('infoPageOverlay');
    if (ov) {
        ov.classList.add('active');
        var body = ov.querySelector('.info-page-body');
        if (body) body.scrollTop = 0;
    }
    lockBodyScroll();
}
function closeInfoPage() {
    var ov = document.getElementById('infoPageOverlay');
    if (ov) ov.classList.remove('active');
    unlockBodyScroll();
}

// ============================================================
// DONOR DETAIL POPUP
// ============================================================
// Opens a read-only profile popup for a donor card. Phone number
// and email are intentionally NOT shown — calling goes through the
// existing verified prepCall() flow.
function openDonorDetail(card) {
    if (!card) return;
    vibrateIfOn([12]);
    var d = card.dataset;

    var nameEl = document.getElementById('ddName');
    nameEl.innerHTML = (d.name || 'Donor') +
        (d.badgeicon ? ' <span style="font-size:0.85em;opacity:0.85;">' + d.badgeicon + '</span>' : '');

    var blood = document.getElementById('ddBlood');
    blood.textContent = d.group || '';
    blood.className = 'dd-badge ' + (d.bgclass || '');

    var st = document.getElementById('ddStatus');
    st.textContent = (d.sticon || '') + ' ' + (d.status || '');
    st.className = 'dd-status ' + (d.stclass || '');

    document.getElementById('ddLoc').textContent   = d.loc || '—';
    document.getElementById('ddBadge').textContent = (d.badge || 'New') + ' Donor';
    document.getElementById('ddTotal').textContent = (d.total || '0') + ' বার';
    document.getElementById('ddLast').textContent  = d.last || '—';
    document.getElementById('ddSince').textContent = d.since || '—';

    var callBtn = document.getElementById('ddCallBtn');
    if (d.available === '1') {
        callBtn.style.display = '';
        callBtn.disabled = false;
        callBtn.onclick = function() {
            closeDonorDetail();
            prepCall(d.id);
        };
    } else {
        callBtn.style.display = 'none';
    }

    // ── Red outline on the clicked card; clear any previous selection ──
    //  Only the card currently opened in the detail popup stays highlighted.
    document.querySelectorAll('.donor-selected-outline').forEach(function(el) {
        el.classList.remove('donor-selected-outline');
    });
    card.classList.add('donor-selected-outline');

    // ── Open the popup WITHOUT touching window scroll ──
    //  The overlay is position:fixed/centered, so it needs no scroll lock. Locking
    //  the body (position:fixed) was yanking the list to the top on open — leave the
    //  page exactly where it is so the clicked card stays in place.
    document.getElementById('donorDetailPopup').classList.add('active');
}

function closeDonorDetail() {
    var p = document.getElementById('donorDetailPopup');
    if (p) p.classList.remove('active');
}

// ============================================================
// DONOR CARD ZOOM
// ============================================================
(function initDcZoom() {
    var saved = parseFloat(localStorage.getItem('dc_zoom') || '1.5');
    document.documentElement.style.setProperty('--dc-zoom', saved);
})();
function changeZoom(dir) {
    var steps = [0.75, 0.85, 1.0, 1.15, 1.3, 1.5];
    var cur = parseFloat(localStorage.getItem('dc_zoom') || '1.5');
    var idx = steps.findIndex(function(s){ return Math.abs(s-cur)<0.01; });
    if (idx === -1) idx = 2; // default to 100%
    idx = Math.max(0, Math.min(steps.length-1, idx+dir));
    var newVal = steps[idx];
    localStorage.setItem('dc_zoom', newVal);
    document.documentElement.style.setProperty('--dc-zoom', newVal);
    var zl = document.getElementById('zoomValLabel');
    if (zl) zl.textContent = Math.round(newVal*100)+'%';
}
function updateSettingsToggles() {
    var isLight = localStorage.getItem('theme') !== 'dark';
    var tt = document.getElementById('settingsThemeToggle');
    // Dark mode toggle = ON when dark mode is active
    if (tt) tt.classList.toggle('on', !isLight);
    // Update the icon in settings
    var si = document.querySelector('.si-theme .settings-item-icon');
    if (si) si.textContent = isLight ? '☀️' : '🌙';

    // ✨ 3D & Animation toggle — OFF by default; ON only when user opts in (fx_on)
    var fxt = document.getElementById('settingsFxToggle');
    if (fxt) fxt.classList.toggle('on', localStorage.getItem('fx_on') === '1');

    var soundOff = localStorage.getItem('sound_off') === '1';
    var st = document.getElementById('settingsSoundToggle');
    if (st) st.classList.toggle('on', !soundOff);

    var autoScrollOn = localStorage.getItem('auto_scroll_call') === '1';
    var ast = document.getElementById('settingsAutoScrollToggle');
    if (ast) ast.classList.toggle('on', autoScrollOn);

    var vibOff = localStorage.getItem('vibration_off') === '1';
    var vt = document.getElementById('settingsVibToggle');
    if (vt) vt.classList.toggle('on', !vibOff);

    // Update zoom label
    var zl = document.getElementById('zoomValLabel');
    if (zl) { var zv = parseFloat(localStorage.getItem('dc_zoom') || '1.5'); zl.textContent = Math.round(zv*100)+'%'; }

    // Notification status
    var nt = document.getElementById('notifStatusText');
    var nb = document.getElementById('notifStatusBadge');
    if ('Notification' in window) {
        if (Notification.permission === 'granted') {
            if (nt) nt.textContent = '✅ Notifications চালু আছে';
            if (nb) { nb.textContent = '✅'; nb.style.color = 'var(--success)'; }
        } else if (Notification.permission === 'denied') {
            if (nt) nt.textContent = '❌ Browser settings থেকে Allow করুন';
            if (nb) { nb.textContent = '❌'; nb.style.color = 'var(--danger)'; }
        } else {
            if (nt) nt.textContent = 'নতুন blood request এলে জানুন';
            if (nb) { nb.textContent = '›'; nb.style.color = ''; }
        }
    }

    // Install app status
    var installItem = document.getElementById('settingsInstallItem');
    var installText = document.getElementById('installStatusText');
    var installBadge = document.getElementById('installStatusBadge');
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches
                    || window.navigator.standalone === true;
    if (installItem) {
        if (isStandalone) {
            // Already installed
            if (installText) installText.textContent = '✅ ইতিমধ্যে Install করা আছে';
            if (installBadge) { installBadge.textContent = '✅'; installBadge.style.color = 'var(--success)'; }
            installItem.style.opacity = '0.55';
            installItem.style.pointerEvents = 'none';
        } else if (window._pwaPromptEvent) {
            if (installText) installText.textContent = 'Install করতে tap করুন';
            if (installBadge) { installBadge.textContent = '›'; installBadge.style.color = ''; }
        } else {
            if (installText) installText.textContent = 'Home Screen-এ Add করুন';
            if (installBadge) { installBadge.textContent = '›'; installBadge.style.color = ''; }
        }
    }

    // Location status
    var lt = document.getElementById('locStatusText');
    var lb = document.getElementById('locStatusBadge');
    if (navigator.permissions) {
        navigator.permissions.query({name:'geolocation'}).then(function(r) {
            if (r.state === 'granted') {
                if(lt) lt.textContent = '✅ Location চালু আছে';
                if(lb) { lb.textContent = '✅'; lb.style.color = 'var(--success)'; }
            } else if (r.state === 'denied') {
                if(lt) lt.textContent = '❌ Browser settings থেকে Allow করুন';
                if(lb) { lb.textContent = '❌'; lb.style.color = 'var(--danger)'; }
            } else {
                if(lt) lt.textContent = 'Nearby donors খুঁজতে দরকার';
                if(lb) { lb.textContent = '›'; lb.style.color = ''; }
            }
        });
    }
}
function toggleSoundSetting() {
    var isOff = localStorage.getItem('sound_off') === '1';
    if (isOff) localStorage.removeItem('sound_off'); else localStorage.setItem('sound_off','1');
    updateSettingsToggles();
}
function toggleAutoScrollSetting() {
    var isOn = localStorage.getItem('auto_scroll_call') === '1';
    if (isOn) localStorage.removeItem('auto_scroll_call'); else localStorage.setItem('auto_scroll_call','1');
    updateSettingsToggles();
}
function toggleVibrationSetting() {
    var isOff = localStorage.getItem('vibration_off') === '1';
    if (isOff) {
        localStorage.removeItem('vibration_off');
        if (navigator.vibrate) navigator.vibrate([30, 20, 60]); // preview when turning ON
    } else {
        localStorage.setItem('vibration_off', '1');
    }
    updateSettingsToggles();
}
// ── vibrateIfOn(pattern) — call everywhere instead of navigator.vibrate directly ──
function vibrateIfOn(pattern) {
    if (localStorage.getItem('vibration_off') === '1') return;
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch(e) {}
}
function settingsInstallApp() {
    closeSettingsPanel();
    _checkPermsBeforeInstall(function() {
    setTimeout(function() {
        // Reset content to original
        var andEl = document.getElementById('pwaAndroidContent');
        if (andEl) {
            andEl.innerHTML =
                '<div class="pwa-top-row">'
              + '  <img src="icon.png" alt="Blood Arena" class="pwa-app-icon">'
              + '  <div class="pwa-install-titles"><strong>Blood Arena</strong><span>Home Screen-এ Add করুন</span></div>'
              + '  <div class="pwa-top-btns">'
              + '    <button class="pwa-install-btn" onclick="pwaDoInstall()">📲 Install</button>'
              + '    <button class="pwa-dismiss-btn" onclick="pwaDismiss()">✕</button>'
              + '  </div>'
              + '</div>'
              + '<div class="pwa-features">'
              + '  <span class="pwa-feat-pill">⚡ দ্রুত লোড</span>'
              + '  <span class="pwa-feat-pill">📵 Offline</span>'
              + '  <span class="pwa-feat-pill">🔔 Notification</span>'
              + '  <span class="pwa-feat-pill">📱 App Feel</span>'
              + '</div>';
        }
        var overlay = document.getElementById('pwaInstallOverlay');
        if (overlay) overlay.classList.add('show');
    }, 320);
    });
}
// Sidebar "Install as App" — Settings item-এর মতোই overlay দেখায়
function sidebarInstallApp() {
    _checkPermsBeforeInstall(function() {
    setTimeout(function() {
        var andEl = document.getElementById('pwaAndroidContent');
        if (andEl) {
            andEl.innerHTML =
                '<div class="pwa-top-row">'
              + '  <img src="icon.png" alt="Blood Arena" class="pwa-app-icon">'
              + '  <div class="pwa-install-titles"><strong>Blood Arena</strong><span>Home Screen-এ Add করুন</span></div>'
              + '  <div class="pwa-top-btns">'
              + '    <button class="pwa-install-btn" onclick="pwaDoInstall()">📲 Install</button>'
              + '    <button class="pwa-dismiss-btn" onclick="pwaDismiss()">✕</button>'
              + '  </div>'
              + '</div>'
              + '<div class="pwa-features">'
              + '  <span class="pwa-feat-pill">⚡ দ্রুত লোড</span>'
              + '  <span class="pwa-feat-pill">📵 Offline</span>'
              + '  <span class="pwa-feat-pill">🔔 Notification</span>'
              + '  <span class="pwa-feat-pill">📱 App Feel</span>'
              + '</div>';
        }
        var overlay = document.getElementById('pwaInstallOverlay');
        if (overlay) overlay.classList.add('show');
    }, 320);
    });
}

// ── Permission check before PWA install ──
(function() {
    var _origPwaDoInstall = window.pwaDoInstall;
    window._checkPermsBeforeInstall = function(callback) {
        var checks = [];
        checks.push(new Promise(function(resolve) {
            if (!('Notification' in window)) { resolve(null); return; }
            if (Notification.permission === 'granted') { resolve(null); return; }
            if (Notification.permission === 'denied') { resolve('notifications'); return; }
            Notification.requestPermission().then(function(p) {
                resolve(p === 'granted' ? null : 'notifications');
            });
        }));
        checks.push(new Promise(function(resolve) {
            function locDone(state) {
                if (state === 'granted') { resolve(null); return; }
                if (state === 'denied') { resolve('location'); return; }
                navigator.geolocation.getCurrentPosition(
                    function() { resolve(null); },
                    function() { resolve('location'); },
                    { timeout: 3000, maximumAge: Infinity }
                );
            }
            if (navigator.permissions) {
                navigator.permissions.query({name:'geolocation'}).then(function(r) {
                    locDone(r.state);
                }).catch(function() { locDone('prompt'); });
            } else {
                resolve('location');
            }
        }));
        Promise.all(checks).then(function(results) {
            var denied = results.filter(function(r) { return r !== null; });
            if (denied.length === 0) { callback(); return; }
            var idx = 0;
            var _origClose = window.closePermGuide;
            window.closePermGuide = function() {
                _origClose();
                window.closePermGuide = _origClose;
                idx++;
                if (idx < denied.length) openPermGuide(denied[idx], INSTALL_PERM_NOTE);
            };
            openPermGuide(denied[0], INSTALL_PERM_NOTE);
        });
    };
    window.pwaDoInstall = function() {
        window._checkPermsBeforeInstall(function() {
            if (_origPwaDoInstall) _origPwaDoInstall();
        });
    };
})();

// ইতিমধ্যে standalone হিসেবে চললে sidebar-এর Install item লুকাও
(function() {
    function _hideInstallIfStandalone() {
        var isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
                        || window.navigator.standalone === true;
        if (isStandalone) {
            ['sdInstallItem','headerInstallBtn'].forEach(function(id){
                var it = document.getElementById(id);
                if (it) it.style.display = 'none';
            });
        }
    }
    if (document.readyState !== 'loading') _hideInstallIfStandalone();
    else document.addEventListener('DOMContentLoaded', _hideInstallIfStandalone);
    window.addEventListener('appinstalled', function() {
        ['sdInstallItem','headerInstallBtn'].forEach(function(id){
            var it = document.getElementById(id);
            if (it) it.style.display = 'none';
        });
    });
})();

function requestBrowserNotif() {
    if (!('Notification' in window)) { showToast('এই browser notification সাপোর্ট করে না।', 'error'); return; }
    if (Notification.permission === 'granted') { showToast('✅ Notifications ইতিমধ্যে চালু আছে।', 'success'); return; }
    closeSettingsPanel();
    openPermGuide('notifications');
}
function requestLocationSetting() {
    if (!navigator.geolocation) { showToast('এই browser geolocation সাপোর্ট করে না।', 'error'); return; }
    closeSettingsPanel();
    if (navigator.permissions) {
        navigator.permissions.query({name:'geolocation'}).then(function(r) {
            if (r.state === 'granted') { showToast('✅ Location ইতিমধ্যে চালু আছে।', 'success'); }
            else { openPermGuide('location'); }
        }).catch(function(){ openPermGuide('location'); });
    } else {
        openPermGuide('location');
    }
}
function openPermGuide(type, contextNote) {
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    var isAndroid = /Android/.test(navigator.userAgent);
    var platform = isAndroid ? 'android' : 'ios';
    var steps = getPermSteps(type, platform);
    if (!steps) return;
    var titles = { notifications:'🔔 Notification চালু করুন', location:'📍 Location চালু করুন' };
    document.getElementById('permGuideTitle').textContent = titles[type] || 'Permission চালু করুন';
    document.getElementById('permGuidePlatform').textContent = platform === 'android' ? 'Android' : 'iOS';
    var container = document.getElementById('permGuideSteps');
    // optional context note (e.g. install-এর সময় mandatory-permission সতর্কতা)
    var noteHtml = contextNote
        ? '<div class="perm-guide-note">' + contextNote + '</div>'
        : '';
    container.innerHTML = noteHtml + steps.map(function(s, i) {
        var cn = 'perm-guide-step-num' + (i === steps.length - 1 ? ' done' : '');
        return '<div class="perm-guide-step">' +
            '<div class="' + cn + '">' + (i + 1) + '</div>' +
            '<div class="perm-guide-step-content">' + s + '</div></div>';
    }).join('');
    document.getElementById('permGuideReload').style.display = 'none';
    openOverlay('permGuideOverlay');
}
// App-install এর সময় permission guide-এ দেখানো বাধ্যতামূলক-permission বার্তা
var INSTALL_PERM_NOTE = '📲 App install করতে হলে Notification আর Location Permission Allow করা বাধ্যতামূলক।';
function getPermSteps(type, platform) {
    if (platform === 'android') {
        var step3Labels = { notifications:'"Notifications" → "Allow"', location:'"Location" → "Allow"' };
        return [
            'Chrome address bar-এ <span class="perm-guide-step-icon"><svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="3" y1="5" x2="17" y2="5"/><circle cx="12" cy="5" r="2.5" fill="currentColor" stroke="none"/><line x1="3" y1="10" x2="17" y2="10"/><circle cx="7" cy="10" r="2.5" fill="currentColor" stroke="none"/><line x1="3" y1="15" x2="17" y2="15"/><circle cx="14" cy="15" r="2.5" fill="currentColor" stroke="none"/></svg></span> icon এ tap করুন',
            '<span class="perm-guide-step-icon"><svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="4" y1="5" x2="16" y2="5"/><line x1="4" y1="10" x2="16" y2="10"/><circle cx="10" cy="10" r="2.5" fill="currentColor" stroke="none"/><line x1="4" y1="15" x2="16" y2="15"/><circle cx="10" cy="15" r="2.5" fill="currentColor" stroke="none"/></svg></span> "Permissions" select করুন',
            step3Labels[type] || step3Labels.notifications,
            'পেজ reload করুন ✓'
        ];
    }
    var iosMap = {
        notifications: [
            'iPhone Settings app খুলুন',
            'Safari → "Advanced" → "Website Data" এ যান',
            'অথবা Settings → Notifications → Safari → Allow',
            'Blood Arena reload করুন ✓'
        ],
        location: [
            'iPhone Settings app খুলুন',
            'Privacy & Security → Location Services',
            'Safari → "While Using" select করুন',
            'Blood Arena reload করুন ✓'
        ]
    };
    return iosMap[type] || iosMap.notifications;
}
function closePermGuide() {
    closeOverlay('permGuideOverlay');
}

// Patch sound to respect sound setting
(function() {
    var origPlay = HTMLAudioElement.prototype.play;
    HTMLAudioElement.prototype.play = function() {
        if (localStorage.getItem('sound_off') === '1') return Promise.resolve();
        return origPlay.apply(this, arguments);
    };
})();

// ============================================================
// SMART DATE PICKER FOR REGISTRATION
// ============================================================
function setDonationNever() {
    document.getElementById('lastDonationHidden').value = 'no';
    document.getElementById('sdNeverBtn').classList.add('sd-active');
    document.getElementById('sdDateBtn').classList.remove('sd-active');
    document.getElementById('sdDatePickerWrap').style.display = 'none';
    document.getElementById('sdNeverMsg').style.display = 'block';
    // Hide donation count — if never donated, count stays 0
    var wrap = document.getElementById('regDonationCountWrap');
    if(wrap) wrap.style.display = 'none';
    document.getElementById('regDonCountHidden').value = '0';
    document.getElementById('regDonCountDisplay').textContent = '0';
    updateRegBadgePreview(0);
}
function setDonationDate() {
    document.getElementById('sdNeverBtn').classList.remove('sd-active');
    document.getElementById('sdDateBtn').classList.add('sd-active');
    document.getElementById('sdDatePickerWrap').style.display = 'block';
    document.getElementById('sdNeverMsg').style.display = 'none';
    // Show donation count field
    var wrap = document.getElementById('regDonationCountWrap');
    if(wrap) wrap.style.display = 'block';
    // Set today as max date
    var today = new Date().toISOString().split('T')[0];
    var inp = document.getElementById('sdDateInput');
    inp.max = today;
    inp.min = '1940-01-01';
    if (!inp.value) { inp.value = today; syncDonationDate(today); }
    // Default count to 1 if currently 0
    var cur = parseInt(document.getElementById('regDonCountHidden').value)||0;
    if(cur === 0) {
        document.getElementById('regDonCountHidden').value = '1';
        document.getElementById('regDonCountDisplay').textContent = '1';
        updateRegBadgePreview(1);
    }
}
function syncDonationDate(val) {
    if (!val) return;
    // Convert yyyy-mm-dd to dd/mm/yyyy for the backend
    var parts = val.split('-');
    if (parts.length === 3) {
        document.getElementById('lastDonationHidden').value = parts[2]+'/'+parts[1]+'/'+parts[0];
    }
}

// ── Registration donation count ──────────────────────────────
function regDonCountChange(delta) {
    var el  = document.getElementById('regDonCountHidden');
    var dis = document.getElementById('regDonCountDisplay');
    var cur = parseInt(el.value)||0;
    var next = Math.max(1, cur + delta); // min 1 when date is picked
    el.value = next;
    dis.textContent = next;
    updateRegBadgePreview(next);
}

function updateRegBadgePreview(n) {
    var icon, name, note;
    if(n >= 10)     { icon='👑'; name='Legend Donor'; note='সর্বোচ্চ স্তর! অসাধারণ!'; }
    else if(n >= 5) { icon='🦸'; name='Hero Donor';   note='আরও '+(10-n)+' donation করলে Legend হবেন'; }
    else if(n >= 2) { icon='⭐'; name='Active Donor'; note='আরও '+(5-n)+' donation করলে Hero হবেন'; }
    else            { icon='🌱'; name='New Donor';    note=n===0?'প্রথমবার হলে 0 রাখুন':'আরও '+(2-n)+' donation করলে Active হবেন'; }
    var ic = document.getElementById('regBadgeIcon');
    var nm = document.getElementById('regBadgeName');
    var nt = document.getElementById('regBadgeNote');
    if(ic) ic.textContent = icon;
    if(nm) nm.textContent = name;
    if(nt) nt.textContent = note;
}

// Init smart date on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    setDonationNever(); // default = never donated
    updateRegBadgePreview(0);
});

// scroll-padding = header height only
document.documentElement.style.scrollPaddingTop = '80px';

// ── Online visitor heartbeat ──────────────────────────────────
(function() {
    function pingOnline() {
        var fd = new FormData();
        fd.append('ping_online', '1');
        fd.append('visitor_token', getDeviceId());
        fetch(_AJAX_URL, {method:'POST', body:fd})
            .then(function(r){ return r.json(); })
            .then(function(d){
                if (!d || !d.online) return;
                var lc = document.getElementById('liveOnlineCount');
                if (lc) lc.textContent = ' · ' + d.online + ' online';
            })
            .catch(function(){});
    }
    window.addEventListener('load', function(){
        setTimeout(pingOnline, 1500);
        setInterval(pingOnline, 30000);
    });
})();



// ── Real-time Visitors card (Register page) ───────────────────
// Pings visitors_api.php every 30s: logs this visit + reads {live, total}.
// Runs site-wide so the all-time total counts every visitor; the card itself
// is only updated when present (Register page).
(function() {
    // visitors_api.php sits next to the app entry point (works in sub-dir installs too)
    var VIS_URL = (window.location.pathname.replace(/[^/]*$/, '') || '/') + 'visitors_api.php';

    var _lvShown = 0;          // currently displayed live number
    var _lvRAF   = null;       // running count-up animation frame
    var _lvSpark = [];         // recent live samples for the sparkline

    function animateCount(el, to) {
        if (!el) return;
        var from = _lvShown;
        to = Math.max(0, to | 0);
        if (from === to) { el.textContent = to; return; }
        if (_lvRAF) cancelAnimationFrame(_lvRAF);
        var start = null, dur = 800;
        function step(ts) {
            if (start === null) start = ts;
            var p = Math.min(1, (ts - start) / dur);
            var eased = 1 - Math.pow(1 - p, 3);          // easeOutCubic
            el.textContent = Math.round(from + (to - from) * eased);
            if (p < 1) { _lvRAF = requestAnimationFrame(step); }
            else { _lvShown = to; el.textContent = to; _lvRAF = null; }
        }
        _lvRAF = requestAnimationFrame(step);
    }

    function renderSpark(live) {
        var wrap = document.getElementById('lvSpark');
        if (!wrap) return;
        _lvSpark.push(Math.max(0, live | 0));
        if (_lvSpark.length > 14) _lvSpark.shift();
        var max = Math.max.apply(null, _lvSpark.concat([1]));
        var html = '';
        for (var i = 0; i < _lvSpark.length; i++) {
            var h = Math.round(4 + (_lvSpark[i] / max) * 22);   // 4–26px
            html += '<span class="lv-bar" style="height:' + h + 'px"></span>';
        }
        wrap.innerHTML = html;
    }

    function updateCard(live, total) {
        var countEl = document.getElementById('lvCount');
        var totalEl = document.getElementById('lvTotal');
        var dotEl   = document.getElementById('lvDot');
        if (countEl) animateCount(countEl, live);
        if (totalEl) totalEl.textContent = (total | 0).toLocaleString('en-US');
        if (dotEl) dotEl.classList.toggle('is-live', (live | 0) > 0);
        renderSpark(live);
    }

    function pingVisitors() {
        var fd = new FormData();
        fd.append('session_id', (typeof getDeviceId === 'function') ? getDeviceId() : 'anon');
        fd.append('page', (window.location.pathname || '/'));
        fetch(VIS_URL, { method: 'POST', body: fd, cache: 'no-store' })
            .then(function(r){ return r.json(); })
            .then(function(d){
                if (!d) return;
                updateCard(d.live || 0, d.total || 0);
            })
            .catch(function(){ /* offline / endpoint missing → silent */ });
    }

    window.addEventListener('load', function() {
        setTimeout(pingVisitors, 1200);
        setInterval(pingVisitors, 30000);
    });
})();

// ═══════════════════════════════════════════════════════════════
// COMMUNITY — posts, replies, badge poll, infinite scroll
// ═══════════════════════════════════════════════════════════════

// ── Bengali relative time (shared with existing _relTime pattern) ──
function _commTimeAgo(ts) {
    var u = parseInt(ts,10); if(!u) return '';
    var bn = function(num){ return String(num).replace(/[0-9]/g, function(d){ return '০১২৩৪৫৬৭৮৯'[+d]; }); };
    var diff = Math.floor((Date.now() - u*1000) / 1000);
    if (diff < 45) return 'এইমাত্র';
    var m = Math.floor(diff/60);
    if (m < 60) return bn(m) + ' মিনিট আগে';
    var h = Math.floor(m/60);
    if (h < 24) return bn(h) + ' ঘণ্টা আগে';
    var d = Math.floor(h/24);
    if (d < 7) return bn(d) + ' দিন আগে';
    return new Date(u*1000).toLocaleDateString('bn-BD', {day:'numeric', month:'long'});
}

// ── Community state ──
var _commState = {
    type: 'review',
    offset: 0,
    limit: 10,
    loading: false,
    hasMore: true,
    formType: 'review',
    formRating: 0,
    _infiniteObs: null
};

// ── Switch tab ──
function switchCommTab(type) {
    if (_commState.loading) return;
    _commState.type = type;
    _commState.offset = 0;
    _commState.hasMore = true;
    document.querySelectorAll('.comm-tab').forEach(function(t){
        t.classList.toggle('active', t.getAttribute('data-type') === type);
    });
    var rs = document.getElementById('commRatingSummary');
    if (rs) rs.style.display = (type === 'review') ? '' : 'none';
    _commLoadPosts(type);
}

// ── Load posts ──
function _commLoadPosts(type, append) {
    if (_commState.loading) return;
    _commState.loading = true;
    var container = document.getElementById('commPostsContainer');
    if (!container) return;
    if (!append) {
        container.innerHTML = '<div class="comm-add-btn-wrap"><button class="comm-add-btn" onclick="openCommunityForm()">➕ নতুন পোস্ট করুন</button></div><div class="comm-loading" style="text-align:center;padding:30px;color:var(--text-muted);">লোড হচ্ছে...</div>';
    }
    var fd = new FormData();
    fd.append('get_community_posts','1');
    fd.append('type', type || _commState.type);
    fd.append('offset', String(_commState.offset));
    fd.append('limit', String(_commState.limit));
    fetch(_AJAX_URL, {method:'POST', body:fd})
    .then(safeJSON)
    .then(function(d){
        _commState.loading = false;
        if (!d || !d.posts) {
            container.innerHTML = '<div class="comm-add-btn-wrap"><button class="comm-add-btn" onclick="openCommunityForm()">➕ নতুন পোস্ট করুন</button></div><div class="comm-empty"><div class="comm-empty-icon">💬</div><div class="comm-empty-text">কিছু লোড হয়নি।</div></div>';
            return;
        }
        if (!append) {
            container.innerHTML = '<div class="comm-add-btn-wrap"><button class="comm-add-btn" onclick="openCommunityForm()">➕ নতুন পোস্ট করুন</button></div>';
        }
        // Rating summary
        var rs = document.getElementById('commRatingSummary');
        if (rs && type === 'review') {
            rs.style.display = '';
            rs.innerHTML = _commRenderRatingSummary(d);
        } else if (rs) {
            rs.style.display = 'none';
        }
        if (d.posts.length === 0 && !append) {
            var emptyMsg = (type === 'review')
                ? 'এখনো কোনো Review দেওয়া হয়নি।<br>প্রথম Review দিন!'
                : 'এখনো কোনো প্রশ্ন করা হয়নি।<br>প্রথম প্রশ্ন করুন!';
            container.innerHTML = '<div class="comm-add-btn-wrap"><button class="comm-add-btn" onclick="openCommunityForm()">➕ নতুন পোস্ট করুন</button></div><div class="comm-empty"><div class="comm-empty-icon">'+(type==='review'?'⭐':'❓')+'</div><div class="comm-empty-text">'+emptyMsg+'</div><button class="comm-empty-btn" onclick="openCommunityForm()">পোস্ট করুন</button></div>';
        }
        d.posts.forEach(function(p){
            container.insertAdjacentHTML('beforeend', _commRenderPost(p));
        });
        _commState.offset += d.posts.length;
        _commState.hasMore = d.has_more;
        // Re-init infinite scroll
        _commInitInfiniteScroll();
    })
    .catch(function(){
        _commState.loading = false;
        if (!append) container.innerHTML = '<div class="comm-add-btn-wrap"><button class="comm-add-btn" onclick="openCommunityForm()">➕ নতুন পোস্ট করুন</button></div><div class="comm-empty"><div class="comm-empty-icon">⚠️</div><div class="comm-empty-text">লোড করতে সমস্যা হয়েছে।</div></div>';
    });
}

// ── Render rating summary ──
function _commRenderRatingSummary(d) {
    var avg = d.avg_rating || 0;
    var sb = d.star_breakdown || {};
    var total = d.total || 0;
    var fullStars = Math.round(avg);
    var starsHtml = '';
    for (var i = 1; i <= 5; i++) {
        starsHtml += '<span class="comm-star' + (i <= fullStars ? ' filled' : '') + '">★</span>';
    }
    var barsHtml = '';
    for (var s = 5; s >= 1; s--) {
        var count = sb[s] || 0;
        var pct = total > 0 ? (count / total * 100) : 0;
        barsHtml += '<div class="comm-rating-bar">'
            + '<span style="width:16px;text-align:right;font-size:0.72em;">' + s + '</span>'
            + '<div class="comm-rating-bar-bg"><div class="comm-rating-bar-fill" style="width:' + pct + '%"></div></div>'
            + '<span style="font-size:0.72em;min-width:20px;">' + count + '</span>'
            + '</div>';
    }
    return '<div class="comm-rating-summary">'
        + '<div><div class="comm-rating-big">' + avg.toFixed(1) + '</div><div class="comm-rating-stars">' + starsHtml + '</div><div style="font-size:0.68em;color:var(--text-muted);margin-top:2px;">' + total + 'টি review</div></div>'
        + '<div class="comm-rating-bar-wrap">' + barsHtml + '</div>'
        + '</div>';
}

// ── Render a single post card ──
function _commRenderPost(p) {
    var isReview = p.type === 'review';
    var starsHtml = '';
    if (isReview && p.rating) {
        var r = parseInt(p.rating, 10);
        for (var i = 1; i <= 5; i++) {
            starsHtml += '<span class="comm-star' + (i <= r ? ' filled' : '') + '">★</span>';
        }
        starsHtml = '<div class="comm-stars">' + starsHtml + '</div>';
    }
    var name = _escHtml(p.display_name || 'Anonymous');
    var verified = p.auth_uid ? '<span class="comm-verified" title="Verified Account">✓</span>' : '';
    var avatar = p.auth_uid
        ? '<div class="comm-avatar" style="background:var(--info-soft);color:var(--info);">' + (name.charAt(0).toUpperCase()) + '</div>'
        : '<div class="comm-avatar">👤</div>';
    var content = _escHtml(p.content);
    var time = _commTimeAgo(p.created_ts);
    var replyCount = p.reply_count || 0;
    var replyBadge = replyCount > 0 ? '<span class="comm-reply-count" onclick="toggleCommReplies('+p.id+')">💬 '+replyCount+'টি উত্তর</span>' : '';
    var repliesHtml = '';
    if (p.replies && p.replies.length > 0) {
        p.replies.forEach(function(rp){
            var rn = _escHtml(rp.display_name || 'Anonymous');
            var ra = rp.auth_uid ? '<span class="comm-verified" title="Verified Account">✓</span>' : '';
            repliesHtml += '<div class="comm-reply">'
                + '<span class="comm-reply-name">' + rn + ra + '</span>'
                + '<span class="comm-reply-time">' + _commTimeAgo(rp.created_ts) + '</span>'
                + '<div class="comm-reply-content">' + _escHtml(rp.content) + '</div>'
                + '</div>';
        });
    }
    var showAllBtn = replyCount > 3 ? '<button class="comm-show-all-btn" onclick="toggleCommReplies('+p.id+')">সব উত্তর দেখুন ('+replyCount+')</button>' : '';
    var replySection = '<div class="comm-reply-section" id="commReplySection_'+p.id+'">'
        + repliesHtml
        + showAllBtn
        + '<button class="comm-reply-toggle-btn" onclick="_commToggleReply('+p.id+')">💬 উত্তর দিন</button>'
        + '<div class="comm-reply-form collapsed" id="commReplyForm_'+p.id+'">'
        + '<textarea id="commReplyInput_'+p.id+'" placeholder="উত্তর লিখুন..." rows="3" maxlength="500" oninput="onCommReplyInput(this)"></textarea>'
        + '<div class="comm-reply-actions">'
        + '<button class="comm-reply-cancel-btn" onclick="_commToggleReply('+p.id+')">বাতিল</button>'
        + '<button class="comm-reply-send-btn" onclick="createCommunityReply('+p.id+')" id="commReplyBtn_'+p.id+'" disabled>পাঠান</button>'
        + '</div>'
        + '</div>'
        + '</div>';
    return '<div class="comm-post-card" id="commPost_'+p.id+'">'
        + '<div class="comm-post-head">'
        + avatar
        + '<span class="comm-name">' + name + verified + '</span>'
        + '<span class="comm-time">' + time + '</span>'
        + '</div>'
        + starsHtml
        + '<div class="comm-post-content">' + content + '</div>'
        + '<div style="display:flex;align-items:center;gap:8px;">'
        + replyBadge
        + '</div>'
        + replySection
        + '</div>';
}

// ── Toggle reply form expand/collapse ──
function _commToggleReply(postId) {
    var form = document.getElementById('commReplyForm_' + postId);
    if (!form) return;
    if (form.classList.contains('collapsed')) {
        form.classList.remove('collapsed');
        form.classList.add('expanded');
        var ta = document.getElementById('commReplyInput_' + postId);
        if (ta) { setTimeout(function(){ ta.focus(); }, 100); }
    } else {
        form.classList.remove('expanded');
        form.classList.add('collapsed');
        var ta = document.getElementById('commReplyInput_' + postId);
        if (ta) { ta.value = ''; }
        var btn = document.getElementById('commReplyBtn_' + postId);
        if (btn) btn.disabled = true;
    }
}

// ── Toggle replies expand/collapse ──
var _commRepliesExpanded = {};
function toggleCommReplies(postId) {
    var section = document.getElementById('commReplySection_' + postId);
    if (!section) return;
    if (_commRepliesExpanded[postId]) {
        // Collapse — reload the full post list view (re-render)
        _commRepliesExpanded[postId] = false;
        _commReloadPost(postId);
        return;
    }
    _commRepliesExpanded[postId] = true;
    // Fetch all replies
    var fd = new FormData();
    fd.append('get_community_posts','1');
    fd.append('type', _commState.type);
    fd.append('offset', '0');
    fd.append('limit', '1');
    // We need to get the single post with full replies. Use a trick: fetch with a high limit and find our post
    // Actually, let's just fetch all replies through a separate call
    // For now, a simpler approach: re-fetch the post with limit=1000 and offset=0, find our post
    // But that's wasteful. Let me instead build a simple get_post_replies endpoint.
    // For simplicity in this implementation, let me use the existing approach of re-fetching with a high limit.
    // Actually, I'll refetch with limit=1 targeting this specific post's ID via backend filter.
    // The backend doesn't filter by post ID. Let me just do it differently:
    // We'll just fetch the post with a separate endpoint or just re-fetch and find it.
    // For now, simplest: toggleAllReplies via a dedicated endpoint call.
    // Let me just use the comment above and do a simple inline expand.
    // Actually let me just make a direct request for this post's replies.
    // Since we don't have a dedicated endpoint, let me just re-fetch and replace.
    // Actually, the simplest approach: just do a full re-fetch and find our post
    fd.append('get_all_replies_for', String(postId));
    // I'll just re-fetch the whole page but that's overkill. Instead, fetch the post directly.
    // The cleanest approach: fetch with limit high and find the post.
    // Let me just use the data from the already-loaded page and store the replies.
    // Shortcut: just load more replies by showing all that we have + fetching remaining.
    // For now, I'll load all replies by fetching post with high offset.
    // Simpler: just use the existing reply section and load remaining replies via a custom query.
    // OK let me just create a simple mechanism: re-fetch with limit=1 and offset to find our post, then show all replies.
    // Actually, the most practical approach: since we already have limited replies (3), 
    // we need the remaining ones. Let me create a simple inline fetch.
    _commLoadAllReplies(postId);
}

function _commLoadAllReplies(postId) {
    var fd = new FormData();
    fd.append('get_community_posts','1');
    fd.append('get_all_replies_for', String(postId));
    fetch(_AJAX_URL, {method:'POST', body:fd})
    .then(safeJSON)
    .then(function(d){
        if (!d || !d.posts || !d.posts[0]) return;
        var found = d.posts[0];
        if (found) {
            // Re-render just the reply section with all replies
            var section = document.getElementById('commReplySection_' + postId);
            if (!section) return;
            var repliesHtml = '';
            (found.replies || []).forEach(function(rp){
                var rn = _escHtml(rp.display_name || 'Anonymous');
                var ra = rp.auth_uid ? '<span class="comm-verified" title="Verified Account">✓</span>' : '';
                repliesHtml += '<div class="comm-reply">'
                    + '<span class="comm-reply-name">' + rn + ra + '</span>'
                    + '<span class="comm-reply-time">' + _commTimeAgo(rp.created_ts) + '</span>'
                    + '<div class="comm-reply-content">' + _escHtml(rp.content) + '</div>'
                    + '</div>';
            });
            var collapseBtn = '<button class="comm-show-all-btn" onclick="toggleCommReplies('+postId+')">সংকুচিত করুন</button>';
            section.innerHTML = repliesHtml + collapseBtn
                + '<button class="comm-reply-toggle-btn" onclick="_commToggleReply('+postId+')">💬 উত্তর দিন</button>'
                + '<div class="comm-reply-form collapsed" id="commReplyForm_'+postId+'">'
                + '<textarea id="commReplyInput_'+postId+'" placeholder="উত্তর লিখুন..." rows="3" maxlength="500" oninput="onCommReplyInput(this)"></textarea>'
                + '<div class="comm-reply-actions">'
                + '<button class="comm-reply-cancel-btn" onclick="_commToggleReply('+postId+')">বাতিল</button>'
                + '<button class="comm-reply-send-btn" onclick="createCommunityReply('+postId+')" id="commReplyBtn_'+postId+'" disabled>পাঠান</button>'
                + '</div>'
                + '</div>';
        }
    })
    .catch(function(){});
}

function _commReloadPost(postId) {
    _commState.offset = 0;
    _commLoadPosts(_commState.type, false);
}

// ── Create community post ──
function createCommunityPost() {
    var content = document.getElementById('commPostContent');
    var btn = document.getElementById('commSubmitBtn');
    if (!content || !content.value.trim()) { showToast('কন্টেন্ট লিখুন।','info'); return; }
    if (btn) btn.disabled = true;
    var fd = new FormData();
    fd.append('create_community_post','1');
    fd.append('csrf_token', CSRF_TOKEN);
    fd.append('type', _commState.formType);
    fd.append('content', content.value.trim());
    if (_commState.formType === 'review') fd.append('rating', String(_commState.formRating));
    fetch(_AJAX_URL, {method:'POST', body:fd})
    .then(safeJSON)
    .then(function(d){
        if (d && d.status === 'success') {
            showToast('পোস্ট করা হয়েছে!','success');
            closeCommunityForm();
            _commState.offset = 0;
            _commLoadPosts(_commState.type, false);
        } else {
            showToast((d&&d.msg)||'পোস্ট করতে সমস্যা হয়েছে।','error');
            if (btn) btn.disabled = false;
        }
    })
    .catch(function(){
        showToast('নেটওয়ার্ক সমস্যা।','error');
        if (btn) btn.disabled = false;
    });
}

// ── Open/close community form ──
function openCommunityForm() {
    var overlay = document.getElementById('commFormOverlay');
    if (overlay) overlay.classList.add('active');
    _commState.formType = 'review';
    _commState.formRating = 0;
    document.getElementById('commPostContent').value = '';
    document.getElementById('commCharCount').textContent = '0 / 500';
    document.getElementById('commSubmitBtn').disabled = true;
    // Reset type toggle
    document.querySelectorAll('.comm-type-pill').forEach(function(p){
        p.classList.toggle('active', p.getAttribute('data-type') === 'review');
    });
    // Reset star picker
    document.querySelectorAll('#commStarPicker span').forEach(function(s){ s.classList.remove('active'); });
    document.getElementById('commStarPicker').style.display = '';
    // Focus textarea
    setTimeout(function(){ document.getElementById('commPostContent').focus(); }, 300);
}

function closeCommunityForm() {
    var overlay = document.getElementById('commFormOverlay');
    if (overlay) overlay.classList.remove('active');
}

// ── Set post type in form ──
function setCommType(type) {
    _commState.formType = type;
    document.querySelectorAll('.comm-type-pill').forEach(function(p){
        p.classList.toggle('active', p.getAttribute('data-type') === type);
    });
    var picker = document.getElementById('commStarPicker');
    if (picker) picker.style.display = (type === 'review') ? '' : 'none';
}

// ── Set rating in form ──
function setCommRating(n) {
    _commState.formRating = n;
    document.querySelectorAll('#commStarPicker span').forEach(function(s){
        s.classList.toggle('active', parseInt(s.getAttribute('data-star'),10) <= n);
    });
    _commUpdateSubmitBtn();
}

// ── Content input handler ──
function onCommContentInput() {
    var ta = document.getElementById('commPostContent');
    var cc = document.getElementById('commCharCount');
    if (ta && cc) cc.textContent = ta.value.length + ' / 500';
    _commUpdateSubmitBtn();
}

function _commUpdateSubmitBtn() {
    var btn = document.getElementById('commSubmitBtn');
    var ta = document.getElementById('commPostContent');
    if (!btn || !ta) return;
    var ok = ta.value.trim().length > 0;
    if (_commState.formType === 'review' && _commState.formRating < 1) ok = false;
    btn.disabled = !ok;
}

// ── Create reply ──
function createCommunityReply(postId) {
    var input = document.getElementById('commReplyInput_' + postId);
    var btn = document.getElementById('commReplyBtn_' + postId);
    if (!input || !input.value.trim()) return;
    if (btn) btn.disabled = true;
    var fd = new FormData();
    fd.append('create_community_reply','1');
    fd.append('csrf_token', CSRF_TOKEN);
    fd.append('post_id', String(postId));
    fd.append('content', input.value.trim());
    fetch(_AJAX_URL, {method:'POST', body:fd})
    .then(safeJSON)
    .then(function(d){
        if (d && d.status === 'success' && d.reply) {
            input.value = '';
            // Append reply to the section
            var section = document.getElementById('commReplySection_' + postId);
            if (section) {
                var rp = d.reply;
                var rn = _escHtml(rp.display_name || 'Anonymous');
                var ra = rp.auth_uid ? '<span class="comm-verified" title="Verified Account">✓</span>' : '';
                var replyHtml = '<div class="comm-reply">'
                    + '<span class="comm-reply-name">' + rn + ra + '</span>'
                    + '<span class="comm-reply-time">' + _commTimeAgo(rp.created_ts) + '</span>'
                    + '<div class="comm-reply-content">' + _escHtml(rp.content) + '</div>'
                    + '</div>';
                // Insert before reply-form
                var form = section.querySelector('.comm-reply-form');
                if (form) form.insertAdjacentHTML('beforebegin', replyHtml);
                // Update reply count in card
                var cntSpan = section.closest('.comm-post-card')?.querySelector('.comm-reply-count');
                if (cntSpan) {
                    var m = cntSpan.textContent.match(/(\d+)/);
                    var c = m ? parseInt(m[1],10) + 1 : 1;
                    cntSpan.textContent = '💬 ' + c + 'টি উত্তর';
                }
            }
            if (btn) btn.disabled = false;
            _commToggleReply(postId);
            showToast('উত্তর দেওয়া হয়েছে।','success');
        } else {
            showToast((d&&d.msg)||'উত্তর দিতে সমস্যা।','error');
            if (btn) btn.disabled = false;
        }
    })
    .catch(function(){
        showToast('নেটওয়ার্ক সমস্যা।','error');
        if (btn) btn.disabled = false;
    });
}

function onCommReplyInput(el) {
    var btn = el.parentElement.querySelector('.comm-reply-send-btn');
    if (btn) btn.disabled = !el.value.trim();
}

// ── Admin delete post ──
function deleteCommunityPost(postId) {
    if (!confirm('এই পোস্টটি মুছে ফেলবেন?')) return;
    var fd = new FormData();
    fd.append('delete_community_post','1');
    fd.append('csrf_token', CSRF_TOKEN);
    fd.append('post_id', String(postId));
    fetch(_AJAX_URL, {method:'POST', body:fd})
    .then(safeJSON)
    .then(function(d){
        if (d && d.status === 'success') {
            var card = document.getElementById('commPost_' + postId);
            if (card) card.remove();
            showToast('মুছে ফেলা হয়েছে।','success');
        } else {
            showToast((d&&d.msg)||'মুছতে সমস্যা।','error');
        }
    })
    .catch(function(){ showToast('নেটওয়ার্ক সমস্যা।','error'); });
}

// ── Badge: unread reply count ──
var _commBadgeTimer = null;

function _commUpdateBadge() {
    // Only for signed-in users
    if (typeof _isSignedIn !== 'function' || !_isSignedIn()) {
        var b = document.getElementById('commSdBadge');
        if (b) { b.style.display = 'none'; b.textContent = ''; }
        return;
    }
    var lastSeen = 0;
    try { lastSeen = parseInt(localStorage.getItem('last_seen_community_ts'), 10) || 0; } catch(e){}
    var fd = new FormData();
    fd.append('get_community_unread','1');
    fd.append('csrf_token', CSRF_TOKEN);
    fd.append('last_seen_ts', String(lastSeen));
    fetch(_AJAX_URL, {method:'POST', body:fd})
    .then(safeJSON)
    .then(function(d){
        var badge = document.getElementById('commSdBadge');
        if (!badge) return;
        var count = (d && d.unread) || 0;
        if (count > 0) {
            badge.textContent = count > 9 ? '9+' : String(count);
            badge.style.display = 'flex';
        } else {
            badge.textContent = '';
            badge.style.display = 'none';
        }
    })
    .catch(function(){});
}

function startCommunityBadgePoll() {
    _commUpdateBadge();
    if (_commBadgeTimer) clearInterval(_commBadgeTimer);
    _commBadgeTimer = setInterval(_commUpdateBadge, 60000);
}

// ── Infinite scroll ──
function _commInitInfiniteScroll() {
    if (_commState._infiniteObs) _commState._infiniteObs.disconnect();
    var sentinel = document.getElementById('commInfiniteSentinel');
    if (!sentinel) {
        var container = document.getElementById('commPostsContainer');
        if (!container) return;
        sentinel = document.createElement('div');
        sentinel.id = 'commInfiniteSentinel';
        sentinel.style.height = '1px';
        container.appendChild(sentinel);
    }
    _commState._infiniteObs = new IntersectionObserver(function(entries){
        if (entries[0].isIntersecting && _commState.hasMore && !_commState.loading) {
            _commLoadPosts(_commState.type, true);
        }
    }, { rootMargin: '200px' });
    _commState._infiniteObs.observe(sentinel);
}

// ── Start badge poll on load ──
window.addEventListener('load', startCommunityBadgePoll);

// ════════════════════════════════════════════════════════════════════
// HOME BANNER SLIDER — 5 images (banner1..5.jpg), auto-slide every 4s.
// Controls: ◀ ▶ arrows + dots + touch-swipe. Pauses on hover / hidden tab.
// ════════════════════════════════════════════════════════════════════
(function initBannerSlider() {
    var slider = document.getElementById('bannerSlider');
    if (!slider) return;
    var track    = slider.querySelector('.banner-track');
    var slides   = slider.querySelectorAll('.banner-slide');
    var dotsWrap = slider.querySelector('.banner-dots');
    var prevBtn  = slider.querySelector('.banner-prev');
    var nextBtn  = slider.querySelector('.banner-next');
    var n = slides.length;
    if (!track || n === 0) return;

    var INTERVAL = 4000;   // auto-slide delay (ms)
    var idx = 0, timer = null;

    // Single image → hide controls, nothing to slide.
    if (n <= 1) {
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
        return;
    }

    // Build dots
    var dots = [];
    for (var i = 0; i < n; i++) {
        var d = document.createElement('button');
        d.type = 'button';
        d.className = 'banner-dot' + (i === 0 ? ' active' : '');
        d.setAttribute('aria-label', 'Slide ' + (i + 1));
        (function (k) { d.addEventListener('click', function () { go(k); restart(); }); })(i);
        dotsWrap.appendChild(d);
        dots.push(d);
    }

    function go(k) {
        idx = (k + n) % n;
        track.style.transform = 'translateX(-' + (idx * 100) + '%)';
        for (var i = 0; i < n; i++) dots[i].classList.toggle('active', i === idx);
    }
    function nextSlide() { go(idx + 1); }
    function prevSlide() { go(idx - 1); }
    function start()   { if (!timer) timer = setInterval(nextSlide, INTERVAL); }
    function stop()    { if (timer) { clearInterval(timer); timer = null; } }
    function restart() { stop(); start(); }

    nextBtn.addEventListener('click', function () { nextSlide(); restart(); });
    prevBtn.addEventListener('click', function () { prevSlide(); restart(); });

    // Pause on hover (desktop)
    slider.addEventListener('mouseenter', stop);
    slider.addEventListener('mouseleave', start);

    // Touch swipe (mobile)
    var x0 = null;
    slider.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; stop(); }, { passive: true });
    slider.addEventListener('touchend', function (e) {
        if (x0 === null) return;
        var dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 40) { dx < 0 ? nextSlide() : prevSlide(); }
        x0 = null;
        start();
    }, { passive: true });

    // Pause when tab hidden (saves battery / avoids jump-on-return)
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) stop(); else restart();
    });

    // Safety net: if any banner fails to load (corrupt / removed after the PHP
    // scan), silently hide the whole slider — never show a broken-image icon.
    function killSlider() { stop(); slider.style.display = 'none'; }
    var imgs = slider.querySelectorAll('.banner-slide img');
    for (var j = 0; j < imgs.length; j++) {
        if (imgs[j].complete && imgs[j].naturalWidth === 0) { killSlider(); return; }
        imgs[j].addEventListener('error', killSlider, { once: true });
    }

    start();
})();
