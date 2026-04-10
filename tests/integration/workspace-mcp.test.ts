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

  const advancedRequestText = await callToolText(session.client, 'create_request', {
    collectionPath,
    name: 'List Users',
    method: 'GET',
    url: '{{baseUrl}}/users',
    folder: 'users',
    tags: ['users', 'list'],
    settings: {
      encodeUrl: true,
    },
    assertions: [{ name: 'res.status', value: 'eq 200' }],
    docs: 'Lists users.',
  });
  assert.match(advancedRequestText, /Created request/);

  const advancedRequest = JSON.parse(
    await callToolText(session.client, 'get_request', {
      requestPath: join(collectionPath, 'users', 'list-users.bru'),
    }),
  ) as { assertions: unknown[]; docs: string; settings: Record<string, unknown>; tags: string[] };
  assert.deepEqual(advancedRequest.tags, ['users', 'list']);
  assert.equal(advancedRequest.assertions.length, 1);
  assert.equal(advancedRequest.docs, 'Lists users.');
  assert.equal(advancedRequest.settings.encodeUrl, true);

  const requestPath = join(collectionPath, 'users', 'admin', 'get-user.bru');
  const updateRequestText = await callToolText(session.client, 'update_request', {
    assertions: [
      { name: 'res.status', value: 'eq 200' },
      { name: 'res.body.id', value: 'isNumber', enabled: false },
    ],
    docs: 'Fetch a single user.',
    requestPath,
    headers: {
      Accept: 'application/json',
    },
    name: 'Fetch User',
    settings: {
      encodeUrl: true,
      timeout: 10000,
    },
    tags: ['users', 'read'],
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
  ) as { requests: Array<{ assertions: unknown[]; name: string; tags: string[] }> };
  const movedRequest = listRequests.requests.find((request) => request.name === 'Fetch User Root');
  assert.ok(movedRequest);
  assert.deepEqual(movedRequest.tags, ['users', 'read']);
  assert.equal(movedRequest.assertions.length, 2);

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

  const promptList = await session.client.listPrompts();
  assert.ok(promptList.prompts.some((prompt) => prompt.name === 'generate_rest_feature'));

  const completion = await session.client.complete({
    argument: {
      name: 'featureStyle',
      value: 'res',
    },
    ref: {
      name: 'generate_rest_feature',
      type: 'ref/prompt',
    },
  });
  assert.ok(completion.completion.values.includes('resource-crud'));

  const prompt = await session.client.getPrompt({
    arguments: {
      collectionPath,
      featureName: 'Users',
      featureStyle: 'resource-crud',
    },
    name: 'generate_rest_feature',
  });
  assert.match(JSON.stringify(prompt), /resource-crud/);

  const resources = await session.client.listResources();
  assert.ok(resources.resources.some((resource) => resource.uri === 'bruno://capabilities'));

  const capabilitiesResource = await session.client.readResource({ uri: 'bruno://capabilities' });
  assert.match(JSON.stringify(capabilitiesResource), /prompt completions/);

  const workspaceResource = await session.client.readResource({
    uri: `bruno://workspace/${encodeURIComponent(workspacePath)}`,
  });
  assert.match(JSON.stringify(workspaceResource), /native-api/);
});
