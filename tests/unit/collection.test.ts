import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createCollectionManager } from '../../src/bruno/collection.js';
import { createRequestBuilder } from '../../src/bruno/request.js';

test('listCollections finds nested collections and README uses bru run', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-collections-'));
  const collectionManager = createCollectionManager();

  const topLevel = await collectionManager.createCollection({
    name: 'top-level',
    outputPath: rootPath,
  });
  const nested = await collectionManager.createCollection({
    name: 'nested-api',
    outputPath: join(rootPath, 'services'),
  });

  assert.equal(topLevel.success, true);
  assert.equal(nested.success, true);

  const readme = await readFile(join(topLevel.path as string, 'README.md'), 'utf8');
  assert.match(readme, /bru run/);
  assert.doesNotMatch(readme, /bruno-cli run/);

  const collections = await collectionManager.listCollections(rootPath);
  assert.deepEqual(
    collections.map((collection) => collection.name),
    ['nested-api', 'top-level'],
  );
});

test('getCollectionStats counts request methods', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-stats-'));
  const collectionManager = createCollectionManager();
  const requestBuilder = createRequestBuilder();

  const collection = await collectionManager.createCollection({
    name: 'stats-api',
    outputPath: rootPath,
  });

  assert.equal(collection.success, true);
  const collectionPath = collection.path as string;

  await requestBuilder.createRequest({
    collectionPath,
    name: 'List Widgets',
    method: 'GET',
    url: '{{baseUrl}}/api/widgets',
    folder: 'widgets',
  });

  await requestBuilder.createRequest({
    collectionPath,
    name: 'Create Widget',
    method: 'POST',
    url: '{{baseUrl}}/api/widgets',
    body: {
      type: 'json',
      content: '{\n  "name": "Widget"\n}',
    },
    folder: 'widgets',
  });

  const stats = await collectionManager.getCollectionStats(collectionPath);
  assert.equal(stats.totalRequests, 2);
  assert.deepEqual(stats.requestsByMethod, {
    GET: 1,
    POST: 1,
  });
  assert.deepEqual(stats.folders, ['widgets']);
});
