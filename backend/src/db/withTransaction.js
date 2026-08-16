// Multi-document atomicity.
//
// Most write paths in this app are made safe with a single conditional update
// (`findOneAndUpdate` with the precondition in the filter) — that works on any
// MongoDB and is the right tool when one document decides the outcome.
//
// Some flows genuinely span several documents that must all land or none:
// receiving a purchase order touches the order, the item, its batch and the
// stock ledger. Those use a transaction, which requires MongoDB to be running
// as a replica set (a single-node one is fine — see docker-compose.yml).
//
// Usage:
//   await withTransaction(async (session) => {
//     await Item.updateOne({ _id }, { $inc: { stock: n } }, { session });
//     await Ledger.create([{ ... }], { session });
//   });
//
// Every query inside MUST be passed the session, or it runs outside the
// transaction and will not be rolled back.
import { currentConnection } from './tenantContext.js';

let transactionsSupported = null; // null = not yet probed

// Whether the connected server can run transactions. Standalone mongod cannot;
// replica sets and sharded clusters can.
export async function probeTransactionSupport(conn) {
  try {
    const info = await conn.db.admin().command({ hello: 1 });
    transactionsSupported = Boolean(info.setName || info.msg === 'isdbgrid');
  } catch {
    transactionsSupported = false;
  }
  return transactionsSupported;
}

export const areTransactionsSupported = () => transactionsSupported;

export async function withTransaction(fn) {
  const conn = currentConnection();

  // Not probed yet (e.g. a script that never called probeTransactionSupport).
  if (transactionsSupported === null) await probeTransactionSupport(conn);

  if (!transactionsSupported) {
    // Running the body without a session would silently drop the atomicity the
    // caller asked for, and a half-applied goods receipt is worse than a
    // failed one. Fail loudly instead — the fix is a one-line deployment
    // change, not a code change.
    throw new Error(
      'This operation needs a MongoDB transaction, but the server is standalone. ' +
      'Run MongoDB as a single-node replica set (--replSet rs0) and initiate it once.'
    );
  }

  const session = await conn.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
