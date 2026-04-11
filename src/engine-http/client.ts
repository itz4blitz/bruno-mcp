import { ControllerContract } from '../bruno/controller-contract.js';
import {
  FeatureRunManifest,
  FeatureRunManifestValidation,
  FeatureRunReport,
  FeatureSliceArtifactBundle,
  FeatureSlicePlan,
  FeatureSliceSupportGraph,
  FeatureSliceValidationResult,
} from '../bruno/feature-slice.js';
import {
  EngineCompatibility,
  ENGINE_SCHEMA_VERSION,
  EngineEnvelope,
  EngineInspectContractRequest,
  EngineInspectSliceRequest,
  EnginePlanRequest,
  EngineRunRequest,
  EngineSchemaVersionMismatch,
  EngineScaffoldRequest,
  EngineValidateRequest,
} from './types.js';

type EngineFetch = typeof fetch;
type EngineHeadersInit = Headers | Record<string, string>;

export class BrunoEngineHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'BrunoEngineHttpError';
  }
}

export class BrunoEngineProtocolError extends Error {
  constructor(message: string, public readonly payload?: unknown) {
    super(message);
    this.name = 'BrunoEngineProtocolError';
  }
}

export class BrunoEngineVersionMismatchError extends Error {
  constructor(
    message: string,
    public readonly compatibility: EngineSchemaVersionMismatch,
  ) {
    super(message);
    this.name = 'BrunoEngineVersionMismatchError';
  }
}

export interface BrunoEngineClientOptions {
  baseUrl: string;
  expectedSchemaVersion?: number;
  fetch?: EngineFetch;
  token?: string;
}

export class BrunoEngineClient {
  private readonly baseUrl: string;
  private readonly expectedSchemaVersion: number;
  private readonly fetchImpl: EngineFetch;
  private readonly token?: string;

  constructor(options: BrunoEngineClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.expectedSchemaVersion = options.expectedSchemaVersion || ENGINE_SCHEMA_VERSION;
    this.fetchImpl = options.fetch || fetch;
    this.token = options.token;
  }

  health(): Promise<{ status: 'ok' }> {
    return this.request('/engine/health', { method: 'GET' });
  }

  version(): Promise<EngineCompatibility> {
    return this.request('/engine/version', { method: 'GET' });
  }

  getCompatibility(): Promise<EngineCompatibility> {
    return this.request('/engine/version', { method: 'GET' });
  }

  inspectContract(input: EngineInspectContractRequest): Promise<{ contractPath: string; controllers: ControllerContract[] }> {
    return this.request('/engine/inspect-contract', { body: input, method: 'POST' });
  }

  plan(input: EnginePlanRequest): Promise<{ artifacts: FeatureSliceArtifactBundle; plan: FeatureSlicePlan }> {
    return this.request('/engine/plan', { body: input, method: 'POST' });
  }

  scaffold(input: EngineScaffoldRequest): Promise<{ artifacts: FeatureSliceArtifactBundle; scaffold: unknown }> {
    return this.request('/engine/scaffold', { body: input, method: 'POST' });
  }

  validateSlice(input: EngineValidateRequest): Promise<FeatureSliceValidationResult> {
    return this.request('/engine/validate', { body: input, method: 'POST' });
  }

  inspectRunManifest(input: EngineInspectSliceRequest): Promise<{ artifacts: FeatureSliceArtifactBundle; manifest: FeatureRunManifest }> {
    return this.request('/engine/inspect-run-manifest', { body: input, method: 'POST' });
  }

  validateRunManifest(input: EngineInspectSliceRequest): Promise<{ artifacts: FeatureSliceArtifactBundle; validation: FeatureRunManifestValidation }> {
    return this.request('/engine/validate-run-manifest', { body: input, method: 'POST' });
  }

  inspectSupportGraph(input: EngineInspectSliceRequest): Promise<{ artifacts: FeatureSliceArtifactBundle; supportGraph: FeatureSliceSupportGraph }> {
    return this.request('/engine/inspect-support-graph', { body: input, method: 'POST' });
  }

  run(input: EngineRunRequest): Promise<{ artifacts: FeatureSliceArtifactBundle; report: FeatureRunReport } | { artifacts: FeatureSliceArtifactBundle; jobId: string; pollUrl: string; state: string }> {
    return this.request('/engine/run', { body: input, method: 'POST' });
  }

  pollRunStatus(jobId: string): Promise<{ artifacts: FeatureSliceArtifactBundle; error?: string; jobId: string; report?: FeatureRunReport; state: string }> {
    return this.request(`/engine/run-status?jobId=${encodeURIComponent(jobId)}`, { method: 'GET' });
  }

  private async request<T>(path: string, init: { body?: unknown; method: 'GET' | 'POST' }): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      body: init.body ? JSON.stringify(init.body) : undefined,
      headers: this.buildHeaders(Boolean(init.body)),
      method: init.method,
    });

    const text = await response.text();
    let payload: unknown;
    try {
      payload = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      throw new BrunoEngineProtocolError(`Engine returned invalid JSON for ${path}`, text);
    }

    if (!response.ok) {
      if (
        typeof payload === 'object' &&
        payload &&
        'error' in payload &&
        (payload as { error?: unknown }).error === 'schema_version_mismatch'
      ) {
        throw new BrunoEngineVersionMismatchError('Engine schema version mismatch', payload as EngineSchemaVersionMismatch);
      }
      throw new BrunoEngineHttpError(
        typeof payload === 'object' && payload && 'error' in payload ? String((payload as { error: unknown }).error) : `HTTP ${response.status}`,
        response.status,
        path,
        payload,
      );
    }

    return this.parseEngineEnvelope<T>(payload);
  }

  private parseEngineEnvelope<T>(payload: unknown): T {
    if (!payload || typeof payload !== 'object') {
      throw new BrunoEngineProtocolError('Engine response envelope is missing', payload);
    }
    const envelope = payload as Partial<EngineEnvelope<T>>;
    if (envelope.runtime !== 'bruno') {
      throw new BrunoEngineProtocolError('Unexpected engine runtime', payload);
    }
    if (envelope.schemaVersion !== this.expectedSchemaVersion) {
      throw new BrunoEngineProtocolError('Unexpected engine schema version', payload);
    }
    if (!('data' in envelope)) {
      throw new BrunoEngineProtocolError('Engine response is missing data', payload);
    }
    return envelope.data as T;
  }

  private buildHeaders(hasBody: boolean): EngineHeadersInit {
    const headers = new Headers();
    if (hasBody) {
      headers.set('content-type', 'application/json');
    }
    if (this.token) {
      headers.set('authorization', `Bearer ${this.token}`);
    }
    headers.set('x-bruno-schema-version', String(this.expectedSchemaVersion));
    return headers;
  }
}

export function createBrunoEngineClient(options: BrunoEngineClientOptions): BrunoEngineClient {
  return new BrunoEngineClient(options);
}
