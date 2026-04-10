import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';

import { createFeatureSliceManager } from '../bruno/feature-slice.js';
import { createBrunoNativeManager } from '../bruno/native.js';
import { createOpenApiContractManager } from '../bruno/openapi.js';
import { createRequestBuilder } from '../bruno/request.js';
import { createWorkspaceManager } from '../bruno/workspace.js';
import { isAuthorizedRequest } from './auth.js';
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
  private server?: Server;

  constructor(private readonly options: EngineHttpServerOptions = {}) {}

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
        writeJson(response, 200, jsonEnvelope({ status: 'ok' }));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/engine/version') {
        writeJson(response, 200, jsonEnvelope({ version: getEngineVersion() }));
        return;
      }

      if (!isAuthorizedRequest(request, this.options.token)) {
        writeJson(response, 401, { error: 'unauthorized' });
        return;
      }

      if (request.method !== 'POST') {
        writeJson(response, 405, { error: 'method_not_allowed' });
        return;
      }

      switch (url.pathname) {
        case '/engine/inspect-contract': {
          const body = await readJsonBody<EngineInspectContractRequest>(request);
          const controllers = await this.openApiContractManager.ingestFile(body.contractPath);
          writeJson(response, 200, jsonEnvelope({ contractPath: body.contractPath, controllers }));
          return;
        }
        case '/engine/plan': {
          const body = await readJsonBody<EnginePlanRequest>(request);
          const controllerContract = body.controllerContractPath
            ? await this.loadControllerContract(body.controllerContractPath, body.featureName)
            : undefined;
          const plan = await this.featureSliceManager.planFeatureSlice({
            ...body,
            controllerContract,
          });
          const artifacts = await this.featureSliceManager.getArtifactBundle(body.collectionPath, plan.sliceId);
          writeJson(response, 200, jsonEnvelope({ artifacts, plan }));
          return;
        }
        case '/engine/scaffold': {
          const body = await readJsonBody<EngineScaffoldRequest>(request);
          const controllerContract = body.controllerContractPath
            ? await this.loadControllerContract(body.controllerContractPath, body.featureName)
            : undefined;
          const scaffold = await this.featureSliceManager.scaffoldFeatureSlice({
            ...body,
            controllerContract,
          });
          const artifacts = await this.featureSliceManager.getArtifactBundle(body.collectionPath, slugify(body.featureName));
          writeJson(response, 200, jsonEnvelope({ artifacts, scaffold }));
          return;
        }
        case '/engine/validate': {
          const body = await readJsonBody<EngineValidateRequest>(request);
          const validation = await this.featureSliceManager.validateFeatureSlice(body.collectionPath, body.sliceId);
          writeJson(response, 200, jsonEnvelope(validation));
          return;
        }
        case '/engine/inspect-run-manifest': {
          const body = await readJsonBody<EngineInspectSliceRequest>(request);
          const manifest = await this.featureSliceManager.inspectRunManifest(body.collectionPath, body.sliceId);
          const artifacts = await this.featureSliceManager.getArtifactBundle(body.collectionPath, body.sliceId);
          writeJson(response, 200, jsonEnvelope({ artifacts, manifest }));
          return;
        }
        case '/engine/validate-run-manifest': {
          const body = await readJsonBody<EngineInspectSliceRequest>(request);
          const validation = await this.featureSliceManager.validateRunManifest(body.collectionPath, body.sliceId);
          const artifacts = await this.featureSliceManager.getArtifactBundle(body.collectionPath, body.sliceId);
          writeJson(response, 200, jsonEnvelope({ artifacts, validation }));
          return;
        }
        case '/engine/inspect-support-graph': {
          const body = await readJsonBody<EngineInspectSliceRequest>(request);
          const supportGraph = await this.featureSliceManager.inspectSupportGraph(body.collectionPath, body.sliceId);
          const artifacts = await this.featureSliceManager.getArtifactBundle(body.collectionPath, body.sliceId);
          writeJson(response, 200, jsonEnvelope({ artifacts, supportGraph }));
          return;
        }
        case '/engine/run': {
          const body = await readJsonBody<EngineRunRequest>(request);
          const report = await this.featureSliceManager.runFeatureSlice(body);
          const artifacts = await this.featureSliceManager.getArtifactBundle(body.collectionPath, body.sliceId);
          writeJson(response, 200, jsonEnvelope({ artifacts, report }));
          return;
        }
        default:
          writeJson(response, 404, { error: 'not_found' });
      }
    } catch (error) {
      writeJson(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
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
