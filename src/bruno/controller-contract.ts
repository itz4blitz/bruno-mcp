import { HttpMethod } from './types.js';

export interface ControllerContractSource {
  format: 'openapi';
  path?: string;
  title?: string;
  version?: string;
}

export interface ControllerSchemaField {
  description?: string;
  enum?: Array<string | number | boolean | null>;
  format?: string;
  name: string;
  required: boolean;
  type: string;
}

export interface ControllerParameterContract {
  description?: string;
  in: 'header' | 'path' | 'query';
  name: string;
  required: boolean;
  schemaType: string;
}

export interface ControllerRequestBodyContract {
  contentType: string;
  fields: ControllerSchemaField[];
  required: boolean;
}

export interface ControllerResponseContract {
  bodyFields: ControllerSchemaField[];
  contentType?: string;
  description?: string;
  statusCode: number;
}

export interface ControllerOperationContract {
  action: 'create' | 'custom' | 'delete' | 'get' | 'list' | 'update';
  actionId: string;
  authRequired: boolean;
  method: HttpMethod;
  operationId?: string;
  parameters: ControllerParameterContract[];
  path: string;
  requestBody?: ControllerRequestBodyContract;
  responses: ControllerResponseContract[];
  summary?: string;
  tags: string[];
}

export interface ControllerContract {
  authRequired: boolean;
  basePath: string;
  controllerName: string;
  operations: ControllerOperationContract[];
  source: ControllerContractSource;
}

export function normalizeControllerAction(
  method: HttpMethod,
  path: string,
): ControllerOperationContract['action'] {
  const leaf = path.split('/').filter(Boolean).at(-1) || '';
  const hasIdSegment = /{[^}]+}$/.test(path);

  if (method === 'POST' && !hasIdSegment) {
    return 'create';
  }
  if (method === 'GET' && !hasIdSegment) {
    return 'list';
  }
  if (method === 'GET' && hasIdSegment) {
    return 'get';
  }
  if ((method === 'PUT' || method === 'PATCH') && hasIdSegment) {
    return 'update';
  }
  if (method === 'DELETE' && hasIdSegment) {
    return 'delete';
  }

  if (leaf.includes('search') || leaf.includes('lookup')) {
    return 'list';
  }

  return 'custom';
}
