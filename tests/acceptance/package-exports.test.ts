import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);

test('packed package exports resolve root and engine subpaths', async () => {
  await execFileAsync('npm', ['run', 'build'], { cwd: process.cwd() });
  const root = await import('../../dist/index.js');
  const engine = await import('../../dist/engine-http/index.js');

  assert.equal(typeof root.createBrunoMcpServer, 'function');
  assert.equal(typeof engine.createBrunoEngineClient, 'function');
  assert.equal(typeof engine.getEngineHttpJsonSchemas, 'function');
  assert.equal(typeof engine.createEngineHttpServer, 'function');
});
