import assert from 'node:assert/strict';
import test from 'node:test';

import type { ContractCoverageManifest } from '../../src/bruno/contract-coverage.js';
import { createBrunoRunReportManager } from '../../src/bruno/run-report.js';

test('BrunoRunReportManager normalizes Bruno JSON reporter output', () => {
  const manager = createBrunoRunReportManager();
  const report = manager.parseJsonReport([
    {
      iterationIndex: 0,
      results: [
        {
          name: 'List products',
          path: 'Contract Suite/Products/list.bru',
          request: { method: 'GET', url: '{{baseUrl}}/Products' },
          response: { status: 200 },
          runDuration: 42,
          status: 'pass',
        },
        {
          error: 'Expected status 201 but received 500',
          name: 'Create product',
          path: 'Contract Suite/Products/create.bru',
          request: { method: 'POST', url: '{{baseUrl}}/Products' },
          response: { status: 500 },
          status: 'fail',
        },
        {
          name: 'Delete product',
          path: 'Contract Suite/Products/delete.bru',
          request: { method: 'DELETE', url: '{{baseUrl}}/Products/{{id}}' },
          status: 'skipped',
        },
      ],
      summary: {
        failedRequests: 1,
        passedRequests: 1,
        skippedRequests: 1,
        totalRequests: 3,
      },
    },
  ]);

  assert.equal(report.format, 'bruno-json');
  assert.deepEqual(report.summary, { failed: 1, passed: 1, skipped: 1, total: 3 });
  assert.deepEqual(
    report.requests.map((request) => ({
      method: request.method,
      path: request.path,
      status: request.status,
      statusCode: request.statusCode,
    })),
    [
      {
        method: 'GET',
        path: 'Contract Suite/Products/list.bru',
        status: 'passed',
        statusCode: 200,
      },
      {
        method: 'POST',
        path: 'Contract Suite/Products/create.bru',
        status: 'failed',
        statusCode: 500,
      },
      {
        method: 'DELETE',
        path: 'Contract Suite/Products/delete.bru',
        status: 'skipped',
        statusCode: undefined,
      },
    ],
  );
});

test('BrunoRunReportManager normalizes JUnit XML reporter output', () => {
  const manager = createBrunoRunReportManager();
  const report = manager.parseJunitReport(`
    <testsuite name="Bruno" tests="3" failures="1" skipped="1">
      <testcase classname="Contract Suite.Products" name="List products" file="Contract Suite/Products/list.bru" time="0.041" />
      <testcase classname="Contract Suite.Products" name="Create product" file="Contract Suite/Products/create.bru">
        <failure message="Expected status 201 but received 500">stack</failure>
      </testcase>
      <testcase classname="Contract Suite.Products" name="Delete product" file="Contract Suite/Products/delete.bru">
        <skipped message="Scenario disabled" />
      </testcase>
    </testsuite>
  `);

  assert.equal(report.format, 'junit-xml');
  assert.deepEqual(report.summary, { failed: 1, passed: 1, skipped: 1, total: 3 });
  assert.deepEqual(
    report.requests.map((request) => ({
      durationMs: request.durationMs,
      error: request.error,
      name: request.name,
      path: request.path,
      status: request.status,
    })),
    [
      {
        durationMs: 41,
        error: undefined,
        name: 'List products',
        path: 'Contract Suite/Products/list.bru',
        status: 'passed',
      },
      {
        durationMs: undefined,
        error: 'Expected status 201 but received 500',
        name: 'Create product',
        path: 'Contract Suite/Products/create.bru',
        status: 'failed',
      },
      {
        durationMs: undefined,
        error: 'Scenario disabled',
        name: 'Delete product',
        path: 'Contract Suite/Products/delete.bru',
        status: 'skipped',
      },
    ],
  );
});

test('BrunoRunReportManager reconciles manifest coverage against runtime results', () => {
  const manifest = sampleManifest();
  const manager = createBrunoRunReportManager();
  const report = manager.parseJsonReport([
    {
      iterationIndex: 0,
      results: [
        {
          name: 'List products',
          path: 'Contract Suite/Products/list.bru',
          request: { method: 'GET', url: '{{baseUrl}}/Products' },
          status: 'pass',
        },
        {
          error: 'Expected status 201 but received 500',
          name: 'Create product',
          path: 'Contract Suite/Products/create.bru',
          request: { method: 'POST', url: '{{baseUrl}}/Products' },
          status: 'fail',
        },
        {
          name: 'Delete product',
          path: 'Contract Suite/Products/delete.bru',
          request: { method: 'DELETE', url: '{{baseUrl}}/Products/{{id}}' },
          status: 'skipped',
        },
      ],
      summary: {
        failedRequests: 1,
        passedRequests: 1,
        skippedRequests: 1,
        totalRequests: 3,
      },
    },
  ]);

  const reconciliation = manager.reconcileCoverage(manifest, report);
  const byId = new Map(reconciliation.items.map((item) => [item.id, item]));

  assert.equal(byId.get('endpoint:get-products')?.status, 'covered');
  assert.equal(byId.get('endpoint:get-products')?.runtimeStatus, 'passed');
  assert.equal(byId.get('payload:post-products')?.status, 'covered');
  assert.equal(byId.get('payload:post-products')?.runtimeStatus, 'failed');
  assert.equal(byId.get('negative:delete-products-id')?.runtimeStatus, 'skipped');
  assert.equal(byId.get('negative:patch-products-id')?.runtimeStatus, 'not-run');
  assert.equal(byId.get('response:get-products:value')?.runtimeStatus, 'not-run');
  assert.deepEqual(reconciliation.summary.runtime, {
    failedItems: 1,
    notRunItems: 2,
    passedItems: 1,
    skippedItems: 1,
    totalItems: 5,
  });
});

function sampleManifest(): ContractCoverageManifest {
  const items: ContractCoverageManifest['items'] = [
    {
      category: 'endpoint',
      coveredBy: ['Contract Suite/Products/list.bru'],
      id: 'endpoint:get-products',
      method: 'GET',
      path: '/Products',
      required: true,
      requirement: 'Exercise endpoint GET /Products',
      status: 'covered',
    },
    {
      category: 'payload-field',
      coveredBy: ['Contract Suite/Products/create.bru'],
      fieldPath: 'name',
      id: 'payload:post-products',
      method: 'POST',
      path: '/Products',
      required: true,
      requirement: 'Cover request payload field name',
      status: 'covered',
    },
    {
      category: 'negative-scenario',
      coveredBy: ['Contract Suite/Products/delete.bru'],
      id: 'negative:delete-products-id',
      method: 'DELETE',
      path: '/Products/{id}',
      required: true,
      requirement: 'Reject invalid product id',
      scenario: 'bad-key',
      status: 'covered',
    },
    {
      category: 'negative-scenario',
      coveredBy: ['Contract Suite/Products/missing.bru'],
      id: 'negative:patch-products-id',
      method: 'PATCH',
      path: '/Products/{id}',
      required: true,
      requirement: 'Reject unsupported patch',
      scenario: 'unsupported-method',
      status: 'covered',
    },
    {
      category: 'response-field',
      coveredBy: [],
      fieldPath: 'value',
      id: 'response:get-products:value',
      method: 'GET',
      path: '/Products',
      required: true,
      requirement: 'Assert response value',
      status: 'uncovered',
    },
  ];

  return {
    generatedAt: '2026-05-14T00:00:00.000Z',
    items,
    schemaVersion: 1,
    source: {
      format: 'openapi',
      location: 'openapi.json',
      title: 'Products API',
      version: '1.0.0',
    },
    summary: {
      byCategory: {},
      requiredItems: items.length,
      totalItems: items.length,
    },
  };
}
