'use strict';
// ════════════════════════════════════════════════════════════════════
//  Blood Arena — Telegram OTP bot v2 (modernized UI)
//  - HTML parse_mode, rich cards, cleaner copy
//  - request_contact share button w/ placeholder + one-time keyboard
//  - long-polling (no webhook), HTTP relay API unchanged
// ════════════════════════════════════════════════════════════════════
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const https = require('https');
const path = require('path');

const TOKEN   = process.env.TG_BOT_TOKEN;
const SECRET  = process.env.TG_BOT_SECRET;
const PORT    = parseInt(process.env.TG_PORT || '3002', 10);
const HOST    = process.env.HOST || '127.0.0.1';
const DB_FILE = path.join(__dirname, 'phone_map.json');
const SITE_URL = process.env.SITE_URL || 'https://bloodarenabd.org';

if (!TOKEN)  { console.error('❌ TG_BOT_TOKEN সেট নেই (.env দেখুন)।'); process.exit(1); }
if (!SECRET) { console.error('❌ TG_BOT_SECRET সেট নেই (.env দেখুন)।'); process.exit(1); }

let phoneMap = {};
try {
  phoneMap = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  console.log(`📂 Loaded ${Object.keys(phoneMap).length} linked numbers`);
} catch (e) { phoneMap = {}; }

function saveMap() { fs.writeFileSync(DB_FILE, JSON.stringify(phoneMap, null, 2)); }

// ── account-verify callback → backend (tg_verify_callback) ──
function postVerifyCallback(token, phone, chatId) {
  try {
    const body = JSON.stringify({
      secret: SECRET,
      token: token,
      phone: phone,
      chat_id: chatId,
      tg_verify_callback: true
    });
    const callbackUrl = SITE_URL + '/';
    console.log('📤 tg_verify_callback POST', callbackUrl, 'token:', token.slice(0,8) + '…', 'phone:', phone);
    const url = new URL(callbackUrl);
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        console.log('📥 verify callback response:', res.statusCode, data.slice(0, 200));
        let j = {};
        try { j = JSON.parse(data); } catch (e) {}
        if (j.status === 'success') {
          sendTelegram(chatId,
            '🎉 <b>যাচাইকরণ সফল!</b>\n\n' +
            'আপনার অ্যাকাউন্ট এখন সম্পূর্ণ verified।\n' +
            'Blood Arena-তে ফিরে যান ও কাজ চালিয়ে যান 🩸',
            { reply_markup: { remove_keyboard: true } }
          );
        } else if (j.status === 'expired') {
          sendTelegram(chatId,
            '⌛ <b>সময় শেষ</b>\n\n' +
            'যাচাইকরণের সময়সীমা পেরিয়ে গেছে।\n' +
            'ওয়েবসাইটে গিয়ে নতুন করে চেষ্টা করুন।',
            { reply_markup: { remove_keyboard: true } }
          );
        } else {
          sendTelegram(chatId,
            '⚠️ <b>যাচাই ব্যর্থ</b>' + (j.msg ? ('\n\n' + escHtml(j.msg)) : '') +
            '\n\nওয়েবসাইটে ফিরে আবার চেষ্টা করুন।',
            { reply_markup: { remove_keyboard: true } }
          );
        }
      });
    });
    req.on('error', (e) => {
      console.error('❌ verify callback error:', e.message);
      sendTelegram(chatId, '⚠️ <b>সার্ভারে যোগাযোগে সমস্যা</b>\n\nএকটু পর আবার চেষ্টা করুন।');
    });
    req.write(body);
    req.end();
  } catch (e) {
    console.error('❌ verify callback exception:', e.message);
  }
}

// pending[phone] = otp  — /prepare এ set হয়, user deep link খুললে bot পাঠায়
let pending = {};

// pendingRegistrations[token] = { chatId, firstName }  — registration contact-share
let pendingRegistrations = {};

// pendingVerify[token] = chatId | null — account-verify flow (tg_send_otp)
let pendingVerify = {};

// ── Telegram API helper ──
function tgApi(method, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
/** Send an HTML-formatted message. extras: {reply_markup, ...} */
const sendTelegram = (chatId, text, extras = {}) =>
  tgApi('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extras });

/** Modern contact-share prompt card */
function shareContactCard(title, bodyText) {
  return {
    text:
      `<b>🩸 Blood Arena</b>\n` +
      `<blockquote>${escHtml(title)}</blockquote>\n\n` +
      `${bodyText}\n\n` +
      `<i>🔒 আপনার নম্বর শুধু যাচাইয়ের জন্য — আপনার অনুমতি ছাড়া কারও সাথে শেয়ার হবে না।</i>`,
    reply_markup: {
      keyboard: [[{ text: '📲 নম্বর শেয়ার করুন', request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
      input_field_placeholder: 'নিচের বাটনে চাপ দিন…'
    }
  };
}

// ── incoming message handler (নম্বর লিংক) ──
async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const firstName = escHtml(msg.chat.first_name || '');
  const text = (msg.text || '').trim();

  if (text.startsWith('/start')) {
    const param = text.slice(6).trim();
    if (param) {
      // registration contact-share verify: start=reg_<64-char-hex-token>
      if (param.startsWith('reg_')) {
        const token = param.slice(4);
        if (/^[0-9a-f]{64}$/i.test(token)) {
          pendingRegistrations[token] = { chatId, firstName: msg.chat.first_name || 'User' };
          await tgApi('sendMessage', {
            chat_id: chatId,
            ...shareContactCard(
              'রেজিস্ট্রেশন যাচাইকরণ',
              `স্বাগতম${firstName ? ', <b>' + firstName + '</b>' : ''}! 🩸\nপরিচয় যাচাইয়ের জন্য নিচের বাটন থেকে ফোন নম্বর শেয়ার করুন।`
            )
          });
        } else {
          await sendTelegram(chatId,
            '⚠️ <b>টোকেনটি বৈধ নয়</b>\n\nBlood Arena ওয়েবসাইট থেকে আবার চেষ্টা করুন।');
        }
        return;
      }
      // account verify: start=<64-char-hex-token> (tg_send_otp flow)
      if (/^[0-9a-f]{64}$/i.test(param)) {
        if (Object.prototype.hasOwnProperty.call(pendingVerify, param)) {
          pendingVerify[param] = chatId;
          await tgApi('sendMessage', {
            chat_id: chatId,
            ...shareContactCard(
              'অ্যাকাউন্ট যাচাইকরণ',
              `${firstName ? '<b>' + firstName + '</b>, ' : ''}অ্যাকাউন্ট যাচাইয়ের জন্য নিচের বাটন থেকে ফোন নম্বর শেয়ার করুন।`
            )
          });
        } else {
          await sendTelegram(chatId,
            '⚠️ <b>টোকেন নেই বা মেয়াদ শেষ</b>\n\nBlood Arena ওয়েবসাইট থেকে আবার চেষ্টা করুন।');
        }
        return;
      }
      // deep link থেকে আসা phone: 8801XXXXXXXXX (+ ছাড়া)
      const phone = '+' + param;
      if (/^\+8801[3-9]\d{8}$/.test(phone)) {
        phoneMap[phone] = chatId;
        saveMap();
        const otp = pending[phone];
        if (otp) {
          delete pending[phone];
          await sendTelegram(chatId,
            `<b>🩸 Blood Arena যাচাইকরণ কোড</b>\n\n` +
            `আপনার কোড:\n<b><code>${escHtml(otp)}</code></b>\n\n` +
            `<i>কোডটি ওয়েবসাইটে প্রবেশ করিয়ে যাচাই সম্পন্ন করুন।\n⏱ ৫ মিনিটের জন্য বৈধ • 🔒 কারও সাথে শেয়ার করবেন না</i>`);
        } else {
          await sendTelegram(chatId,
            `✅ <b>নম্বর যুক্ত হয়েছে</b>\n\n<code>${escHtml(phone)}</code>\n\nএখন Blood Arena ওয়েবসাইটে গিয়ে যাচাইকরণ কোড সংগ্রহ করুন।`);
        }
        return;
      }
    }
    await sendTelegram(chatId,
      `<b>🩸 Blood Arena-তে স্বাগতম${firstName ? ', ' + firstName : ''}!</b>\n\n` +
      `এই বট আপনার অ্যাকাউন্ট যাচাইয়ের কাজ করে.\n\n` +
      `📱 <b>যাচাই শুরু করতে:</b>\nBlood Arena ওয়েবসাইট → Verify → এই বট-এর লিংকে ক্লিক করুন\n\n` +
      `✍️ অথবা সরাসরি নম্বর পাঠান:\n<code>+8801XXXXXXXXX</code>`);
    return;
  }

  // ── User Telegram contact শেয়ার করলে (registration verify flow) ──
  if (msg.contact && msg.contact.phone_number) {
    let phone = msg.contact.phone_number.replace(/[\s\-]/g, '');
    if (/^01[3-9]\d{8}$/.test(phone)) phone = '+88' + phone;
    if (!/^\+8801\d{9}$/.test(phone)) {
      // format not recognized, just link the phone anyway
      phone = '+' + msg.contact.phone_number.replace(/[^0-9]/g, '');
    }
    // find matching pending registration by chatId
    let matchedToken = null;
    for (const [token, data] of Object.entries(pendingRegistrations)) {
      if (data.chatId === chatId) { matchedToken = token; break; }
    }
    if (matchedToken) {
      delete pendingRegistrations[matchedToken];
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: '<b>✅ নম্বর পাওয়া গেছে</b>\n<i>অ্যাকাউন্ট যাচাই করা হচ্ছে…</i>',
        parse_mode: 'HTML',
        reply_markup: { remove_keyboard: true }
      });
      // callback to backend
      try {
        const body = JSON.stringify({
          secret: SECRET,
          token: matchedToken,
          phone: phone,
          reg_verify_callback: true
        });
        const callbackUrl = SITE_URL + '/';
        console.log('📤 callback POST', callbackUrl, 'token:', matchedToken.slice(0,8) + '…', 'phone:', phone);
        const url = new URL(callbackUrl);
        const req = https.request({
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
          }
        }, (res) => {
          let data = '';
          res.on('data', d => { data += d; });
          res.on('end', () => {
            console.log('📥 callback response status:', res.statusCode, 'body:', data);
            try {
              const j = JSON.parse(data);
              if (j.status === 'success') {
                sendTelegram(chatId,
                  '🎉 <b>যাচাইকরণ সফল!</b>\n\nBlood Arena ওয়েবসাইটে ফিরে রেজিস্ট্রেশন সম্পন্ন করুন 🩸',
                  { reply_markup: { remove_keyboard: true } });
              } else {
                sendTelegram(chatId,
                  '⚠️ <b>যাচাই ব্যর্থ</b>\n' + escHtml(j.msg || 'অজানা ত্রুটি') +
                  '\n\nBlood Arena ওয়েবসাইটে ফিরে আবার চেষ্টা করুন।',
                  { reply_markup: { remove_keyboard: true } });
              }
            } catch (e) {
              console.error('❌ callback JSON parse failed:', e.message, 'raw:', data);
              sendTelegram(chatId, '⚠️ <b>যাচাই প্রক্রিয়ায় সমস্যা</b>\n\nওয়েবসাইটে ফিরে আবার চেষ্টা করুন।');
            }
          });
        });
        req.on('error', (e) => {
          console.error('❌ callback network error:', e.message);
          sendTelegram(chatId, '⚠️ <b>সার্ভারে যোগাযোগে সমস্যা</b>\n\nএকটু পর আবার চেষ্টা করুন।');
        });
        req.write(body);
        req.end();
      } catch (e) {
        console.error('❌ callback exception:', e.message);
        sendTelegram(chatId, '⚠️ <b>সার্ভারে যোগাযোগে সমস্যা</b>\n\nএকটু পর আবার চেষ্টা করুন।');
      }
      return;
    }
    // account-verify flow: this chat deep-linked a verify token earlier
    for (const tok of Object.keys(pendingVerify)) {
      if (pendingVerify[tok] === chatId) {
        delete pendingVerify[tok];
        await tgApi('sendMessage', {
          chat_id: chatId,
          text: '<b>✅ নম্বর পাওয়া গেছে</b>\n<i>অ্যাকাউন্ট যাচাই করা হচ্ছে…</i>',
          parse_mode: 'HTML',
          reply_markup: { remove_keyboard: true }
        });
        postVerifyCallback(tok, phone, String(chatId));
        return;
      }
    }
    // no matching pending flow → link phone normally
    phoneMap[phone] = chatId;
    saveMap();
    await sendTelegram(chatId,
      `✅ <b>নম্বর যুক্ত হয়েছে</b>\n\n<code>${escHtml(phone)}</code>\n\nএখন Blood Arena ওয়েবসাইটে লগ-ইন করে যাচাই সম্পন্ন করুন।`);
    return;
  }

  let phone = text.replace(/\s/g, '');
  if (/^01[3-9]\d{8}$/.test(phone)) phone = '+88' + phone;

  if (/^\+8801[3-9]\d{8}$/.test(phone)) {
    phoneMap[phone] = chatId;
    saveMap();
    await sendTelegram(chatId,
      `✅ <b>নম্বর যুক্ত হয়েছে</b>\n\n<code>${escHtml(phone)}</code>\n\nএখন Blood Arena ওয়েবসাইটে লগ-ইন করে যাচাইকরণ কোড সংগ্রহ করুন।`);
  } else {
    await sendTelegram(chatId,
      '⚠️ <b>নম্বরটি সঠিক নয়</b>\n\nঅনুগ্রহ করে এই ফরম্যাটে পাঠান:\n<code>+8801XXXXXXXXX</code>');
  }
}

// ── long-polling loop ──
let offset = 0;
async function poll() {
  try {
    const r = await tgApi('getUpdates', { offset, timeout: 30 });
    if (r && r.ok && Array.isArray(r.result)) {
      for (const u of r.result) {
        offset = u.update_id + 1;
        if (u.message) { try { await handleMessage(u.message); } catch (e) { console.error('msg err', e.message); } }
      }
    }
  } catch (e) { console.error('poll err', e.message); await new Promise(s => setTimeout(s, 3000)); }
  setImmediate(poll);
}

// ── HTTP API (backend → bot) ──
const app = express();
app.use(express.json());

app.post('/prepare', (req, res) => {
  const { secret, phone, otp, token } = req.body || {};
  if (secret !== SECRET) return res.status(403).json({ ok: false, error: 'Forbidden' });
  if (token) {
    if (!/^[0-9a-f]{64}$/i.test(token)) return res.status(400).json({ ok: false, error: 'invalid token' });
    pendingVerify[token] = null;
    setTimeout(() => { if (pendingVerify[token] === null) delete pendingVerify[token]; }, 10 * 60 * 1000).unref?.();
    return res.json({ ok: true });
  }
  if (!phone || !otp) return res.status(400).json({ ok: false, error: 'phone and otp required' });
  pending[phone] = String(otp);
  res.json({ ok: true });
});

app.post('/send', async (req, res) => {
  const { secret, phone, message } = req.body || {};
  if (secret !== SECRET) return res.status(403).json({ ok: false, error: 'Forbidden' });
  if (!phone || !message) return res.status(400).json({ ok: false, error: 'phone & message required' });
  const chatId = phoneMap[phone];
  if (!chatId) return res.status(404).json({ ok: false, error: 'Phone not linked' });
  try {
    const r = await sendTelegram(chatId, message);
    if (r && r.ok) return res.json({ ok: true });
    return res.status(500).json({ ok: false, error: (r && r.description) || 'send failed' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/notify', async (req, res) => {
  const { secret, phone, message } = req.body || {};
  if (secret !== SECRET) return res.status(403).json({ ok: false, error: 'Forbidden' });
  if (!phone || !message) return res.status(400).json({ ok: false, error: 'phone & message required' });
  const chatId = phoneMap[phone];
  if (!chatId) return res.status(404).json({ ok: false, error: 'Phone not linked' });
  try {
    const r = await sendTelegram(chatId, message);
    if (r && r.ok) return res.json({ ok: true });
    return res.status(500).json({ ok: false, error: (r && r.description) || 'send failed' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/broadcast', async (req, res) => {
  const { secret, phones, message } = req.body || {};
  if (secret !== SECRET) return res.status(403).json({ ok: false, error: 'Forbidden' });
  if (!Array.isArray(phones) || !message) return res.status(400).json({ ok: false, error: 'phones[] & message required' });
  let sent = 0, failed = 0;
  for (const phone of phones) {
    const chatId = phoneMap[phone];
    if (!chatId) { failed++; continue; }
    try {
      const r = await sendTelegram(chatId, message);
      if (r && r.ok) sent++; else failed++;
    } catch (e) { failed++; }
  }
  res.json({ ok: true, sent, failed });
});

app.get('/health', (req, res) => res.json({ ok: true, linked: Object.keys(phoneMap).length }));

app.listen(PORT, HOST, () => {
  console.log(`🤖 Telegram OTP bot HTTP → ${HOST}:${PORT}`);
  poll();
  console.log('📡 Telegram long-polling শুরু হলো।');
});
