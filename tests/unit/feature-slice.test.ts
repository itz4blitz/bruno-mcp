import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createCollectionManager } from '../../src/bruno/collection.js';
import { createOpenApiContractManager } from '../../src/bruno/openapi.js';
import { createFeatureSliceManager } from '../../src/bruno/feature-slice.js';
import { createBrunoNativeManager } from '../../src/bruno/native.js';
import { createRequestBuilder } from '../../src/bruno/request.js';
import { createWorkspaceManager } from '../../src/bruno/workspace.js';

test('FeatureSliceManager plans and scaffolds a strict feature slice', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-mcp-feature-slice-'));
  const collectionManager = createCollectionManager();
  const nativeManager = createBrunoNativeManager();
  const requestBuilder = createRequestBuilder();
  const workspaceManager = createWorkspaceManager();
  const featureSliceManager = createFeatureSliceManager(
    nativeManager,
    requestBuilder,
    workspaceManager,
  );

  const collectionResult = await collectionManager.createCollection({
    name: 'slice-api',
    outputPath: rootPath,
  });
  assert.equal(collectionResult.success, true);

  const collectionPath = join(rootPath, 'slice-api');
  const plan = await featureSliceManager.planFeatureSlice({
    collectionPath,
    featureName: 'Users',
    featureType: 'resource-crud',
    overlay: 'raw-dto-overlay',
  });

  assert.equal(plan.sliceId, 'users');
  assert.equal(plan.matrixes.length, 2);
  assert.equal(plan.overlayDetails?.id, 'raw-dto-overlay');
  assert.ok(plan.supportRequests.some((support) => support.role === 'cleanup'));

  const scaffold = await featureSliceManager.scaffoldFeatureSlice({
    collectionPath,
    featureName: 'Users',
    featureType: 'resource-crud',
    dataPolicy: {
      mode: 'builtin',
      persistAsVars: true,
      scope: 'mcp',
    },
    overlay: 'raw-dto-overlay',
    strictMode: true,
  });

  assert.ok(scaffold.createdRequests.length >= 9);
  assert.equal(scaffold.scenarioFiles.length, 2);

  const manifest = JSON.parse(
    await readFile(join(collectionPath, '.bruno-mcp', 'feature-slices', 'users', 'slice.json'), 'utf8'),
  ) as {
    dynamicData: { generatedVars: Record<string, string>; uniqueEmail: string };
    overlayDetails: { id: string };
    sliceId: string;
  };
  assert.equal(manifest.sliceId, 'users');
  assert.match(manifest.dynamicData.uniqueEmail, /example\.test/);
  assert.equal(manifest.overlayDetails.id, 'raw-dto-overlay');
  assert.ok(manifest.dynamicData.generatedVars.generatedSuffix.length > 0);

  const matrixScenario = JSON.parse(
    await readFile(scaffold.scenarioFiles[0]!, 'utf8'),
  ) as Array<{ expectedStatus: number; scenarioId: string }>;
  assert.equal(Array.isArray(matrixScenario), true);
  assert.equal(matrixScenario[0]?.scenarioId, 'missing-name');

  const matrixMetadata = JSON.parse(
    await readFile(
      join(collectionPath, '.bruno-mcp', 'feature-slices', 'users', 'matrices', 'create-user-validation-matrix.json'),
      'utf8',
    ),
  ) as { scenarioFilePath: string; strategy: string };
  assert.equal(matrixMetadata.strategy, 'base-valid-payload-plus-deltas');
  assert.match(matrixMetadata.scenarioFilePath, /scenarios\/create-user-validation-matrix\.json/);

  const folderDefaults = (await nativeManager.getFolderDefaults(
    collectionPath,
    'Features/Users/Happy Path',
  )) as { docs: string; vars: { req: Array<{ name: string }> } };
  assert.match(folderDefaults.docs, /Cleanup truth/);
  assert.ok(folderDefaults.vars.req.some((entry) => entry.name === 'generatedSuffix'));

  const audit = (await featureSliceManager.auditFeatureSlice({
    collectionPath,
    sliceId: 'users',
  })) as { collectionDefects: unknown[]; coverageGaps: unknown[] };
  assert.deepEqual(audit.coverageGaps, []);
  assert.deepEqual(audit.collectionDefects, []);
});

test('FeatureSliceManager plans controller-aware Branch slice from OpenAPI contract', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-mcp-branch-contract-'));
  const collectionManager = createCollectionManager();
  const nativeManager = createBrunoNativeManager();
  const requestBuilder = createRequestBuilder();
  const workspaceManager = createWorkspaceManager();
  const openApiManager = createOpenApiContractManager();
  const featureSliceManager = createFeatureSliceManager(
    nativeManager,
    requestBuilder,
    workspaceManager,
  );

  const collectionResult = await collectionManager.createCollection({
    name: 'branch-api',
    outputPath: rootPath,
  });
  assert.equal(collectionResult.success, true);

  const fixturePath = join(process.cwd(), 'tests', 'fixtures', 'contracts', 'branch', 'openapi.json');
  const contracts = await openApiManager.ingestFile(fixturePath);
  const branchContract = contracts.find((contract) => contract.controllerName === 'Branch');
  assert.ok(branchContract);

  const collectionPath = join(rootPath, 'branch-api');
  const plan = await featureSliceManager.planFeatureSlice({
    collectionPath,
    controllerContract: branchContract,
    featureName: 'Branch',
    featureType: 'resource-crud',
  });

  assert.equal(plan.basePath, '/branches');
  assert.equal(plan.sourceOfTruth, fixturePath);
  assert.ok(plan.coreRequests.some((request) => request.action === 'update'));
  assert.ok(plan.coreRequests.some((request) => request.action === 'delete'));
  assert.ok(plan.requiredInputs.includes('branchId'));
  assert.ok(plan.matrixes[0]?.allowedDeltaPaths.includes('code'));

  const scaffold = await featureSliceManager.scaffoldFeatureSlice({
    collectionPath,
    controllerContract: branchContract,
    featureName: 'Branch',
    featureType: 'resource-crud',
  });
  const runManifest = await featureSliceManager.inspectRunManifest(collectionPath, 'branch');
  assert.ok(runManifest.steps.some((step) => step.name === 'Update Branch'));
  const validation = await featureSliceManager.validateRunManifest(collectionPath, 'branch');
  assert.equal(validation.valid, true);
  const supportGraph = await featureSliceManager.inspectSupportGraph(collectionPath, 'branch');
  assert.ok(supportGraph.nodes.some((node) => node.kind === 'support'));
  assert.ok(supportGraph.edges.some((edge) => edge.kind === 'requires-role'));

  const updateRequestPath = scaffold.createdRequests.find((requestPath) => requestPath.endsWith('/update-branch.bru'));
  assert.ok(updateRequestPath);
  const updateRequest = await nativeManager.getRequest(updateRequestPath!);
  assert.ok(
    Array.isArray((updateRequest as { assertions?: Array<{ name: string }> }).assertions) &&
      ((updateRequest as { assertions: Array<{ name: string }> }).assertions.some((assertion) => assertion.name === 'res.body.id') ||
        (updateRequest as { assertions: Array<{ name: string }> }).assertions.some((assertion) => assertion.name === 'res.status')),
  );
});

test('FeatureSliceManager rejects invalid strict matrix rows', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-mcp-feature-matrix-'));
  const collectionManager = createCollectionManager();
  const nativeManager = createBrunoNativeManager();
  const requestBuilder = createRequestBuilder();
  const workspaceManager = createWorkspaceManager();
  const featureSliceManager = createFeatureSliceManager(
    nativeManager,
    requestBuilder,
    workspaceManager,
  );

  const collectionResult = await collectionManager.createCollection({
    name: 'matrix-api',
    outputPath: rootPath,
  });
  assert.equal(collectionResult.success, true);

  const collectionPath = join(rootPath, 'matrix-api');

  await assert.rejects(
    featureSliceManager.scaffoldMatrixRequest({
      allowedDeltaPaths: ['name'],
      basePayload: { name: 'valid' },
      category: 'negative',
      collectionPath,
      requestFolder: 'Features/Users/Matrix',
      requestName: 'Create User Validation Matrix',
      requestUrl: '{{baseUrl}}/users',
      requiredIterationFields: ['scenarioId', 'delta', 'expectedStatus', 'expectedOutcome'],
      scenarioDeltas: [
        {
          delta: { set: { name: 'invalid' } },
          expectedOutcome: 'validation_error',
          expectedStatus: 400,
          scenarioId: 'valid-row',
        },
        {
          delta: { set: { email: 'invalid' } },
          expectedOutcome: 'validation_error',
          expectedStatus: 400,
          scenarioId: 'unsupported-path',
        },
      ],
      sliceId: 'users',
      strictMode: true,
    }),
    /unsupported delta path email/i,
  );
});
