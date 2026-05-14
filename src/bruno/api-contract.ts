import { promises as fs } from 'node:fs';
import { extname } from 'node:path';

import YAML from 'yaml';

import { BrunoError } from './types.js';

export type ApiServiceType = 'graphql' | 'mixed' | 'odata' | 'rest';

export interface ApiContractInspectOptions {
  serviceType?: ApiServiceType;
}

export interface ApiContractSource {
  format: 'openapi';
  location?: string;
  title?: string;
  version?: string;
}

export interface ApiContractParameter {
  in: 'body' | 'cookie' | 'header' | 'path' | 'query';
  name: string;
  required: boolean;
  schema?: ApiContractSchema;
}

export interface ApiContractSchema {
  enum?: Array<boolean | number | string | null>;
  format?: string;
  items?: ApiContractSchema;
  maximum?: number;
  maxItems?: number;
  maxLength?: number;
  minimum?: number;
  minItems?: number;
  minLength?: number;
  nullable: boolean;
  properties?: Record<string, ApiContractSchema>;
  required?: string[];
  type: string;
}

export interface ApiContractField {
  enum?: Array<boolean | number | string | null>;
  format?: string;
  maximum?: number;
  maxItems?: number;
  maxLength?: number;
  minimum?: number;
  minItems?: number;
  minLength?: number;
  nullable: boolean;
  path: string;
  required: boolean;
  type: string;
}

export interface ApiContractBody {
  contentType: string;
  fields: ApiContractField[];
  required: boolean;
}

export interface ApiContractResponse {
  contentType?: string;
  fields: ApiContractField[];
  statusCode: string;
}

export interface ApiContractEndpoint {
  authRequired: boolean;
  id: string;
  method: string;
  operationId?: string;
  parameters: ApiContractParameter[];
  path: string;
  requestBodies: ApiContractBody[];
  responses: ApiContractResponse[];
  summary?: string;
  tags: string[];
}

export interface ODataEntitySetContract {
  keyEndpointId?: string;
  keyFields: string[];
  listEndpointId: string;
  name: string;
  navigationProperties: string[];
  path: string;
  queryOptions: string[];
}

export interface ODataContract {
  documentationPaths: string[];
  entitySets: ODataEntitySetContract[];
  metadataPaths: string[];
  serviceRootPaths: string[];
}

export interface ApiContractIr {
  endpoints: ApiContractEndpoint[];
  generatedAt: string;
  odata?: ODataContract;
  serviceType: ApiServiceType;
  source: ApiContractSource;
}

type OpenApiDocument = {
  components?: {
    schemas?: Record<string, OpenApiSchema>;
    securitySchemes?: Record<string, unknown>;
  };
  info?: { title?: string; version?: string };
  openapi?: string;
  paths?: Record<string, OpenApiPathItem>;
  security?: unknown[];
  swagger?: string;
};

type OpenApiPathItem = {
  parameters?: OpenApiParameter[];
} & Record<string, OpenApiOperation | OpenApiParameter[] | undefined>;

type OpenApiOperation = {
  operationId?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    content?: Record<string, { schema?: OpenApiSchema }>;
    required?: boolean;
  };
  responses?: Record<string, { content?: Record<string, { schema?: OpenApiSchema }> }>;
  security?: unknown[];
  summary?: string;
  tags?: string[];
};

type OpenApiParameter = {
  in?: 'cookie' | 'header' | 'path' | 'query';
  name?: string;
  required?: boolean;
  schema?: OpenApiSchema;
};

type OpenApiSchema = {
  $ref?: string;
  allOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  enum?: Array<boolean | number | string | null>;
  format?: string;
  items?: OpenApiSchema;
  maximum?: number;
  maxItems?: number;
  maxLength?: number;
  minimum?: number;
  minItems?: number;
  minLength?: number;
  nullable?: boolean;
  oneOf?: OpenApiSchema[];
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  type?: string;
};

const HTTP_METHODS = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
  'trace',
  'connect',
];
const ODATA_QUERY_OPTIONS = [
  '$select',
  '$filter',
  '$orderby',
  '$top',
  '$skip',
  '$count',
  '$expand',
];

export class ApiContractManager {
  async inspectFile(
    contractPath: string,
    options: ApiContractInspectOptions = {},
  ): Promise<ApiContractIr> {
    const content = await fs.readFile(contractPath, 'utf8');
    return this.inspectContent(content, contractPath, options);
  }

  async inspectUrl(
    contractUrl: string,
    options: ApiContractInspectOptions = {},
  ): Promise<ApiContractIr> {
    const response = await fetch(contractUrl, {
      headers: { Accept: 'application/json, application/yaml' },
    });
    if (!response.ok) {
      throw new BrunoError(
        `Failed to fetch OpenAPI contract from ${contractUrl}: ${response.status}`,
        'VALIDATION_ERROR',
      );
    }

    return this.inspectContent(await response.text(), contractUrl, options);
  }

  inspectContent(
    content: string,
    sourceLocation?: string,
    options: ApiContractInspectOptions = {},
  ): ApiContractIr {
    const document = this.parseOpenApiDocument(content, sourceLocation);
    const endpoints = this.normalizeEndpoints(document);
    const serviceType = options.serviceType || this.inferServiceType(endpoints);
    const odata =
      serviceType === 'odata' || serviceType === 'mixed'
        ? this.normalizeOData(endpoints)
        : undefined;

    return {
      endpoints,
      generatedAt: new Date().toISOString(),
      odata,
      serviceType,
      source: {
        format: 'openapi',
        location: sourceLocation,
        title: document.info?.title,
        version: document.info?.version || document.openapi || document.swagger,
      },
    };
  }

  parseOpenApiDocument(content: string, sourceLocation?: string): OpenApiDocument {
    try {
      if (sourceLocation && ['.yaml', '.yml'].includes(extname(sourceLocation).toLowerCase())) {
        return YAML.parse(content) as OpenApiDocument;
      }

      return JSON.parse(content) as OpenApiDocument;
    } catch (error) {
      throw new BrunoError(
        `Failed to parse OpenAPI contract${sourceLocation ? ` at ${sourceLocation}` : ''}: ${error instanceof Error ? error.message : String(error)}`,
        'VALIDATION_ERROR',
      );
    }
  }

  private normalizeEndpoints(document: OpenApiDocument): ApiContractEndpoint[] {
    const endpoints: ApiContractEndpoint[] = [];

    for (const [path, pathItem] of Object.entries(document.paths || {})) {
      const pathParameters = this.normalizeParameters(document, pathItem.parameters || []);
      for (const [methodKey, operation] of Object.entries(pathItem)) {
        if (!HTTP_METHODS.includes(methodKey.toLowerCase())) {
          continue;
        }

        endpoints.push(
          this.normalizeEndpoint(
            document,
            path,
            methodKey,
            operation as OpenApiOperation,
            pathParameters,
          ),
        );
      }
    }

    return endpoints.toSorted(
      (left, right) =>
        left.path.localeCompare(right.path) || left.method.localeCompare(right.method),
    );
  }

  private normalizeEndpoint(
    document: OpenApiDocument,
    path: string,
    methodKey: string,
    operation: OpenApiOperation,
    pathParameters: ApiContractParameter[],
  ): ApiContractEndpoint {
    const method = methodKey.toUpperCase();
    const parameters = [
      ...pathParameters,
      ...this.normalizeParameters(document, operation.parameters || []),
      ...this.inferUndeclaredPathParameters(path),
    ];

    return {
      authRequired: this.isAuthRequired(document, operation),
      id: `${method} ${path}`,
      method,
      operationId: operation.operationId,
      parameters: this.dedupeParameters(parameters),
      path,
      requestBodies: this.normalizeRequestBodies(document, operation.requestBody),
      responses: this.normalizeResponses(document, operation.responses || {}),
      summary: operation.summary,
      tags: operation.tags || [],
    };
  }

  private normalizeParameters(
    document: OpenApiDocument,
    parameters: OpenApiParameter[],
  ): ApiContractParameter[] {
    return parameters
      .filter((parameter) => parameter.name && parameter.in)
      .map((parameter) => ({
        in: parameter.in!,
        name: parameter.name!,
        required: Boolean(parameter.required || parameter.in === 'path'),
        schema: this.normalizeSchema(document, parameter.schema),
      }));
  }

  private inferUndeclaredPathParameters(path: string): ApiContractParameter[] {
    return [...path.matchAll(/{([^}]+)}/g)].map((match) => ({
      in: 'path',
      name: match[1]!,
      required: true,
      schema: {
        nullable: false,
        type: 'string',
      },
    }));
  }

  private dedupeParameters(parameters: ApiContractParameter[]): ApiContractParameter[] {
    const byName = new Map<string, ApiContractParameter>();
    for (const parameter of parameters) {
      byName.set(`${parameter.in}:${parameter.name}`, parameter);
    }
    return [...byName.values()].toSorted((left, right) =>
      `${left.in}:${left.name}`.localeCompare(`${right.in}:${right.name}`),
    );
  }

  private normalizeRequestBodies(
    document: OpenApiDocument,
    requestBody: OpenApiOperation['requestBody'],
  ): ApiContractBody[] {
    return Object.entries(requestBody?.content || {}).map(([contentType, content]) => ({
      contentType,
      fields: this.flattenSchemaFields(document, content.schema),
      required: Boolean(requestBody?.required),
    }));
  }

  private normalizeResponses(
    document: OpenApiDocument,
    responses: NonNullable<OpenApiOperation['responses']>,
  ): ApiContractResponse[] {
    return Object.entries(responses).map(([statusCode, response]) => {
      const [contentType, content] = Object.entries(response.content || {})[0] || [];
      return {
        contentType,
        fields: this.flattenSchemaFields(document, content?.schema),
        statusCode,
      };
    });
  }

  private flattenSchemaFields(
    document: OpenApiDocument,
    schema: OpenApiSchema | undefined,
    prefix = '',
    parentRequired = false,
  ): ApiContractField[] {
    const normalized = this.normalizeSchema(document, schema);
    if (!normalized) {
      return [];
    }

    if (normalized.type === 'array' && normalized.items) {
      return this.flattenSchemaFields(document, normalized.items, `${prefix}[]`, parentRequired);
    }

    if (!normalized.properties) {
      return prefix
        ? [
            {
              enum: normalized.enum,
              format: normalized.format,
              maximum: normalized.maximum,
              maxItems: normalized.maxItems,
              maxLength: normalized.maxLength,
              minimum: normalized.minimum,
              minItems: normalized.minItems,
              minLength: normalized.minLength,
              nullable: normalized.nullable,
              path: prefix,
              required: parentRequired,
              type: normalized.type,
            },
          ]
        : [];
    }

    const required = new Set(normalized.required || []);
    const fields: ApiContractField[] = [];
    for (const [name, property] of Object.entries(normalized.properties)) {
      const path = prefix ? `${prefix}.${name}` : name;
      const propertyRequired = required.has(name);
      const child = this.normalizeSchema(document, property);
      fields.push({
        enum: child?.enum,
        format: child?.format,
        maximum: child?.maximum,
        maxItems: child?.maxItems,
        maxLength: child?.maxLength,
        minimum: child?.minimum,
        minItems: child?.minItems,
        minLength: child?.minLength,
        nullable: child?.nullable ?? false,
        path,
        required: propertyRequired,
        type: child?.type || 'object',
      });
      fields.push(...this.flattenSchemaFields(document, property, path, propertyRequired));
    }

    return this.dedupeFields(fields);
  }

  private dedupeFields(fields: ApiContractField[]): ApiContractField[] {
    const byPath = new Map<string, ApiContractField>();
    for (const field of fields) {
      byPath.set(field.path, field);
    }
    return [...byPath.values()].toSorted((left, right) => left.path.localeCompare(right.path));
  }

  private normalizeSchema(
    document: OpenApiDocument,
    schema: OpenApiSchema | undefined,
    seenRefs = new Set<string>(),
  ): ApiContractSchema | undefined {
    const resolved = this.resolveSchema(document, schema, seenRefs);
    if (!resolved) {
      return undefined;
    }

    return {
      enum: resolved.enum,
      format: resolved.format,
      items: this.normalizeSchema(document, resolved.items, seenRefs),
      maximum: resolved.maximum,
      maxItems: resolved.maxItems,
      maxLength: resolved.maxLength,
      minimum: resolved.minimum,
      minItems: resolved.minItems,
      minLength: resolved.minLength,
      nullable: Boolean(resolved.nullable),
      properties: resolved.properties
        ? Object.fromEntries(
            Object.entries(resolved.properties).map(([name, property]) => [
              name,
              this.normalizeSchema(document, property, seenRefs) || {
                nullable: false,
                type: 'object',
              },
            ]),
          )
        : undefined,
      required: resolved.required || [],
      type: resolved.type || (resolved.properties ? 'object' : resolved.items ? 'array' : 'string'),
    };
  }

  private resolveSchema(
    document: OpenApiDocument,
    schema: OpenApiSchema | undefined,
    seenRefs: Set<string>,
  ): OpenApiSchema | undefined {
    if (!schema) {
      return undefined;
    }

    if (schema.$ref) {
      if (seenRefs.has(schema.$ref)) {
        return { type: 'object' };
      }
      seenRefs.add(schema.$ref);
      const refName = schema.$ref.split('/').pop();
      return this.resolveSchema(
        document,
        refName ? document.components?.schemas?.[refName] : undefined,
        seenRefs,
      );
    }

    if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
      const merged = schema.allOf
        .map((entry) => this.resolveSchema(document, entry, seenRefs))
        .filter((entry): entry is OpenApiSchema => Boolean(entry))
        .reduce<OpenApiSchema>(
          (accumulator, entry) => ({
            ...accumulator,
            ...entry,
            properties: { ...accumulator.properties, ...entry.properties },
            required: [...(accumulator.required || []), ...(entry.required || [])],
          }),
          {},
        );
      return { ...schema, ...merged };
    }

    const union = schema.oneOf || schema.anyOf;
    if (Array.isArray(union) && union.length > 0) {
      return this.resolveSchema(document, union[0], seenRefs);
    }

    return schema;
  }

  private isAuthRequired(document: OpenApiDocument, operation: OpenApiOperation): boolean {
    if (Array.isArray(operation.security)) {
      return operation.security.length > 0;
    }
    return Array.isArray(document.security) && document.security.length > 0;
  }

  private inferServiceType(endpoints: ApiContractEndpoint[]): ApiServiceType {
    const odataSignals = endpoints.filter(
      (endpoint) =>
        endpoint.path.includes('$metadata') ||
        endpoint.path.includes('(') ||
        endpoint.parameters.some((parameter) => parameter.name.startsWith('$')),
    ).length;

    if (odataSignals === 0) {
      return 'rest';
    }

    return odataSignals === endpoints.length ? 'odata' : 'mixed';
  }

  private normalizeOData(endpoints: ApiContractEndpoint[]): ODataContract {
    const getEndpoints = endpoints.filter((endpoint) => endpoint.method === 'GET');
    const serviceRootPaths = getEndpoints
      .filter((endpoint) => endpoint.path === '/' || endpoint.path === '')
      .map((endpoint) => endpoint.path);
    const metadataPaths = getEndpoints
      .filter((endpoint) => endpoint.path.endsWith('/$metadata') || endpoint.path === '$metadata')
      .map((endpoint) => endpoint.path);
    const documentationPaths = getEndpoints
      .filter((endpoint) => /\/(?:openapi\.json|swagger)(?:$|[/?#])/.test(endpoint.path))
      .map((endpoint) => endpoint.path);

    const entitySets = getEndpoints
      .filter((endpoint) => this.isODataEntitySetListEndpoint(endpoint))
      .map((endpoint) => this.normalizeODataEntitySet(endpoint, endpoints));

    return {
      documentationPaths,
      entitySets,
      metadataPaths,
      serviceRootPaths,
    };
  }

  private isODataEntitySetListEndpoint(endpoint: ApiContractEndpoint): boolean {
    if (
      endpoint.path === '/' ||
      endpoint.path.includes('$') ||
      endpoint.path.includes('{') ||
      endpoint.path.includes('(')
    ) {
      return false;
    }

    const name = endpoint.path.split('/').filter(Boolean).at(-1);
    return Boolean(name) && endpoint.parameters.some((parameter) => parameter.name.startsWith('$'));
  }

  private normalizeODataEntitySet(
    listEndpoint: ApiContractEndpoint,
    endpoints: ApiContractEndpoint[],
  ): ODataEntitySetContract {
    const name = listEndpoint.path.split('/').filter(Boolean).at(-1) || listEndpoint.path;
    const keyEndpoint = endpoints.find(
      (endpoint) =>
        endpoint.method === 'GET' &&
        endpoint.path !== listEndpoint.path &&
        (endpoint.path.startsWith(`${listEndpoint.path}/`) ||
          endpoint.path.startsWith(`${listEndpoint.path}(`)),
    );
    const keyFields =
      keyEndpoint?.parameters
        .filter((parameter) => parameter.in === 'path')
        .map((parameter) => parameter.name) || [];

    return {
      keyEndpointId: keyEndpoint?.id,
      keyFields,
      listEndpointId: listEndpoint.id,
      name,
      navigationProperties: this.inferNavigationProperties(listEndpoint),
      path: listEndpoint.path,
      queryOptions: this.normalizeODataQueryOptions(listEndpoint),
    };
  }

  private normalizeODataQueryOptions(endpoint: ApiContractEndpoint): string[] {
    const declared = endpoint.parameters
      .filter((parameter) => parameter.in === 'query' && parameter.name.startsWith('$'))
      .map((parameter) => parameter.name);
    return ODATA_QUERY_OPTIONS.filter((option) => declared.includes(option));
  }

  private inferNavigationProperties(endpoint: ApiContractEndpoint): string[] {
    const successResponse = endpoint.responses.find((response) =>
      /^2\d\d$/.test(response.statusCode),
    );
    return (successResponse?.fields || [])
      .filter((field) => !field.path.startsWith('@') && ['array', 'object'].includes(field.type))
      .map((field) => field.path.replace(/\[\]$/, ''))
      .toSorted();
  }
}

export function createApiContractManager(): ApiContractManager {
  return new ApiContractManager();
}
