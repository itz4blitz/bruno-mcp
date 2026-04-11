import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { z } from 'zod';

import { createFeatureSliceManager } from '../bruno/feature-slice.js';
import type { FeatureSliceManager } from '../bruno/feature-slice.js';
import { createBrunoNativeManager } from '../bruno/native.js';
import { createOpenApiContractManager } from '../bruno/openapi.js';
import { createRequestBuilder } from '../bruno/request.js';
import { createWorkspaceManager } from '../bruno/workspace.js';
import { isAuthorizedRequest } from './auth.js';
import { EngineRunJobStore, JsonFileEngineRunJobStore } from './job-store.js';
import {
  ENGINE_HTTP_SCHEMA_REGISTRY,
  engineEnvelopeSchema,
  engineErrorSchema,
  engineInspectContractRequestSchema,
  engineInspectSliceRequestSchema,
  enginePlanRequestSchema,
  engineRunRequestSchema,
  engineRunStatusRequestSchema,
  engineScaffoldRequestSchema,
  engineValidateRequestSchema,
} from './schema.js';
import {
  ENGINE_SCHEMA_VERSION,
  EngineEnvelope,
  EngineInspectContractRequest,
  EngineInspectSliceRequest,
  EnginePlanRequest,
  EngineRunRequest,
  EngineScaffoldRequest,
  EngineValidateRequest,
} from './types.js';

type EngineHttpServerOptions = {
  host?: string;
  jobStore?: EngineRunJobStore;
  port?: number;
  token?: string;
};

function getEngineVersion(): string {
  return '1.0.0';
}

function jsonEnvelope<T>(data: T): EngineEnvelope<T> {
  return {
    data,
    engineVersion: getEngineVersion(),
    runtime: 'bruno',
    schemaVersion: ENGINE_SCHEMA_VERSION,
  };
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return (raw.length > 0 ? JSON.parse(raw) : {}) as T;
}

function validateBody<T>(payload: unknown, schema: z.ZodType<T>): T {
  return schema.parse(payload);
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(`${JSON.stringify(payload)}\n`);
}

export class EngineHttpServer {
  private readonly nativeManager = createBrunoNativeManager();
  private readonly openApiContractManager = createOpenApiContractManager();
  private readonly requestBuilder = createRequestBuilder();
  private readonly workspaceManager = createWorkspaceManager();
  private readonly featureSliceManager = createFeatureSliceManager(
    this.nativeManager,
    this.requestBuilder,
    this.workspaceManager,
  );
  private readonly jobStore: EngineRunJobStore;
  private server?: Server;

  constructor(private readonly options: EngineHttpServerOptions = {}) {
    this.jobStore = options.jobStore || new JsonFileEngineRunJobStore();
  }

  async start(): Promise<{ host: string; port: number }> {
    if (this.server) {
      const address = this.server.address();
      if (address && typeof address !== 'string') {
        return { host: address.address, port: address.port };
      }
    }

    this.server = createServer((request, response) => {
      void this.handleRequest(request, response);
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.options.port || 0, this.options.host || '127.0.0.1', () => {
        this.server!.off('error', reject);
        resolve();
      });
    });

    const address = this.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind engine HTTP server');
    }
    return { host: address.address, port: address.port };
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      this.server!.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    this.server = undefined;
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      if (!request.url) {
        writeJson(response, 400, { error: 'missing_url' });
        return;
      }

      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/engine/health') {
        writeJson(response, 200, this.validateSuccessEnvelopeForRoute('health', { status: 'ok' }));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/engine/version') {
        writeJson(
          response,
          200,
          this.validateSuccessEnvelopeForRoute('version', {
            engineVersion: getEngineVersion(),
            schemaVersion: ENGINE_SCHEMA_VERSION,
            supportedSchemaVersions: [ENGINE_SCHEMA_VERSION],
          }),
        );
        return;
      }

      if (!isAuthorizedRequest(request, this.options.token)) {
        writeJson(response, 401, { error: 'unauthorized' });
        return;
      }

      const requestedSchemaVersion = request.headers['x-bruno-schema-version'];
      if (requestedSchemaVersion && Number(requestedSchemaVersion) !== ENGINE_SCHEMA_VERSION) {
        writeJson(response, 409, {
          engineVersion: getEngineVersion(),
          error: 'schema_version_mismatch',
          schemaVersion: ENGINE_SCHEMA_VERSION,
          supportedSchemaVersions: [ENGINE_SCHEMA_VERSION],
        });
        return;
      }

      if (request.method !== 'POST' && !(request.method === 'GET' && url.pathname === '/engine/run-status')) {
        writeJson(response, 405, { error: 'method_not_allowed' });
        return;
      }

      switch (url.pathname) {
        case '/engine/inspect-contract': {
          const body = validateBody(
            await readJsonBody<EngineInspectContractRequest>(request),
            engineInspectContractRequestSchema,
          );
          const controllers = await this.openApiContractManager.ingestFile(body.contractPath);
          writeJson(response, 200, this.validateSuccessEnvelopeForRoute('inspectContract', { contractPath: body.contractPath, controllers }));
          return;
        }
        case '/engine/plan': {
          const body = validateBody(await readJsonBody<EnginePlanRequest>(request), enginePlanRequestSchema);
          const controllerContract = body.controllerContractPath
            ? await this.loadControllerContract(body.controllerContractPath, body.featureName)
            : undefined;
          const plan = await this.featureSliceManager.planFeatureSlice({
            ...body,
            controllerContract,
          });
          const artifacts = await this.featureSliceManager.getArtifactBundle(body.collectionPath, plan.sliceId);
          writeJson(response, 200, this.validateSuccessEnvelopeForRoute('plan', { artifacts, plan }));
          return;
        }
        case '/engine/scaffold': {
          const body = validateBody(await readJsonBody<EngineScaffoldRequest>(request), engineScaffoldRequestSchema);
          const controllerContract = body.controllerContractPath
            ? await this.loadControllerContract(body.controllerContractPath, body.featureName)
            : undefined;
          const scaffold = await this.featureSliceManager.scaffoldFeatureSlice({
            ...body,
            controllerContract,
          });
          const artifacts = await this.featureSliceManager.getArtifactBundle(body.collectionPath, slugify(body.featureName));
          writeJson(response, 200, this.validateSuccessEnvelopeForRoute('scaffold', { artifacts, scaffold }));
          return;
        }
        case '/engine/validate': {
          const body = validateBody(await readJsonBody<EngineValidateRequest>(request), engineValidateRequestSchema);
          const validation = await this.featureSliceManager.validateFeatureSlice(body.collectionPath, body.sliceId);
          writeJson(response, 200, this.validateSuccessEnvelopeForRoute('validate', validation));
          return;
        }
        case '/engine/inspect-run-manifest': {
          const body = validateBody(await readJsonBody<EngineInspectSliceRequest>(request), engineInspectSliceRequestSchema);
          const manifest = await this.featureSliceManager.inspectRunManifest(body.collectionPath, body.sliceId);
          const artifacts = await this.featureSliceManager.getArtifactBundle(body.collectionPath, body.sliceId);
          writeJson(response, 200, this.validateSuccessEnvelopeForRoute('inspectRunManifest', { artifacts, manifest }));
          return;
        }
        case '/engine/validate-run-manifest': {
          const body = validateBody(await readJsonBody<EngineInspectSliceRequest>(request), engineInspectSliceRequestSchema);
          const validation = await this.featureSliceManager.validateRunManifest(body.collectionPath, body.sliceId);
          const artifacts = await this.featureSliceManager.getArtifactBundle(body.collectionPath, body.sliceId);
          writeJson(response, 200, this.validateSuccessEnvelopeForRoute('validateRunManifest', { artifacts, validation }));
          return;
        }
        case '/engine/inspect-support-graph': {
          const body = validateBody(await readJsonBody<EngineInspectSliceRequest>(request), engineInspectSliceRequestSchema);
          const supportGraph = await this.featureSliceManager.inspectSupportGraph(body.collectionPath, body.sliceId);
          const artifacts = await this.featureSliceManager.getArtifactBundle(body.collectionPath, body.sliceId);
          writeJson(response, 200, this.validateSuccessEnvelopeForRoute('inspectSupportGraph', { artifacts, supportGraph }));
          return;
        }
        case '/engine/run': {
          const body = validateBody(await readJsonBody<EngineRunRequest>(request), engineRunRequestSchema);
          const artifacts = await this.featureSliceManager.getArtifactBundle(body.collectionPath, body.sliceId);
          if (body.mode === 'async') {
            const active = await this.jobStore.findActiveJob(body.collectionPath, body.sliceId);
            if (active) {
              writeJson(response, 409, { error: 'run_already_active' });
              return;
            }
            const job = await this.jobStore.createQueuedJob({
              artifacts,
              request: body,
            });
            queueMicrotask(() => {
              void this.executeAsyncRun(job.jobId);
            });
            writeJson(
              response,
              202,
              this.validateSuccessEnvelopeForRoute('run', {
                artifacts,
                correlation: job.request.correlation,
                jobId: job.jobId,
                pollUrl: `/engine/run-status?jobId=${encodeURIComponent(job.jobId)}`,
                state: 'queued',
              }),
            );
            return;
          }
          const report = await this.featureSliceManager.runFeatureSlice(body);
          writeJson(response, 200, this.validateSuccessEnvelopeForRoute('run', { artifacts, report }));
          return;
        }
        case '/engine/run-status': {
          if (request.method !== 'GET') {
            writeJson(response, 405, { error: 'method_not_allowed' });
            return;
          }
          const body = validateBody({ jobId: url.searchParams.get('jobId') || '' }, engineRunStatusRequestSchema);
          const jobId = body.jobId;
          const job = await this.jobStore.getJob(jobId);
          if (!job) {
            writeJson(response, 404, { error: 'job_not_found' });
            return;
          }
          writeJson(
            response,
            200,
            this.validateSuccessEnvelopeForRoute('runStatus', {
              artifacts: job.artifacts,
              correlation: job.request.correlation,
              error: job.error,
              finishedAt: job.finishedAt,
              jobId: job.jobId,
              report: job.report,
              startedAt: job.startedAt,
              state: job.state,
            }),
          );
          return;
        }
        default:
          writeJson(response, 404, { error: 'not_found' });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        writeJson(response, 400, { error: 'validation_error', issues: error.issues });
        return;
      }
      if (error instanceof SyntaxError) {
        writeJson(response, 400, { error: 'invalid_json' });
        return;
      }
      writeJson(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private validateSuccessEnvelopeForRoute<T>(
    routeName: keyof typeof ENGINE_HTTP_SCHEMA_REGISTRY,
    data: T,
  ): EngineEnvelope<T> {
    const route = ENGINE_HTTP_SCHEMA_REGISTRY[routeName];
    return engineEnvelopeSchema(route.responseData).parse(jsonEnvelope(data)) as EngineEnvelope<T>;
  }

  private async executeAsyncRun(jobId: string): Promise<void> {
    const job = await this.jobStore.getJob(jobId);
    if (!job) {
      return;
    }
    await this.jobStore.markJobRunning(jobId);
    try {
      const report = await this.featureSliceManager.runFeatureSlice(job.request);
      await this.jobStore.markJobSucceeded(jobId, report);
    } catch (error) {
      await this.jobStore.markJobFailed(jobId, error instanceof Error ? error.message : String(error));
    }
  }

  private async loadControllerContract(contractPath: string, featureName: string) {
    const contracts = await this.openApiContractManager.ingestFile(contractPath);
    const normalizedFeatureName = featureName.toLowerCase();
    return (
      contracts.find((contract) => contract.controllerName.toLowerCase() === normalizedFeatureName) ||
      contracts.find((contract) => contract.controllerName.toLowerCase().includes(normalizedFeatureName)) ||
      contracts[0]
    );
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function createEngineHttpServer(options: EngineHttpServerOptions = {}): EngineHttpServer {
  return new EngineHttpServer(options);
}
