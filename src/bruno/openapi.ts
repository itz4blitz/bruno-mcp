import { promises as fs } from 'node:fs';
import { extname } from 'node:path';

import YAML from 'yaml';

import {
  ControllerContract,
  ControllerOperationContract,
  ControllerParameterContract,
  ControllerRequestBodyContract,
  ControllerResponseContract,
  ControllerSchemaField,
  normalizeControllerAction,
} from './controller-contract.js';
import { BrunoError, HttpMethod } from './types.js';

type OpenApiDocument = {
  components?: {
    schemas?: Record<string, OpenApiSchema>;
    securitySchemes?: Record<string, unknown>;
  };
  info?: {
    title?: string;
    version?: string;
  };
  openapi?: string;
  paths?: Record<string, Record<string, OpenApiOperation>>;
  security?: unknown[];
};

type OpenApiOperation = {
  operationId?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    content?: Record<string, { schema?: OpenApiSchema }>;
    required?: boolean;
  };
  responses?: Record<string, { content?: Record<string, { schema?: OpenApiSchema }>; description?: string }>;
  security?: unknown[];
  summary?: string;
  tags?: string[];
};

type OpenApiParameter = {
  description?: string;
  in: 'header' | 'path' | 'query';
  name: string;
  required?: boolean;
  schema?: OpenApiSchema;
};

type OpenApiSchema = {
  $ref?: string;
  anyOf?: OpenApiSchema[];
  enum?: Array<string | number | boolean | null>;
  format?: string;
  items?: OpenApiSchema;
  nullable?: boolean;
  oneOf?: OpenApiSchema[];
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  type?: string;
};

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

export class OpenApiContractManager {
  async ingestFile(filePath: string): Promise<ControllerContract[]> {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = this.parseOpenApiDocument(raw, filePath);
    return this.normalizeOpenApiDocument(parsed, filePath);
  }

  parseOpenApiDocument(content: string, sourcePath?: string): OpenApiDocument {
    try {
      if (sourcePath && ['.yaml', '.yml'].includes(extname(sourcePath).toLowerCase())) {
        return YAML.parse(content) as OpenApiDocument;
      }
      return JSON.parse(content) as OpenApiDocument;
    } catch (error) {
      throw new BrunoError(
        `Failed to parse OpenAPI document${sourcePath ? ` at ${sourcePath}` : ''}: ${error instanceof Error ? error.message : String(error)}`,
        'VALIDATION_ERROR',
      );
    }
  }

  normalizeOpenApiDocument(document: OpenApiDocument, sourcePath?: string): ControllerContract[] {
    const operationsByController = new Map<string, ControllerOperationContract[]>();

    for (const [path, pathItem] of Object.entries(document.paths || {})) {
      for (const [methodKey, operation] of Object.entries(pathItem || {})) {
        const method = methodKey.toUpperCase() as HttpMethod;
        if (!HTTP_METHODS.includes(method)) {
          continue;
        }

        const normalized = this.normalizeOperation(document, method, path, operation);
        const controllerName = this.getControllerName(path, operation);
        const existing = operationsByController.get(controllerName) || [];
        existing.push(normalized);
        operationsByController.set(controllerName, existing);
      }
    }

    return [...operationsByController.entries()].map(([controllerName, operations]) => ({
      authRequired: operations.some((operation) => operation.authRequired),
      basePath: this.inferBasePath(operations),
      controllerName,
      operations: operations.toSorted((left, right) => left.path.localeCompare(right.path) || left.method.localeCompare(right.method)),
      source: {
        format: 'openapi',
        path: sourcePath,
        title: document.info?.title,
        version: document.info?.version || document.openapi,
      },
    }));
  }

  private normalizeOperation(
    document: OpenApiDocument,
    method: HttpMethod,
    path: string,
    operation: OpenApiOperation,
  ): ControllerOperationContract {
    const requestBody = this.normalizeRequestBody(document, operation.requestBody);
    const responses = this.normalizeResponses(document, operation.responses || {});
    const parameters = this.normalizeParameters(document, operation.parameters || [], path);
    const action = normalizeControllerAction(method, path);
    const actionId = operation.operationId || `${action}:${method.toLowerCase()}:${path}`;
    return {
      action,
      actionId,
      authRequired: Array.isArray(operation.security) ? operation.security.length > 0 : Array.isArray(document.security) ? document.security.length > 0 : false,
      method,
      operationId: operation.operationId,
      parameters,
      path,
      requestBody,
      responses,
      summary: operation.summary,
      tags: operation.tags || [],
    };
  }

  private normalizeParameters(
    document: OpenApiDocument,
    parameters: OpenApiParameter[],
    path: string,
  ): ControllerParameterContract[] {
    const fromOperation = parameters.map((parameter) => ({
      description: parameter.description,
      in: parameter.in,
      name: parameter.name,
      required: Boolean(parameter.required || parameter.in === 'path'),
      schemaType: this.resolveSchema(document, parameter.schema)?.type || 'string',
    }));

    const pathParams = [...path.matchAll(/{([^}]+)}/g)].map((match) => match[1]!);
    for (const name of pathParams) {
      if (!fromOperation.some((parameter) => parameter.in === 'path' && parameter.name === name)) {
        fromOperation.push({
          description: undefined,
          in: 'path',
          name,
          required: true,
          schemaType: 'string',
        });
      }
    }

    return fromOperation;
  }

  private normalizeRequestBody(
    document: OpenApiDocument,
    requestBody: OpenApiOperation['requestBody'],
  ): ControllerRequestBodyContract | undefined {
    if (!requestBody?.content) {
      return undefined;
    }
    const [contentType, content] = Object.entries(requestBody.content)[0] || [];
    if (!contentType) {
      return undefined;
    }
    return {
      contentType,
      fields: this.normalizeSchemaFields(document, content.schema),
      required: Boolean(requestBody.required),
    };
  }

  private normalizeResponses(
    document: OpenApiDocument,
    responses: Record<string, { content?: Record<string, { schema?: OpenApiSchema }>; description?: string }>,
  ): ControllerResponseContract[] {
    return Object.entries(responses)
      .filter(([statusCode]) => /^\d+$/.test(statusCode))
      .map(([statusCode, response]) => {
        const [contentType, content] = Object.entries(response.content || {})[0] || [];
        return {
          bodyFields: this.normalizeSchemaFields(document, content?.schema),
          contentType,
          description: response.description,
          statusCode: Number(statusCode),
        };
      })
      .toSorted((left, right) => left.statusCode - right.statusCode);
  }

  private normalizeSchemaFields(document: OpenApiDocument, schema: OpenApiSchema | undefined): ControllerSchemaField[] {
    const resolved = this.resolveSchema(document, schema);
    if (!resolved) {
      return [];
    }
    if (resolved.type === 'array') {
      return this.normalizeSchemaFields(document, resolved.items);
    }
    if (!resolved.properties) {
      return [];
    }
    const required = new Set(resolved.required || []);
    return Object.entries(resolved.properties).map(([name, property]) => {
      const normalized = this.resolveSchema(document, property) || property;
      return {
        description: undefined,
        enum: normalized.enum,
        format: normalized.format,
        name,
        required: required.has(name),
        type: normalized.type || 'string',
      };
    });
  }

  private resolveSchema(document: OpenApiDocument, schema: OpenApiSchema | undefined): OpenApiSchema | undefined {
    if (!schema) {
      return undefined;
    }
    if (schema.$ref) {
      const refName = schema.$ref.split('/').pop();
      return refName ? document.components?.schemas?.[refName] : undefined;
    }
    if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
      return this.resolveSchema(document, schema.oneOf[0]);
    }
    if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
      return this.resolveSchema(document, schema.anyOf[0]);
    }
    return schema;
  }

  private getControllerName(path: string, operation: OpenApiOperation): string {
    const tag = operation.tags?.[0];
    if (tag) {
      return tag.replace(/Controller$/i, '');
    }
    return path.split('/').filter(Boolean)[0] || 'Root';
  }

  private inferBasePath(operations: ControllerOperationContract[]): string {
    const listLike = operations.find((operation) => operation.action === 'create' || operation.action === 'list');
    if (listLike) {
      return listLike.path;
    }
    return operations[0]?.path.replace(/\/{[^}]+}$/, '') || '/';
  }
}

export function createOpenApiContractManager(): OpenApiContractManager {
  return new OpenApiContractManager();
}
