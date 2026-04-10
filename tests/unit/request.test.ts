import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createCollectionManager } from '../../src/bruno/collection.js';
import { createRequestBuilder } from '../../src/bruno/request.js';

test('addTestScript and updateRequest preserve existing supported sections', async () => {
  const rootPath = await import('node:fs/promises').then(({ mkdtemp }) =>
    mkdtemp(join(tmpdir(), 'bruno-request-')),
  );
  const collectionManager = createCollectionManager();
  const requestBuilder = createRequestBuilder();

  const collection = await collectionManager.createCollection({
    name: 'request-tests',
    outputPath: rootPath,
  });

  assert.equal(collection.success, true);
  const collectionPath = collection.path as string;

  const created = await requestBuilder.createRequest({
    collectionPath,
    name: 'Get User',
    method: 'GET',
    url: '{{baseUrl}}/users',
    headers: {
      Accept: 'application/json',
    },
    auth: {
      type: 'bearer',
      config: {
        token: '{{token}}',
      },
    },
    body: {
      type: 'json',
      content: '{\n  "include": "details"\n}',
    },
    query: {
      limit: 10,
    },
    folder: 'users',
  });

  assert.equal(created.success, true);
  const bruFilePath = created.path as string;

  const addScriptResult = await requestBuilder.addTestScript({
    bruFilePath,
    scriptType: 'tests',
    script: `test("status is 200", function () {
  expect(res.status).to.equal(200);
});`,
  });

  assert.equal(addScriptResult.success, true);

  const updateResult = await requestBuilder.updateRequest(bruFilePath, {
    url: '{{baseUrl}}/users/{{id}}',
  });

  assert.equal(updateResult.success, true);

  const content = await readFile(bruFilePath, 'utf8');
  assert.match(content, /url: \{\{baseUrl\}\}\/users\/\{\{id\}\}/);
  assert.match(content, /auth:bearer/);
  assert.match(content, /body:json/);
  assert.match(content, /tests \{/);
  assert.match(content, /expect\(res.status\)\.to.equal\(200\)/);

  const loaded = await requestBuilder.loadRequest(bruFilePath);
  assert.equal(loaded.http.url, '{{baseUrl}}/users/{{id}}');
  assert.equal(loaded.auth?.type, 'bearer');
  assert.equal(loaded.body?.type, 'json');
  assert.ok(loaded.tests?.exec.some((line) => line.includes('status is 200')));
});

test('createRequest supports form-urlencoded bodies and digest auth', async () => {
  const rootPath = await import('node:fs/promises').then(({ mkdtemp }) =>
    mkdtemp(join(tmpdir(), 'bruno-request-')),
  );
  const collectionManager = createCollectionManager();
  const requestBuilder = createRequestBuilder();

  const collection = await collectionManager.createCollection({
    name: 'request-auth-tests',
    outputPath: rootPath,
  });

  assert.equal(collection.success, true);
  const collectionPath = collection.path as string;

  const created = await requestBuilder.createRequest({
    collectionPath,
    name: 'Create Session',
    method: 'POST',
    url: 'https://example.com/sessions',
    body: {
      type: 'form-urlencoded',
      formUrlEncoded: [
        { name: 'username', value: '{{username}}' },
        { name: 'password', value: '{{password}}' },
      ],
    },
    auth: {
      type: 'digest',
      config: {
        username: '{{username}}',
        password: '{{password}}',
      },
    },
  });

  assert.equal(created.success, true);

  const loaded = await requestBuilder.loadRequest(created.path as string);
  assert.equal(loaded.body?.type, 'form-urlencoded');
  assert.equal(loaded.body?.formUrlEncoded?.length, 2);
  assert.equal(loaded.auth?.type, 'digest');
  assert.equal(loaded.auth?.digest?.username, '{{username}}');
});

test('createRequest supports GraphQL requests and preserves variables', async () => {
  const rootPath = await import('node:fs/promises').then(({ mkdtemp }) =>
    mkdtemp(join(tmpdir(), 'bruno-request-')),
  );
  const collectionManager = createCollectionManager();
  const requestBuilder = createRequestBuilder();

  const collection = await collectionManager.createCollection({
    name: 'request-graphql-tests',
    outputPath: rootPath,
  });

  assert.equal(collection.success, true);
  const collectionPath = collection.path as string;

  const created = await requestBuilder.createRequest({
    collectionPath,
    name: 'List Users',
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

  assert.equal(created.success, true);

  const content = await readFile(created.path as string, 'utf8');
  assert.match(content, /body:graphql \{/);
  assert.match(content, /body:graphql:vars \{/);

  const loaded = await requestBuilder.loadRequest(created.path as string);
  assert.equal(loaded.body?.type, 'graphql');
  assert.match(loaded.body?.content || '', /query ListUsers/);
  assert.equal(loaded.body?.variables, '{\n  "limit": 5\n}');
});

test('createRequest rejects invalid GraphQL variables JSON', async () => {
  const rootPath = await import('node:fs/promises').then(({ mkdtemp }) =>
    mkdtemp(join(tmpdir(), 'bruno-request-')),
  );
  const collectionManager = createCollectionManager();
  const requestBuilder = createRequestBuilder();

  const collection = await collectionManager.createCollection({
    name: 'request-graphql-invalid',
    outputPath: rootPath,
  });

  assert.equal(collection.success, true);

  const result = await requestBuilder.createRequest({
    collectionPath: collection.path as string,
    name: 'Invalid GraphQL Request',
    method: 'POST',
    url: '{{baseUrl}}/graphql',
    body: {
      type: 'graphql',
      content: 'query Invalid { users { id } }',
      variables: '{ invalid json }',
    },
  });

  assert.equal(result.success, false);
  assert.match(result.error || '', /GraphQL variables must be valid JSON/);
});

test('createRequest supports binary request bodies', async () => {
  const rootPath = await import('node:fs/promises').then(({ mkdtemp }) =>
    mkdtemp(join(tmpdir(), 'bruno-request-')),
  );
  const collectionManager = createCollectionManager();
  const requestBuilder = createRequestBuilder();

  const collection = await collectionManager.createCollection({
    name: 'request-binary-tests',
    outputPath: rootPath,
  });

  assert.equal(collection.success, true);
  const collectionPath = collection.path as string;
  const payloadPath = join(rootPath, 'payload.bin');
  await writeFile(payloadPath, Buffer.from([0x00, 0x01, 0x02, 0xff]));

  const created = await requestBuilder.createRequest({
    collectionPath,
    name: 'Upload Artifact',
    method: 'POST',
    url: '{{baseUrl}}/binary',
    body: {
      type: 'binary',
      filePath: payloadPath,
      contentType: 'application/octet-stream',
    },
  });

  assert.equal(created.success, true);

  const content = await readFile(created.path as string, 'utf8');
  assert.match(content, /body:file \{/);
  assert.match(content, /@file\(/);
  assert.match(content, /@contentType\(application\/octet-stream\)/);

  const loaded = await requestBuilder.loadRequest(created.path as string);
  assert.equal(loaded.body?.type, 'binary');
  assert.equal(loaded.body?.filePath, payloadPath);
  assert.equal(loaded.body?.contentType, 'application/octet-stream');
});
