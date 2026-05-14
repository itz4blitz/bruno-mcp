import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createCollectionManager } from '../../src/bruno/collection.js';
import { createRunnerDataManager } from '../../src/bruno/runner-data.js';

test('RunnerDataManager authors JSON data files and run manifests', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-runner-data-'));
  const collection = await createCollectionManager().createCollection({
    name: 'runner-data-api',
    outputPath: rootPath,
  });
  assert.equal(collection.success, true);

  const manager = createRunnerDataManager();
  const result = await manager.createDataFile({
    collectionPath: collection.path as string,
    filePath: 'runner-data/users.json',
    format: 'json',
    rows: [
      { email: 'min@example.com', expectedStatus: 201, name: 'Min' },
      { email: 'max@example.com', expectedStatus: 201, name: 'Max' },
    ],
    requiredFields: ['email', 'expectedStatus', 'name'],
    requestPaths: ['users/create-user.bru'],
    manifestPath: 'runner-data/run-manifest.json',
  });

  assert.equal(result.success, true);
  assert.equal(result.format, 'json');
  assert.equal(result.rowCount, 2);
  assert.match(result.runCommand, /--json-file-path runner-data\/users\.json/);

  const dataPath = result.path!;
  assert.equal(typeof dataPath, 'string');
  const dataFile = JSON.parse(await readFile(dataPath, 'utf8')) as unknown[];
  assert.equal(dataFile.length, 2);

  const manifestPath = result.manifestPath!;
  assert.equal(typeof manifestPath, 'string');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    dataFiles: Array<{ fields: string[]; requestPaths: string[]; rowCount: number }>;
  };
  assert.deepEqual(manifest.dataFiles[0]?.fields, ['email', 'expectedStatus', 'name']);
  assert.deepEqual(manifest.dataFiles[0]?.requestPaths, ['users/create-user.bru']);
  assert.equal(manifest.dataFiles[0]?.rowCount, 2);

  const validation = await manager.validateManifest(manifestPath);
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.errors, []);
});

test('RunnerDataManager validates CSV field completeness', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-runner-data-'));
  const collection = await createCollectionManager().createCollection({
    name: 'runner-data-csv-api',
    outputPath: rootPath,
  });
  assert.equal(collection.success, true);

  const manager = createRunnerDataManager();
  await assert.rejects(
    () =>
      manager.createDataFile({
        collectionPath: collection.path as string,
        filePath: 'runner-data/users.csv',
        format: 'csv',
        rows: [{ email: 'missing-name@example.com' }],
        requiredFields: ['email', 'name'],
      }),
    /missing required data-file field "name"/,
  );

  const result = await manager.createDataFile({
    collectionPath: collection.path as string,
    filePath: 'runner-data/users.csv',
    format: 'csv',
    rows: [
      { email: 'quoted@example.com', name: 'A, B' },
      { email: 'newline@example.com', name: 'Line\nBreak' },
    ],
    requiredFields: ['email', 'name'],
  });

  const csvPath = result.path!;
  assert.equal(typeof csvPath, 'string');
  const csv = await readFile(csvPath, 'utf8');
  assert.match(csv, /^email,name/m);
  assert.match(csv, /"A, B"/);
  assert.match(csv, /"Line\nBreak"/);
  assert.match(result.runCommand, /--csv-file-path runner-data\/users\.csv/);
});
