import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
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

  const listCollectionsText = await callToolText(session.client, 'list_collections', {
    path: rootPath,
  });
  assert.match(listCollectionsText, /integration-api/);

  const statsText = await callToolText(session.client, 'get_collection_stats', {
    collectionPath,
  });
  assert.match(statsText, /Total requests: 7/);
  assert.match(statsText, /GET: 3/);
  assert.match(statsText, /POST: 2/);
  assert.match(statsText, /PUT: 1/);
  assert.match(statsText, /DELETE: 1/);

  const requestFile = await readFile(bruFilePath, 'utf8');
  assert.match(requestFile, /tests \{/);
  assert.match(requestFile, /expect\(res.status\)\.to.equal\(200\)/);

  const graphqlFile = await readFile(join(collectionPath, 'list-users-graphql.bru'), 'utf8');
  assert.match(graphqlFile, /body:graphql \{/);
  assert.match(graphqlFile, /body:graphql:vars \{/);
});
