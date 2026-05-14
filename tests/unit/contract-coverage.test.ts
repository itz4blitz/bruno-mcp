import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createApiContractManager } from '../../src/bruno/api-contract.js';
import { createContractCoverageManager } from '../../src/bruno/contract-coverage.js';

const sampleODataContract = {
  openapi: '3.0.0',
  info: {
    title: 'Sample Inventory API',
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
    '/Products/upload': {
      post: {
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary' },
                },
                required: ['file'],
              },
            },
          },
        },
        responses: { '204': { description: 'uploaded' } },
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
        },
      },
      Product: {
        type: 'object',
        required: ['ProductId', 'name'],
        properties: {
          ProductId: { type: 'string' },
          name: { type: 'string', minLength: 1, maxLength: 100 },
          price: { type: 'number', minimum: 0, maximum: 9999 },
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
          name: { type: 'string', minLength: 1, maxLength: 100 },
          price: { type: 'number', minimum: 0 },
          description: { type: 'string', maxLength: 500 },
        },
      },
    },
  },
};

test('ApiContractManager normalizes OpenAPI/OData contracts without product-specific assumptions', () => {
  const manager = createApiContractManager();
  const contract = manager.inspectContent(
    JSON.stringify(sampleODataContract),
    'sample-openapi.json',
    {
      serviceType: 'mixed',
    },
  );

  assert.equal(contract.source.title, 'Sample Inventory API');
  assert.equal(contract.endpoints.length, 6);
  assert.equal(contract.odata?.entitySets.length, 1);
  assert.deepEqual(contract.odata?.entitySets[0]?.queryOptions, [
    '$select',
    '$filter',
    '$orderby',
    '$top',
    '$skip',
    '$count',
    '$expand',
  ]);
  assert.equal(contract.odata?.entitySets[0]?.keyEndpointId, 'GET /Products/{ProductId}');
});

test('ContractCoverageManager creates endpoint, OData, payload, response, file, and seed denominators', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-contract-coverage-'));
  const collectionPath = join(rootPath, 'collection');
  await import('node:fs/promises').then(({ mkdir }) => mkdir(collectionPath, { recursive: true }));

  const contract = createApiContractManager().inspectContent(
    JSON.stringify(sampleODataContract),
    'sample-openapi.json',
    {
      serviceType: 'mixed',
    },
  );
  const coverageManager = createContractCoverageManager();
  const manifest = coverageManager.buildManifest(contract, {
    variables: {
      Products_id: { source: 'api-resolver' },
      Products_expand: { required: false, source: 'api-resolver' },
    },
  });

  assert.equal(coverageManager.validateManifest(manifest).valid, true);
  assert.ok(manifest.items.some((item) => item.id === 'odata-query:products:select'));
  assert.ok(manifest.items.some((item) => item.id === 'negative:get:products-productid:bad-key'));
  assert.ok(manifest.items.some((item) => item.category === 'file-route'));
  assert.ok(manifest.items.some((item) => item.id === 'seed-variable:products-id'));
  assert.ok(manifest.items.some((item) => item.id.includes('payload:post:products:name')));
  assert.ok(manifest.summary.totalItems > contract.endpoints.length);

  const manifestPath = await coverageManager.writeManifest(collectionPath, manifest);
  const persisted = JSON.parse(await readFile(manifestPath, 'utf8')) as typeof manifest;
  assert.equal(persisted.schemaVersion, 1);
});
