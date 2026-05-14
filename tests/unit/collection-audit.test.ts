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

test('CollectionAuditManager does not flag intentional scenario matrices as duplicate endpoint coverage', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-audit-matrix-'));
  const collectionManager = createCollectionManager();
  const nativeManager = createBrunoNativeManager();
  const requestBuilder = createRequestBuilder();
  const auditManager = createCollectionAuditManager(nativeManager);

  const collection = await collectionManager.createCollection({
    name: 'audit-matrix-tests',
    outputPath: rootPath,
  });

  assert.equal(collection.success, true);
  const collectionPath = collection.path as string;

  const baseTests = `test("status is asserted", function () {
  expect(res.getStatus()).to.equal(400);
});

test("error body is asserted", function () {
  const body = res.getBody();
  expect(body).to.have.property("error");
});`;
  const baseTestLines = baseTests.split('\n');

  const missingName = await requestBuilder.createRequest({
    body: {
      content: '{\n  "email": "person@example.test"\n}',
      type: 'json',
    },
    collectionPath,
    method: 'POST',
    name: 'Create User Missing Name',
    tests: baseTestLines,
    url: '{{baseUrl}}/users',
  });
  assert.equal(missingName.success, true);

  const missingEmail = await requestBuilder.createRequest({
    body: {
      content: '{\n  "name": "Person"\n}',
      type: 'json',
    },
    collectionPath,
    method: 'POST',
    name: 'Create User Missing Email',
    tests: baseTestLines,
    url: '{{baseUrl}}/users',
  });
  assert.equal(missingEmail.success, true);

  const report = await auditManager.auditCollection(collectionPath, {
    includeRequests: true,
  });

  assert.equal(report.summary.totalRequests, 2);
  assert.equal(report.summary.duplicateEndpointGroups, 0);
  assert.deepEqual(report.duplicateEndpoints, []);
  assert.equal(
    report.findings.some((finding) => finding.category === 'duplication'),
    false,
  );
});

test('CollectionAuditManager separates weak semantic oracles from parity findings', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-audit-semantic-risk-'));
  const collectionManager = createCollectionManager();
  const nativeManager = createBrunoNativeManager();
  const requestBuilder = createRequestBuilder();
  const auditManager = createCollectionAuditManager(nativeManager);

  const collection = await collectionManager.createCollection({
    name: 'audit-semantic-risks',
    outputPath: rootPath,
  });

  assert.equal(collection.success, true);
  const collectionPath = collection.path as string;

  const gatewayNegative = await requestBuilder.createRequest({
    collectionPath,
    method: 'GET',
    name: 'Gateway Missing Bearer',
    tests: `test("missing bearer is rejected", function () {
  expect([401, 403], "status").to.include(res.getStatus());
  expect(JSON.stringify(res.getBody())).to.not.contain("@odata.context");
});`.split('\n'),
    url: '{{baseUrl}}/Patients',
  });
  assert.equal(gatewayNegative.success, true);

  const emulatorGap = await requestBuilder.createRequest({
    body: {
      content: '{\n  "name": "Upload"\n}',
      type: 'json',
    },
    collectionPath,
    method: 'POST',
    name: 'Enterprise Upload Usage Plan Gap',
    tests: `test("enterprise upload usage-plan behavior is observed", function () {
  if ([403, 429].includes(res.getStatus())) return;
  expect(res.getStatus()).to.equal(200);
  expect(res.getBody()).to.have.property("presignedUrl");
});`.split('\n'),
    url: '{{baseUrl}}/file/upload',
  });
  assert.equal(emulatorGap.success, true);

  const emulatorGapDocs = await nativeManager.updateRequest(emulatorGap.path as string, {
    docs: 'LocalStack usage-plan emulator gap: AWS should block this upload, but LocalStack may allow it.',
  });
  assert.equal(emulatorGapDocs.success, true);

  const report = await auditManager.auditCollection(collectionPath, {
    includeRequests: true,
  });

  assert.equal(report.summary.totalRequests, 2);
  assert.equal(report.summary.semanticRiskFindings, 4);
  assert.equal(report.summary.semanticRiskScore, 75);
  assert.equal(report.summary.parityRiskFindings, 2);
  assert.equal(report.summary.parityRiskScore, 93);
  assert.equal(report.summary.enterpriseReadinessScore < 100, true);

  const missingBearer = report.requests?.find(
    (request) => request.name === 'Gateway Missing Bearer',
  );
  assert.ok(missingBearer);
  assert.ok(missingBearer.semanticRisks.some((risk) => risk.kind === 'broad-status-oracle'));

  const uploadGap = report.requests?.find(
    (request) => request.name === 'Enterprise Upload Usage Plan Gap',
  );
  assert.ok(uploadGap);
  assert.ok(uploadGap.semanticRisks.some((risk) => risk.kind === 'mixed-success-failure-oracle'));
  assert.ok(uploadGap.semanticRisks.some((risk) => risk.kind === 'conditional-oracle'));
  assert.ok(uploadGap.parityRisks.some((risk) => risk.kind === 'emulator-gap'));
  assert.ok(uploadGap.parityRisks.some((risk) => risk.kind === 'known-gap-or-stub'));
});

test('CollectionAuditManager classifies parity ownership for defects, seed gaps, and stubs', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-audit-parity-ownership-'));
  const collectionManager = createCollectionManager();
  const nativeManager = createBrunoNativeManager();
  const requestBuilder = createRequestBuilder();
  const auditManager = createCollectionAuditManager(nativeManager);

  const collection = await collectionManager.createCollection({
    name: 'audit-parity-ownership',
    outputPath: rootPath,
  });

  assert.equal(collection.success, true);
  const collectionPath = collection.path as string;
  const tests = `test("status and explicit finding are asserted", function () {
  expect(res.getStatus()).to.equal(200);
  expect(JSON.stringify(res.getBody())).to.contain("finding");
});`.split('\n');

  const productDefectRequest = await requestBuilder.createRequest({
    collectionPath,
    method: 'GET',
    name: 'Stale Route Product Defect',
    tests,
    url: '{{baseUrl}}/document',
  });
  assert.equal(productDefectRequest.success, true);
  assert.equal(
    (
      await nativeManager.updateRequest(productDefectRequest.path as string, {
        docs: 'Known product/infra defect: a stale deployed route is intentionally asserted so release gates can fail until configuration is fixed.',
        tags: ['product-defect', 'infra-defect', 'route-gap'],
      })
    ).success,
    true,
  );

  const seedGapRequest = await requestBuilder.createRequest({
    collectionPath,
    method: 'POST',
    name: 'Post Delete Seed Gap',
    tests,
    url: '{{baseUrl}}/scenarios/delete',
  });
  assert.equal(seedGapRequest.success, true);
  assert.equal(
    (
      await nativeManager.updateRequest(seedGapRequest.path as string, {
        docs: 'Seed data gap: the handler path is covered, but a post-delete seed state is still required to prove the full business invariant.',
        tags: ['seed-data-gap', 'coverage-gap'],
      })
    ).success,
    true,
  );

  const externalStubRequest = await requestBuilder.createRequest({
    collectionPath,
    method: 'POST',
    name: 'External Stubbed Dependency',
    tests,
    url: '{{baseUrl}}/scenarios/cancel',
  });
  assert.equal(externalStubRequest.success, true);
  assert.equal(
    (
      await nativeManager.updateRequest(externalStubRequest.path as string, {
        docs: 'External dependency stub: dispatch is covered, but the downstream cancel API is stubbed until a real local dependency exists.',
        tags: ['external-dependency-stub', 'stubbed'],
      })
    ).success,
    true,
  );

  const report = await auditManager.auditCollection(collectionPath, {
    includeRequests: true,
  });

  assert.equal(report.summary.productDefectFindings, 1);
  assert.equal(report.summary.seedDataGapFindings, 1);
  assert.equal(report.summary.externalStubFindings, 1);

  const productDefect = report.requests?.find(
    (request) => request.name === 'Stale Route Product Defect',
  );
  assert.ok(productDefect);
  assert.ok(productDefect.parityRisks.some((risk) => risk.kind === 'product-infra-defect'));

  const seedGap = report.requests?.find((request) => request.name === 'Post Delete Seed Gap');
  assert.ok(seedGap);
  assert.ok(seedGap.parityRisks.some((risk) => risk.kind === 'seed-data-gap'));

  const externalStub = report.requests?.find(
    (request) => request.name === 'External Stubbed Dependency',
  );
  assert.ok(externalStub);
  assert.ok(externalStub.parityRisks.some((risk) => risk.kind === 'external-dependency-stub'));
});

test('CollectionAuditManager scores documentation depth beyond docs presence', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-audit-doc-depth-'));
  const collectionManager = createCollectionManager();
  const nativeManager = createBrunoNativeManager();
  const requestBuilder = createRequestBuilder();
  const auditManager = createCollectionAuditManager(nativeManager);

  const collection = await collectionManager.createCollection({
    name: 'audit-doc-depth',
    outputPath: rootPath,
  });

  assert.equal(collection.success, true);
  const collectionPath = collection.path as string;
  const tests = `test("status and body shape are asserted", function () {
  expect(res.getStatus()).to.equal(200);
  const body = res.getBody();
  expect(body).to.have.property("value");
  expect(body.value).to.be.an("array");
});`.split('\n');

  const placeholderDocs = await requestBuilder.createRequest({
    collectionPath,
    method: 'GET',
    name: 'Placeholder Docs Request',
    tests,
    url: '{{baseUrl}}/placeholder-docs',
  });
  assert.equal(placeholderDocs.success, true);
  assert.equal(
    (
      await nativeManager.updateRequest(placeholderDocs.path as string, {
        docs: 'TODO: add docs',
      })
    ).success,
    true,
  );

  const decisionDocs = await requestBuilder.createRequest({
    collectionPath,
    method: 'GET',
    name: 'Decision Docs Request',
    tests,
    url: '{{baseUrl}}/decision-docs',
  });
  assert.equal(decisionDocs.success, true);
  assert.equal(
    (
      await nativeManager.updateRequest(decisionDocs.path as string, {
        docs: 'Coverage decision: this request validates the list contract because the endpoint is used as a seed source of truth. A failure means later key and OData scenarios cannot safely assume runtime IDs were discovered through the public API.',
      })
    ).success,
    true,
  );

  const report = await auditManager.auditCollection(collectionPath, {
    includeRequests: true,
  });

  assert.equal(report.summary.totalRequests, 2);
  assert.equal(report.summary.docsPresentRequests, 2);
  assert.equal(report.summary.docsMeaningfulRequests, 1);
  assert.equal(report.summary.docsDecisionGradeRequests, 1);
  assert.equal(report.summary.docsThinRequests, 1);
  assert.equal(report.summary.docsDepthScore, 55);
  assert.equal(report.summary.enterpriseReadinessScore < 100, true);

  const placeholder = report.requests?.find(
    (request) => request.name === 'Placeholder Docs Request',
  );
  assert.ok(placeholder);
  assert.equal(placeholder.documentation.quality, 'placeholder');
  assert.ok(placeholder.issues.includes('placeholder-docs'));
  assert.ok(placeholder.issues.includes('assertion-depth-incomplete'));

  const decision = report.requests?.find((request) => request.name === 'Decision Docs Request');
  assert.ok(decision);
  assert.equal(decision.documentation.quality, 'decision-grade');
  assert.equal(decision.assertionDepth.missingRequired.includes('docs'), false);
});

test('CollectionAuditManager requires executable evidence for perfect assertion depth', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-audit-executable-depth-'));
  const collectionManager = createCollectionManager();
  const nativeManager = createBrunoNativeManager();
  const requestBuilder = createRequestBuilder();
  const auditManager = createCollectionAuditManager(nativeManager);

  const collection = await collectionManager.createCollection({
    name: 'audit-executable-depth',
    outputPath: rootPath,
  });

  assert.equal(collection.success, true);
  const collectionPath = collection.path as string;

  const weakRequest = await requestBuilder.createRequest({
    collectionPath,
    method: 'GET',
    name: 'Get Seed Projection With Content Type Schema Fields Query Semantics Business Semantics',
    tests: `test("status is successful", function () {
  expect(res.getStatus()).to.equal(200);
});`.split('\n'),
    url: '{{baseUrl}}/users?$select=id,name&$top=1',
  });
  assert.equal(weakRequest.success, true);
  assert.equal(
    (
      await nativeManager.updateRequest(weakRequest.path as string, {
        docs: 'Coverage decision: this request validates content-type, response shape, schema fields, query semantics, seed identity, business semantics, side effects, no unexpected side effects, negative envelope, and variable capture because those labels document the intended contract and known LocalStack emulator gap parity interpretation.',
        tags: [
          'schema-fields',
          'query-semantics',
          'seed-identity',
          'business-semantics',
          'variable-capture',
          'no-unexpected-side-effects',
        ],
      })
    ).success,
    true,
  );

  const report = await auditManager.auditCollection(collectionPath, {
    includeRequests: true,
  });

  const weakSummary = report.requests?.find(
    (request) => request.url === '{{baseUrl}}/users?$select=id,name&$top=1',
  );
  assert.ok(weakSummary);
  assert.equal(weakSummary.documentation.quality, 'decision-grade');
  assert.ok(weakSummary.parityRisks.some((risk) => risk.kind === 'emulator-gap'));
  assert.equal(weakSummary.assertionDepth.percent < 100, true);
  assert.ok(weakSummary.issues.includes('assertion-depth-incomplete'));
  assert.deepEqual(
    weakSummary.assertionDepth.dimensions
      .filter((dimension) => dimension.present && dimension.key !== 'docs')
      .map((dimension) => dimension.key),
    ['status'],
  );
  assert.equal(report.summary.assertionPerfectRequests, 0);
  assert.equal(report.summary.parityRiskFindings, 1);
});
