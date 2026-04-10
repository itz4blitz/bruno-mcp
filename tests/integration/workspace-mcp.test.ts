import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { callToolText, createMcpTestClient } from '../helpers/mcp-client.js';

test('MCP server exposes workspace and native collection management tools', async (t) => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-mcp-workspace-'));
  const workspacePath = join(rootPath, 'workspace');
  const collectionsPath = join(workspacePath, 'collections');
  await mkdir(collectionsPath, { recursive: true });
  await writeFile(
    join(workspacePath, 'workspace.yml'),
    `opencollection: 1.0.0
info:
  name: "Workspace"
  type: workspace

collections: []

specs:

docs: ''
`,
  );

  const session = await createMcpTestClient();
  t.after(async () => {
    await session.close();
  });

  const collectionText = await callToolText(session.client, 'create_collection', {
    name: 'native-api',
    outputPath: collectionsPath,
  });
  assert.match(collectionText, /Created Bruno collection/);

  const collectionPath = join(collectionsPath, 'native-api');

  const addWorkspaceText = await callToolText(session.client, 'add_collection_to_workspace', {
    collectionPath,
    workspacePath,
  });
  assert.match(addWorkspaceText, /Added/);

  const workspaceSummary = JSON.parse(
    await callToolText(session.client, 'get_workspace', { workspacePath }),
  ) as {
    collections: Array<{ name: string; path: string }>;
  };
  assert.equal(workspaceSummary.collections[0].path, 'collections/native-api');

  const defaultsText = await callToolText(session.client, 'update_collection_defaults', {
    collectionPath,
    headers: {
      Accept: 'application/json',
    },
    preRequestScript: "console.log('collection pre')",
  });
  assert.match(defaultsText, /Updated collection defaults/);

  const collectionDefaults = JSON.parse(
    await callToolText(session.client, 'get_collection_defaults', { collectionPath }),
  ) as { headers: Array<{ name: string }>; scripts: { req: string } };
  assert.ok(collectionDefaults.headers.some((header) => header.name === 'Accept'));
  assert.match(collectionDefaults.scripts.req, /collection pre/);

  const createFolderText = await callToolText(session.client, 'create_folder', {
    collectionPath,
    folderPath: 'users/admin',
    tests: "test('folder default', function () { expect(true).to.equal(true); });",
  });
  assert.match(createFolderText, /Created folder/);

  const requestText = await callToolText(session.client, 'create_request', {
    collectionPath,
    name: 'Get User',
    method: 'GET',
    url: '{{baseUrl}}/users/{{id}}',
    folder: 'users/admin',
  });
  assert.match(requestText, /Created request/);

  const requestPath = join(collectionPath, 'users', 'admin', 'get-user.bru');
  const updateRequestText = await callToolText(session.client, 'update_request', {
    requestPath,
    headers: {
      Accept: 'application/json',
    },
    name: 'Fetch User',
  });
  assert.match(updateRequestText, /Updated request/);

  const movedRequestText = await callToolText(session.client, 'move_request', {
    newName: 'Fetch User Root',
    requestPath: join(collectionPath, 'users', 'admin', 'fetch-user.bru'),
    targetFolderPath: 'users',
  });
  assert.match(movedRequestText, /Moved request/);

  const listRequests = JSON.parse(
    await callToolText(session.client, 'list_requests', { collectionPath }),
  ) as { requests: Array<{ name: string }> };
  assert.ok(listRequests.requests.some((request) => request.name === 'Fetch User Root'));

  const createWorkspaceEnvironmentText = await callToolText(
    session.client,
    'create_workspace_environment',
    {
      environmentName: 'SIT',
      variables: { baseUrl: 'http://localhost:8080' },
      workspacePath,
    },
  );
  assert.match(createWorkspaceEnvironmentText, /Created workspace environment/);

  const getWorkspaceEnvironment = JSON.parse(
    await callToolText(session.client, 'get_workspace_environment', {
      environmentName: 'SIT',
      workspacePath,
    }),
  ) as { variables: Record<string, string> };
  assert.deepEqual(getWorkspaceEnvironment.variables, { baseUrl: 'http://localhost:8080' });

  const updateEnvironmentText = await callToolText(session.client, 'update_environment_vars', {
    collectionPath,
    environmentName: 'Local',
    set: { tenantId: 85 },
    unset: [],
  });
  assert.match(updateEnvironmentText, /Failed to update environment/);

  const workspaceFileContent = await readFile(join(workspacePath, 'workspace.yml'), 'utf8');
  assert.match(workspaceFileContent, /native-api/);
});
