import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { describe, it } from 'node:test';

async function availablePort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const address = probe.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  probe.close();
  await once(probe, 'close');
  return port;
}

async function waitForHealth(origin) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/health`);
      if (response.ok) return response;
    } catch {
      // Server startup can race the first request.
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Server did not become healthy');
}

describe('Mini Football release', () => {
  it('uses the immutable SDK and low-latency authoritative settings', async () => {
    const [html, app, bundle] = await Promise.all([
      readFile(new URL('../index.html', import.meta.url), 'utf8'),
      readFile(new URL('../app.js', import.meta.url), 'utf8'),
      readFile(new URL('../server.bundle.js', import.meta.url), 'utf8'),
    ]);
    assert.match(html, /https:\/\/usions\.com\/sdk\/v3\/3\.0\.0-next\.7\/usion-sdk\.js/);
    assert.match(app, /game\.sendInput/);
    assert.match(app, /game\.onSnapshot/);
    assert.match(bundle, /tickHz:\s*30,\s*snapshotHz:\s*30/);
  });

  it('serves health and public game assets without exposing deployment files', async () => {
    const port = await availablePort();
    const child = spawn(process.execPath, ['server.mjs'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, PORT: String(port) },
      stdio: 'ignore',
    });
    try {
      const origin = `http://127.0.0.1:${port}`;
      const health = await waitForHealth(origin);
      assert.deepEqual(await health.json(), {
        status: 'ok',
        service: 'sdk-v3-mini-football',
      });
      assert.equal((await fetch(`${origin}/index.html`)).status, 200);
      assert.equal((await fetch(`${origin}/sdk-v3-football/app.js`)).status, 200);
      assert.equal((await fetch(`${origin}/server.bundle.js`)).status, 200);
      assert.equal((await fetch(`${origin}/package.json`)).status, 404);
    } finally {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
  });
});
