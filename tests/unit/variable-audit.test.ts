import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createCollectionManager } from '../../src/bruno/collection.js';
import { createBrunoNativeManager } from '../../src/bruno/native.js';
import { createRequestBuilder } from '../../src/bruno/request.js';
import { createVariableAuditManager } from '../../src/bruno/variable-audit.js';

test('VariableAuditManager classifies Desktop-ready, runtime-only, process, prompt, and missing variables', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-variable-audit-'));
  const collectionManager = createCollectionManager();
  const nativeManager = createBrunoNativeManager();
  const requestBuilder = createRequestBuilder();
  const auditManager = createVariableAuditManager(nativeManager);

  const collection = await collectionManager.createCollection({
    name: 'variable-audit',
    outputPath: rootPath,
  });
  assert.equal(collection.success, true);
  const collectionPath = collection.path as string;

  await nativeManager.createEnvironment(collectionPath, 'Local', {
    baseUrl: 'http://localhost:3000',
  });
  await nativeManager.updateCollectionDefaults(collectionPath, {
    preRequestVars: { authToken: 'abc123' },
  });
  await nativeManager.createFolder(collectionPath, 'users', {
    preRequestVars: { folderKey: 'folder-value' },
  });

  const request = await requestBuilder.createRequest({
    collectionPath,
    folder: 'users',
    headers: {
      Authorization: 'Bearer {{authToken}}',
      'X-Folder-Key': '{{folderKey}}',
      'X-Missing': '{{missingVar}}',
      'X-Process': "{{process.env['API_TOKEN']}}",
      'X-Prompt': '{{?API token}}',
      'X-Runtime': '{{runtimeOnly}}',
    },
    method: 'GET',
    name: 'List Users',
    url: '{{baseUrl}}/users/{{requestKey}}',
  });
  assert.equal(request.success, true);

  await nativeManager.updateRequest(request.path as string, {
    postResponseScript: "bru.setVar('runtimeOnly', 'resolved-during-run');",
    preRequestVars: { requestKey: 'request-value' },
  });

  const report = await auditManager.auditCollection(collectionPath);
  assert.equal(report.summary.missingReferences, 1);
  assert.deepEqual(report.summary.uniqueMissingVariables, ['missingVar']);

  const byName = new Map(report.references.map((reference) => [reference.name, reference]));
  assert.ok(byName.get('baseUrl')?.sourceTypes.includes('environment'));
  assert.ok(byName.get('authToken')?.sourceTypes.includes('collection'));
  assert.ok(byName.get('folderKey')?.sourceTypes.includes('folder'));
  assert.ok(byName.get('requestKey')?.sourceTypes.includes('request'));
  assert.deepEqual(byName.get('runtimeOnly')?.sourceTypes, ['runtime']);
  assert.equal(byName.get('runtimeOnly')?.directRequestReady, false);
  assert.deepEqual(byName.get('API_TOKEN')?.sourceTypes, ['process-env']);
  assert.deepEqual(byName.get('API token')?.sourceTypes, ['prompt']);
});
