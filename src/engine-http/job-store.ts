import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { FeatureSliceArtifactBundle, FeatureRunReport } from '../bruno/feature-slice.js';
import type { EngineRunRequest } from './types.js';

export type EngineRunJobState = 'failed' | 'queued' | 'running' | 'succeeded';

export type EngineRunJobRecord = {
  artifacts: FeatureSliceArtifactBundle;
  createdAt: string;
  error?: string;
  finishedAt?: string;
  jobId: string;
  report?: FeatureRunReport;
  request: EngineRunRequest;
  startedAt?: string;
  state: EngineRunJobState;
};

export interface EngineRunJobStore {
  createQueuedJob(input: {
    artifacts: FeatureSliceArtifactBundle;
    request: EngineRunRequest;
  }): Promise<EngineRunJobRecord>;
  findActiveJob(collectionPath: string, sliceId: string): Promise<EngineRunJobRecord | undefined>;
  getJob(jobId: string): Promise<EngineRunJobRecord | undefined>;
  markJobFailed(jobId: string, error: string): Promise<EngineRunJobRecord | undefined>;
  markJobRunning(jobId: string): Promise<EngineRunJobRecord | undefined>;
  markJobSucceeded(jobId: string, report: FeatureRunReport): Promise<EngineRunJobRecord | undefined>;
}

export class InMemoryEngineRunJobStore implements EngineRunJobStore {
  private readonly jobs = new Map<string, EngineRunJobRecord>();

  constructor(
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly createJobId: () => string = () => `job_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
  ) {}

  async createQueuedJob(input: { artifacts: FeatureSliceArtifactBundle; request: EngineRunRequest }): Promise<EngineRunJobRecord> {
    const jobId = this.createJobId();
    const job: EngineRunJobRecord = {
      artifacts: input.artifacts,
      createdAt: this.now(),
      jobId,
      request: {
        ...input.request,
        correlation: {
          ...input.request.correlation,
          jobId,
        },
      },
      state: 'queued',
    };
    this.jobs.set(jobId, job);
    return job;
  }

  async findActiveJob(collectionPath: string, sliceId: string): Promise<EngineRunJobRecord | undefined> {
    return [...this.jobs.values()].find(
      (job) =>
        (job.state === 'queued' || job.state === 'running') &&
        job.request.collectionPath === collectionPath &&
        job.request.sliceId === sliceId,
    );
  }

  async getJob(jobId: string): Promise<EngineRunJobRecord | undefined> {
    return this.jobs.get(jobId);
  }

  async markJobRunning(jobId: string): Promise<EngineRunJobRecord | undefined> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return undefined;
    }
    job.state = 'running';
    job.startedAt = this.now();
    return job;
  }

  async markJobSucceeded(jobId: string, report: FeatureRunReport): Promise<EngineRunJobRecord | undefined> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return undefined;
    }
    job.finishedAt = this.now();
    job.report = report;
    job.state = 'succeeded';
    return job;
  }

  async markJobFailed(jobId: string, error: string): Promise<EngineRunJobRecord | undefined> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return undefined;
    }
    job.error = error;
    job.finishedAt = this.now();
    job.state = 'failed';
    return job;
  }
}

export type JsonFileEngineRunJobStoreOptions = {
  createJobId?: () => string;
  filePath?: string;
  now?: () => string;
};

export class JsonFileEngineRunJobStore implements EngineRunJobStore {
  private readonly createJobId: () => string;
  private readonly filePath: string;
  private readonly now: () => string;
  private mutationQueue: Promise<unknown> = Promise.resolve();

  constructor(options: JsonFileEngineRunJobStoreOptions = {}) {
    this.createJobId = options.createJobId || (() => `job_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
    this.filePath = options.filePath || join(tmpdir(), 'bruno-mcp-engine-http', 'run-jobs.json');
    this.now = options.now || (() => new Date().toISOString());
  }

  async createQueuedJob(input: { artifacts: FeatureSliceArtifactBundle; request: EngineRunRequest }): Promise<EngineRunJobRecord> {
    return this.mutateJobs((jobs) => {
      const jobId = this.createJobId();
      const job: EngineRunJobRecord = {
        artifacts: input.artifacts,
        createdAt: this.now(),
        jobId,
        request: {
          ...input.request,
          correlation: {
            ...input.request.correlation,
            jobId,
          },
        },
        state: 'queued',
      };
      jobs[jobId] = job;
      return job;
    });
  }

  async findActiveJob(collectionPath: string, sliceId: string): Promise<EngineRunJobRecord | undefined> {
    const jobs = await this.readJobs();
    return Object.values(jobs).find(
      (job) =>
        (job.state === 'queued' || job.state === 'running') &&
        job.request.collectionPath === collectionPath &&
        job.request.sliceId === sliceId,
    );
  }

  async getJob(jobId: string): Promise<EngineRunJobRecord | undefined> {
    const jobs = await this.readJobs();
    return jobs[jobId];
  }

  async markJobRunning(jobId: string): Promise<EngineRunJobRecord | undefined> {
    return this.mutateJobs((jobs) => {
      const job = jobs[jobId];
      if (!job) {
        return undefined;
      }
      job.startedAt = this.now();
      job.state = 'running';
      return job;
    });
  }

  async markJobSucceeded(jobId: string, report: FeatureRunReport): Promise<EngineRunJobRecord | undefined> {
    return this.mutateJobs((jobs) => {
      const job = jobs[jobId];
      if (!job) {
        return undefined;
      }
      job.finishedAt = this.now();
      job.report = report;
      job.state = 'succeeded';
      return job;
    });
  }

  async markJobFailed(jobId: string, error: string): Promise<EngineRunJobRecord | undefined> {
    return this.mutateJobs((jobs) => {
      const job = jobs[jobId];
      if (!job) {
        return undefined;
      }
      job.error = error;
      job.finishedAt = this.now();
      job.state = 'failed';
      return job;
    });
  }

  private async mutateJobs<T>(mutator: (jobs: Record<string, EngineRunJobRecord>) => T | Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(async () => {
      const jobs = await this.readJobs();
      const result = await mutator(jobs);
      await fs.mkdir(dirname(this.filePath), { recursive: true });
      await fs.writeFile(this.filePath, `${JSON.stringify(jobs, null, 2)}\n`);
      return result;
    });
    this.mutationQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  private async readJobs(): Promise<Record<string, EngineRunJobRecord>> {
    try {
      return JSON.parse(await fs.readFile(this.filePath, 'utf8')) as Record<string, EngineRunJobRecord>;
    } catch {
      return {};
    }
  }
}
