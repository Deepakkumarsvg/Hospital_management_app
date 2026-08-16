// Provides MongoDB for the test suite.
//
// If TEST_MONGODB_URI points at a real server (CI does this), we use it as-is.
// Otherwise we boot an in-memory MongoDB so `npm test` works on a machine with
// nothing installed. It is started as a single-node **replica set** because
// transactions — which the service layer relies on for multi-document writes —
// are unavailable on a standalone server.
let mongod = null;

export async function setup({ provide }) {
  if (process.env.TEST_MONGODB_URI) {
    provide('mongoUri', process.env.TEST_MONGODB_URI);
    return;
  }

  const { MongoMemoryReplSet } = await import('mongodb-memory-server');
  mongod = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    // The 10s default isn't enough for a cold start on Windows.
    instanceOpts: [{ launchTimeout: 90_000 }],
  });

  const uri = mongod.getUri();
  process.env.TEST_MONGODB_URI = uri;
  provide('mongoUri', uri);
}

export async function teardown() {
  if (mongod) await mongod.stop();
}
