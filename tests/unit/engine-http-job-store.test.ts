import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { JsonFileEngineRunJobStore } from '../../src/index.js';

test('JsonFileEngineRunJobStore persists queued to succeeded transitions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bruno-job-store-'));
  const filePath = join(root, 'jobs.json');
  const store = new JsonFileEngineRunJobStore({
    createJobId: () => 'job-fixed',
    filePath,
    now: () => '2026-01-01T00:00:00.000Z',
  });

  const queued = await store.createQueuedJob({
    artifacts: {
      artifactsManifestPath: '/tmp/artifacts.json',
      coveragePath: '/tmp/coverage.json',
      findingsPath: '/tmp/findings.json',
      generatedDataPath: '/tmp/generated-data.json',
      manifestPath: '/tmp/slice.json',
      runManifestPath: '/tmp/run-manifest.json',
      runReportPath: '/tmp/run-report.json',
      runSummaryMarkdownPath: '/tmp/run-summary.md',
      supportGraphPath: '/tmp/support-graph.json',
      validationSummaryMarkdownPath: '/tmp/validation-summary.md',
    },
    request: {
      collectionPath: '/tmp/collection',
      correlation: { projectId: 'project-1' },
      env: 'test',
      sliceId: 'users',
    },
  });
  assert.equal(queued.jobId, 'job-fixed');
  assert.equal(queued.request.correlation?.jobId, 'job-fixed');

  await store.markJobRunning('job-fixed');
  await store.markJobSucceeded('job-fixed', {
    cleanupOutcomes: [],
    collectionDefects: [],
    correlation: { jobId: 'job-fixed', projectId: 'project-1' },
    env: 'test',
    exitStatus: 'passed',
    passCount: 1,
    productDefects: [],
    profile: 'smoke',
    setupFailures: [],
    sliceId: 'users',
    stepResults: [],
    totalSteps: 1,
  });

  const reloaded = new JsonFileEngineRunJobStore({ filePath });
  const job = await reloaded.getJob('job-fixed');
  assert.equal(job?.state, 'succeeded');
  assert.equal(job?.report?.exitStatus, 'passed');
});

test('JsonFileEngineRunJobStore finds only active jobs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bruno-job-store-active-'));
  const filePath = join(root, 'jobs.json');
  const store = new JsonFileEngineRunJobStore({
    createJobId: (() => {
      let index = 0;
      return () => `job-${++index}`;
    })(),
    filePath,
  });

  const first = await store.createQueuedJob({
    artifacts: {
      artifactsManifestPath: '/tmp/artifacts.json',
      coveragePath: '/tmp/coverage.json',
      findingsPath: '/tmp/findings.json',
      generatedDataPath: '/tmp/generated-data.json',
      manifestPath: '/tmp/slice.json',
      runManifestPath: '/tmp/run-manifest.json',
      runReportPath: '/tmp/run-report.json',
      runSummaryMarkdownPath: '/tmp/run-summary.md',
      supportGraphPath: '/tmp/support-graph.json',
      validationSummaryMarkdownPath: '/tmp/validation-summary.md',
    },
    request: { collectionPath: '/tmp/collection', env: 'test', sliceId: 'users' },
  });
  await store.markJobFailed(first.jobId, 'boom');

  const second = await store.createQueuedJob({
    artifacts: first.artifacts,
    request: { collectionPath: '/tmp/collection', env: 'test', sliceId: 'users' },
  });
  const active = await store.findActiveJob('/tmp/collection', 'users');
  assert.equal(active?.jobId, second.jobId);
});
