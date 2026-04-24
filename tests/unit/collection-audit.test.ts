import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createCollectionAuditManager } from '../../src/bruno/collection-audit.js';
import { createCollectionManager } from '../../src/bruno/collection.js';
import { createBrunoNativeManager } from '../../src/bruno/native.js';
import { createRequestBuilder } from '../../src/bruno/request.js';

test('CollectionAuditManager classifies inherited shallow coverage and deep request tests truthfully', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-audit-'));
  const collectionManager = createCollectionManager();
  const nativeManager = createBrunoNativeManager();
  const requestBuilder = createRequestBuilder();
  const auditManager = createCollectionAuditManager(nativeManager);

  const collection = await collectionManager.createCollection({
    name: 'audit-tests',
    outputPath: rootPath,
  });

  assert.equal(collection.success, true);
  const collectionPath = collection.path as string;

  const defaultsResult = await nativeManager.updateCollectionDefaults(collectionPath, {
    tests:
      'test("response status is successful", function () { expect(res.getStatus()).to.be.oneOf([200, 201, 202, 204]); });\n' +
      'test("response is not an HTML error page", function () { const contentType = String(res.getHeader("content-type") || "").toLowerCase(); expect(contentType).to.not.contain("text/html"); });',
  });
  assert.equal(defaultsResult.success, true);

  const usersFolder = await nativeManager.createFolder(collectionPath, 'users');
  assert.equal(usersFolder.success, true);

  const getUser = await requestBuilder.createRequest({
    collectionPath,
    folder: 'users',
    method: 'GET',
    name: 'Get User',
    url: '{{baseUrl}}/users/{{id}}',
  });
  assert.equal(getUser.success, true);

  const getUserCopy = await requestBuilder.createRequest({
    collectionPath,
    folder: 'users',
    method: 'GET',
    name: 'Get User Copy',
    url: '{{baseUrl}}/users/{{id}}',
  });
  assert.equal(getUserCopy.success, true);

  const updateUser = await requestBuilder.createRequest({
    collectionPath,
    folder: 'users',
    method: 'PUT',
    name: 'Update User',
    url: '{{baseUrl}}/users/{{userId}}',
    body: {
      type: 'json',
      content: '{\n  "effectiveDate": "YYYY-MM-DD",\n  "name": "Updated User"\n}',
    },
  });
  assert.equal(updateUser.success, true);

  const updateUserTests = await requestBuilder.addTestScript({
    bruFilePath: updateUser.path as string,
    scriptType: 'tests',
    script: `test("updates return persisted entity", function () {
  expect(res.getStatus()).to.equal(200);
  const body = res.getBody();
  expect(body).to.have.property("id");
  expect(body).to.have.property("name");
  bru.setVar("userId", String(body.id));
});`,
  });
  assert.equal(updateUserTests.success, true);

  const updateUserDocs = await nativeManager.updateRequest(updateUser.path as string, {
    docs: 'Updates a user using a live user identifier and verifies the returned projection.',
  });
  assert.equal(updateUserDocs.success, true);

  const report = await auditManager.auditCollection(collectionPath, {
    includeRequests: true,
  });

  assert.equal(report.summary.totalRequests, 3);
  assert.equal(report.summary.shallowRequests, 2);
  assert.equal(report.summary.deepRequests, 1);
  assert.equal(report.summary.literalPlaceholderRequests, 1);
  assert.equal(report.summary.duplicateEndpointGroups, 1);

  const getUserSummary = report.requests?.find((request) => request.name === 'Get User');
  assert.ok(getUserSummary);
  assert.equal(getUserSummary?.depth, 'shallow');
  assert.ok(getUserSummary?.issues.includes('baseline-only-tests'));
  assert.ok(getUserSummary?.issues.includes('generic-id-variable'));

  const updateUserSummary = report.requests?.find((request) => request.name === 'Update User');
  assert.ok(updateUserSummary);
  assert.equal(updateUserSummary?.depth, 'deep');
  assert.equal(updateUserSummary?.docsPresent, true);
  assert.ok(updateUserSummary?.issues.includes('literal-placeholders'));

  assert.ok(
    report.findings.some((finding) =>
      finding.message.includes('Duplicate endpoint coverage for GET {{baseUrl}}/users/{{id}}'),
    ),
  );
});
