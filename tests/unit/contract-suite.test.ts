import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createApiContractManager } from '../../src/bruno/api-contract.js';
import { createCollectionManager } from '../../src/bruno/collection.js';
import { createContractCoverageManager } from '../../src/bruno/contract-coverage.js';
import { createContractSuiteScaffolder } from '../../src/bruno/contract-suite.js';
import { createBrunoNativeManager } from '../../src/bruno/native.js';
import { createRequestBuilder } from '../../src/bruno/request.js';
import { createVariableAuditManager } from '../../src/bruno/variable-audit.js';

const sampleContract = {
  openapi: '3.0.0',
  info: {
    title: 'Sample Products API',
    version: '1.0.0',
  },
  paths: {
    '/': {
      get: {
        responses: { '200': { description: 'service root' } },
      },
    },
    '/$metadata': {
      get: {
        responses: { '200': { description: 'metadata' } },
      },
    },
    '/Products': {
      get: {
        parameters: [
          { in: 'query', name: '$select', schema: { type: 'string' } },
          { in: 'query', name: '$filter', schema: { type: 'string' } },
          { in: 'query', name: '$orderby', schema: { type: 'string' } },
          { in: 'query', name: '$top', schema: { type: 'integer' } },
          { in: 'query', name: '$skip', schema: { type: 'integer' } },
          { in: 'query', name: '$count', schema: { type: 'boolean' } },
          { in: 'query', name: '$expand', schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ProductCollection' },
              },
            },
          },
        },
      },
      post: {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ProductCreate' },
            },
          },
        },
        responses: {
          '201': {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Product' },
              },
            },
          },
        },
      },
    },
    '/Products/{ProductId}': {
      get: {
        parameters: [{ in: 'path', name: 'ProductId', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Product' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      ProductCollection: {
        type: 'object',
        properties: {
          value: {
            type: 'array',
            items: { $ref: '#/components/schemas/Product' },
          },
          '@odata.count': { type: 'integer' },
        },
      },
      Product: {
        type: 'object',
        required: ['ProductId', 'name'],
        properties: {
          ProductId: { type: 'string' },
          name: { type: 'string', minLength: 1, maxLength: 20 },
          price: { type: 'number', minimum: 0, maximum: 1000 },
          category: {
            type: 'object',
            properties: {
              CategoryId: { type: 'string' },
            },
          },
        },
      },
      ProductCreate: {
        type: 'object',
        required: ['name', 'price'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 20 },
          price: { type: 'number', minimum: 0, maximum: 1000 },
          description: { type: 'string', maxLength: 50 },
        },
      },
    },
  },
};

test('ContractSuiteScaffolder builds Desktop-ready REST/OData coverage from a contract', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-contract-suite-'));
  const collectionManager = createCollectionManager();
  const nativeManager = createBrunoNativeManager();
  const coverageManager = createContractCoverageManager();
  const variableAuditManager = createVariableAuditManager(nativeManager);
  const scaffolder = createContractSuiteScaffolder(
    createRequestBuilder(),
    nativeManager,
    coverageManager,
    variableAuditManager,
  );

  const collection = await collectionManager.createCollection({
    name: 'sample-products-api',
    outputPath: rootPath,
  });
  assert.equal(collection.success, true);

  const contract = createApiContractManager().inspectContent(
    JSON.stringify(sampleContract),
    'sample.json',
    {
      serviceType: 'mixed',
    },
  );
  const result = await scaffolder.scaffold({
    baseUrl: 'http://127.0.0.1:3000',
    collectionPath: collection.path as string,
    contract,
    environmentName: 'local',
    seedManifest: {
      variables: {
        Products_id: { source: 'api-resolver', value: 'product-1' },
      },
    },
  });

  assert.equal(result.environment.variables.baseUrl, 'http://127.0.0.1:3000');
  assert.equal(result.environment.variables.Products_id, 'product-1');
  assert.equal(result.variableAudit.summary.missingReferences, 0);
  assert.ok(result.createdRequests.some((request) => request.name === 'Products $filter'));
  assert.ok(result.createdRequests.some((request) => request.scenario === 'bad-key'));
  assert.ok(result.createdRequests.some((request) => request.scenario === 'unsupported-method'));
  assert.ok(result.createdRequests.some((request) => request.scenario === 'bad-entity-set'));
  assert.ok(result.createdRequests.some((request) => request.scenario === 'missing-required:name'));
  assert.ok(result.createdRequests.some((request) => request.scenario === 'boundary:price'));

  const requiredUncovered = result.coverageManifest.items.filter(
    (item) => item.required && item.status === 'uncovered',
  );
  assert.deepEqual(requiredUncovered, []);

  const environment = await nativeManager.getEnvironment(collection.path as string, 'local');
  assert.equal(environment.Products_id, 'product-1');

  const keyRequest = result.createdRequests.find((request) => request.name === 'Products By Key');
  assert.ok(keyRequest);
  const keyRequestSource = await readFile(keyRequest.path, 'utf8');
  assert.match(keyRequestSource, /\/Products\/\{\{Products_id\}\}/);
  assert.match(keyRequestSource, /OData key response identity/);

  const manifestSource = await readFile(result.coverageManifestPath, 'utf8');
  assert.match(manifestSource, /odata-query:products:filter/);
  assert.match(manifestSource, /environment:local/);
});
