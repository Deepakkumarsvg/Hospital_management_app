// Lightweight in-process scheduler for appointment reminders.
//
// Runs hourly (and can be triggered on demand by an admin). It iterates every
// active tenant, binding that tenant's DB connection into async context, and
// sends one reminder per upcoming appointment.
//
// For heavy production loads this would move to BullMQ + Redis (see V2 #9);
// the per-tenant job body stays the same.
import { Appointment } from '../models/Appointment.js';
import { User } from '../models/User.js';
import { notify } from './notificationService.js';
import { deliver } from './channels.js';
import { listTenants } from './tenantService.js';
import { tenantConnection } from '../db/connectionManager.js';
import { runWithTenant } from '../db/tenantContext.js';

function tomorrowRange() {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

// Reminder job for ONE tenant (assumes tenant context is bound).
async function remindCurrentTenant() {
  const { start, end } = tomorrowRange();
  const appts = await Appointment.find({
    status: 'BOOKED',
    reminderSent: false,
    date: { $gte: start, $lt: end },
  }).populate([
    { path: 'patient', select: 'firstName lastName email phone' },
    { path: 'doctor', select: 'firstName lastName specialization' },
  ]);

  let sent = 0;
  for (const a of appts) {
    const p = a.patient || {};
    const doctorName = `Dr. ${a.doctor?.firstName || ''} ${a.doctor?.lastName || ''}`.trim();
    const when = `${a.date.toDateString()} at ${a.time}`;
    const title = 'Appointment reminder';
    const message = `Reminder: your appointment with ${doctorName} is tomorrow (${when}).`;

    const account = await User.findOne({ patient: p._id }).select('_id');
    if (account) notify({ user: account._id, type: 'APPOINTMENT', title, message, link: '/portal/appointments' });

    deliver({ email: p.email, phone: p.phone, subject: title, text: message, sms: `${title}: ${doctorName}, ${when}.` });

    a.reminderSent = true;
    await a.save();
    sent += 1;
  }
  return { sent, scanned: appts.length };
}

// Run the reminder job across every active tenant.
export async function runAppointmentReminders() {
  const tenants = await listTenants();
  const totals = { sent: 0, scanned: 0, tenants: 0 };
  for (const t of tenants) {
    if (t.status !== 'ACTIVE') continue;
    const conn = tenantConnection(t.dbName);
    const r = await runWithTenant({ tenant: t, conn }, () => remindCurrentTenant());
    totals.sent += r.sent;
    totals.scanned += r.scanned;
    totals.tenants += 1;
  }
  return totals;
}

let timer = null;
export function startScheduler() {
  if (timer) return;
  setTimeout(() => runAppointmentReminders().catch((e) => console.warn('reminder job:', e.message)), 15_000);
  timer = setInterval(() => runAppointmentReminders().catch((e) => console.warn('reminder job:', e.message)), 60 * 60 * 1000);
  console.log('✓ Reminder scheduler started (hourly, all tenants)');
}
