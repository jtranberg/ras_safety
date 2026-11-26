import test from 'node:test';
import assert from 'node:assert/strict';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import Submission from '../src/models/Submission.js';

function isolatedApp(connected = true) {
  return createApp({
    sessionSecret: 'test-only-session-secret-'.repeat(4),
    sessionStore: new session.MemoryStore(),
    isDatabaseConnected: () => connected,
  });
}
async function withServer(app, run) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('anonymous readiness probe succeeds without using the session store', async () => {
  const store = new session.MemoryStore();
  store.get = () => { throw new Error('Health probes must not read sessions'); };
  const app = createApp({
    sessionSecret: 'test-only-secret-'.repeat(5),
    sessionStore: store,
    isDatabaseConnected: () => true,
  });
  await withServer(app, async (base) => {
    const response = await fetch(`${base}/api/health`, {
      headers: { cookie: 'ras.sid=irrelevant-test-cookie' },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: 'ok', service: 'ras-safety-api', database: 'connected',
    });
    assert.equal(response.headers.get('set-cookie'), null);
  });
});

test('readiness returns 503 rather than an authentication response when disconnected', async () => {
  await withServer(isolatedApp(false), async (base) => {
    const response = await fetch(`${base}/api/health`);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).database, 'disconnected');
  });
});

test('public readiness does not open protected workers, submissions, or photos', async () => {
  await withServer(isolatedApp(), async (base) => {
    for (const path of ['/api/sites', '/api/submissions', '/api/auth/workers',
      '/api/submissions/admin-dashboard', '/api/submissions/507f1f77bcf86cd799439011/photos']) {
      const response = await fetch(base + path);
      assert.equal(response.status, 401, path);
      assert.equal((await response.json()).message, 'Please log in.', path);
    }
  });
});

test('writes from an unapproved browser origin remain blocked', async () => {
  await withServer(isolatedApp(), async (base) => {
    const response = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { origin: 'https://untrusted.example', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'not-a-real-password' }),
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).message, 'Request origin not allowed.');
  });
});

test('reopened submission details include authorization and revocation names', async (t) => {
  const adminId = '507f1f77bcf86cd799439010';
  const names = {
    worker: { _id: '507f1f77bcf86cd799439012', name: 'Demo Worker' },
    site: { _id: '507f1f77bcf86cd799439013', name: 'Demo Site' },
    authorizedBy: { _id: adminId, name: 'Original Authorizer' },
    revokedBy: { _id: '507f1f77bcf86cd799439014', name: 'Revoking Admin' },
  };
  t.mock.method(User, 'findById', async () => ({ _id: adminId, role: 'ADMIN', isActive: true, sessionVersion: 0 }));
  // Only database operations are stubbed. The real route, auth checks, and
  // populate declarations determine the response shape.
  t.mock.method(Submission, 'findOne', () => {
    const query = { populated: new Set(),
      populate(path) { this.populated.add(path); return this; },
      async lean() {
        const record = { _id: '507f1f77bcf86cd799439011', status: 'SUBMITTED' };
        for (const [path, value] of Object.entries(names)) {
          record[path] = this.populated.has(path) ? value : value._id;
        }
        return record;
      },
    };
    return query;
  });
  const passwordHash = await bcrypt.hash('test-only-demo-password', 4);
  t.mock.method(User, 'findOne', () => ({
    async select() { return { _id: adminId, name: 'Test Admin', email: 'test@example.com',
      passwordHash, role: 'ADMIN', isActive: true, sessionVersion: 0 }; },
  }));
  await withServer(isolatedApp(), async (base) => {
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'test-only-demo-password' }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const response = await fetch(`${base}/api/submissions/507f1f77bcf86cd799439011`, {
      headers: { cookie },
    });
    assert.equal(response.status, 200);
    const { submission } = await response.json();
    assert.equal(submission.authorizedBy.name, 'Original Authorizer');
    assert.equal(submission.revokedBy.name, 'Revoking Admin');
  });
});

test('leaderboard requires sign-in', async () => {
  await withServer(isolatedApp(), async (base) => {
    const response = await fetch(`${base}/api/submissions/leaderboard`);
    assert.equal(response.status, 401);
  });
});

test('login rejects invalid emails and short passwords before checking accounts', async () => {
  await withServer(isolatedApp(), async (base) => {
    const cases = [
      [{ email: 'not-an-email', password: 'long-enough-password' }, 'Enter a valid email address.'],
      [{ email: 'name@domain', password: 'long-enough-password' }, 'Enter a valid email address.'],
      [{ password: 'long-enough-password' }, 'Enter a valid email address.'],
      [{ email: 'worker@example.com', password: 'short7c' }, 'Password must be at least 8 characters.'],
      [{ email: 'worker@example.com', password: '   abc   ' }, 'Password must be at least 8 characters.'],
    ];
    for (const [body, message] of cases) {
      const response = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.equal((await response.json()).message, message);
    }
  });
});
