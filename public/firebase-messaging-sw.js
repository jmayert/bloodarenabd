// firebase-messaging-sw.js — Blood Arena v2.2
// Full FCM background handler — restored to working state

importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyAXKVJLxgZsOTCBJRTJmBs5H3wLlZdj514",
  authDomain:        "shsmc-blood-portal.firebaseapp.com",
  projectId:         "shsmc-blood-portal",
  storageBucket:     "shsmc-blood-portal.firebasestorage.app",
  messagingSenderId: "968307626441",
  appId:             "1:968307626441:web:0186bc2d4adcaf434a9818"
});

const messaging = firebase.messaging();
const SITE_URL   = 'https://bloodarenabd.org';

function _bloodText(d, n) {
  var grp   = d.blood_group  || '';
  var hosp  = d.hospital     || (n.body || '');
  var cont  = d.contact      || '';
  var pname = d.patient_name || '';
  var title = '🩸 জরুরি রক্তের প্রয়োজন! — ' + grp;
  var body  = '';
  if (pname) body += pname + ' ভাই/আপু — ';
  if (hosp)  body += '🏥 ' + hosp;
  if (cont)  body += '\n📞 ' + cont;
  body += '\nআল্লাহর ওয়াস্তে এগিয়ে আসুন! 🤲';
  return { title: title, body: body };
}

// ── Background push handler ───────────────────────────────────
messaging.onBackgroundMessage(function(payload) {
  var n    = payload.notification || {};
  var d    = payload.data         || {};
  var url  = d.url || (SITE_URL + '/');
  var tag  = d.tag    ? d.tag
           : d.request_id ? ('blood-' + d.request_id)
           : d.push_id    ? ('adm-'   + d.push_id)
           :                 ('fcm-'  + Date.now());

  var title, body;
  var type = d.type || '';

  if (type === 'blood_request') {
    var t = _bloodText(d, n); title = t.title; body = t.body;
  } else if (type === 'donation_verified') {
    title = d.title || '🎉 রক্তদান যাচাই হয়েছে!';
    body  = d.body  || 'আপনার donation count +১ হয়েছে। ধন্যবাদ! 🩸';
  } else if (type === 'code_redeemed') {
    title = d.title || '✅ রক্তদান নিশ্চিত হয়েছে';
    body  = d.body  || 'একজন দাতা আপনার Request-এর বিপরীতে রক্তদান নিশ্চিত করেছেন।';
  } else if (type === 'donor_called') {
    title = d.title || '📞 Blood Arena';
    body  = d.body  || 'একজন রক্তের প্রয়োজনে call করেছেন।';
  } else if (type === 'admin_push') {
    title = d.title || n.title || '📢 BloodArena — বিজ্ঞপ্তি';
    body  = d.body  || n.body  || d.message || 'নতুন বিজ্ঞপ্তি।';
  } else if (type === 'service' || type === 'secret_code_ready') {
    title = d.title || n.title || '✅ BloodArena — Services';
    body  = d.body  || n.body  || d.message || 'আপনার একটি notification আছে।';
  } else {
    title = d.title || n.title || '🩸 BloodArena';
    body  = d.body  || n.body  || d.message || 'নতুন বিজ্ঞপ্তি।';
  }

  return self.registration.showNotification(title, {
    body:               body,
    icon:               SITE_URL + '/icon.png',
    badge:              SITE_URL + '/?badge_icon=1',
    tag:                tag,
    renotify:           false,
    requireInteraction: false,
    vibrate:            [300, 100, 300, 100, 200],
    silent:             false,
    data:               { url: url }
  });
});

// ── Notification click ────────────────────────────────────────
self.addEventListener('notificationclick', function(event) {
  var notif = event.notification;
  notif.close();
  var url = (notif.data && notif.data.url) ? notif.data.url : SITE_URL + '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf(SITE_URL) !== -1 && 'focus' in list[i]) {
          return list[i].focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

// ── Install & Activate ────────────────────────────────────────
self.addEventListener('install',  function() { self.skipWaiting(); });
self.addEventListener('activate', function(e) { e.waitUntil(clients.claim()); });
