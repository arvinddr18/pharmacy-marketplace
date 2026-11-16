import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

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

const wrap = (title, body) => `
  <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#172033">
    <div style="background:#0D9488;color:#fff;padding:18px 20px;border-radius:12px 12px 0 0;font-weight:800;font-size:18px">MedMart</div>
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
    subject: `${code} is your MedMart verification code`,
    text: `Hi ${name || ''}, your MedMart verification code is ${code}. It expires in 15 minutes.`,
    html: wrap('Verify your email', `<p>Hi ${name || 'there'}, welcome to MedMart! Enter this code to finish creating your account:</p>${codeBlock(code)}<p style="color:#64748B;font-size:13px">This code expires in 15 minutes.</p>`),
  });
}

export async function sendPasswordResetEmail(to, name, code) {
  return sendMail({
    to,
    subject: `${code} is your MedMart password reset code`,
    text: `Hi ${name || ''}, your MedMart password reset code is ${code}. It expires in 15 minutes.`,
    html: wrap('Reset your password', `<p>Hi ${name || 'there'}, use this code to set a new password:</p>${codeBlock(code)}<p style="color:#64748B;font-size:13px">This code expires in 15 minutes.</p>`),
  });
}