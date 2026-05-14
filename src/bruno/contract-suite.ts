import {
  ApiContractBody,
  ApiContractEndpoint,
  ApiContractField,
  ApiContractIr,
  ApiContractParameter,
  ODataEntitySetContract,
} from './api-contract.js';
import {
  ContractCoverageItem,
  ContractCoverageManager,
  ContractCoverageManifest,
  SeedManifestContract,
} from './contract-coverage.js';
import { BrunoNativeManager } from './native.js';
import { RequestBuilder } from './request.js';
import { toRelativeCollectionPath } from './store.js';
import {
  BodyType,
  FileOperationResult,
  HttpMethod,
  RequestAuthConfig,
  RequestAuthMode,
} from './types.js';
import { VariableAuditManager, VariableSourceAuditReport } from './variable-audit.js';

type VariableValue = boolean | number | string;

export interface ContractSuiteScaffoldInput {
  auth?: { config?: RequestAuthConfig; type: RequestAuthMode };
  baseUrl?: string;
  baseUrlVariable?: string;
  collectionPath: string;
  contract: ApiContractIr;
  environmentName?: string;
  environmentVariables?: Record<string, VariableValue>;
  includeNegative?: boolean;
  includeODataMatrix?: boolean;
  rootFolder?: string;
  seedManifest?: SeedManifestContract;
}

export interface ContractSuiteRequestResult {
  coverageItemIds: string[];
  endpointId?: string;
  method: string;
  name: string;
  path: string;
  relativePath: string;
  scenario: string;
  tags: string[];
  url: string;
}

export interface ContractSuiteFinding {
  severity: 'high' | 'low' | 'medium';
  title: string;
  detail: string;
}

export interface ContractSuiteScaffoldResult {
  collectionPath: string;
  coverageManifest: ContractCoverageManifest;
  coverageManifestPath: string;
  createdRequests: ContractSuiteRequestResult[];
  environment: {
    name: string;
    variables: Record<string, VariableValue>;
  };
  findings: ContractSuiteFinding[];
  runCommand: string;
  variableAudit: VariableSourceAuditReport;
}

interface PendingRequest {
  body?: {
    content?: string;
    contentType?: string;
    filePath?: string;
    formData?: Array<{ name: string; type?: 'file' | 'text'; value: string }>;
    formUrlEncoded?: Array<{ name: string; value: string }>;
    type: BodyType;
  };
  coverage: (item: ContractCoverageItem) => boolean;
  docs: string;
  endpoint?: ApiContractEndpoint;
  folder: string;
  headers?: Record<string, string>;
  method: HttpMethod;
  name: string;
  query?: Record<string, boolean | number | string>;
  scenario: string;
  tags: string[];
  tests: string;
  url: string;
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:3000';
const DEFAULT_ROOT_FOLDER = 'contract';
const ODATA_QUERY_OPTIONS = [
  '$select',
  '$filter',
  '$orderby',
  '$top',
  '$skip',
  '$count',
  '$expand',
];
const SUPPORTED_METHODS: HttpMethod[] = [
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'HEAD',
  'OPTIONS',
];

export class ContractSuiteScaffolder {
  private baseUrlVariable = 'baseUrl';
  private readonly environmentVariables = new Map<string, VariableValue>();

  constructor(
    private readonly requestBuilder: RequestBuilder,
    private readonly nativeManager: BrunoNativeManager,
    private readonly coverageManager: ContractCoverageManager,
    private readonly variableAuditManager: VariableAuditManager,
  ) {}

  async scaffold(input: ContractSuiteScaffoldInput): Promise<ContractSuiteScaffoldResult> {
    const environmentName = input.environmentName || 'local';
    const rootFolder = input.rootFolder || DEFAULT_ROOT_FOLDER;
    this.baseUrlVariable = input.baseUrlVariable || 'baseUrl';
    this.environmentVariables.clear();
    this.setVariable(this.baseUrlVariable, input.baseUrl || DEFAULT_BASE_URL);
    this.applySeedManifest(input.seedManifest);
    this.applyExplicitVariables(input.environmentVariables);

    await this.nativeManager.createFolder(input.collectionPath, rootFolder, {
      auth: input.auth,
      docs: this.rootFolderDocs(input.contract),
      tests: this.baselineFolderTests(),
    });

    if (input.auth) {
      await this.nativeManager.updateCollectionDefaults(input.collectionPath, {
        auth: input.auth,
      });
    }

    const manifest = this.coverageManager.buildManifest(input.contract, input.seedManifest);
    const requests = this.buildRequests(input.contract, {
      includeNegative: input.includeNegative !== false,
      includeODataMatrix: input.includeODataMatrix !== false,
      rootFolder,
    });
    const createdRequests: ContractSuiteRequestResult[] = [];

    let sequence = 1;
    for (const request of requests) {
      const result = await this.createRequest(input.collectionPath, request, sequence++);
      createdRequests.push(result);
      this.markCovered(manifest, request.coverage, result.relativePath, result.coverageItemIds);
    }

    const variables = Object.fromEntries(this.environmentVariables);
    await this.upsertEnvironment(input.collectionPath, environmentName, variables);
    this.markSeedVariablesCovered(manifest, environmentName);
    this.refreshSummary(manifest);
    const coverageManifestPath = await this.coverageManager.writeManifest(
      input.collectionPath,
      manifest,
    );
    const variableAudit = await this.variableAuditManager.auditCollection(input.collectionPath);

    return {
      collectionPath: input.collectionPath,
      coverageManifest: manifest,
      coverageManifestPath,
      createdRequests,
      environment: {
        name: environmentName,
        variables,
      },
      findings: this.buildFindings(manifest, variableAudit),
      runCommand: `bru run ${input.collectionPath} --env ${environmentName}`,
      variableAudit,
    };
  }

  private buildRequests(
    contract: ApiContractIr,
    options: {
      includeNegative: boolean;
      includeODataMatrix: boolean;
      rootFolder: string;
    },
  ): PendingRequest[] {
    const requests: PendingRequest[] = [];
    const odataEntitySets = contract.odata?.entitySets || [];

    for (const endpoint of contract.endpoints) {
      requests.push(
        ...this.positiveEndpointRequests(endpoint, options.rootFolder, odataEntitySets),
      );

      if (options.includeNegative) {
        requests.push(
          ...this.negativeEndpointRequests(endpoint, options.rootFolder, odataEntitySets),
        );
      }
    }

    if (contract.odata && options.includeODataMatrix) {
      for (const entitySet of contract.odata.entitySets) {
        requests.push(...this.odataMatrixRequests(contract, entitySet, options.rootFolder));
      }
    }

    if (contract.odata && options.includeNegative && contract.odata.entitySets.length > 0) {
      for (const entitySet of contract.odata.entitySets) {
        const request = this.malformedODataQueryRequest(contract, entitySet, options.rootFolder);
        if (request) {
          requests.push(request);
        }
      }
      requests.push(this.badODataEntitySetRequest(options.rootFolder));
    }

    if (options.includeNegative) {
      requests.push(...this.unsupportedMethodRequests(contract, options.rootFolder));
    }

    return requests;
  }

  private positiveEndpointRequests(
    endpoint: ApiContractEndpoint,
    rootFolder: string,
    entitySets: ODataEntitySetContract[],
  ): PendingRequest[] {
    if (endpoint.requestBodies.length === 0) {
      return [this.endpointRequest(endpoint, rootFolder, entitySets, 'positive')];
    }

    const requests: PendingRequest[] = [];
    const body = this.preferredBody(endpoint);
    if (!body) {
      return [this.endpointRequest(endpoint, rootFolder, entitySets, 'positive')];
    }

    requests.push(this.endpointRequest(endpoint, rootFolder, entitySets, 'min-valid', body));
    if (body.fields.some((field) => !field.required)) {
      requests.push(this.endpointRequest(endpoint, rootFolder, entitySets, 'max-valid', body));
    }

    return requests;
  }

  private negativeEndpointRequests(
    endpoint: ApiContractEndpoint,
    rootFolder: string,
    entitySets: ODataEntitySetContract[],
  ): PendingRequest[] {
    const requests: PendingRequest[] = [];
    const body = this.preferredBody(endpoint);

    if (endpoint.parameters.some((parameter) => parameter.in === 'path')) {
      requests.push(this.badKeyRequest(endpoint, rootFolder, entitySets));
    }

    if (body && body.fields.length > 0) {
      requests.push(this.malformedPayloadRequest(endpoint, rootFolder, entitySets, body));
      for (const field of body.fields.filter((entry) => entry.required)) {
        requests.push(
          this.missingRequiredFieldRequest(endpoint, rootFolder, entitySets, body, field),
        );
      }
      for (const field of body.fields.filter((entry) => this.hasBoundary(entry))) {
        requests.push(this.boundaryRequest(endpoint, rootFolder, entitySets, body, field));
      }
    }

    return requests;
  }

  private endpointRequest(
    endpoint: ApiContractEndpoint,
    rootFolder: string,
    entitySets: ODataEntitySetContract[],
    scenario: 'max-valid' | 'min-valid' | 'positive',
    body?: ApiContractBody,
  ): PendingRequest {
    const entitySet = this.findEntitySet(endpoint, entitySets);
    const name = this.requestName(endpoint, scenario, entitySet);
    const requestBody =
      body && scenario !== 'positive' ? this.requestBody(endpoint, body, scenario) : undefined;

    return {
      body: requestBody?.body,
      coverage: (item) =>
        this.coversEndpointItem(item, endpoint) ||
        this.coversPayloadItem(item, endpoint, requestBody?.coveredFields || []) ||
        this.coversODataMetadata(item, endpoint) ||
        (entitySet ? this.coversODataKey(item, entitySet, endpoint) : false),
      docs: this.requestDocs(endpoint, scenario),
      endpoint,
      folder: this.endpointFolder(rootFolder, endpoint, entitySet, scenario),
      headers: this.headersForEndpoint(endpoint, body),
      method: this.toHttpMethod(endpoint.method),
      name,
      query: this.requiredQuery(endpoint),
      scenario,
      tags: this.tags(endpoint, scenario, entitySet),
      tests: this.positiveTests(endpoint, entitySet, scenario),
      url: this.urlForEndpoint(endpoint, entitySet),
    };
  }

  private malformedPayloadRequest(
    endpoint: ApiContractEndpoint,
    rootFolder: string,
    entitySets: ODataEntitySetContract[],
    body: ApiContractBody,
  ): PendingRequest {
    const entitySet = this.findEntitySet(endpoint, entitySets);
    return {
      body: { content: '{"not valid json"', type: 'json' },
      coverage: (item) => item.endpointId === endpoint.id && item.scenario === 'malformed-payload',
      docs: this.requestDocs(endpoint, 'malformed-payload'),
      endpoint,
      folder: this.endpointFolder(rootFolder, endpoint, entitySet, 'negative'),
      headers: this.headersForEndpoint(endpoint, body),
      method: this.toHttpMethod(endpoint.method),
      name: `${this.operationName(endpoint, entitySet)} Malformed Payload`,
      query: this.requiredQuery(endpoint),
      scenario: 'malformed-payload',
      tags: this.tags(endpoint, 'negative', entitySet),
      tests: this.negativeStatusTests([400, 415, 422]),
      url: this.urlForEndpoint(endpoint, entitySet),
    };
  }

  private missingRequiredFieldRequest(
    endpoint: ApiContractEndpoint,
    rootFolder: string,
    entitySets: ODataEntitySetContract[],
    body: ApiContractBody,
    field: ApiContractField,
  ): PendingRequest {
    const entitySet = this.findEntitySet(endpoint, entitySets);
    const payload = this.payloadForBody(body, 'max-valid', new Set([field.path]));
    return {
      body: this.jsonBody(payload),
      coverage: (item) =>
        item.endpointId === endpoint.id && item.scenario === `missing-required:${field.path}`,
      docs: this.requestDocs(endpoint, `missing required ${field.path}`),
      endpoint,
      folder: this.endpointFolder(rootFolder, endpoint, entitySet, 'negative'),
      headers: this.headersForEndpoint(endpoint, body),
      method: this.toHttpMethod(endpoint.method),
      name: `${this.operationName(endpoint, entitySet)} Missing ${field.path}`,
      query: this.requiredQuery(endpoint),
      scenario: `missing-required:${field.path}`,
      tags: this.tags(endpoint, 'negative', entitySet),
      tests: this.negativeStatusTests([400, 422]),
      url: this.urlForEndpoint(endpoint, entitySet),
    };
  }

  private boundaryRequest(
    endpoint: ApiContractEndpoint,
    rootFolder: string,
    entitySets: ODataEntitySetContract[],
    body: ApiContractBody,
    field: ApiContractField,
  ): PendingRequest {
    const entitySet = this.findEntitySet(endpoint, entitySets);
    const payload = this.payloadForBody(body, 'max-valid');
    this.setJsonValue(payload, field.path, this.invalidBoundaryValue(field));

    return {
      body: this.jsonBody(payload),
      coverage: (item) =>
        item.endpointId === endpoint.id && item.scenario === `boundary:${field.path}`,
      docs: this.requestDocs(endpoint, `invalid boundary ${field.path}`),
      endpoint,
      folder: this.endpointFolder(rootFolder, endpoint, entitySet, 'negative'),
      headers: this.headersForEndpoint(endpoint, body),
      method: this.toHttpMethod(endpoint.method),
      name: `${this.operationName(endpoint, entitySet)} Invalid ${field.path}`,
      query: this.requiredQuery(endpoint),
      scenario: `boundary:${field.path}`,
      tags: this.tags(endpoint, 'negative', entitySet),
      tests: this.negativeStatusTests([400, 422]),
      url: this.urlForEndpoint(endpoint, entitySet),
    };
  }

  private badKeyRequest(
    endpoint: ApiContractEndpoint,
    rootFolder: string,
    entitySets: ODataEntitySetContract[],
  ): PendingRequest {
    const entitySet = this.findEntitySet(endpoint, entitySets);
    return {
      coverage: (item) => item.endpointId === endpoint.id && item.scenario === 'bad-key',
      docs: this.requestDocs(endpoint, 'bad key'),
      endpoint,
      folder: this.endpointFolder(rootFolder, endpoint, entitySet, 'negative'),
      headers: this.headersForEndpoint(endpoint),
      method: this.toHttpMethod(endpoint.method),
      name: `${this.operationName(endpoint, entitySet)} Bad Key`,
      query: this.requiredQuery(endpoint),
      scenario: 'bad-key',
      tags: this.tags(endpoint, 'negative', entitySet),
      tests: this.negativeStatusTests([400, 404, 422]),
      url: this.urlForEndpoint(endpoint, entitySet, { invalidKeys: true }),
    };
  }

  private odataMatrixRequests(
    contract: ApiContractIr,
    entitySet: ODataEntitySetContract,
    rootFolder: string,
  ): PendingRequest[] {
    const endpoint = contract.endpoints.find((entry) => entry.id === entitySet.listEndpointId);
    if (!endpoint) {
      return [];
    }

    return ODATA_QUERY_OPTIONS.filter((queryOption) =>
      entitySet.queryOptions.includes(queryOption),
    ).map((queryOption) => ({
      coverage: (item) =>
        item.category === 'odata-query-option' &&
        item.endpointId === endpoint.id &&
        item.queryOption === queryOption,
      docs: this.odataMatrixDocs(endpoint, queryOption, entitySet),
      endpoint,
      folder: `${rootFolder}/odata/${entitySet.name}/matrix`,
      headers: this.headersForEndpoint(endpoint),
      method: 'GET' as const,
      name: `${entitySet.name} ${queryOption}`,
      query: this.odataQueryParameters(queryOption, entitySet, endpoint),
      scenario: queryOption,
      tags: this.tags(endpoint, 'odata-matrix', entitySet),
      tests: this.odataQueryTests(queryOption, entitySet, endpoint),
      url: this.urlForEndpoint(endpoint, entitySet),
    }));
  }

  private badODataEntitySetRequest(rootFolder: string): PendingRequest {
    return {
      coverage: (item) => item.id === 'negative:odata:bad-entity-set',
      docs: 'Validates that an unknown OData entity set is rejected instead of returning a fake success.',
      folder: `${rootFolder}/odata/negative`,
      headers: { Accept: 'application/json' },
      method: 'GET',
      name: 'Unknown OData Entity Set',
      scenario: 'bad-entity-set',
      tags: ['contract', 'odata', 'negative'],
      tests: this.negativeStatusTests([400, 404]),
      url: `{{${this.baseUrlVariable}}}/__bruno_mcp_missing_entity_set__`,
    };
  }

  private malformedODataQueryRequest(
    contract: ApiContractIr,
    entitySet: ODataEntitySetContract,
    rootFolder: string,
  ): PendingRequest | undefined {
    const endpoint = contract.endpoints.find((entry) => entry.id === entitySet.listEndpointId);
    if (!endpoint) {
      return undefined;
    }

    return {
      coverage: (item) =>
        item.endpointId === endpoint.id && item.scenario === 'malformed-odata-query',
      docs: this.requestDocs(endpoint, 'malformed OData query'),
      endpoint,
      folder: `${rootFolder}/odata/${entitySet.name}/negative`,
      headers: this.headersForEndpoint(endpoint),
      method: 'GET',
      name: `${entitySet.name} Malformed OData Query`,
      query: {
        $filter: 'not a valid odata filter ((((',
      },
      scenario: 'malformed-odata-query',
      tags: this.tags(endpoint, 'negative', entitySet),
      tests: this.negativeStatusTests([400, 422]),
      url: this.urlForEndpoint(endpoint, entitySet),
    };
  }

  private unsupportedMethodRequests(contract: ApiContractIr, rootFolder: string): PendingRequest[] {
    const methodsByPath = new Map<string, Set<string>>();
    for (const endpoint of contract.endpoints) {
      if (!methodsByPath.has(endpoint.path)) {
        methodsByPath.set(endpoint.path, new Set());
      }
      methodsByPath.get(endpoint.path)!.add(endpoint.method);
    }

    const requests: PendingRequest[] = [];
    for (const [path, methods] of methodsByPath.entries()) {
      const unsupportedMethod = SUPPORTED_METHODS.find((method) => !methods.has(method));
      if (!unsupportedMethod) {
        continue;
      }

      const syntheticEndpoint: ApiContractEndpoint = {
        authRequired: false,
        id: `${unsupportedMethod} ${path}`,
        method: unsupportedMethod,
        parameters: this.pathParametersFromPath(path),
        path,
        requestBodies: [],
        responses: [],
        tags: [],
      };

      requests.push({
        coverage: (item) => item.path === path && item.scenario === 'unsupported-method',
        docs: `Validates that ${unsupportedMethod} is not silently accepted on ${path}.`,
        folder: `${rootFolder}/negative/unsupported-methods`,
        headers: { Accept: 'application/json' },
        method: unsupportedMethod,
        name: `${this.pathName(path)} Unsupported ${unsupportedMethod}`,
        scenario: 'unsupported-method',
        tags: ['contract', 'negative', 'unsupported-method'],
        tests: this.negativeStatusTests([400, 404, 405, 501]),
        url: this.urlForEndpoint(syntheticEndpoint, undefined, { invalidKeys: true }),
      });
    }

    return requests;
  }

  private async createRequest(
    collectionPath: string,
    request: PendingRequest,
    sequence: number,
  ): Promise<ContractSuiteRequestResult> {
    const createResult = await this.requestBuilder.createRequest({
      auth: { type: 'inherit' },
      body: request.body,
      collectionPath,
      folder: request.folder,
      headers: request.headers,
      method: request.method,
      name: request.name,
      query: request.query,
      sequence,
      tests: request.tests.split('\n'),
      url: request.url,
    });
    this.assertSuccess(createResult, `creating request ${request.name}`);

    const requestPath = createResult.path!;
    const relativePath = toRelativeCollectionPath(collectionPath, requestPath);
    const updateResult = await this.nativeManager.updateRequest(requestPath, {
      docs: request.docs,
      settings: { encodeUrl: true, timeout: 0 },
      tags: request.tags,
    });
    this.assertSuccess(updateResult, `updating request ${request.name}`);

    return {
      coverageItemIds: [],
      endpointId: request.endpoint?.id,
      method: request.method,
      name: request.name,
      path: requestPath,
      relativePath,
      scenario: request.scenario,
      tags: request.tags,
      url: request.url,
    };
  }

  private markCovered(
    manifest: ContractCoverageManifest,
    matcher: (item: ContractCoverageItem) => boolean,
    relativePath: string,
    target: string[],
  ): void {
    for (const item of manifest.items) {
      if (!matcher(item)) {
        continue;
      }

      item.status = 'covered';
      if (!item.coveredBy.includes(relativePath)) {
        item.coveredBy.push(relativePath);
      }
      target.push(item.id);
    }
  }

  private markSeedVariablesCovered(
    manifest: ContractCoverageManifest,
    environmentName: string,
  ): void {
    for (const item of manifest.items) {
      if (item.category !== 'seed-variable' || !item.seedVariable) {
        continue;
      }
      if (!this.environmentVariables.has(item.seedVariable)) {
        continue;
      }
      item.status = 'covered';
      const source = `environment:${environmentName}`;
      if (!item.coveredBy.includes(source)) {
        item.coveredBy.push(source);
      }
    }
  }

  private coversEndpointItem(item: ContractCoverageItem, endpoint: ApiContractEndpoint): boolean {
    return (
      item.endpointId === endpoint.id &&
      ['endpoint', 'method', 'response-field', 'file-route'].includes(item.category)
    );
  }

  private coversPayloadItem(
    item: ContractCoverageItem,
    endpoint: ApiContractEndpoint,
    coveredFields: string[],
  ): boolean {
    return (
      item.category === 'payload-field' &&
      item.endpointId === endpoint.id &&
      Boolean(item.fieldPath && coveredFields.includes(item.fieldPath))
    );
  }

  private coversODataMetadata(item: ContractCoverageItem, endpoint: ApiContractEndpoint): boolean {
    return item.category === 'odata-metadata' && item.path === endpoint.path;
  }

  private coversODataKey(
    item: ContractCoverageItem,
    entitySet: ODataEntitySetContract,
    endpoint: ApiContractEndpoint,
  ): boolean {
    return (
      item.category === 'odata-key' &&
      item.endpointId === endpoint.id &&
      item.path === entitySet.path
    );
  }

  private requestBody(
    endpoint: ApiContractEndpoint,
    body: ApiContractBody,
    scenario: 'max-valid' | 'min-valid',
  ): { body: PendingRequest['body']; coveredFields: string[] } {
    if (/json/i.test(body.contentType)) {
      const payload = this.payloadForBody(body, scenario);
      return {
        body: this.jsonBody(payload),
        coveredFields: this.coveredPayloadFields(body, scenario),
      };
    }

    if (/multipart/i.test(body.contentType)) {
      this.setVariable('uploadFilePath', './fixtures/upload.bin');
      return {
        body: {
          formData: body.fields.map((field) => ({
            name: field.path,
            type: field.format === 'binary' || /file/i.test(field.path) ? 'file' : 'text',
            value:
              field.format === 'binary' || /file/i.test(field.path)
                ? '{{uploadFilePath}}'
                : String(this.validValue(field, scenario)),
          })),
          type: 'form-data',
        },
        coveredFields: this.coveredPayloadFields(body, scenario),
      };
    }

    if (/x-www-form-urlencoded/i.test(body.contentType)) {
      return {
        body: {
          formUrlEncoded: body.fields.map((field) => ({
            name: field.path,
            value: String(this.validValue(field, scenario)),
          })),
          type: 'form-urlencoded',
        },
        coveredFields: this.coveredPayloadFields(body, scenario),
      };
    }

    if (/xml/i.test(body.contentType)) {
      return {
        body: {
          content: '<request />',
          type: 'xml',
        },
        coveredFields: [],
      };
    }

    if (/text/i.test(body.contentType)) {
      return {
        body: {
          content: 'sample request',
          type: 'text',
        },
        coveredFields: [],
      };
    }

    this.setVariable('uploadFilePath', './fixtures/upload.bin');
    return {
      body: {
        contentType: body.contentType,
        filePath: '{{uploadFilePath}}',
        type: 'binary',
      },
      coveredFields: this.coveredPayloadFields(body, scenario),
    };
  }

  private payloadForBody(
    body: ApiContractBody,
    scenario: 'max-valid' | 'min-valid',
    omit = new Set<string>(),
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    for (const field of body.fields) {
      if (omit.has(field.path)) {
        continue;
      }
      if (scenario === 'min-valid' && !field.required) {
        continue;
      }
      this.setJsonValue(payload, field.path, this.validValue(field, scenario));
    }
    return payload;
  }

  private coveredPayloadFields(
    body: ApiContractBody,
    scenario: 'max-valid' | 'min-valid',
  ): string[] {
    return body.fields
      .filter((field) => scenario === 'max-valid' || field.required)
      .map((field) => field.path);
  }

  private jsonBody(payload: Record<string, unknown>): PendingRequest['body'] {
    return {
      content: JSON.stringify(payload, null, 2),
      type: 'json',
    };
  }

  private setJsonValue(target: Record<string, unknown>, path: string, value: unknown): void {
    const segments = path.replace(/\[\]/g, '.0').split('.').filter(Boolean);
    let current: Record<string, unknown> = target;

    for (const [index, segment] of segments.entries()) {
      const isLast = index === segments.length - 1;
      if (isLast) {
        current[segment] = value;
        return;
      }

      const nextSegment = segments[index + 1]!;
      if (current[segment] === undefined) {
        current[segment] = /^\d+$/.test(nextSegment) ? [] : {};
      }
      current = current[segment] as Record<string, unknown>;
    }
  }

  private validValue(field: ApiContractField, scenario: 'max-valid' | 'min-valid'): unknown {
    if (field.enum && field.enum.length > 0) {
      return field.enum[0];
    }

    switch (field.type) {
      case 'array':
        return [];
      case 'boolean':
        return true;
      case 'integer':
      case 'number':
        return scenario === 'max-valid'
          ? Math.min(field.maximum ?? field.minimum ?? 1, field.maximum ?? 1)
          : (field.minimum ?? 1);
      case 'object':
        return {};
      case 'string':
      default:
        if (field.format === 'date') {
          return '2026-01-01';
        }
        if (field.format === 'date-time') {
          return '2026-01-01T00:00:00.000Z';
        }
        if (field.format === 'email') {
          return 'user@example.test';
        }
        if (field.format === 'uuid') {
          return '00000000-0000-4000-8000-000000000001';
        }
        if (field.format === 'binary') {
          return '{{uploadFilePath}}';
        }
        return this.stringValue(field, scenario);
    }
  }

  private stringValue(field: ApiContractField, scenario: 'max-valid' | 'min-valid'): string {
    const minLength = Math.max(field.minLength ?? 1, 1);
    const maxLength = field.maxLength ?? Math.max(minLength, 12);
    const length = scenario === 'max-valid' ? Math.min(maxLength, 24) : minLength;
    return 'x'.repeat(length);
  }

  private invalidBoundaryValue(field: ApiContractField): unknown {
    if (field.enum && field.enum.length > 0) {
      return '__invalid_enum_value__';
    }
    if (field.type === 'integer' || field.type === 'number') {
      if (field.minimum !== undefined) {
        return field.minimum - 1;
      }
      if (field.maximum !== undefined) {
        return field.maximum + 1;
      }
      return 'not-a-number';
    }
    if (field.type === 'array') {
      if (field.minItems !== undefined) {
        return [];
      }
      return Array.from({ length: (field.maxItems ?? 1) + 1 }, () => 'x');
    }
    if (field.maxLength !== undefined) {
      return 'x'.repeat(field.maxLength + 1);
    }
    if (field.minLength !== undefined) {
      return '';
    }
    return null;
  }

  private urlForEndpoint(
    endpoint: ApiContractEndpoint,
    entitySet?: ODataEntitySetContract,
    options: { invalidKeys?: boolean } = {},
  ): string {
    let path = endpoint.path.startsWith('/') ? endpoint.path : `/${endpoint.path}`;
    for (const parameter of this.pathParameters(endpoint)) {
      const variableName = this.pathVariableName(parameter, endpoint, entitySet, options);
      const template = `{{${variableName}}}`;
      path = path.replace(new RegExp(`\\{${this.escapeRegExp(parameter.name)}\\}`, 'g'), template);
      this.setVariable(
        variableName,
        options.invalidKeys ? '__invalid_key__' : this.seedPlaceholder(variableName),
      );
    }
    return `{{${this.baseUrlVariable}}}${path === '/' ? '' : path}`;
  }

  private requiredQuery(endpoint: ApiContractEndpoint): Record<string, boolean | number | string> {
    const query: Record<string, boolean | number | string> = {};
    for (const parameter of endpoint.parameters.filter(
      (entry) => entry.in === 'query' && entry.required && !entry.name.startsWith('$'),
    )) {
      const variableName = this.queryVariableName(parameter.name);
      query[parameter.name] = `{{${variableName}}}`;
      this.setVariable(variableName, this.defaultParameterValue(parameter));
    }
    return query;
  }

  private headersForEndpoint(
    endpoint: ApiContractEndpoint,
    body?: ApiContractBody,
  ): Record<string, string> {
    const headers: Record<string, string> = {};
    if (endpoint.responses.some((response) => /json/i.test(response.contentType || ''))) {
      headers.Accept = 'application/json';
    }
    if (body) {
      headers['Content-Type'] = body.contentType;
    }
    return headers;
  }

  private positiveTests(
    endpoint: ApiContractEndpoint,
    entitySet: ODataEntitySetContract | undefined,
    scenario: string,
  ): string {
    const statuses = endpoint.responses
      .filter((response) => /^2\d\d$/.test(response.statusCode))
      .map((response) => Number(response.statusCode));
    const expectedStatuses = statuses.length > 0 ? statuses : [200, 201, 202, 204];
    const lines = [...this.statusTest(expectedStatuses), ...this.noHtmlErrorTest()];

    if (endpoint.responses.some((response) => /json/i.test(response.contentType || ''))) {
      lines.push(...this.jsonContentTypeTest());
      if (entitySet && endpoint.id === entitySet.listEndpointId) {
        lines.push(...this.odataValueArrayTest());
      }
      if (entitySet && endpoint.id === entitySet.keyEndpointId) {
        lines.push(...this.odataKeyIdentityTest(entitySet));
      }
      lines.push(...this.responseFieldTests(endpoint));
    }

    if (scenario === 'positive' && endpoint.path === '/') {
      lines.push('test("service root returns a response body", function () {');
      lines.push('  expect(res.getBody()).to.not.equal(undefined);');
      lines.push('});');
    }

    return lines.join('\n');
  }

  private odataQueryTests(
    queryOption: string,
    entitySet: ODataEntitySetContract,
    endpoint: ApiContractEndpoint,
  ): string {
    const lines = [
      ...this.statusTest([200]),
      ...this.jsonContentTypeTest(),
      ...this.odataValueArrayTest(),
    ];

    if (queryOption === '$top') {
      lines.push('test("$top limits result length", function () {');
      lines.push('  const body = res.getBody();');
      lines.push('  expect(body.value.length).to.be.at.most(1);');
      lines.push('});');
    }
    if (queryOption === '$count') {
      lines.push('test("$count returns @odata.count", function () {');
      lines.push('  const body = res.getBody();');
      lines.push('  expect(body).to.have.property("@odata.count");');
      lines.push('  expect(body["@odata.count"]).to.be.a("number");');
      lines.push('});');
    }
    if (queryOption === '$filter') {
      const keyField = entitySet.keyFields[0] || this.selectFields(endpoint)[0];
      if (keyField) {
        const variableName = `${entitySet.name}_id`;
        lines.push(
          `test("$filter returns only records matching ${variableName} when records exist", function () {`,
        );
        lines.push('  const body = res.getBody();');
        lines.push(
          `  const expected = bru.getEnvVar(${JSON.stringify(variableName)}) || bru.getVar(${JSON.stringify(variableName)});`,
        );
        lines.push('  if (body.value.length > 0) {');
        lines.push('    for (const record of body.value) {');
        lines.push(
          `      expect(String(record[${JSON.stringify(keyField)}])).to.equal(String(expected));`,
        );
        lines.push('    }');
        lines.push('  }');
        lines.push('});');
      }
    }
    if (queryOption === '$orderby') {
      const orderField = entitySet.keyFields[0] || this.selectFields(endpoint)[0];
      if (orderField) {
        lines.push(
          `test("$orderby sorts records by ${orderField} ascending when comparable", function () {`,
        );
        lines.push('  const body = res.getBody();');
        lines.push(
          `  const values = body.value.map((record) => record[${JSON.stringify(orderField)}]).filter((value) => value !== undefined && value !== null);`,
        );
        lines.push('  if (values.length > 1) {');
        lines.push('    const sorted = [...values].sort((left, right) => {');
        lines.push('      if (typeof left === "number" && typeof right === "number") {');
        lines.push('        return left - right;');
        lines.push('      }');
        lines.push('      return String(left).localeCompare(String(right));');
        lines.push('    });');
        lines.push('    expect(values).to.deep.equal(sorted);');
        lines.push('  }');
        lines.push('});');
      }
    }
    if (queryOption === '$skip') {
      lines.push('test("$skip returns a page consistent with one skipped record", function () {');
      lines.push('  const body = res.getBody();');
      lines.push('  if (Object.prototype.hasOwnProperty.call(body, "@odata.count")) {');
      lines.push('    expect(body["@odata.count"]).to.be.a("number");');
      lines.push(
        '    expect(body.value.length).to.be.at.most(Math.max(body["@odata.count"] - 1, 0));',
      );
      lines.push('  }');
      lines.push('});');
    }
    if (queryOption === '$expand' && entitySet.navigationProperties.length > 0) {
      const property = entitySet.navigationProperties[0]!;
      lines.push(
        'test("$expand includes requested navigation property when records exist", function () {',
      );
      lines.push('  const body = res.getBody();');
      lines.push('  if (body.value.length > 0) {');
      lines.push(`    expect(body.value[0]).to.have.property(${JSON.stringify(property)});`);
      lines.push('  }');
      lines.push('});');
    }
    if (queryOption === '$select') {
      const selected = this.selectFields(endpoint).slice(0, 2);
      lines.push('test("$select includes selected fields when records exist", function () {');
      lines.push('  const body = res.getBody();');
      lines.push('  if (body.value.length > 0) {');
      for (const field of selected) {
        lines.push(`    expect(body.value[0]).to.have.property(${JSON.stringify(field)});`);
      }
      lines.push('  }');
      lines.push('});');
    }

    return lines.join('\n');
  }

  private negativeStatusTests(statuses: number[]): string {
    return this.statusTest(statuses).join('\n');
  }

  private statusTest(statuses: number[]): string[] {
    return [
      'test("status matches contract expectation", function () {',
      '  const status = typeof res.getStatus === "function" ? res.getStatus() : res.status;',
      `  expect(status).to.be.oneOf(${JSON.stringify(statuses)});`,
      '});',
    ];
  }

  private noHtmlErrorTest(): string[] {
    return [
      'test("response is not an HTML error page", function () {',
      '  const contentType = String(res.getHeader("content-type") || "").toLowerCase();',
      '  expect(contentType).to.not.contain("text/html");',
      '});',
    ];
  }

  private jsonContentTypeTest(): string[] {
    return [
      'test("response content type is JSON", function () {',
      '  const contentType = String(res.getHeader("content-type") || "").toLowerCase();',
      '  expect(contentType).to.contain("json");',
      '});',
    ];
  }

  private odataValueArrayTest(): string[] {
    return [
      'test("OData response exposes value array", function () {',
      '  const body = res.getBody();',
      '  expect(body).to.be.an("object");',
      '  expect(body.value).to.be.an("array");',
      '});',
    ];
  }

  private odataKeyIdentityTest(entitySet: ODataEntitySetContract): string[] {
    const keyField = entitySet.keyFields[0];
    const variableName = `${entitySet.name}_id`;
    if (!keyField) {
      return [];
    }

    return [
      'test("OData key response identity matches requested key", function () {',
      '  const body = res.getBody();',
      `  const expected = bru.getEnvVar(${JSON.stringify(variableName)}) || bru.getVar(${JSON.stringify(variableName)});`,
      `  expect(String(body[${JSON.stringify(keyField)}])).to.equal(String(expected));`,
      '});',
    ];
  }

  private responseFieldTests(endpoint: ApiContractEndpoint): string[] {
    const successResponse = endpoint.responses.find((response) =>
      /^2\d\d$/.test(response.statusCode),
    );
    const fields = (successResponse?.fields || [])
      .filter((field) => this.shouldAssertResponseField(field))
      .slice(0, 14);
    const lines: string[] = [];

    for (const field of fields) {
      lines.push(...this.responseFieldTest(field));
    }

    return lines;
  }

  private responseFieldTest(field: ApiContractField): string[] {
    const lines = [`test("response field ${field.path} has expected schema", function () {`];
    const arrayGuards = this.arrayPathGuards(field.path);

    lines.push('  const body = res.getBody();');
    if (arrayGuards.length > 0) {
      lines.push(`  if (${arrayGuards.join(' && ')}) {`);
      lines.push(`    const value = ${this.optionalPathExpression('body', field.path)};`);
      lines.push(...this.responseFieldAssertions(field, '    '));
      lines.push('  }');
    } else {
      lines.push(`  const value = ${this.optionalPathExpression('body', field.path)};`);
      if (field.required && !field.path.includes('@')) {
        lines.push(`  expect(body).to.have.nested.property(${JSON.stringify(field.path)});`);
      }
      lines.push(...this.responseFieldAssertions(field, '  '));
    }
    lines.push('});');

    return lines;
  }

  private responseFieldAssertions(field: ApiContractField, indent: string): string[] {
    const lines: string[] = [];
    if (field.required) {
      lines.push(`${indent}expect(value).to.not.equal(undefined);`);
    }

    if (field.required && !field.nullable) {
      lines.push(`${indent}expect(value).to.not.equal(null);`);
      lines.push(...this.responseFieldTypeAssertions(field, indent));
      return lines;
    }

    if (field.required && field.nullable) {
      lines.push(`${indent}if (value !== null) {`);
      lines.push(...this.responseFieldTypeAssertions(field, `${indent}  `));
      lines.push(`${indent}}`);
      return lines;
    }

    if (field.nullable) {
      lines.push(`${indent}if (value !== undefined && value !== null) {`);
    } else {
      lines.push(`${indent}if (value !== undefined) {`);
      lines.push(`${indent}  expect(value).to.not.equal(null);`);
    }
    lines.push(...this.responseFieldTypeAssertions(field, `${indent}  `));
    lines.push(`${indent}}`);

    return lines;
  }

  private responseFieldTypeAssertions(field: ApiContractField, indent: string): string[] {
    const lines: string[] = [];
    switch (field.type) {
      case 'array':
        lines.push(`${indent}expect(value).to.be.an("array");`);
        break;
      case 'boolean':
        lines.push(`${indent}expect(value).to.be.a("boolean");`);
        break;
      case 'integer':
        lines.push(`${indent}expect(value).to.be.a("number");`);
        lines.push(`${indent}expect(Number.isInteger(value)).to.equal(true);`);
        break;
      case 'number':
        lines.push(`${indent}expect(value).to.be.a("number");`);
        break;
      case 'object':
        lines.push(`${indent}expect(value).to.be.an("object");`);
        break;
      case 'string':
      default:
        lines.push(`${indent}expect(value).to.be.a("string");`);
        break;
    }

    if (field.enum && field.enum.length > 0) {
      lines.push(`${indent}expect(value).to.be.oneOf(${JSON.stringify(field.enum)});`);
    }
    if (field.minimum !== undefined) {
      lines.push(`${indent}expect(value).to.be.at.least(${JSON.stringify(field.minimum)});`);
    }
    if (field.maximum !== undefined) {
      lines.push(`${indent}expect(value).to.be.at.most(${JSON.stringify(field.maximum)});`);
    }
    if (field.minLength !== undefined) {
      lines.push(
        `${indent}expect(value.length).to.be.at.least(${JSON.stringify(field.minLength)});`,
      );
    }
    if (field.maxLength !== undefined) {
      lines.push(
        `${indent}expect(value.length).to.be.at.most(${JSON.stringify(field.maxLength)});`,
      );
    }
    if (field.minItems !== undefined) {
      lines.push(
        `${indent}expect(value.length).to.be.at.least(${JSON.stringify(field.minItems)});`,
      );
    }
    if (field.maxItems !== undefined) {
      lines.push(`${indent}expect(value.length).to.be.at.most(${JSON.stringify(field.maxItems)});`);
    }

    return lines;
  }

  private shouldAssertResponseField(field: ApiContractField): boolean {
    if (field.path === 'value') {
      return false;
    }
    if (field.path.endsWith('[]') && field.type === 'object') {
      return false;
    }
    return (
      field.required ||
      field.enum !== undefined ||
      field.minimum !== undefined ||
      field.maximum !== undefined ||
      field.minLength !== undefined ||
      field.maxLength !== undefined ||
      field.minItems !== undefined ||
      field.maxItems !== undefined ||
      !['object'].includes(field.type)
    );
  }

  private arrayPathGuards(path: string): string[] {
    const guards: string[] = [];
    let expression = 'body';

    for (const segment of this.responsePathSegments(path)) {
      const propertyExpression = `${expression}${this.propertyAccessor(segment.property)}`;
      if (segment.array) {
        guards.push(`Array.isArray(${propertyExpression})`);
        guards.push(`${propertyExpression}.length > 0`);
        expression = `${propertyExpression}[0]`;
      } else {
        expression = propertyExpression;
      }
    }

    return guards;
  }

  private optionalPathExpression(root: string, path: string): string {
    let expression = root;
    for (const segment of this.responsePathSegments(path)) {
      expression += this.optionalPropertyAccessor(segment.property);
      if (segment.array) {
        expression += '?.[0]';
      }
    }
    return expression;
  }

  private responsePathSegments(path: string): Array<{ array: boolean; property: string }> {
    if (path.startsWith('@')) {
      return [{ array: path.endsWith('[]'), property: path.replace(/\[\]$/, '') }];
    }
    return path
      .split('.')
      .filter(Boolean)
      .map((segment) => ({
        array: segment.endsWith('[]'),
        property: segment.replace(/\[\]$/, ''),
      }));
  }

  private propertyAccessor(property: string): string {
    return /^[A-Za-z_$][\w$]*$/.test(property) ? `.${property}` : `[${JSON.stringify(property)}]`;
  }

  private optionalPropertyAccessor(property: string): string {
    return /^[A-Za-z_$][\w$]*$/.test(property)
      ? `?.${property}`
      : `?.[${JSON.stringify(property)}]`;
  }

  private odataQueryParameters(
    queryOption: string,
    entitySet: ODataEntitySetContract,
    endpoint: ApiContractEndpoint,
  ): Record<string, boolean | number | string> {
    const query: Record<string, boolean | number | string> = {
      [queryOption]: this.odataQueryValue(queryOption, entitySet, endpoint),
    };
    if (queryOption === '$skip' && entitySet.queryOptions.includes('$count')) {
      query.$count = true;
    }
    return query;
  }

  private odataQueryValue(
    queryOption: string,
    entitySet: ODataEntitySetContract,
    endpoint: ApiContractEndpoint,
  ): string | number | boolean {
    const keyField = entitySet.keyFields[0] || this.selectFields(endpoint)[0] || 'id';
    const idVariable = `${entitySet.name}_id`;
    this.setVariable(idVariable, this.seedPlaceholder(idVariable));

    switch (queryOption) {
      case '$count':
        return true;
      case '$expand':
        return entitySet.navigationProperties[0] || '';
      case '$filter':
        this.setVariable(
          `${entitySet.name}_filter`,
          `${keyField} eq '${this.environmentVariables.get(idVariable) ?? this.seedPlaceholder(idVariable)}'`,
        );
        return `{{${entitySet.name}_filter}}`;
      case '$orderby':
        this.setVariable(`${entitySet.name}_orderby`, `${keyField} asc`);
        return `{{${entitySet.name}_orderby}}`;
      case '$select':
        return this.selectFields(endpoint).slice(0, 2).join(',') || keyField;
      case '$skip':
        return 1;
      case '$top':
        return 1;
      default:
        return '';
    }
  }

  private preferredBody(endpoint: ApiContractEndpoint): ApiContractBody | undefined {
    return (
      endpoint.requestBodies.find((body) => /json/i.test(body.contentType)) ||
      endpoint.requestBodies[0]
    );
  }

  private findEntitySet(
    endpoint: ApiContractEndpoint,
    entitySets: ODataEntitySetContract[],
  ): ODataEntitySetContract | undefined {
    return entitySets.find(
      (entitySet) =>
        entitySet.listEndpointId === endpoint.id ||
        entitySet.keyEndpointId === endpoint.id ||
        endpoint.path === entitySet.path,
    );
  }

  private endpointFolder(
    rootFolder: string,
    endpoint: ApiContractEndpoint,
    entitySet: ODataEntitySetContract | undefined,
    scenario: string,
  ): string {
    if (scenario === 'negative') {
      return `${rootFolder}/negative/${this.pathName(endpoint.path)}`;
    }
    if (entitySet) {
      return `${rootFolder}/odata/${entitySet.name}`;
    }
    return `${rootFolder}/rest/${endpoint.tags[0] || this.pathName(endpoint.path)}`;
  }

  private requestName(
    endpoint: ApiContractEndpoint,
    scenario: 'max-valid' | 'min-valid' | 'positive',
    entitySet?: ODataEntitySetContract,
  ): string {
    const suffix = scenario === 'positive' ? '' : ` ${scenario}`;
    return `${this.operationName(endpoint, entitySet)}${suffix}`;
  }

  private operationName(endpoint: ApiContractEndpoint, entitySet?: ODataEntitySetContract): string {
    if (endpoint.operationId) {
      return this.titleCase(endpoint.operationId);
    }
    if (entitySet && endpoint.id === entitySet.listEndpointId) {
      return `${entitySet.name} List`;
    }
    if (entitySet && endpoint.id === entitySet.keyEndpointId) {
      return `${entitySet.name} By Key`;
    }
    return `${endpoint.method} ${this.pathName(endpoint.path)}`;
  }

  private tags(
    endpoint: ApiContractEndpoint,
    scenario: string,
    entitySet?: ODataEntitySetContract,
  ): string[] {
    return [
      'contract',
      entitySet ? 'odata' : 'rest',
      scenario.includes('negative') || scenario.includes('invalid') ? 'negative' : scenario,
      ...endpoint.tags,
    ].filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
  }

  private requestDocs(endpoint: ApiContractEndpoint, scenario: string): string {
    return [
      `Contract endpoint: ${endpoint.id}`,
      `Scenario: ${scenario}`,
      endpoint.summary ? `Summary: ${endpoint.summary}` : undefined,
      '',
      'Generated by Bruno MCP contract suite scaffolding. Assertions are contract-derived and should be strengthened only with source-of-truth API behavior, not weakened to hide product defects.',
    ]
      .filter((line): line is string => line !== undefined)
      .join('\n');
  }

  private odataMatrixDocs(
    endpoint: ApiContractEndpoint,
    queryOption: string,
    entitySet: ODataEntitySetContract,
  ): string {
    const docs = [this.requestDocs(endpoint, queryOption)];
    if (queryOption === '$filter') {
      docs.push(
        '',
        `Behavior assertion filters against the ${entitySet.name}_id seed variable. Hydrate that variable with a deterministic record key before live runs when a non-empty filtered result is required.`,
      );
    }
    if (queryOption === '$skip') {
      docs.push(
        '',
        'The generic $skip assertion verifies the strongest contract-derived page invariant available. When $count is supported, this request includes $count=true to compare page length with one skipped record.',
      );
    }
    return docs.join('\n');
  }

  private rootFolderDocs(contract: ApiContractIr): string {
    return [
      `Contract suite for ${contract.source.title || 'API contract'}`,
      `Service type: ${contract.serviceType}`,
      '',
      'This folder is generated from an API contract. Environment variables are persisted so Bruno Desktop can run requests directly.',
    ].join('\n');
  }

  private baselineFolderTests(): string {
    return [
      'test("response status was asserted by request-specific tests", function () {',
      '  const status = typeof res.getStatus === "function" ? res.getStatus() : res.status;',
      '  expect(status).to.be.a("number");',
      '});',
    ].join('\n');
  }

  private pathVariableName(
    parameter: ApiContractParameter,
    endpoint: ApiContractEndpoint,
    entitySet: ODataEntitySetContract | undefined,
    options: { invalidKeys?: boolean },
  ): string {
    if (options.invalidKeys) {
      return `invalid_${parameter.name}`;
    }
    if (entitySet && endpoint.id === entitySet.keyEndpointId) {
      return `${entitySet.name}_id`;
    }
    return parameter.name;
  }

  private pathParameters(endpoint: ApiContractEndpoint): ApiContractParameter[] {
    return endpoint.parameters.filter((parameter) => parameter.in === 'path');
  }

  private pathParametersFromPath(path: string): ApiContractParameter[] {
    return [...path.matchAll(/{([^}]+)}/g)].map((match) => ({
      in: 'path',
      name: match[1]!,
      required: true,
      schema: { nullable: false, type: 'string' },
    }));
  }

  private queryVariableName(name: string): string {
    return name.replace(/^\$/, '').replace(/[^A-Za-z0-9_]/g, '_');
  }

  private defaultParameterValue(parameter: ApiContractParameter): VariableValue {
    switch (parameter.schema?.type) {
      case 'boolean':
        return true;
      case 'integer':
      case 'number':
        return parameter.schema.minimum ?? 1;
      default:
        return `sample-${parameter.name}`;
    }
  }

  private selectFields(endpoint: ApiContractEndpoint): string[] {
    const successResponse = endpoint.responses.find((response) =>
      /^2\d\d$/.test(response.statusCode),
    );
    return (successResponse?.fields || [])
      .filter(
        (field) =>
          !field.path.startsWith('@') && !field.path.includes('.') && !field.path.includes('[]'),
      )
      .filter((field) => !['array', 'object'].includes(field.type))
      .map((field) => field.path);
  }

  private pathName(path: string): string {
    return path.replace(/[{}$]/g, '').split('/').filter(Boolean).join(' ') || 'Service Root';
  }

  private titleCase(value: string): string {
    return value
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  private hasBoundary(field: ApiContractField): boolean {
    return [
      field.enum,
      field.maximum,
      field.maxItems,
      field.maxLength,
      field.minimum,
      field.minItems,
      field.minLength,
    ].some((value) => value !== undefined);
  }

  private toHttpMethod(method: string): HttpMethod {
    if (SUPPORTED_METHODS.includes(method as HttpMethod)) {
      return method as HttpMethod;
    }
    return 'GET';
  }

  private refreshSummary(manifest: ContractCoverageManifest): void {
    const byCategory: Record<string, number> = {};
    for (const item of manifest.items) {
      byCategory[item.category] = (byCategory[item.category] || 0) + 1;
    }
    manifest.summary = {
      byCategory,
      requiredItems: manifest.items.filter((item) => item.required).length,
      totalItems: manifest.items.length,
    };
  }

  private buildFindings(
    manifest: ContractCoverageManifest,
    variableAudit: VariableSourceAuditReport,
  ): ContractSuiteFinding[] {
    const findings: ContractSuiteFinding[] = [];
    const requiredUncovered = manifest.items.filter(
      (item) => item.required && item.status === 'uncovered',
    );
    if (requiredUncovered.length > 0) {
      findings.push({
        detail: `${requiredUncovered.length} required contract coverage items are not mapped to generated requests.`,
        severity: 'high',
        title: 'Required contract coverage remains unmapped',
      });
    }

    if (variableAudit.summary.uniqueMissingVariables.length > 0) {
      findings.push({
        detail: `Missing variables: ${variableAudit.summary.uniqueMissingVariables.join(', ')}`,
        severity: 'high',
        title: 'Generated collection has unresolved Bruno variables',
      });
    }

    const unresolvedSeedVariables = [...this.environmentVariables.entries()]
      .filter(([, value]) => typeof value === 'string' && value.startsWith('__SET_'))
      .map(([name]) => name);
    if (unresolvedSeedVariables.length > 0) {
      findings.push({
        detail: `Seed-backed variables need real values before live runs: ${unresolvedSeedVariables.join(', ')}`,
        severity: 'medium',
        title: 'Seed values need hydration',
      });
    }

    return findings;
  }

  private applySeedManifest(seedManifest?: SeedManifestContract): void {
    const variables = seedManifest?.variables;
    if (!variables) {
      return;
    }

    if (Array.isArray(variables)) {
      for (const variable of variables) {
        if (typeof variable === 'string') {
          this.setVariable(variable, this.seedPlaceholder(variable));
        } else {
          this.setVariable(
            variable.name,
            variable.value ?? variable.defaultValue ?? this.seedPlaceholder(variable.name),
          );
        }
      }
      return;
    }

    for (const [name, value] of Object.entries(variables)) {
      if (typeof value === 'string') {
        this.setVariable(name, this.seedPlaceholder(name));
      } else {
        this.setVariable(name, value.value ?? value.defaultValue ?? this.seedPlaceholder(name));
      }
    }
  }

  private applyExplicitVariables(variables?: Record<string, VariableValue>): void {
    for (const [name, value] of Object.entries(variables || {})) {
      this.environmentVariables.set(name, value);
    }
  }

  private setVariable(name: string, value: VariableValue): void {
    if (!this.environmentVariables.has(name)) {
      this.environmentVariables.set(name, value);
    }
  }

  private seedPlaceholder(name: string): string {
    return `__SET_${name}__`;
  }

  private async upsertEnvironment(
    collectionPath: string,
    environmentName: string,
    variables: Record<string, VariableValue>,
  ): Promise<void> {
    const existing = await this.nativeManager.listEnvironments(collectionPath);
    const result = existing.includes(environmentName)
      ? await this.nativeManager.updateEnvironmentVariables(
          collectionPath,
          environmentName,
          variables,
          [],
        )
      : await this.nativeManager.createEnvironment(collectionPath, environmentName, variables);
    this.assertSuccess(result, `upserting environment ${environmentName}`);
  }

  private assertSuccess(result: FileOperationResult, action: string): void {
    if (!result.success) {
      throw new Error(`Failed ${action}: ${result.error || 'unknown error'}`);
    }
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

export function createContractSuiteScaffolder(
  requestBuilder: RequestBuilder,
  nativeManager: BrunoNativeManager,
  coverageManager: ContractCoverageManager,
  variableAuditManager: VariableAuditManager,
): ContractSuiteScaffolder {
  return new ContractSuiteScaffolder(
    requestBuilder,
    nativeManager,
    coverageManager,
    variableAuditManager,
  );
}
