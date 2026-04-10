import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createWorkspaceManager } from '../../src/bruno/workspace.js';

test('WorkspaceManager adds, validates, and removes workspace collections', async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), 'bruno-workspace-'));
  const collectionsPath = join(workspacePath, 'collections');
  const branchCollectionPath = join(collectionsPath, 'Branch');
  await mkdir(branchCollectionPath, { recursive: true });

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
  await writeFile(
    join(branchCollectionPath, 'bruno.json'),
    '{"version":"1","name":"Branch","type":"collection"}',
  );

  const workspaceManager = createWorkspaceManager();

  const addResult = await workspaceManager.addCollection(
    workspacePath,
    'Branch',
    branchCollectionPath,
  );
  assert.equal(addResult.success, true);

  const summary = await workspaceManager.getWorkspaceSummary(workspacePath);
  assert.equal(summary.workspaceName, 'Workspace');
  assert.deepEqual(summary.collections, [
    { exists: true, name: 'Branch', path: 'collections/Branch' },
  ]);

  const validation = await workspaceManager.validateWorkspace(workspacePath);
  assert.deepEqual(validation.errors, []);

  const removeResult = await workspaceManager.removeCollection(workspacePath, branchCollectionPath);
  assert.equal(removeResult.success, true);

  const workspaceContent = await readFile(join(workspacePath, 'workspace.yml'), 'utf8');
  assert.match(workspaceContent, /"collections": \[\]/);
});

test('WorkspaceManager manages workspace-level environments', async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), 'bruno-workspace-env-'));
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

  const workspaceManager = createWorkspaceManager();

  const createResult = await workspaceManager.createWorkspaceEnvironment(workspacePath, 'SIT', {
    apiToken: 'abc123',
    baseUrl: 'http://localhost:8080',
    tenantId: 85,
  });
  assert.equal(createResult.success, true);

  const list = await workspaceManager.listWorkspaceEnvironments(workspacePath);
  assert.deepEqual(list, ['SIT']);

  const env = await workspaceManager.getWorkspaceEnvironment(workspacePath, 'SIT');
  assert.deepEqual(env, {
    apiToken: 'abc123',
    baseUrl: 'http://localhost:8080',
    tenantId: '85',
  });

  const updateResult = await workspaceManager.updateWorkspaceEnvironment(
    workspacePath,
    'SIT',
    { baseUrl: 'http://localhost:9090' },
    ['apiToken'],
  );
  assert.equal(updateResult.success, true);

  const updated = await workspaceManager.getWorkspaceEnvironment(workspacePath, 'SIT');
  assert.deepEqual(updated, {
    baseUrl: 'http://localhost:9090',
    tenantId: '85',
  });

  const deleteResult = await workspaceManager.deleteWorkspaceEnvironment(workspacePath, 'SIT');
  assert.equal(deleteResult.success, true);
  assert.deepEqual(await workspaceManager.listWorkspaceEnvironments(workspacePath), []);
});
