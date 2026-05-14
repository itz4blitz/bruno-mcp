import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
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
  await mkdir(join(collection.path as string, 'users'), { recursive: true });
  await writeFile(
    join(collection.path as string, 'users/create-user.bru'),
    'meta {\n  name: create-user\n}\n',
  );

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

test('RunnerDataManager validates manifests against collection files', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-runner-data-'));
  const collection = await createCollectionManager().createCollection({
    name: 'runner-data-manifest-api',
    outputPath: rootPath,
  });
  assert.equal(collection.success, true);

  const collectionPath = collection.path as string;
  await mkdir(join(collectionPath, 'users'), { recursive: true });
  await writeFile(
    join(collectionPath, 'users/create-user.bru'),
    'meta {\n  name: create-user\n}\n',
  );
  await mkdir(join(collectionPath, 'runner-data'), { recursive: true });
  await writeFile(
    join(collectionPath, 'runner-data/users.json'),
    `${JSON.stringify(
      [
        { email: 'min@example.com', name: 'Min' },
        { email: 'max@example.com', name: '' },
      ],
      null,
      2,
    )}\n`,
  );

  const manifestPath = join(collectionPath, 'runner-data/run-manifest.json');
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        collectionPath,
        dataFiles: [
          {
            commandOption: '--json-file-path',
            fields: ['email'],
            format: 'json',
            path: 'runner-data/users.json',
            requestPaths: ['users/create-user.bru'],
            requiredFields: ['email', 'name'],
            rowCount: 1,
          },
          {
            commandOption: '--json-file-path',
            fields: ['email'],
            format: 'csv',
            path: 'runner-data/missing.csv',
            requestPaths: ['users/missing.bru'],
            requiredFields: ['accountId'],
            rowCount: 1,
          },
          {
            commandOption: '--json-file-path',
            fields: ['email'],
            format: 'json',
            path: '../escaped.json',
            requestPaths: ['../escaped.bru'],
            requiredFields: [],
            rowCount: 1,
          },
        ],
        version: 1,
      },
      null,
      2,
    )}\n`,
  );

  const validation = await createRunnerDataManager().validateManifest(manifestPath);
  assert.equal(validation.valid, false);

  const errors = validation.errors.join('\n');
  assert.match(errors, /dataFiles\[0\]\.rowCount must match actual row count 2\./);
  assert.match(errors, /dataFiles\[0\]\.fields must match actual fields: email, name\./);
  assert.match(errors, /dataFiles\[0\]\.requiredFields\[1\] "name" is empty in row 2\./);
  assert.match(
    errors,
    /dataFiles\[1\]\.commandOption must be --csv-file-path for csv data files\./,
  );
  assert.match(errors, /dataFiles\[1\]\.path does not exist/);
  assert.match(errors, /dataFiles\[1\]\.requestPaths\[0\] does not exist/);
  assert.match(
    errors,
    /dataFiles\[1\]\.requiredFields\[0\] "accountId" is not present in fields\./,
  );
  assert.match(errors, /dataFiles\[2\]\.path escapes collection root/);
  assert.match(errors, /dataFiles\[2\]\.requestPaths\[0\] escapes collection root/);
});

test('RunnerDataManager reports missing manifest collection roots without throwing', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-runner-data-'));
  const manifestPath = join(rootPath, 'run-manifest.json');
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        collectionPath: join(rootPath, 'missing-collection'),
        dataFiles: [],
        version: 1,
      },
      null,
      2,
    )}\n`,
  );

  const validation = await createRunnerDataManager().validateManifest(manifestPath);
  assert.equal(validation.valid, false);
  assert.match(
    validation.errors.join('\n'),
    /Manifest collectionPath does not load as a Bruno collection/,
  );
});
