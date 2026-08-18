// Who can reach what.
//
// Route guards used to be hard-coded arrays of role names, and the permission
// matrix admins could edit was decorative — it changed nothing. Enforcement now
// runs off that matrix, which means the matrix is load-bearing and a mistake in
// it silently grants or removes access.
//
// This file is the spec for it: every module, every distinct action, checked
// against every role. It is deliberately written as data rather than prose, so
// adding a module means adding a row, and a row that disagrees with
// config/permissions.js fails loudly.
//
// The assertion is 403-or-not, never 200: a role that gets through the guard
// and then fails validation (400) or finds nothing (404) has been *authorised*,
// which is the only thing under test here.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, connectTestDb, disconnectTestDb, inTenant, seedBase, login, auth } from './helpers.js';

const { User } = await import('../src/models/User.js');
const { Role } = await import('../src/models/Role.js');
const { ROLES } = await import('../src/config/roles.js');
const { invalidateRolePermissions } = await import('../src/middleware/rbac.js');

// Every staff role, plus the tokens to act as each.
const STAFF_ROLES = [
  'ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'LAB_TECHNICIAN', 'RADIOLOGIST',
  'PHARMACIST', 'ACCOUNTANT', 'STORE_MANAGER', 'OT_STAFF', 'HR',
];

const tokens = {};

beforeAll(async () => {
  await connectTestDb();
  await seedBase();
  await inTenant(async () => {
    for (const role of STAFF_ROLES) {
      const email = `${role.toLowerCase()}@rbac.local`;
      const u = new User({ name: role, email, role: ROLES[role], status: 'ACTIVE' });
      await u.setPassword('Test@1234');
      await u.save();
    }
  });
  for (const role of STAFF_ROLES) {
    tokens[role] = await login(`${role.toLowerCase()}@rbac.local`, 'Test@1234');
  }
});

afterAll(async () => { await disconnectTestDb(); });

// [method, path, permission-it-needs, roles-that-should-get-through]
const MATRIX = [
  // --- Patients
  ['get', '/api/patients', 'patients:view', ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST']],
  ['post', '/api/patients', 'patients:edit', ['ADMIN', 'RECEPTIONIST']],
  ['delete', '/api/patients/000000000000000000000001', 'patients:delete', ['ADMIN']],

  // --- Appointments
  ['get', '/api/appointments', 'appointments:view', ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST']],
  ['post', '/api/appointments', 'appointments:book', ['ADMIN', 'RECEPTIONIST']],
  ['patch', '/api/appointments/000000000000000000000001/status', 'appointments:status', ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST']],
  ['delete', '/api/appointments/000000000000000000000001', 'appointments:delete', ['ADMIN']],

  // --- OPD
  ['get', '/api/opd', 'opd:view', ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST']],
  ['post', '/api/opd', 'opd:edit', ['ADMIN', 'DOCTOR', 'NURSE']],
  ['delete', '/api/opd/000000000000000000000001', 'opd:delete', ['ADMIN']],

  // --- IPD
  ['get', '/api/ipd', 'ipd:view', ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST']],
  ['post', '/api/ipd', 'ipd:admit', ['ADMIN', 'DOCTOR', 'RECEPTIONIST']],
  ['post', '/api/ipd/000000000000000000000001/notes', 'ipd:nurse', ['ADMIN', 'DOCTOR', 'NURSE']],

  // --- Emergency: registering, triaging and treating are three different
  // jobs done by three different people, so they are three permissions.
  ['get', '/api/emergency/queue', 'emergency:view', ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST']],
  ['post', '/api/emergency', 'emergency:register', ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST']],
  ['patch', '/api/emergency/000000000000000000000001/triage', 'emergency:triage', ['ADMIN', 'DOCTOR', 'NURSE']],
  ['patch', '/api/emergency/000000000000000000000001/dispose', 'emergency:treat', ['ADMIN', 'DOCTOR']],
  ['patch', '/api/emergency/000000000000000000000001/mlc', 'emergency:mlc', ['ADMIN', 'DOCTOR']],

  // --- Clinical record. Prescribing and administering are split on purpose:
  // a drug chart is only a safety control if the person who writes the order
  // and the person who gives the dose are two different people.
  ['get', '/api/clinical/options', 'clinical:view', ['ADMIN', 'DOCTOR', 'NURSE']],
  ['post', '/api/clinical/vitals', 'clinical:vitals', ['ADMIN', 'DOCTOR', 'NURSE']],
  ['post', '/api/clinical/notes', 'clinical:note', ['ADMIN', 'DOCTOR', 'NURSE']],
  ['post', '/api/clinical/orders', 'clinical:prescribe', ['ADMIN', 'DOCTOR']],
  ['post', '/api/clinical/orders/000000000000000000000001/administer', 'clinical:administer', ['ADMIN', 'NURSE']],

  // --- OPD queue. Issuing at the front desk and running the room are two
  // people in a real OPD, so they are two permissions.
  ['get', '/api/queue/board', 'queue:view', ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST']],
  ['post', '/api/queue', 'queue:issue', ['ADMIN', 'NURSE', 'RECEPTIONIST']],
  ['patch', '/api/queue/000000000000000000000001/call', 'queue:call', ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST']],

  // --- Advances. Handing money back sits with whoever may reverse a payment,
  // not with everyone who may take one.
  ['get', '/api/deposits', 'deposits:view', ['ADMIN', 'ACCOUNTANT', 'RECEPTIONIST']],
  ['post', '/api/deposits', 'deposits:manage', ['ADMIN', 'ACCOUNTANT', 'RECEPTIONIST']],
  ['post', '/api/deposits/000000000000000000000001/refund', 'deposits:refund', ['ADMIN', 'ACCOUNTANT']],

  // --- Laboratory: ordering and processing are deliberately different people.
  ['get', '/api/laboratory/orders', 'laboratory:view', ['ADMIN', 'DOCTOR', 'NURSE', 'LAB_TECHNICIAN', 'RECEPTIONIST']],
  ['post', '/api/laboratory/orders', 'laboratory:order', ['ADMIN', 'DOCTOR']],
  ['put', '/api/laboratory/orders/000000000000000000000001/results', 'laboratory:process', ['ADMIN', 'LAB_TECHNICIAN']],
  ['post', '/api/laboratory/tests', 'laboratory:manage', ['ADMIN']],
  ['patch', '/api/laboratory/orders/000000000000000000000001/status', 'laboratory:order|process', ['ADMIN', 'DOCTOR', 'LAB_TECHNICIAN']],

  // --- Radiology
  ['get', '/api/radiology/orders', 'radiology:view', ['ADMIN', 'DOCTOR', 'RADIOLOGIST', 'NURSE', 'RECEPTIONIST']],
  ['post', '/api/radiology/orders', 'radiology:order', ['ADMIN', 'DOCTOR']],
  ['post', '/api/radiology/tests', 'radiology:manage', ['ADMIN']],
  ['patch', '/api/radiology/orders/000000000000000000000001/status', 'radiology:order|process', ['ADMIN', 'DOCTOR', 'RADIOLOGIST']],

  // --- Pharmacy
  ['get', '/api/pharmacy/medicines', 'pharmacy:view', ['ADMIN', 'PHARMACIST', 'DOCTOR', 'NURSE']],
  ['post', '/api/pharmacy/medicines', 'pharmacy:manage', ['ADMIN', 'PHARMACIST']],
  ['delete', '/api/pharmacy/medicines/000000000000000000000001', 'pharmacy:delete', ['ADMIN']],

  // --- Inventory
  ['get', '/api/inventory/items', 'inventory:view', ['ADMIN', 'STORE_MANAGER']],
  ['post', '/api/inventory/items', 'inventory:manage', ['ADMIN', 'STORE_MANAGER']],
  ['delete', '/api/inventory/items/000000000000000000000001', 'inventory:delete', ['ADMIN']],

  // --- Billing: reception may take money, only finance may reverse it.
  ['get', '/api/billing/invoices', 'billing:view', ['ADMIN', 'ACCOUNTANT', 'RECEPTIONIST']],
  ['post', '/api/billing/invoices', 'billing:manage', ['ADMIN', 'ACCOUNTANT', 'RECEPTIONIST']],
  ['patch', '/api/billing/invoices/000000000000000000000001/cancel', 'billing:reverse', ['ADMIN', 'ACCOUNTANT']],
  ['post', '/api/billing/invoices/000000000000000000000001/refund', 'billing:reverse', ['ADMIN', 'ACCOUNTANT']],

  // --- Insurance
  ['get', '/api/insurance/claims', 'insurance:view', ['ADMIN', 'ACCOUNTANT']],
  ['post', '/api/insurance/claims', 'insurance:manage', ['ADMIN', 'ACCOUNTANT']],

  // --- Reports
  ['get', '/api/reports/summary', 'reports:view', ['ADMIN', 'ACCOUNTANT']],

  // --- Operation theatre
  ['get', '/api/ot/surgeries', 'ot:view', ['ADMIN', 'OT_STAFF', 'DOCTOR', 'NURSE']],
  ['post', '/api/ot/surgeries', 'ot:manage', ['ADMIN', 'OT_STAFF', 'DOCTOR']],
  ['post', '/api/ot/theatres', 'ot:admin', ['ADMIN']],

  // --- Blood bank
  ['get', '/api/blood-bank/units', 'bloodbank:view', ['ADMIN', 'LAB_TECHNICIAN', 'DOCTOR', 'NURSE']],
  ['post', '/api/blood-bank/units', 'bloodbank:manage', ['ADMIN', 'LAB_TECHNICIAN']],
  ['delete', '/api/blood-bank/donors/000000000000000000000001', 'bloodbank:delete', ['ADMIN']],

  // --- HR
  ['get', '/api/hr/employees', 'hr:view', ['ADMIN', 'HR']],
  ['delete', '/api/hr/employees/000000000000000000000001', 'hr:delete', ['ADMIN']],

  // --- Ambulance
  ['get', '/api/ambulance', 'ambulance:view', ['ADMIN', 'RECEPTIONIST', 'NURSE']],
  ['post', '/api/ambulance', 'ambulance:admin', ['ADMIN']],

  // --- Facilities
  ['get', '/api/wards', 'facilities:view', ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST']],
  ['post', '/api/wards', 'facilities:manage', ['ADMIN']],
  ['put', '/api/beds/000000000000000000000001', 'facilities:bedstatus', ['ADMIN', 'NURSE']],

  // --- Directory
  ['post', '/api/doctors', 'doctors:manage', ['ADMIN']],
  ['post', '/api/departments', 'departments:manage', ['ADMIN']],

  // --- Tariffs: price lists are a commercial control, not a clinical one.
  ['get', '/api/tariffs', 'tariffs:view', ['ADMIN', 'ACCOUNTANT', 'RECEPTIONIST']],
  ['post', '/api/tariffs', 'tariffs:manage', ['ADMIN', 'ACCOUNTANT']],

  // --- Administration
  ['get', '/api/users', 'users:manage', ['ADMIN']],
  ['get', '/api/roles', 'roles:manage', ['ADMIN']],
  ['put', '/api/settings', 'settings:manage', ['ADMIN']],
  ['get', '/api/audit-logs', 'audit:view', ['ADMIN']],
];

const call = (method, path, token) => request(app)[method](path).set(auth(token)).send({});

describe('permission matrix', () => {
  for (const [method, path, permission, allowed] of MATRIX) {
    const denied = STAFF_ROLES.filter((r) => !allowed.includes(r));

    it(`${permission} — ${method.toUpperCase()} ${path}`, async () => {
      for (const role of allowed) {
        const res = await call(method, path, tokens[role]);
        expect(
          res.status,
          `${role} should reach ${method.toUpperCase()} ${path} (needs ${permission})`
        ).not.toBe(403);
      }
      for (const role of denied) {
        const res = await call(method, path, tokens[role]);
        expect(
          res.status,
          `${role} must NOT reach ${method.toUpperCase()} ${path} (needs ${permission})`
        ).toBe(403);
      }
    });
  }
});

describe('super admin', () => {
  it('bypasses the matrix entirely', async () => {
    const token = await login('admin@test.local', 'Admin@123'); // SUPER_ADMIN
    for (const [method, path] of MATRIX) {
      const res = await call(method, path, token);
      expect(res.status, `SUPER_ADMIN blocked on ${method.toUpperCase()} ${path}`).not.toBe(403);
    }
  });
});

describe('the matrix is actually in force', () => {
  it('takes access away when a permission is removed from a role', async () => {
    // A pharmacist can list medicines by default.
    expect((await call('get', '/api/pharmacy/medicines', tokens.PHARMACIST)).status).not.toBe(403);

    // Take it away — this is the edit an admin makes in the Roles screen, and
    // it used to change precisely nothing.
    await inTenant(async () => {
      await Role.updateOne(
        { name: 'PHARMACIST' },
        { $set: { permissions: ['pharmacy:manage'] } },
        { upsert: true }
      );
    });
    invalidateRolePermissions('PHARMACIST');

    expect((await call('get', '/api/pharmacy/medicines', tokens.PHARMACIST)).status).toBe(403);
    // The permission that was kept still works.
    expect((await call('post', '/api/pharmacy/medicines', tokens.PHARMACIST)).status).not.toBe(403);
  });

  it('grants access when a permission is added to a role', async () => {
    expect((await call('get', '/api/billing/invoices', tokens.NURSE)).status).toBe(403);

    await inTenant(async () => {
      await Role.updateOne(
        { name: 'NURSE' },
        { $set: { permissions: ['billing:view'] } },
        { upsert: true }
      );
    });
    invalidateRolePermissions('NURSE');

    expect((await call('get', '/api/billing/invoices', tokens.NURSE)).status).not.toBe(403);
  });
});
