import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createTestServer } from '../helpers/http-server.js';
import { callToolText, createMcpTestClient } from '../helpers/mcp-client.js';

test('MCP server exposes feature-slice tools and slice resource', async (t) => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-mcp-feature-integration-'));
  const session = await createMcpTestClient();
  t.after(async () => {
    await session.close();
  });

  const tools = await session.client.listTools();
  assert.ok(tools.tools.some((tool) => tool.name === 'inspect_controller_contract'));
  assert.ok(tools.tools.some((tool) => tool.name === 'plan_feature_slice'));
  assert.ok(tools.tools.some((tool) => tool.name === 'scaffold_feature_slice'));
  assert.ok(tools.tools.some((tool) => tool.name === 'audit_feature_slice'));

  const collectionText = await callToolText(session.client, 'create_collection', {
    name: 'feature-api',
    outputPath: rootPath,
  });
  assert.match(collectionText, /Created Bruno collection/);

  const collectionPath = join(rootPath, 'feature-api');
  const branchContractPath = join(process.cwd(), 'tests', 'fixtures', 'contracts', 'branch', 'openapi.json');
  const server = await createTestServer();
  t.after(async () => {
    await server.close();
  });

  await callToolText(session.client, 'create_environment', {
    collectionPath,
    name: 'test',
    variables: {
      baseUrl: server.baseUrl,
      password: 'demo',
      username: 'demo',
    },
  });

  const branchContracts = JSON.parse(
    await callToolText(session.client, 'inspect_controller_contract', {
      contractPath: branchContractPath,
    }),
  ) as { controllers: Array<{ controllerName: string; operations: unknown[] }> };
  assert.ok(branchContracts.controllers.some((controller) => controller.controllerName === 'Branch'));

  const plan = JSON.parse(
    await callToolText(session.client, 'plan_feature_slice', {
      collectionPath,
      featureName: 'Users',
      featureType: 'resource-crud',
      overlay: 'raw-dto-overlay',
      strictMode: true,
    }),
  ) as {
    matrixes: Array<{ metadataFilePath: string; scenarioFilePath: string }>;
    overlayDetails: { id: string };
    sliceId: string;
    supportRequests: unknown[];
  };
  assert.equal(plan.sliceId, 'users');
  assert.equal(plan.matrixes.length, 2);
  assert.equal(plan.overlayDetails.id, 'raw-dto-overlay');
  assert.ok(plan.supportRequests.length >= 3);

  const overlayCompletion = await session.client.complete({
    argument: {
      name: 'overlay',
      value: 'raw',
    },
    ref: {
      name: 'build_feature_slice',
      type: 'ref/prompt',
    },
  });
  assert.ok(overlayCompletion.completion.values.includes('raw-dto-overlay'));

  const scaffold = JSON.parse(
    await callToolText(session.client, 'scaffold_feature_slice', {
      collectionPath,
      featureName: 'Users',
      featureType: 'resource-crud',
      strictMode: true,
      includeMatrices: true,
      includeSupportRequests: true,
      dataPolicy: {
        mode: 'builtin',
        persistAsVars: true,
        scope: 'mcp',
      },
      overlay: 'raw-dto-overlay',
    }),
  ) as {
    createdRequests: string[];
    manifestPath: string;
    scenarioFiles: string[];
  };
  assert.ok(scaffold.createdRequests.length >= 9);
  assert.equal(scaffold.scenarioFiles.length, 2);

  const matrixMetadata = JSON.parse(
    await readFile(plan.matrixes[0]!.metadataFilePath, 'utf8'),
  ) as { scenarioFilePath: string; strategy: string };
  assert.equal(matrixMetadata.strategy, 'base-valid-payload-plus-deltas');
  assert.match(matrixMetadata.scenarioFilePath, /scenarios\/create-user-validation-matrix\.json/);

  const inspect = JSON.parse(
    await callToolText(session.client, 'inspect_feature_slice_context', {
      collectionPath,
      featureName: 'Users',
    }),
  ) as {
    brunoNativeOpportunities: string[];
    duplicationSignals: string[];
    supportCoverage: Record<string, boolean>;
  };
  assert.equal(inspect.supportCoverage.auth, true);
  assert.ok(Array.isArray(inspect.brunoNativeOpportunities));
  assert.ok(Array.isArray(inspect.duplicationSignals));

  const audit = JSON.parse(
    await callToolText(session.client, 'audit_feature_slice', {
      collectionPath,
      sliceId: 'users',
    }),
  ) as { collectionDefects: unknown[]; coverageGaps: unknown[] };
  assert.deepEqual(audit.collectionDefects, []);
  assert.deepEqual(audit.coverageGaps, []);

  const runManifest = JSON.parse(
    await callToolText(session.client, 'generate_feature_run_manifest', {
      collectionPath,
      sliceId: 'users',
    }),
  ) as { steps: Array<{ dataFilePath?: string; phase: string; profileMembership: string[] }> };
  assert.ok(runManifest.steps.some((step) => step.phase === 'auth'));
  assert.ok(runManifest.steps.some((step) => step.phase === 'negative' && step.dataFilePath));

  const inspectedRunManifest = JSON.parse(
    await callToolText(session.client, 'inspect_feature_run_manifest', {
      collectionPath,
      sliceId: 'users',
    }),
  ) as { steps: Array<{ expected?: { statusCodes: number[] }; order: number }> };
  assert.ok(inspectedRunManifest.steps.every((step) => typeof step.order === 'number'));
  assert.ok(inspectedRunManifest.steps.some((step) => Array.isArray(step.expected?.statusCodes)));

  const runManifestValidation = JSON.parse(
    await callToolText(session.client, 'validate_feature_run_manifest', {
      collectionPath,
      sliceId: 'users',
    }),
  ) as { errors: string[]; valid: boolean; warnings: string[] };
  assert.equal(runManifestValidation.valid, true);
  assert.deepEqual(runManifestValidation.errors, []);
  assert.ok(Array.isArray(runManifestValidation.warnings));

  const supportGraph = JSON.parse(
    await callToolText(session.client, 'inspect_feature_slice_support_graph', {
      collectionPath,
      sliceId: 'users',
    }),
  ) as { edges: Array<{ kind: string }>; nodes: Array<{ kind: string }> };
  assert.ok(supportGraph.nodes.some((node) => node.kind === 'support'));
  assert.ok(supportGraph.edges.some((edge) => edge.kind === 'requires-role'));

  const runReport = JSON.parse(
    await callToolText(session.client, 'run_feature_slice', {
      collectionPath,
      env: 'test',
      profile: 'full',
      sliceId: 'users',
    }),
  ) as {
    cleanupOutcomes: Array<{ outcome: string }>;
    exitStatus: string;
    passCount: number;
    productDefects: unknown[];
    setupFailures: unknown[];
    totalSteps: number;
  };
  assert.equal(runReport.exitStatus, 'passed');
  assert.equal(runReport.productDefects.length, 0);
  assert.equal(runReport.setupFailures.length, 0);
  assert.ok(runReport.passCount > 0);
  assert.equal(runReport.totalSteps > 0, true);

  const resource = await session.client.readResource({
    uri: `bruno://slice/${encodeURIComponent(collectionPath)}/users`,
  });
  const text = resource.contents.find((entry) => 'text' in entry && typeof entry.text === 'string');
  assert.ok(text && 'text' in text);
  const sliceState = JSON.parse(String(text.text)) as {
    manifest: { overlayDetails: { id: string }; sliceId: string; supportGraph?: { nodes: unknown[] } };
    runManifestValidation: { valid: boolean } | null;
  };
  assert.equal(sliceState.manifest.sliceId, 'users');
  assert.equal(sliceState.manifest.overlayDetails.id, 'raw-dto-overlay');
  assert.ok(Array.isArray(sliceState.manifest.supportGraph?.nodes));
  assert.equal(sliceState.runManifestValidation?.valid, true);

  const supportGraphResource = await session.client.readResource({
    uri: `bruno://slice-support-graph/${encodeURIComponent(collectionPath)}/users`,
  });
  const supportGraphText = supportGraphResource.contents.find(
    (entry) => 'text' in entry && typeof entry.text === 'string',
  );
  assert.ok(supportGraphText && 'text' in supportGraphText);

  const findings = JSON.parse(
    await callToolText(session.client, 'record_slice_findings', {
      collectionPath,
      sliceId: 'users',
      findings: [
        {
          kind: 'product-defect',
          severity: 'high',
          title: 'Delete endpoint returns 500 for valid owned fixture',
          observedBehavior: 'DELETE /users/:id returned 500',
          expectedBehavior: 'DELETE should return 204',
          recommendedAction: 'Fix product delete flow and keep cleanup request truthful until then.',
        },
      ],
    }),
  ) as { findingsPath: string };
  const findingsFile = await readFile(findings.findingsPath, 'utf8');
  assert.match(findingsFile, /product-defect/);
});
