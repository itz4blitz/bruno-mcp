import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createCollectionManager } from '../../src/bruno/collection.js';
import { createBrunoNativeManager } from '../../src/bruno/native.js';
import { createRequestBuilder } from '../../src/bruno/request.js';

test('BrunoNativeManager manages collection defaults, folder defaults, requests, and environments for classic collections', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-native-'));
  const collectionManager = createCollectionManager();
  const requestBuilder = createRequestBuilder();
  const nativeManager = createBrunoNativeManager();

  const collection = await collectionManager.createCollection({
    name: 'native-api',
    outputPath: rootPath,
  });
  assert.equal(collection.success, true);
  const collectionPath = collection.path as string;

  const defaultsResult = await nativeManager.updateCollectionDefaults(collectionPath, {
    headers: { Accept: 'application/json' },
    preRequestVars: { tenantId: 85 },
    preRequestScript: "console.log('collection pre');",
  });
  assert.equal(defaultsResult.success, true);

  const defaults = await nativeManager.getCollectionDefaults(collectionPath);
  assert.match(JSON.stringify(defaults), /collection pre/);
  assert.match(JSON.stringify(defaults), /Accept/);

  const folderResult = await nativeManager.createFolder(collectionPath, 'users/admin', {
    tests: "test('folder default', function () { expect(true).to.equal(true); });",
  });
  assert.equal(folderResult.success, true);

  const folderDefaults = await nativeManager.getFolderDefaults(collectionPath, 'users/admin');
  assert.match(JSON.stringify(folderDefaults), /folder default/);

  const createRequestResult = await requestBuilder.createRequest({
    collectionPath,
    name: 'Get User',
    method: 'GET',
    url: '{{baseUrl}}/users/{{id}}',
    folder: 'users/admin',
  });
  assert.equal(createRequestResult.success, true);
  const requestPath = createRequestResult.path as string;

  const request = await nativeManager.getRequest(requestPath);
  assert.equal(request.method, 'GET');
  assert.equal(request.relativePath, 'users/admin/get-user.bru');

  const updateRequestResult = await nativeManager.updateRequest(requestPath, {
    assertions: [
      { name: 'res.status', value: 'eq 200' },
      { enabled: false, name: 'res.body.id', value: 'isNumber' },
    ],
    docs: 'Fetches a single user by runtime identifier.',
    headers: { Accept: 'application/json' },
    name: 'Fetch User',
    settings: { encodeUrl: true, timeout: 10000 },
    tags: ['users', 'happy-path'],
    tests: "test('status is 200', function () { expect(res.status).to.equal(200); });",
    url: '{{baseUrl}}/users/{{userId}}',
  });
  assert.equal(updateRequestResult.success, true);

  const updatedRequestPath = updateRequestResult.path as string;
  const updatedRequest = await nativeManager.getRequest(updatedRequestPath);
  assert.deepEqual(updatedRequest.tags, ['users', 'happy-path']);
  assert.equal((updatedRequest.settings as Record<string, unknown>).encodeUrl, true);
  assert.equal((updatedRequest.assertions as Array<{ name: string }>)[0].name, 'res.status');
  assert.equal(updatedRequest.name, 'Fetch User');
  assert.equal(updatedRequest.url, '{{baseUrl}}/users/{{userId}}');
  assert.match(JSON.stringify(updatedRequest), /status is 200/);
  assert.match(JSON.stringify(updatedRequest), /Fetches a single user/);

  const moveResult = await nativeManager.moveRequest(
    updatedRequestPath,
    'users',
    'Fetch User Root',
    5,
  );
  assert.equal(moveResult.success, true);
  assert.match(moveResult.path as string, /users\/fetch-user-root\.bru$/);

  const environmentsBefore = await nativeManager.listEnvironments(collectionPath);
  assert.deepEqual(environmentsBefore, []);

  const createEnvironmentResult = await nativeManager.createEnvironment(collectionPath, 'Local', {
    baseUrl: 'http://localhost:8080',
    tenantId: 85,
  });
  assert.equal(createEnvironmentResult.success, true);

  const environment = await nativeManager.getEnvironment(collectionPath, 'Local');
  assert.deepEqual(environment, {
    baseUrl: 'http://localhost:8080',
    tenantId: '85',
  });

  const updateEnvironmentResult = await nativeManager.updateEnvironmentVariables(
    collectionPath,
    'Local',
    { apiToken: 'abc123' },
    ['tenantId'],
  );
  assert.equal(updateEnvironmentResult.success, true);

  const updatedEnvironment = await nativeManager.getEnvironment(collectionPath, 'Local');
  assert.deepEqual(updatedEnvironment, {
    apiToken: 'abc123',
    baseUrl: 'http://localhost:8080',
  });

  const deleteRequestResult = await nativeManager.deleteRequest(moveResult.path as string);
  assert.equal(deleteRequestResult.success, true);

  const deleteEnvironmentResult = await nativeManager.deleteEnvironment(collectionPath, 'Local');
  assert.equal(deleteEnvironmentResult.success, true);

  const requestFileContent = await readFile(join(collectionPath, 'collection.bru'), 'utf8');
  assert.match(requestFileContent, /vars:pre-request/);
  assert.match(requestFileContent, /script:pre-request/);
});

test('BrunoNativeManager supports YAML collection folders and environments', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-native-yml-'));
  const collectionPath = join(rootPath, 'yml-api');
  await mkdir(collectionPath, { recursive: true });
  await writeFile(
    join(collectionPath, 'opencollection.yml'),
    `opencollection: 1.0.0

info:
  name: Yml Api

bundled: false
`,
  );

  const nativeManager = createBrunoNativeManager();

  const folderResult = await nativeManager.createFolder(collectionPath, 'users', {
    preRequestVars: { tenantId: 85 },
  });
  assert.equal(folderResult.success, true);

  const folderContent = await readFile(join(collectionPath, 'users', 'folder.yml'), 'utf8');
  assert.match(folderContent, /tenantId/);

  const environmentResult = await nativeManager.createEnvironment(collectionPath, 'Local', {
    baseUrl: 'http://localhost:8080',
  });
  assert.equal(environmentResult.success, true);

  const environmentContent = await readFile(
    join(collectionPath, 'environments', 'Local.yml'),
    'utf8',
  );
  assert.match(environmentContent, /baseUrl/);
});
