// Health reporting and database-outage handling.
//
// Both exist because of a real incident: the database became unreachable, the
// health endpoint kept reporting "healthy" because the process was alive, and
// every request returned a bare 500 that surfaced in the UI as "Request failed
// with status code 500".
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app, connectTestDb, disconnectTestDb, seedBase } from './helpers.js';

beforeAll(async () => {
  await connectTestDb();
  await seedBase();
});
afterAll(async () => { await disconnectTestDb(); });

describe('GET /api/health', () => {
  it('reports the database as up when it is reachable', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.database).toBe('up');
    expect(typeof res.body.data.uptime).toBe('number');
  });

  it('answers 503 when the database cannot be reached', async () => {
    // Pretend the connection dropped — readyState 0 is what mongoose reports
    // once the socket is gone.
    const spy = vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(0);
    try {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('DATABASE_UNAVAILABLE');
      expect(res.body.data.database).toBe('down');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('database outage handling', () => {
  it('answers 503 with an actionable message, not a bare 500', async () => {
    // A server-selection failure is what Atlas raises when it refuses the
    // connection (paused cluster, IP not allowed).
    const err = new Error('Could not connect to any servers in your MongoDB Atlas cluster');
    err.name = 'MongooseServerSelectionError';
    // Fail at execution rather than at findOne(), so query builders like
    // `.select('+passwordHash')` still chain the way the service expects.
    const spy = vi.spyOn(mongoose.Query.prototype, 'exec').mockRejectedValue(err);

    try {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.local', password: 'Admin@123' });

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('DATABASE_UNAVAILABLE');
      expect(res.body.message).toMatch(/try again/i);
      // The driver's own wording must not reach the client.
      expect(res.body.message).not.toMatch(/Atlas|servers/i);
    } finally {
      spy.mockRestore();
    }
  });
});
