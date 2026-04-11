import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ENGINE_HTTP_SCHEMA_VERSION,
  getEngineHttpJsonSchemas,
  getEngineHttpSchemas,
  BrunoEngineClient,
  BrunoEngineHttpError,
  BrunoEngineVersionMismatchError,
  BrunoEngineProtocolError,
} from '../../src/index.js';

test('engine HTTP schema registry exports all expected route schemas', () => {
  const schemas = getEngineHttpSchemas();
  assert.equal(ENGINE_HTTP_SCHEMA_VERSION, 1);
  assert.ok(schemas.inspectContract.request);
  assert.ok(schemas.plan.request);
  assert.ok(schemas.scaffold.request);
  assert.ok(schemas.validate.request);
  assert.ok(schemas.inspectRunManifest.request);
  assert.ok(schemas.validateRunManifest.request);
  assert.ok(schemas.inspectSupportGraph.request);
  assert.ok(schemas.run.request);
  assert.ok(schemas.health.responseData);
  assert.ok(schemas.version.responseData);
});

test('engine HTTP JSON schema export includes route metadata and envelope fields', () => {
  const schemas = getEngineHttpJsonSchemas();
  assert.equal(schemas.version.path, '/engine/version');
  assert.equal(schemas.run.method, 'POST');
  assert.equal(schemas.runStatus.authRequired, true);
  const definitions = (schemas.health.successEnvelope as { definitions?: Record<string, { properties?: Record<string, unknown>; type?: string }> }).definitions || {};
  const root = definitions.healthSuccessEnvelope;
  assert.equal(root?.type, 'object');
  const properties = root?.properties || {};
  assert.ok(properties.schemaVersion);
  assert.ok(properties.engineVersion);
  assert.ok(properties.runtime);
  assert.ok(properties.data);
});

test('BrunoEngineClient unwraps envelopes and injects bearer auth', async () => {
  const requests: Array<{ headers?: unknown; path: string }> = [];
  const client = new BrunoEngineClient({
    baseUrl: 'http://engine.test',
    fetch: async (input, init) => {
      requests.push({ headers: init?.headers, path: String(input) });
      return new Response(
        JSON.stringify({
          data: { status: 'ok' },
          engineVersion: '1.0.0',
          runtime: 'bruno',
          schemaVersion: 1,
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      );
    },
    token: 'secret',
  });

  const health = await client.health();
  assert.equal(health.status, 'ok');
  assert.match(requests[0]!.path, /\/engine\/health$/);
  assert.equal(new Headers(requests[0]!.headers as any).get('authorization'), 'Bearer secret');
});

test('BrunoEngineClient throws typed errors for HTTP and protocol failures', async () => {
  const httpClient = new BrunoEngineClient({
    baseUrl: 'http://engine.test',
    fetch: async () =>
      new Response(JSON.stringify({ error: 'unauthorized' }), {
        headers: { 'content-type': 'application/json' },
        status: 401,
      }),
  });
  await assert.rejects(httpClient.health(), BrunoEngineHttpError);

  const protocolClient = new BrunoEngineClient({
    baseUrl: 'http://engine.test',
    fetch: async () =>
      new Response(JSON.stringify({ runtime: 'bruno', schemaVersion: 999 }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
  });
  await assert.rejects(protocolClient.health(), BrunoEngineProtocolError);
});

test('BrunoEngineClient sends schema-version header and throws version mismatch errors', async () => {
  const seenHeaders: Array<string | null> = [];
  const mismatchClient = new BrunoEngineClient({
    baseUrl: 'http://engine.test',
    expectedSchemaVersion: 2,
    fetch: async (_input, init) => {
      seenHeaders.push(new Headers(init?.headers as any).get('x-bruno-schema-version'));
      return new Response(
        JSON.stringify({
          engineVersion: '1.0.0',
          error: 'schema_version_mismatch',
          schemaVersion: 1,
          supportedSchemaVersions: [1],
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 409,
        },
      );
    },
  });

  await assert.rejects(mismatchClient.health(), BrunoEngineVersionMismatchError);
  assert.equal(seenHeaders[0], '2');
});

test('engine barrel re-exports server and client surfaces', async () => {
  const engineModule = await import('../../src/engine-http/index.js');
  assert.equal(typeof engineModule.createEngineHttpServer, 'function');
  assert.equal(typeof engineModule.createBrunoEngineClient, 'function');
  assert.equal(typeof engineModule.getEngineHttpJsonSchemas, 'function');
});
