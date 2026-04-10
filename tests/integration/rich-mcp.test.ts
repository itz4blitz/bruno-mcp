import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createMcpTestClient } from '../helpers/mcp-client.js';

test('roots enforcement constrains tools, resources, and completions', async (t) => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-mcp-roots-'));
  const allowedWorkspacePath = join(rootPath, 'allowed-workspace');
  const allowedCollectionsPath = join(allowedWorkspacePath, 'collections');
  const disallowedWorkspacePath = join(rootPath, 'disallowed-workspace');
  const disallowedCollectionsPath = join(disallowedWorkspacePath, 'collections');

  await mkdir(allowedCollectionsPath, { recursive: true });
  await mkdir(disallowedCollectionsPath, { recursive: true });

  await writeFile(
    join(allowedWorkspacePath, 'workspace.yml'),
    `opencollection: 1.0.0
info:
  name: "Allowed Workspace"
  type: workspace

collections: []

specs:

docs: ''
`,
  );
  await writeFile(
    join(disallowedWorkspacePath, 'workspace.yml'),
    `opencollection: 1.0.0
info:
  name: "Disallowed Workspace"
  type: workspace

collections: []

specs:

docs: ''
`,
  );

  const session = await createMcpTestClient({ roots: [allowedWorkspacePath] });
  t.after(async () => {
    await session.close();
  });

  const disallowedCollectionResult = await session.client.callTool({
    name: 'create_collection',
    arguments: {
      name: 'blocked-api',
      outputPath: disallowedCollectionsPath,
    },
  });
  assert.equal(
    Boolean('isError' in disallowedCollectionResult && disallowedCollectionResult.isError),
    true,
  );
  assert.match(JSON.stringify(disallowedCollectionResult), /outside allowed roots/i);

  await assert.rejects(
    session.client.readResource({
      uri: `bruno://workspace/${encodeURIComponent(disallowedWorkspacePath)}`,
    }),
    /outside allowed roots/i,
  );

  await session.client.callTool({
    name: 'create_collection',
    arguments: {
      name: 'allowed-api',
      outputPath: allowedCollectionsPath,
    },
  });

  const completion = await session.client.complete({
    argument: {
      name: 'collectionPath',
      value: allowedCollectionsPath,
    },
    ref: {
      name: 'generate_rest_feature',
      type: 'ref/prompt',
    },
  });
  assert.ok(completion.completion.values.some((value) => value.includes('allowed-api')));
  assert.equal(
    completion.completion.values.some((value) => value.includes('disallowed-workspace')),
    false,
  );
});

test('delete_folder can use elicitation to confirm recursive deletion', async (t) => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-mcp-elicit-'));
  const session = await createMcpTestClient({
    elicitationResponse: {
      action: 'accept',
      content: {
        deleteContents: true,
      },
    },
  });

  t.after(async () => {
    await session.close();
  });

  await session.client.callTool({
    name: 'create_collection',
    arguments: {
      name: 'elicitation-api',
      outputPath: rootPath,
    },
  });

  const collectionPath = join(rootPath, 'elicitation-api');
  await session.client.callTool({
    name: 'create_folder',
    arguments: {
      collectionPath,
      folderPath: 'users/admin',
    },
  });
  await session.client.callTool({
    name: 'create_request',
    arguments: {
      collectionPath,
      folder: 'users/admin',
      method: 'GET',
      name: 'Get User',
      url: '{{baseUrl}}/users/{{id}}',
    },
  });

  const deleteFolderResult = await session.client.callTool({
    name: 'delete_folder',
    arguments: {
      collectionPath,
      deleteContents: false,
      folderPath: 'users',
    },
  });

  assert.equal(Boolean('isError' in deleteFolderResult && deleteFolderResult.isError), false);

  const collectionTree = await readFile(join(collectionPath, 'bruno.json'), 'utf8');
  assert.match(collectionTree, /collection/);
});

test('list_requests emits logging and progress signals for long-ish operations', async (t) => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-mcp-logging-'));
  const session = await createMcpTestClient();
  t.after(async () => {
    await session.close();
  });

  await session.client.callTool({
    name: 'create_collection',
    arguments: {
      name: 'logging-api',
      outputPath: rootPath,
    },
  });

  const collectionPath = join(rootPath, 'logging-api');
  await session.client.callTool({
    name: 'create_request',
    arguments: {
      collectionPath,
      method: 'GET',
      name: 'List Users',
      url: '{{baseUrl}}/users',
    },
  });
  await session.client.callTool({
    name: 'create_request',
    arguments: {
      collectionPath,
      method: 'GET',
      name: 'Get User',
      url: '{{baseUrl}}/users/{{id}}',
    },
  });

  await session.client.setLoggingLevel('debug');

  const result = await session.client.callTool(
    {
      name: 'list_requests',
      arguments: { collectionPath },
    },
    undefined,
    { onprogress: () => {} },
  );

  assert.equal(Boolean('isError' in result && result.isError), false);
  assert.ok(session.logs.some((entry) => JSON.stringify(entry.data).includes('list_requests')));
  assert.ok(session.progress.length > 0);
  assert.ok(session.progress.some((value) => value.progress >= 1));
});
