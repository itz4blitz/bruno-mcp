import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createConverterManager } from '../../src/bruno/converters.js';

test('ConverterManager builds Bruno CLI import commands for OpenAPI and WSDL', () => {
  const manager = createConverterManager();

  assert.deepEqual(
    manager.buildImportCommand({
      type: 'openapi',
      source: 'api.yml',
      output: 'collections/api',
      collectionName: 'API',
      collectionFormat: 'bru',
      groupBy: 'path',
      dryRun: true,
    }).args,
    [
      'import',
      'openapi',
      '--source',
      'api.yml',
      '--output',
      'collections/api',
      '--collection-name',
      'API',
      '--collection-format',
      'bru',
      '--group-by',
      'path',
    ],
  );

  assert.deepEqual(
    manager.buildImportCommand({
      type: 'wsdl',
      source: 'service.wsdl',
      outputFile: 'soap.json',
      collectionName: 'SOAP',
      insecure: true,
      dryRun: true,
    }).args,
    [
      'import',
      'wsdl',
      '--source',
      'service.wsdl',
      '--output-file',
      'soap.json',
      '--collection-name',
      'SOAP',
      '--insecure',
    ],
  );
});

test('ConverterManager converts Postman collections to Bruno export JSON', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'bruno-converter-'));
  const inputPath = join(rootPath, 'postman.json');
  const outputPath = join(rootPath, 'bruno.json');
  await writeFile(
    inputPath,
    JSON.stringify({
      info: {
        name: 'Postman Demo',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      item: [
        {
          name: 'Ping',
          request: {
            method: 'GET',
            url: 'https://example.com/ping',
          },
        },
      ],
    }),
  );

  const result = await createConverterManager().convertToBrunoExport({
    type: 'postman',
    source: inputPath,
    outputFile: outputPath,
  });

  assert.equal(result.success, true);
  const converted = JSON.parse(await readFile(outputPath, 'utf8')) as { name?: string };
  assert.equal(converted.name, 'Postman Demo');

  const outboundPath = join(rootPath, 'postman-out.json');
  const outbound = await createConverterManager().convertFromBrunoExport({
    source: outputPath,
    outputFile: outboundPath,
    target: 'postman',
  });

  assert.equal(outbound.success, true);
  const postman = JSON.parse(await readFile(outboundPath, 'utf8')) as { info?: { name?: string } };
  assert.equal(postman.info?.name, 'Postman Demo');
});
