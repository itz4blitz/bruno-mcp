import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';

import { callToolText, createMcpTestClient } from '../helpers/mcp-client.js';

const sampleMixedApiContract = {
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
    '/openapi.json': {
      get: {
        responses: { '200': { description: 'OpenAPI document' } },
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
    '/Files/upload': {
      post: {
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: {
                  file: { type: 'string', format: 'binary' },
                },
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
          price: { type: 'number', minimum: 0, maximum: 1000 },
        },
      },
      ProductCreate: {
        type: 'object',
        required: ['name', 'price'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          price: { type: 'number', minimum: 0, maximum: 1000 },
          description: { type: 'string', maxLength: 500 },
        },
      },
    },
  },
};

test('MCP server exposes working Bruno collection tools over stdio', async (t) => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-mcp-integration-'));
  const session = await createMcpTestClient();
  t.after(async () => {
    await session.close();
  });

  const tools = await session.client.listTools();
  assert.ok(tools.tools.some((tool) => tool.name === 'add_test_script'));
  assert.ok(tools.tools.some((tool) => tool.name === 'list_collections'));

  const collectionText = await callToolText(session.client, 'create_collection', {
    name: 'integration-api',
    outputPath: rootPath,
    description: 'Integration test collection',
  });
  assert.match(collectionText, /Created Bruno collection/);

  const collectionPath = join(rootPath, 'integration-api');

  const environmentText = await callToolText(session.client, 'create_environment', {
    collectionPath,
    name: 'test',
    variables: {
      baseUrl: 'http://127.0.0.1:9999',
    },
  });
  assert.match(environmentText, /Created environment/);

  const emptyEnvironmentText = await callToolText(session.client, 'create_environment', {
    collectionPath,
    name: 'empty',
  });
  assert.match(emptyEnvironmentText, /Created environment/);

  const emptyEnvironment = JSON.parse(
    await callToolText(session.client, 'get_environment', {
      collectionPath,
      environmentName: 'empty',
    }),
  ) as { variables: Record<string, string> };
  assert.deepEqual(emptyEnvironment.variables, {});

  const updateEnvironmentAliasText = await callToolText(session.client, 'update_environment_vars', {
    collectionPath,
    environmentName: 'empty',
    variables: {
      workspaceId: 85,
    },
  });
  assert.match(updateEnvironmentAliasText, /Updated environment/);

  const updatedAliasEnvironment = JSON.parse(
    await callToolText(session.client, 'get_environment', {
      collectionPath,
      environmentName: 'empty',
    }),
  ) as { variables: Record<string, string> };
  assert.deepEqual(updatedAliasEnvironment.variables, { workspaceId: '85' });

  const requestText = await callToolText(session.client, 'create_request', {
    collectionPath,
    name: 'Ping Request',
    method: 'GET',
    url: '{{baseUrl}}/ping',
    headers: {
      Accept: 'application/json',
    },
  });
  assert.match(requestText, /Created request/);

  const folderDefaultsText = await callToolText(session.client, 'update_folder_defaults', {
    collectionPath,
    folderPath: 'audited',
    tests: `test("response status is successful", function () {
  expect(res.getStatus()).to.be.oneOf([200, 201, 202, 204]);
});

test("response is not an HTML error page", function () {
  const contentType = String(res.getHeader("content-type") || "").toLowerCase();
  expect(contentType).to.not.contain("text/html");
});`,
  });
  assert.match(folderDefaultsText, /Updated folder defaults/);

  const auditedRequestText = await callToolText(session.client, 'create_request', {
    collectionPath,
    name: 'Get Audited User',
    method: 'GET',
    url: '{{baseUrl}}/users/{{id}}',
    folder: 'audited',
  });
  assert.match(auditedRequestText, /Created request/);

  const qualityAudit = JSON.parse(
    await callToolText(session.client, 'audit_collection_quality', {
      collectionPath,
      includeRequests: true,
      requestPathPrefix: 'audited',
    }),
  ) as {
    requests?: Array<{ depth: string; issues: string[] }>;
    summary: { shallowRequests: number; totalRequests: number };
  };
  assert.equal(qualityAudit.summary.totalRequests, 1);
  assert.equal(qualityAudit.summary.shallowRequests, 1);
  assert.ok(qualityAudit.requests?.[0]?.issues.includes('baseline-only-tests'));

  const auditResource = await session.client.readResource({
    uri: `bruno://collection-audit/${encodeURIComponent(collectionPath)}`,
  });
  assert.match(JSON.stringify(auditResource), /enterpriseReadinessScore/);

  const graphqlText = await callToolText(session.client, 'create_request', {
    collectionPath,
    name: 'List Users GraphQL',
    method: 'POST',
    url: '{{baseUrl}}/graphql',
    headers: {
      'content-type': 'application/json',
    },
    body: {
      type: 'graphql',
      content: `query ListUsers($limit: Int!) {
  users(limit: $limit) {
    id
    name
  }
}`,
      variables: '{\n  "limit": 5\n}',
    },
  });
  assert.match(graphqlText, /Created request/);

  const bruFilePath = join(collectionPath, 'ping-request.bru');
  const scriptText = await callToolText(session.client, 'add_test_script', {
    bruFilePath,
    scriptType: 'tests',
    script: `test("status is 200", function () {
  expect(res.status).to.equal(200);
});`,
  });
  assert.match(scriptText, /Updated tests block/);

  const crudText = await callToolText(session.client, 'create_crud_requests', {
    collectionPath,
    entityName: 'Widget',
    baseUrl: '{{baseUrl}}/api',
    folder: 'widgets',
  });
  assert.match(crudText, /Created CRUD request set/);

  const payloadPath = join(rootPath, 'payload.bin');
  await writeFile(payloadPath, Buffer.from([0x00, 0x01, 0x02, 0xff]));

  const binaryText = await callToolText(session.client, 'create_request', {
    collectionPath,
    name: 'Upload Binary',
    method: 'POST',
    url: '{{baseUrl}}/binary',
    body: {
      type: 'binary',
      filePath: payloadPath,
      contentType: 'application/octet-stream',
    },
  });
  assert.match(binaryText, /Created request/);

  const suiteText = await callToolText(session.client, 'create_test_suite', {
    collectionPath,
    suiteName: 'widget-flow',
    requests: [
      {
        name: 'Create Widget For Suite',
        method: 'POST',
        url: '{{baseUrl}}/api/widgets',
        headers: {
          'content-type': 'application/json',
        },
        body: {
          type: 'json',
          content: '{\n  "name": "Suite Widget"\n}',
        },
      },
      {
        name: 'Fetch Widget For Suite',
        method: 'GET',
        url: '{{baseUrl}}/api/widgets/{{widgetId}}',
      },
    ],
    dependencies: [
      {
        from: 'Create Widget For Suite',
        to: 'Fetch Widget For Suite',
        variable: 'widgetId',
        sourcePath: 'id',
      },
    ],
  });
  assert.match(suiteText, /Created test suite/);

  const listCollectionsText = await callToolText(session.client, 'list_collections', {
    path: rootPath,
  });
  assert.match(listCollectionsText, /integration-api/);

  const statsText = await callToolText(session.client, 'get_collection_stats', {
    collectionPath,
  });
  assert.match(statsText, /Total requests: 12/);
  assert.match(statsText, /GET: 5/);
  assert.match(statsText, /POST: 4/);
  assert.match(statsText, /PUT: 1/);
  assert.match(statsText, /DELETE: 1/);

  const requestFile = await readFile(bruFilePath, 'utf8');
  assert.match(requestFile, /tests \{/);
  assert.match(requestFile, /expect\(res.status\)\.to.equal\(200\)/);

  const graphqlFile = await readFile(join(collectionPath, 'list-users-graphql.bru'), 'utf8');
  assert.match(graphqlFile, /body:graphql \{/);
  assert.match(graphqlFile, /body:graphql:vars \{/);

  const binaryFile = await readFile(join(collectionPath, 'upload-binary.bru'), 'utf8');
  assert.match(binaryFile, /body:file \{/);
  assert.match(binaryFile, /@contentType\(application\/octet-stream\)/);

  const suiteSourceFile = await readFile(
    join(collectionPath, 'widget-flow', 'create-widget-for-suite.bru'),
    'utf8',
  );
  assert.match(suiteSourceFile, /bru.setVar\('widgetId', res.getBody\(\)\?\.id\);/);
});

test('MCP server supports task-based audit execution and cancellation', async (t) => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-mcp-tasks-'));
  const session = await createMcpTestClient();
  t.after(async () => {
    await session.close();
  });

  await callToolText(session.client, 'create_collection', {
    name: 'task-audit-api',
    outputPath: rootPath,
  });

  const collectionPath = join(rootPath, 'task-audit-api');

  await callToolText(session.client, 'create_request', {
    collectionPath,
    name: 'Get Widgets',
    method: 'GET',
    url: '{{baseUrl}}/widgets/{{id}}',
  });

  const tools = await session.client.listTools();
  const auditTool = tools.tools.find((tool) => tool.name === 'audit_collection_quality');
  assert.equal(auditTool?.execution?.taskSupport, 'optional');

  assert.ok(tools.nextCursor);
  const secondToolPage = await session.client.listTools({ cursor: tools.nextCursor });
  assert.ok(secondToolPage.tools.length > 0);
  assert.notDeepEqual(
    tools.tools.map((tool) => tool.name),
    secondToolPage.tools.map((tool) => tool.name),
  );

  const serverCapabilities = session.client.getServerCapabilities();
  assert.ok(serverCapabilities?.tasks?.list);
  assert.ok(serverCapabilities?.tasks?.cancel);
  assert.ok(serverCapabilities?.tasks?.requests?.tools?.call);
  assert.match(
    session.client.getInstructions() || '',
    /truthful, deep, reusable Bruno collections/i,
  );

  const auditStream = session.client.experimental.tasks.callToolStream(
    {
      arguments: {
        collectionPath,
        includeRequests: false,
      },
      name: 'audit_collection_quality',
    },
    CallToolResultSchema,
    {
      task: { ttl: 60000 },
    },
  );

  const createdMessage = await auditStream.next();
  assert.equal(createdMessage.value?.type, 'taskCreated');
  const taskId = createdMessage.value?.task.taskId;
  assert.ok(taskId);

  const listedTasks = await session.client.experimental.tasks.listTasks();
  assert.ok(listedTasks.tasks.some((task) => task.taskId === taskId));

  const taskState = await session.client.experimental.tasks.getTask(taskId);
  assert.equal(taskState.taskId, taskId);
  assert.ok(['working', 'completed'].includes(taskState.status));

  let resultMessage:
    | { result: { content: Array<{ text?: string; type: string }> }; type: 'result' }
    | undefined;
  for await (const message of auditStream) {
    if (message.type === 'result') {
      resultMessage = message;
      break;
    }
  }

  assert.ok(resultMessage);
  assert.match(resultMessage?.result.content[0]?.text || '', /enterpriseReadinessScore/);

  const completedResult = await session.client.experimental.tasks.getTaskResult(
    taskId,
    CallToolResultSchema,
  );
  const completedContent = completedResult.content[0];
  assert.equal(completedContent?.type, 'text');
  assert.match(completedContent?.type === 'text' ? completedContent.text : '', /totalRequests/);

  const cancellableStream = session.client.experimental.tasks.callToolStream(
    {
      arguments: {
        collectionPath,
        includeRequests: true,
      },
      name: 'audit_collection_quality',
    },
    CallToolResultSchema,
    {
      task: { ttl: 60000 },
    },
  );

  const cancellableCreated = await cancellableStream.next();
  assert.equal(cancellableCreated.value?.type, 'taskCreated');
  const cancellableTaskId = cancellableCreated.value?.task.taskId;
  assert.ok(cancellableTaskId);

  const cancelledTask = await session.client.experimental.tasks.cancelTask(cancellableTaskId);
  assert.equal(cancelledTask.status, 'cancelled');

  const cancelledState = await session.client.experimental.tasks.getTask(cancellableTaskId);
  assert.equal(cancelledState.status, 'cancelled');

  await cancellableStream.return(undefined);
});

test('MCP server exposes generic contract coverage, variable audit, and run tools', async (t) => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-mcp-contract-tools-'));
  const session = await createMcpTestClient();
  t.after(async () => {
    await session.close();
  });

  await callToolText(session.client, 'create_collection', {
    name: 'sample-products-api',
    outputPath: rootPath,
  });
  const collectionPath = join(rootPath, 'sample-products-api');

  const contractPath = join(rootPath, 'sample-openapi.json');
  await writeFile(contractPath, `${JSON.stringify(sampleMixedApiContract, null, 2)}\n`);

  const seedManifestPath = join(rootPath, 'seed-manifest.json');
  await writeFile(
    seedManifestPath,
    `${JSON.stringify(
      {
        variables: {
          Products_id: { source: 'api-resolver' },
          Products_expand: { required: false, source: 'api-resolver' },
        },
      },
      null,
      2,
    )}\n`,
  );

  const inspected = JSON.parse(
    await callToolText(session.client, 'inspect_api_contract', {
      contractPath,
      serviceType: 'mixed',
    }),
  ) as {
    endpoints: Array<{ id: string }>;
    odata?: { entitySets: Array<{ keyEndpointId?: string; queryOptions: string[] }> };
    source: { title?: string };
  };
  assert.equal(inspected.source.title, 'Sample Products API');
  assert.ok(inspected.endpoints.some((endpoint) => endpoint.id === 'GET /Products'));
  assert.equal(inspected.odata?.entitySets[0]?.keyEndpointId, 'GET /Products/{ProductId}');
  assert.ok(inspected.odata?.entitySets[0]?.queryOptions.includes('$expand'));

  const generatedCoverage = JSON.parse(
    await callToolText(session.client, 'generate_contract_coverage_manifest', {
      collectionPath,
      contractPath,
      seedManifestPath,
      serviceType: 'mixed',
    }),
  ) as {
    manifest: { items: Array<{ category: string; id: string }> };
    manifestPath: string;
    validation: { valid: boolean };
  };
  assert.equal(generatedCoverage.validation.valid, true);
  assert.ok(
    generatedCoverage.manifest.items.some((item) => item.id === 'odata-query:products:expand'),
  );
  assert.ok(generatedCoverage.manifest.items.some((item) => item.category === 'file-route'));
  assert.ok(
    generatedCoverage.manifest.items.some((item) => item.id === 'seed-variable:products-id'),
  );

  const validation = JSON.parse(
    await callToolText(session.client, 'validate_contract_coverage_manifest', {
      manifestPath: generatedCoverage.manifestPath,
    }),
  ) as { valid: boolean };
  assert.equal(validation.valid, true);

  await callToolText(session.client, 'create_collection', {
    name: 'sample-products-suite-api',
    outputPath: rootPath,
  });
  const suiteCollectionPath = join(rootPath, 'sample-products-suite-api');
  const suite = JSON.parse(
    await callToolText(session.client, 'scaffold_api_contract_suite', {
      baseUrl: 'http://127.0.0.1:3000',
      collectionPath: suiteCollectionPath,
      contractPath,
      environmentName: 'local',
      environmentVariables: {
        Products_id: 'seed-product-1',
        uploadFilePath: './fixtures/upload.bin',
      },
      seedManifestPath,
      serviceType: 'mixed',
    }),
  ) as {
    coverageManifest: { items: Array<{ required: boolean; status: string }> };
    createdRequests: Array<{ name: string; scenario: string }>;
    environment: { variables: Record<string, string> };
    variableAudit: { summary: { missingReferences: number } };
  };
  assert.equal(suite.environment.variables.baseUrl, 'http://127.0.0.1:3000');
  assert.equal(suite.environment.variables.Products_id, 'seed-product-1');
  assert.equal(suite.variableAudit.summary.missingReferences, 0);
  assert.ok(suite.createdRequests.some((request) => request.name === 'Products $filter'));
  assert.ok(suite.createdRequests.some((request) => request.scenario === 'missing-required:name'));
  assert.ok(suite.createdRequests.some((request) => request.scenario === 'unsupported-method'));
  assert.deepEqual(
    suite.coverageManifest.items.filter((item) => item.required && item.status === 'uncovered'),
    [],
  );

  await callToolText(session.client, 'create_environment', {
    collectionPath,
    name: 'local',
    variables: {
      baseUrl: 'http://127.0.0.1:3000',
      Products_id: 'seed-product-1',
    },
  });

  await callToolText(session.client, 'update_collection_defaults', {
    collectionPath,
    preRequestVars: {
      authToken: 'collection-token',
    },
  });

  await callToolText(session.client, 'create_request', {
    collectionPath,
    headers: {
      Authorization: 'Bearer {{authToken}}',
      'X-Missing': '{{missingVar}}',
      'X-Process': "{{process.env['API_TOKEN']}}",
      'X-Prompt': '{{?API token}}',
      'X-Runtime': '{{runtimeOnly}}',
    },
    method: 'GET',
    name: 'Fetch Product By Seed',
    url: '{{baseUrl}}/Products/{{Products_id}}',
  });

  await callToolText(session.client, 'update_request', {
    requestPath: join(collectionPath, 'fetch-product-by-seed.bru'),
    postResponseScript: "bru.setVar('runtimeOnly', 'resolved-during-run');",
  });

  const variableAudit = JSON.parse(
    await callToolText(session.client, 'audit_variable_sources', {
      collectionPath,
    }),
  ) as {
    references: Array<{ directRequestReady: boolean; name: string; sourceTypes: string[] }>;
    summary: { missingReferences: number; uniqueMissingVariables: string[] };
  };
  assert.deepEqual(variableAudit.summary.uniqueMissingVariables, ['missingVar']);
  assert.equal(variableAudit.summary.missingReferences, 1);

  const references = new Map(
    variableAudit.references.map((reference) => [reference.name, reference]),
  );
  assert.ok(references.get('baseUrl')?.sourceTypes.includes('environment'));
  assert.ok(references.get('Products_id')?.sourceTypes.includes('environment'));
  assert.ok(references.get('authToken')?.sourceTypes.includes('collection'));
  assert.deepEqual(references.get('runtimeOnly')?.sourceTypes, ['runtime']);
  assert.equal(references.get('runtimeOnly')?.directRequestReady, false);
  assert.deepEqual(references.get('API_TOKEN')?.sourceTypes, ['process-env']);
  assert.deepEqual(references.get('API token')?.sourceTypes, ['prompt']);

  const runCommand = JSON.parse(
    await callToolText(session.client, 'run_collection', {
      collectionPath,
      dryRun: true,
      env: 'local',
      reporterJson: join(rootPath, 'report.json'),
      tags: ['contract'],
    }),
  ) as { args: string[]; dryRun: boolean };
  assert.equal(runCommand.dryRun, true);
  assert.deepEqual(runCommand.args.slice(0, 3), ['run', '--env', 'local']);
  assert.ok(runCommand.args.includes('--reporter-json'));
  assert.ok(runCommand.args.includes('--tags'));
});
