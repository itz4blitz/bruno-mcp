import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createCollectionManager } from '../../src/bruno/collection.js';
import { createBrunoNativeManager } from '../../src/bruno/native.js';
import { createSecretManager } from '../../src/bruno/secrets.js';

test('BrunoNativeManager writes vars:secret environment entries', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-secrets-'));
  const collection = await createCollectionManager().createCollection({
    name: 'secret-api',
    outputPath: rootPath,
  });
  assert.equal(collection.success, true);

  const nativeManager = createBrunoNativeManager();
  const result = await nativeManager.createEnvironment(
    collection.path as string,
    'local',
    { baseUrl: 'http://localhost:3000' },
    { secretVariables: ['API_TOKEN'] },
  );

  assert.equal(result.success, true);
  const content = await readFile(result.path as string, 'utf8');
  assert.match(content, /vars \{/);
  assert.match(content, /baseUrl: http:\/\/localhost:3000/);
  assert.match(content, /vars:secret \[/);
  assert.match(content, /API_TOKEN/);

  const summary = await nativeManager.getEnvironmentSummary(collection.path as string, 'local');
  assert.deepEqual(summary.secretVariables, ['API_TOKEN']);
  assert.equal(summary.variables.baseUrl, 'http://localhost:3000');
});

test('SecretManager configures dotenv-backed secrets without committing secret values', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-secrets-'));
  const collection = await createCollectionManager().createCollection({
    name: 'dotenv-api',
    outputPath: rootPath,
  });
  assert.equal(collection.success, true);

  const result = await createSecretManager().configureCollectionSecrets({
    collectionPath: collection.path as string,
    environmentName: 'local',
    processEnvVariables: ['API_TOKEN', 'CLIENT_SECRET'],
    sampleValues: { API_TOKEN: '', CLIENT_SECRET: '' },
    updateGitignore: true,
  });

  assert.equal(result.success, true);
  assert.match(
    await readFile(join(collection.path as string, '.env.sample'), 'utf8'),
    /API_TOKEN=/,
  );
  assert.match(await readFile(join(collection.path as string, '.gitignore'), 'utf8'), /^\.env$/m);

  const env = await createBrunoNativeManager().getEnvironmentSummary(
    collection.path as string,
    'local',
  );
  assert.equal(env.variables.API_TOKEN, "{{process.env['API_TOKEN']}}");
  assert.equal(env.variables.CLIENT_SECRET, "{{process.env['CLIENT_SECRET']}}");
});
