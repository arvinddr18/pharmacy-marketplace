import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { sendPushToUser } from './push.service.js';

let transporter = null;

/** Build (once) the SMTP transport from env. Returns null if SMTP isn't configured. */
function getTransport() {
  if (transporter) return transporter;
  if (!env.mail.host || !env.mail.user || !env.mail.pass) return null;
  transporter = nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: env.mail.port === 465, // 465 = SSL; 587 = STARTTLS
    auth: { user: env.mail.user, pass: env.mail.pass },
  });
  return transporter;
}

/**
 * Send an email. If SMTP isn't configured yet, the message (and any code) is
 * logged to the server console instead of being sent — so the flow still works
 * in development without a provider.
 */
async function sendMail({ to, subject, text, html }) {
  const t = getTransport();
  if (!t) {
    console.log(`[email] (SMTP not configured) would send to ${to}: ${subject}\n${text || ''}`);
    return { delivered: 'console' };
  }
  await t.sendMail({ from: env.mail.from, to, subject, text, html });
  return { delivered: 'smtp' };
}

// Public logo URL for email headers. Update this if you move to a custom domain (e.g. https://arnora.co.in/icon-192.png).
const LOGO_URL = 'https://pharmacy-marketplace-qwca.onrender.com/icon-192.png';
const wrap = (title, body) => `
  <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#172033">
    <div style="background:#ffffff;padding:16px 20px;border-radius:12px 12px 0 0;border:1px solid #E5E7EB;border-bottom:none">
      <img src="${LOGO_URL}" width="30" height="30" alt="" style="vertical-align:middle;border-radius:7px" />
      <span style="font-weight:800;font-size:20px;vertical-align:middle;margin-left:8px"></span>
    </div>
    <div style="border:1px solid #E5E7EB;border-top:none;border-radius:0 0 12px 12px;padding:22px 20px">
      <h2 style="margin:0 0 10px">${title}</h2>
      ${body}
      <p style="color:#64748B;font-size:12px;margin-top:22px">If you didn't request this, you can ignore this email.</p>
    </div>
  </div>`;

const codeBlock = (code) =>
  `<div style="font-size:30px;font-weight:800;letter-spacing:6px;background:#F0FDFA;color:#0F766E;text-align:center;padding:16px;border-radius:10px;margin:14px 0">${code}</div>`;

export async function sendVerificationEmail(to, name, code) {
  return sendMail({
    to,
    subject: `${code} is your Arnora verification code`,
    text: `Hi ${name || ''}, your Arnora verification code is ${code}. It expires in 15 minutes.`,
    html: wrap('Verify your email', `<p>Hi ${name || 'there'}, welcome to Arnora! Enter this code to finish creating your account:</p>${codeBlock(code)}<p style="color:#64748B;font-size:13px">This code expires in 15 minutes.</p>`),
  });
}

export async function sendPasswordResetEmail(to, name, code) {
  return sendMail({
    to,
    subject: `${code} is your Arnora password reset code`,
    text: `Hi ${name || ''}, your Arnora password reset code is ${code}. It expires in 15 minutes.`,
    html: wrap('Reset your password', `<p>Hi ${name || 'there'}, use this code to set a new password:</p>${codeBlock(code)}<p style="color:#64748B;font-size:13px">This code expires in 15 minutes.</p>`),
  });
}

export async function sendRefillReminderEmail(to, name, label) {
  return sendMail({
    to,
    subject: `Time to reorder ${label} — Arnora`,
    text: `Hi ${name || ''}, it looks like it's time to refill ${label}. Open Arnora and tap "Order again" to get it delivered.`,
    html: wrap('Time to refill', `<p>Hi ${name || 'there'},</p><p>It looks like it's time to reorder <strong>${label}</strong>. Open Arnora and tap <strong>“Order again”</strong> to get it delivered to your door.</p>`),
  });
}

// Which order statuses trigger a customer email, and what it says.
const ORDER_EMAILS = {
  placed: { subject: 'Order {n} placed', line: 'We’ve received your order and it’s being sent to a pharmacy. We’ll email you as it progresses.' },
  accepted: { subject: 'Order {n} accepted', line: 'A pharmacy has accepted your order and is preparing it.' },
  out_for_delivery: { subject: 'Order {n} is on the way', line: 'Your order is out for delivery and will reach you soon.' },
  delivered: { subject: 'Order {n} delivered', line: 'Your order has been delivered. Thank you for using Arnora!' },
  rejected: { subject: 'Order {n} could not be fulfilled', line: 'Sorry — the pharmacy could not fulfil this order. You can try another pharmacy or reorder from the app.' },
};

/**
 * Email the customer about an order status change. Fire-and-forget: call
 * without awaiting so it never blocks or fails the main request.
 */
export async function emailOrderUpdate(order) {
  try {
    if (!order) return;
    const cfg = ORDER_EMAILS[order.status];
    if (!cfg) return;

    // Push notification to the customer (works even when the app is closed).
    try {
      const uid = order.customer && (order.customer._id || order.customer);
      await sendPushToUser(uid, { title: `Arnora · Order ${order.orderNumber}`, body: cfg.line, url: '/' });
    } catch {}

    let email = order.customer && order.customer.email;
    let name = order.customer && order.customer.name;
    if (!email) {
      const u = await User.findById(order.customer).select('email name');
      email = u && u.email; name = u && u.name;
    }
    if (!email) return;

    const n = order.orderNumber;
    const totalLine = order.total > 0 ? ` · Total ₹${order.total}` : '';
    await sendMail({
      to: email,
      subject: cfg.subject.replace('{n}', n),
      text: `Hi ${name || ''}, ${cfg.line} (Order ${n}${totalLine})`,
      html: wrap(`Order ${n}`, `<p>Hi ${name || 'there'},</p><p>${cfg.line}</p><p style="color:#64748B;font-size:13px">Order number: <strong>${n}</strong>${totalLine}</p>`),
    });
  } catch (e) {
    console.log('[email] order update failed:', e.message);
  }
}