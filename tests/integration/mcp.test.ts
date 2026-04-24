import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { callToolText, createMcpTestClient } from '../helpers/mcp-client.js';

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
      tenantId: 85,
    },
  });
  assert.match(updateEnvironmentAliasText, /Updated environment/);

  const updatedAliasEnvironment = JSON.parse(
    await callToolText(session.client, 'get_environment', {
      collectionPath,
      environmentName: 'empty',
    }),
  ) as { variables: Record<string, string> };
  assert.deepEqual(updatedAliasEnvironment.variables, { tenantId: '85' });

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
