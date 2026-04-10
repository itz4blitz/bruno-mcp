import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createTestServer } from '../helpers/http-server.js';
import { callToolText, createMcpTestClient, REPO_ROOT } from '../helpers/mcp-client.js';

test('generated Bruno collections execute successfully with bru run', async (t) => {
  const server = await createTestServer();
  const session = await createMcpTestClient();
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-acceptance-'));

  t.after(async () => {
    await session.close();
    await server.close();
  });

  await callToolText(session.client, 'create_collection', {
    name: 'acceptance-api',
    outputPath: rootPath,
  });

  const collectionPath = join(rootPath, 'acceptance-api');

  await callToolText(session.client, 'create_environment', {
    collectionPath,
    name: 'test',
    variables: {
      baseUrl: server.baseUrl,
    },
  });

  await callToolText(session.client, 'create_request', {
    collectionPath,
    name: 'Ping Request',
    method: 'GET',
    url: '{{baseUrl}}/ping',
  });

  await callToolText(session.client, 'add_test_script', {
    bruFilePath: join(collectionPath, 'ping-request.bru'),
    scriptType: 'tests',
    script: `test("status is 200", function () {
  expect(res.status).to.equal(200);
});`,
  });

  const result = await runBru(collectionPath);

  assert.equal(result.exitCode, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /ping-request/);
  assert.match(result.stdout, /Passed|pass|PASS/);
});

test('generated GraphQL requests execute successfully with bru run', async (t) => {
  const server = await createTestServer();
  const session = await createMcpTestClient();
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-acceptance-graphql-'));

  t.after(async () => {
    await session.close();
    await server.close();
  });

  await callToolText(session.client, 'create_collection', {
    name: 'graphql-api',
    outputPath: rootPath,
  });

  const collectionPath = join(rootPath, 'graphql-api');

  await callToolText(session.client, 'create_environment', {
    collectionPath,
    name: 'test',
    variables: {
      baseUrl: server.baseUrl,
    },
  });

  await callToolText(session.client, 'create_request', {
    collectionPath,
    name: 'List Users GraphQL',
    method: 'POST',
    url: '{{baseUrl}}/graphql',
    headers: {
      'content-type': 'application/json',
    },
    body: {
      type: 'graphql',
      content: `query ListUsers($limit: Int!) {
  users(limit: $limit) {
    id
    name
  }
}`,
      variables: '{\n  "limit": 5\n}',
    },
  });

  await callToolText(session.client, 'add_test_script', {
    bruFilePath: join(collectionPath, 'list-users-graphql.bru'),
    scriptType: 'tests',
    script: `test("status is 200", function () {
  expect(res.status).to.equal(200);
});`,
  });

  const result = await runBru(collectionPath);

  assert.equal(result.exitCode, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /list-users-graphql/);
  assert.match(result.stdout, /Passed|pass|PASS/);
  assert.equal(server.requests.length, 1);
  assert.match(server.requests[0].body, /"query"/);
  assert.match(server.requests[0].body, /ListUsers/);
  assert.match(server.requests[0].body, /"variables"/);
  assert.match(server.requests[0].body, /"limit":5/);
});

async function runBru(
  collectionPath: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const bruCommand =
    process.platform === 'win32'
      ? join(REPO_ROOT, 'node_modules', '.bin', 'bru.cmd')
      : join(REPO_ROOT, 'node_modules', '.bin', 'bru');

  return new Promise((resolve, reject) => {
    const child = spawn(bruCommand, ['run', '--env', 'test'], {
      cwd: collectionPath,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
      });
    });
  });
}
