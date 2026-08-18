// Blood-unit custody integrity.
//
// The invariant: a physical unit of blood has exactly one custodian. It can be
// reserved for one patient, issued to one patient, or discarded — never two of
// those, and never twice, no matter how many people act on it at once.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { connectTestDb, disconnectTestDb, inTenant } from './helpers.js';

const { BloodUnit } = await import('../src/models/BloodUnit.js');
const { BloodDonor } = await import('../src/models/BloodDonor.js');
const { Patient } = await import('../src/models/Patient.js');
const bank = await import('../src/services/bloodBankService.js');

let recipient; let otherRecipient;

const DAY = 24 * 60 * 60 * 1000;
const future = () => new Date(Date.now() + 30 * DAY);
const past = () => new Date(Date.now() - DAY);

beforeAll(async () => { await connectTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

beforeEach(async () => {
  await inTenant(async () => {
    await Promise.all([BloodUnit.deleteMany({}), BloodDonor.deleteMany({}), Patient.deleteMany({})]);
    [recipient, otherRecipient] = await Patient.create([
      { firstName: 'Rahul', lastName: 'Verma', gender: 'MALE', dateOfBirth: '1988-02-11', phone: '9000000041', bloodGroup: 'O+' },
      { firstName: 'Sneha', lastName: 'Das', gender: 'FEMALE', dateOfBirth: '1992-07-19', phone: '9000000042', bloodGroup: 'O+' },
    ]);
  });
});

// O+ into an O+ recipient — always compatible, so custody is the only variable.
const newUnit = (overrides = {}) => BloodUnit.create({
  bloodGroup: 'O+', component: 'PRBC', expiryDate: future(), ...overrides,
});

describe('blood unit issue', () => {
  it('issues a unit exactly once under concurrent attempts', () => inTenant(async () => {
    const unit = await newUnit();

    // Two nurses grab the same bag at the same moment.
    const results = await Promise.allSettled([
      bank.issueUnit(unit._id, { patient: recipient._id, reason: 'Surgery' }, null),
      bank.issueUnit(unit._id, { patient: otherRecipient._id, reason: 'Transfusion' }, null),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected').reason.errorCode).toBe('UNIT_NOT_AVAILABLE');

    const after = await BloodUnit.findById(unit._id);
    expect(after.status).toBe('ISSUED');
    // Exactly one recipient — not the last writer to win. issuedTo comes back
    // populated, so compare against its id.
    const winner = results.find((r) => r.status === 'fulfilled').value;
    expect(String(after.issuedTo)).toBe(String(winner.issuedTo._id));
  }));

  it('refuses to issue an expired unit', () => inTenant(async () => {
    const unit = await newUnit({ expiryDate: past() });
    await expect(bank.issueUnit(unit._id, { patient: recipient._id }, null))
      .rejects.toMatchObject({ errorCode: 'UNIT_EXPIRED' });
  }));

  it('refuses an incompatible group unless overridden', () => inTenant(async () => {
    const unit = await newUnit({ bloodGroup: 'AB-' }); // AB- into O+ is not compatible
    await expect(bank.issueUnit(unit._id, { patient: recipient._id }, null))
      .rejects.toMatchObject({ errorCode: 'INCOMPATIBLE_BLOOD_GROUP' });

    const forced = await bank.issueUnit(unit._id, { patient: recipient._id, overrideCompatibility: true }, null);
    expect(forced.status).toBe('ISSUED');
  }));

  it('refuses to issue a unit that is reserved for someone else', () => inTenant(async () => {
    const unit = await newUnit();
    await bank.reserveUnit(unit._id, recipient._id, null);

    await expect(bank.issueUnit(unit._id, { patient: otherRecipient._id }, null))
      .rejects.toMatchObject({ errorCode: 'UNIT_NOT_AVAILABLE' });
  }));

  it('lets the patient it was reserved for take it', () => inTenant(async () => {
    const unit = await newUnit();
    await bank.reserveUnit(unit._id, recipient._id, null);

    const issued = await bank.issueUnit(unit._id, { patient: recipient._id }, null);
    expect(issued.status).toBe('ISSUED');
    expect(issued.reservedFor).toBeNull();
  }));
});

describe('blood unit reservation', () => {
  it('reserves a unit exactly once under concurrent attempts', () => inTenant(async () => {
    const unit = await newUnit();

    const results = await Promise.allSettled([
      bank.reserveUnit(unit._id, recipient._id, null),
      bank.reserveUnit(unit._id, otherRecipient._id, null),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected').reason.errorCode).toBe('UNIT_NOT_AVAILABLE');
  }));

  it('refuses to reserve an expired unit', () => inTenant(async () => {
    const unit = await newUnit({ expiryDate: past() });
    await expect(bank.reserveUnit(unit._id, recipient._id, null))
      .rejects.toMatchObject({ errorCode: 'UNIT_EXPIRED' });
  }));

  it('puts a released unit back into stock', () => inTenant(async () => {
    const unit = await newUnit();
    await bank.reserveUnit(unit._id, recipient._id, null);
    const freed = await bank.unreserveUnit(unit._id);

    expect(freed.status).toBe('AVAILABLE');
    expect(freed.reservedFor).toBeNull();
  }));
});

describe('blood unit discard', () => {
  it('never discards a unit that has just been issued', () => inTenant(async () => {
    const unit = await newUnit();

    const [issue, discard] = await Promise.allSettled([
      bank.issueUnit(unit._id, { patient: recipient._id }, null),
      bank.discardUnit(unit._id),
    ]);

    const after = await BloodUnit.findById(unit._id);
    // Whichever wins, the unit must never be both issued and discarded.
    if (issue.status === 'fulfilled') {
      expect(after.status).toBe('ISSUED');
      expect(discard.status).toBe('rejected');
    } else {
      expect(after.status).toBe('DISCARDED');
    }
  }));
});

describe('expiry handling without a read-path sweep', () => {
  it('leaves an out-of-date unit out of available stock before any sweep runs', () => inTenant(async () => {
    await newUnit({ expiryDate: past() });
    await newUnit({ expiryDate: future() });

    const s = await bank.stock();
    expect(s.totalAvailable).toBe(1);
    expect(s.byGroup['O+'].total).toBe(1);
  }));

  it('lists an out-of-date unit as expired before any sweep runs', () => inTenant(async () => {
    const stale = await newUnit({ expiryDate: past() });

    // Still stored as AVAILABLE — the sweep has not run.
    expect((await BloodUnit.findById(stale._id)).status).toBe('AVAILABLE');

    expect(await bank.listUnits({ status: 'AVAILABLE' })).toHaveLength(0);
    expect(await bank.listUnits({ status: 'EXPIRED' })).toHaveLength(1);
  }));

  it('sweeps stored statuses when the job does run', () => inTenant(async () => {
    const stale = await newUnit({ expiryDate: past() });
    const fresh = await newUnit({ expiryDate: future() });

    const { expired } = await bank.sweepExpiredUnits();
    expect(expired).toBe(1);
    expect((await BloodUnit.findById(stale._id)).status).toBe('EXPIRED');
    expect((await BloodUnit.findById(fresh._id)).status).toBe('AVAILABLE');
  }));
});
