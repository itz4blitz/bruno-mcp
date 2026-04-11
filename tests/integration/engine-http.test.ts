import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createCollectionManager } from '../../src/bruno/collection.js';
import { createEnvironmentManager } from '../../src/bruno/environment.js';
import { createEngineHttpServer } from '../../src/engine-http/server.js';
import { createTestServer } from '../helpers/http-server.js';

test('Engine HTTP server exposes versioned Premier-friendly endpoints', async (t) => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-engine-http-'));
  const collectionManager = createCollectionManager();
  const collectionResult = await collectionManager.createCollection({
    name: 'engine-api',
    outputPath: rootPath,
  });
  assert.equal(collectionResult.success, true);

  const collectionPath = join(rootPath, 'engine-api');
  const contractPath = join(process.cwd(), 'tests', 'fixtures', 'contracts', 'branch', 'openapi.json');
  const token = 'test-token';
  const server = createEngineHttpServer({ host: '127.0.0.1', port: 0, token });
  const address = await server.start();
  t.after(async () => {
    await server.stop();
  });

  const baseUrl = `http://${address.host}:${address.port}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };

  const healthResponse = await fetch(`${baseUrl}/engine/health`);
  assert.equal(healthResponse.status, 200);
  const health = (await healthResponse.json()) as {
    data: { status: string };
    engineVersion: string;
    runtime: string;
    schemaVersion: number;
  };
  assert.equal(health.data.status, 'ok');
  assert.equal(health.runtime, 'bruno');
  assert.equal(health.schemaVersion, 1);

  const versionResponse = await fetch(`${baseUrl}/engine/version`);
  assert.equal(versionResponse.status, 200);
  const version = (await versionResponse.json()) as {
    data: { engineVersion: string; schemaVersion: number; supportedSchemaVersions: number[] };
  };
  assert.equal(version.data.schemaVersion, 1);
  assert.ok(version.data.supportedSchemaVersions.includes(1));

  const unauthorizedResponse = await fetch(`${baseUrl}/engine/version`, {
    method: 'GET',
    headers: {
      authorization: 'Bearer wrong-token',
    },
  });
  assert.equal(unauthorizedResponse.status, 200);

  const mismatchResponse = await fetch(`${baseUrl}/engine/plan`, {
    body: JSON.stringify({
      collectionPath,
      featureName: 'Branch',
      featureType: 'resource-crud',
    }),
    headers: {
      ...headers,
      'x-bruno-schema-version': '999',
    },
    method: 'POST',
  });
  assert.equal(mismatchResponse.status, 409);

  const inspectContractResponse = await fetch(`${baseUrl}/engine/inspect-contract`, {
    body: JSON.stringify({ contractPath }),
    headers,
    method: 'POST',
  });
  assert.equal(inspectContractResponse.status, 200);
  const inspectContract = (await inspectContractResponse.json()) as {
    data: { controllers: Array<{ controllerName: string }> };
  };
  assert.ok(inspectContract.data.controllers.some((controller) => controller.controllerName === 'Branch'));

  const planResponse = await fetch(`${baseUrl}/engine/plan`, {
    body: JSON.stringify({
      collectionPath,
      controllerContractPath: contractPath,
      featureName: 'Branch',
      featureType: 'resource-crud',
      strictMode: true,
    }),
    headers,
    method: 'POST',
  });
  assert.equal(planResponse.status, 200);
  const plan = (await planResponse.json()) as {
    data: {
      artifacts: { manifestPath: string };
      plan: { coreRequests: Array<{ action: string }>; sliceId: string };
    };
  };
  assert.equal(plan.data.plan.sliceId, 'branch');
  assert.ok(plan.data.plan.coreRequests.some((request) => request.action === 'update'));

  const scaffoldResponse = await fetch(`${baseUrl}/engine/scaffold`, {
    body: JSON.stringify({
      collectionPath,
      controllerContractPath: contractPath,
      featureName: 'Branch',
      featureType: 'resource-crud',
      strictMode: true,
    }),
    headers,
    method: 'POST',
  });
  assert.equal(scaffoldResponse.status, 200);
  const scaffold = (await scaffoldResponse.json()) as {
    data: { artifacts: { runManifestPath: string; supportGraphPath: string }; scaffold: { createdRequests: string[] } };
  };
  assert.ok(scaffold.data.scaffold.createdRequests.length > 0);

  const validateResponse = await fetch(`${baseUrl}/engine/validate`, {
    body: JSON.stringify({
      collectionPath,
      sliceId: 'branch',
    }),
    headers,
    method: 'POST',
  });
  assert.equal(validateResponse.status, 200);
  const validate = (await validateResponse.json()) as { data: { valid: boolean } };
  assert.equal(validate.data.valid, true);

  const inspectManifestResponse = await fetch(`${baseUrl}/engine/inspect-run-manifest`, {
    body: JSON.stringify({
      collectionPath,
      sliceId: 'branch',
    }),
    headers,
    method: 'POST',
  });
  const inspectManifest = (await inspectManifestResponse.json()) as {
    data: { manifest: { steps: Array<{ order: number }> } };
  };
  assert.ok(inspectManifest.data.manifest.steps.every((step) => typeof step.order === 'number'));

  const inspectSupportGraphResponse = await fetch(`${baseUrl}/engine/inspect-support-graph`, {
    body: JSON.stringify({
      collectionPath,
      sliceId: 'branch',
    }),
    headers,
    method: 'POST',
  });
  const inspectSupportGraph = (await inspectSupportGraphResponse.json()) as {
    data: { supportGraph: { nodes: Array<{ kind: string }> } };
  };
  assert.ok(inspectSupportGraph.data.supportGraph.nodes.some((node) => node.kind === 'support'));
});

test('Engine HTTP run endpoint returns structured artifacts and run report', async (t) => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-engine-run-'));
  const collectionManager = createCollectionManager();
  const environmentManager = createEnvironmentManager();
  const collectionResult = await collectionManager.createCollection({
    name: 'engine-run-api',
    outputPath: rootPath,
  });
  assert.equal(collectionResult.success, true);

  const collectionPath = join(rootPath, 'engine-run-api');
  await environmentManager.createEnvironment({
    collectionPath,
    name: 'test',
    variables: {
      baseUrl: 'http://127.0.0.1',
      password: 'demo',
      username: 'demo',
    },
  });

  const token = 'run-token';
  const server = createEngineHttpServer({ host: '127.0.0.1', port: 0, token });
  const address = await server.start();
  const api = await createTestServer();
  t.after(async () => {
    await server.stop();
    await api.close();
  });

  await environmentManager.updateEnvironment(collectionPath, 'test', {
    baseUrl: api.baseUrl,
    password: 'demo',
    username: 'demo',
  });

  const baseUrl = `http://${address.host}:${address.port}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };

  const scaffoldResponse = await fetch(`${baseUrl}/engine/scaffold`, {
    body: JSON.stringify({
      collectionPath,
      featureName: 'Users',
      featureType: 'resource-crud',
      includeMatrices: true,
      includeSupportRequests: true,
      strictMode: true,
    }),
    headers,
    method: 'POST',
  });
  assert.equal(scaffoldResponse.status, 200);

  const runResponse = await fetch(`${baseUrl}/engine/run`, {
    body: JSON.stringify({
      collectionPath,
      env: 'test',
      profile: 'full',
      sliceId: 'users',
    }),
    headers,
    method: 'POST',
  });
  assert.equal(runResponse.status, 200);
  const run = (await runResponse.json()) as {
    data: {
      artifacts: { coveragePath: string; runReportPath: string; runSummaryMarkdownPath: string };
      report: {
        exitStatus: string;
        passCount: number;
        productDefects: Array<{ failureReason?: { code: string } }>;
        stepResults: Array<{ failureReason?: { code: string }; name: string }>;
        totalSteps: number;
      };
    };
  };
  assert.equal(run.data.report.exitStatus, 'passed');
  assert.ok(run.data.report.passCount > 0);
  assert.ok(run.data.report.totalSteps > 0);
  assert.equal(typeof run.data.artifacts.runReportPath, 'string');
  assert.equal(typeof run.data.artifacts.coveragePath, 'string');
  assert.ok(Array.isArray(run.data.report.stepResults));
  assert.equal(run.data.report.productDefects.length, 0);
  assert.equal(typeof run.data.artifacts.runSummaryMarkdownPath, 'string');

  const runSummary = await readFile(run.data.artifacts.runSummaryMarkdownPath, 'utf8');
  assert.match(runSummary, /# Run Summary/);
  assert.match(runSummary, /users/i);
  assert.match(runSummary, /passed/i);

  const validateManifestResponse = await fetch(`${baseUrl}/engine/validate-run-manifest`, {
    body: JSON.stringify({
      collectionPath,
      sliceId: 'users',
    }),
    headers,
    method: 'POST',
  });
  assert.equal(validateManifestResponse.status, 200);
  const validateManifest = (await validateManifestResponse.json()) as {
    data: { artifacts: { artifactsManifestPath: string; supportGraphPath: string }; validation: { valid: boolean } };
  };
  assert.equal(validateManifest.data.validation.valid, true);
  assert.equal(typeof validateManifest.data.artifacts.supportGraphPath, 'string');
  assert.equal(typeof validateManifest.data.artifacts.artifactsManifestPath, 'string');

  const asyncRunResponse = await fetch(`${baseUrl}/engine/run`, {
    body: JSON.stringify({
      collectionPath,
      correlation: {
        projectId: 'project-123',
        requestId: 'request-456',
        runId: 'run-789',
      },
      env: 'test',
      mode: 'async',
      profile: 'support_only',
      sliceId: 'users',
    }),
    headers,
    method: 'POST',
  });
  assert.equal(asyncRunResponse.status, 202);
  const asyncRun = (await asyncRunResponse.json()) as {
    data: {
      artifacts: { artifactsManifestPath: string; runReportPath: string };
      correlation?: { jobId?: string };
      jobId: string;
      pollUrl: string;
      state: string;
    };
  };
  assert.equal(asyncRun.data.state, 'queued');
  assert.equal(typeof asyncRun.data.jobId, 'string');
  assert.equal(asyncRun.data.correlation?.jobId, asyncRun.data.jobId);
  assert.match(asyncRun.data.pollUrl, /\/engine\/run-status\?jobId=/);

  const pollUrl = new URL(asyncRun.data.pollUrl, baseUrl).toString();
  let asyncStatus: {
    data: {
      correlation?: { jobId?: string; projectId?: string };
      report?: { correlation?: { jobId?: string; projectId?: string }; exitStatus: string };
      state: string;
    };
  } | null = null;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const statusResponse = await fetch(pollUrl, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(statusResponse.status, 200);
    asyncStatus = (await statusResponse.json()) as { data: { report?: { exitStatus: string }; state: string } };
    if (asyncStatus.data.state === 'succeeded') {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(asyncStatus);
  assert.equal(asyncStatus!.data.state, 'succeeded');
  assert.equal(asyncStatus!.data.report?.exitStatus, 'passed');
  assert.equal(asyncStatus!.data.correlation?.jobId, asyncRun.data.jobId);
  assert.equal(asyncStatus!.data.report?.correlation?.projectId, 'project-123');

  const artifactsManifest = JSON.parse(
    await readFile(validateManifest.data.artifacts.artifactsManifestPath, 'utf8'),
  ) as { lastRun?: { correlation?: { projectId?: string }; profile: string; runSummaryMarkdownPath?: string } };
  assert.equal(artifactsManifest.lastRun?.profile, 'support_only');
  assert.equal(artifactsManifest.lastRun?.correlation?.projectId, 'project-123');
  assert.match(String(artifactsManifest.lastRun?.runSummaryMarkdownPath || ''), /run-summary\.md$/);
});
