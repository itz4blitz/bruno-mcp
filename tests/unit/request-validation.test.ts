import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeAssertions,
  normalizeRequestSettings,
  normalizeRequestAuth,
} from '../../src/bruno/request-validation.js';

test('normalizeAssertions accepts documented and legacy Bruno operators', () => {
  assert.deepEqual(
    normalizeAssertions([
      { name: 'res.status', value: 'equals 200' },
      { name: "res.headers['content-type']", value: 'contains application/json' },
      { name: 'res.body.items', value: 'isArray' },
      { name: 'res.responseTime', value: 'lt 1000' },
      { enabled: false, name: 'res.body.total', value: 'eq 3' },
    ]),
    [
      { enabled: true, name: 'res.status', value: 'eq 200' },
      { enabled: true, name: "res.headers['content-type']", value: 'contains application/json' },
      { enabled: true, name: 'res.body.items', value: 'isArray' },
      { enabled: true, name: 'res.responseTime', value: 'lt 1000' },
      { enabled: false, name: 'res.body.total', value: 'eq 3' },
    ],
  );
});

test('normalizeAssertions rejects shallow or unsupported assertion operators', () => {
  assert.throws(
    () => normalizeAssertions([{ name: 'res.status', value: 'roughly 200' }]),
    /Unsupported Bruno assertion operator "roughly"/,
  );

  assert.throws(
    () => normalizeAssertions([{ name: 'res.status', value: 'eq' }]),
    /requires an expected value/,
  );

  assert.throws(
    () => normalizeAssertions([{ name: '', value: 'eq 200' }]),
    /Assertion target is required/,
  );
});

test('normalizeRequestSettings enforces Bruno request setting ranges', () => {
  assert.deepEqual(
    normalizeRequestSettings({
      encodeUrl: false,
      followRedirects: true,
      maxRedirects: 10,
      timeout: 30000,
    }),
    {
      encodeUrl: false,
      followRedirects: true,
      maxRedirects: 10,
      timeout: 30000,
    },
  );

  assert.throws(
    () => normalizeRequestSettings({ timeout: 999 }),
    /timeout must be between 1000 and 300000/,
  );

  assert.throws(
    () => normalizeRequestSettings({ maxRedirects: 51 }),
    /maxRedirects must be between 1 and 50/,
  );

  assert.throws(
    () => normalizeRequestSettings({ randomSetting: true }),
    /Unsupported Bruno request setting "randomSetting"/,
  );
});

test('normalizeRequestAuth accepts Bruno auth modes and aliases', () => {
  assert.deepEqual(
    normalizeRequestAuth({
      type: 'api-key',
      config: { key: 'X-API-Key', value: '{{apiKey}}', placement: 'header' },
    }),
    {
      type: 'apikey',
      config: { key: 'X-API-Key', value: '{{apiKey}}', placement: 'header' },
    },
  );

  assert.deepEqual(
    normalizeRequestAuth({
      type: 'aws-sig-v4',
      config: {
        accessKeyId: '{{AWS_ACCESS_KEY_ID}}',
        secretAccessKey: '{{AWS_SECRET_ACCESS_KEY}}',
        service: 'execute-api',
        region: 'us-east-1',
      },
    }),
    {
      type: 'awsv4',
      config: {
        accessKeyId: '{{AWS_ACCESS_KEY_ID}}',
        secretAccessKey: '{{AWS_SECRET_ACCESS_KEY}}',
        service: 'execute-api',
        region: 'us-east-1',
      },
    },
  );

  assert.throws(
    () => normalizeRequestAuth({ type: 'ntlm', config: { username: 'user' } }),
    /password is required for ntlm auth/,
  );
});
