// Outbound communication channels (email / SMS / WhatsApp).
//
// Driver pattern: real providers are used when configured via env, otherwise a
// dev "log" driver prints the message so flows are fully testable without any
// third-party credentials. Adding WhatsApp later = one more driver here; callers
// (reminders, payments, portal) don't change.
import nodemailer from 'nodemailer';

let mailTransport = null;
function getMailTransport() {
  if (mailTransport) return mailTransport;
  if (process.env.SMTP_HOST) {
    mailTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  } else {
    // Dev driver — "sends" to the console via a JSON stream transport.
    mailTransport = nodemailer.createTransport({ jsonTransport: true });
  }
  return mailTransport;
}

async function sendEmail({ to, subject, text, html }) {
  if (!to) return { skipped: 'no-email' };
  const from = process.env.MAIL_FROM || 'HMS <no-reply@hospital.example>';
  const info = await getMailTransport().sendMail({ from, to, subject, text, html });
  if (!process.env.SMTP_HOST) {
    console.log(`📧 [dev-email] → ${to} | ${subject}`);
  }
  return { messageId: info.messageId };
}

async function sendSms({ to, text }) {
  if (!to) return { skipped: 'no-phone' };
  const provider = process.env.SMS_PROVIDER; // e.g. 'twilio' | 'msg91'
  if (!provider) {
    console.log(`📱 [dev-sms] → ${to} | ${text}`);
    return { dev: true };
  }
  // Real providers would POST here (Twilio/MSG91). Wired via env when available.
  try {
    if (provider === 'twilio' && process.env.TWILIO_SID) {
      const auth = Buffer.from(`${process.env.TWILIO_SID}:${process.env.TWILIO_TOKEN}`).toString('base64');
      const body = new URLSearchParams({ To: to, From: process.env.TWILIO_FROM, Body: text });
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_SID}/Messages.json`, {
        method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body,
      });
      return { ok: res.ok };
    }
  } catch (err) {
    console.warn('SMS send failed:', err.message);
  }
  return { skipped: 'provider-not-configured' };
}

// High-level: deliver a message across all channels the recipient has.
// Fire-and-forget friendly (returns a promise; callers may ignore it).
export async function deliver({ email, phone, subject, text, html, sms }) {
  const jobs = [];
  if (email) jobs.push(sendEmail({ to: email, subject, text, html }).catch((e) => console.warn('email:', e.message)));
  if (phone) jobs.push(sendSms({ to: phone, text: sms || text }).catch((e) => console.warn('sms:', e.message)));
  return Promise.allSettled(jobs);
}

export const channelsStatus = () => ({
  email: process.env.SMTP_HOST ? 'smtp' : 'dev-log',
  sms: process.env.SMS_PROVIDER || 'dev-log',
});
