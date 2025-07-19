/**
 * TypeScript interfaces for Bruno BRU file format
 * Based on the Bru markup language specification
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export type AuthType = 'none' | 'bearer' | 'basic' | 'oauth2' | 'api-key' | 'digest';

export type BodyType = 'none' | 'json' | 'text' | 'xml' | 'form-data' | 'form-urlencoded' | 'binary';

// Bruno Collection Configuration (bruno.json)
export interface BrunoCollection {
  version: string;
  name: string;
  type: 'collection';
  ignore?: string[];
  preRequestScript?: string;
  postResponseScript?: string;
}

// Environment Configuration
export interface BrunoEnvironment {
  name: string;
  variables: Record<string, string | number | boolean>;
}

// Meta block in .bru files
export interface BruMeta {
  name: string;
  type: 'http' | 'graphql';
  seq?: number;
}

// HTTP request configuration
export interface BruHttpRequest {
  method: HttpMethod;
  url: string;
  body: BodyType;
  auth: AuthType;
}

// Authentication configurations
export interface BruAuth {
  type: AuthType;
  bearer?: {
    token: string;
  };
  basic?: {
    username: string;
    password: string;
  };
  oauth2?: {
    grantType: 'authorization_code' | 'client_credentials' | 'password';
    accessTokenUrl?: string;
    authorizationUrl?: string;
    clientId?: string;
    clientSecret?: string;
    scope?: string;
    username?: string;
    password?: string;
  };
  apikey?: {
    key: string;
    value: string;
    in: 'header' | 'query';
  };
  digest?: {
    username: string;
    password: string;
  };
}

// Request body configurations
export interface BruBody {
  type: BodyType;
  content?: string;
  formData?: Array<{
    name: string;
    value: string;
    type: 'text' | 'file';
    enabled?: boolean;
  }>;
  formUrlEncoded?: Array<{
    name: string;
    value: string;
    enabled?: boolean;
  }>;
}

// HTTP headers
export interface BruHeaders {
  [key: string]: string;
}

// Query parameters
export interface BruQuery {
  [key: string]: string | number | boolean;
}

// Variable definitions
export interface BruVars {
  [key: string]: string | number | boolean;
}

// Pre-request script
export interface BruPreRequestScript {
  exec: string[];
}

// Post-response script  
export interface BruPostResponseScript {
  exec: string[];
}

// Test assertions
export interface BruTests {
  exec: string[];
}

// Complete .bru file structure
export interface BruFile {
  meta: BruMeta;
  http: BruHttpRequest;
  auth?: BruAuth;
  headers?: BruHeaders;
  query?: BruQuery;
  body?: BruBody;
  vars?: BruVars;
  script?: {
    'pre-request'?: BruPreRequestScript;
    'post-response'?: BruPostResponseScript;
  };
  tests?: BruTests;
  docs?: string;
}

// Request creation input
export interface CreateRequestInput {
  collectionPath: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: {
    type: BodyType;
    content?: string;
    formData?: Array<{
      name: string;
      value: string;
      type?: 'text' | 'file';
    }>;
  };
  auth?: {
    type: AuthType;
    config: Record<string, string>;
  };
  query?: Record<string, string | number | boolean>;
  folder?: string;
  sequence?: number;
}

// Collection creation input
export interface CreateCollectionInput {
  name: string;
  description?: string;
  baseUrl?: string;
  outputPath: string;
  ignore?: string[];
}

// Environment creation input
export interface CreateEnvironmentInput {
  collectionPath: string;
  name: string;
  variables: Record<string, string | number | boolean>;
}

// Test script addition input
export interface AddTestScriptInput {
  bruFilePath: string;
  scriptType: 'pre-request' | 'post-response' | 'tests';
  script: string;
}

// Test suite creation input
export interface CreateTestSuiteInput {
  collectionPath: string;
  suiteName: string;
  requests: Array<{
    name: string;
    method: HttpMethod;
    url: string;
    headers?: Record<string, string>;
    body?: {
      type: BodyType;
      content?: string;
    };
    auth?: {
      type: AuthType;
      config: Record<string, string>;
    };
    folder?: string;
  }>;
  dependencies?: Array<{
    from: string;
    to: string;
    variable: string;
  }>;
}

// Bruno file generation options
export interface BruGeneratorOptions {
  indentSize?: number;
  useSpaces?: boolean;
  addTimestamp?: boolean;
  validateSyntax?: boolean;
}

// Error types
export class BrunoError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'BrunoError';
  }
}

export class BruValidationError extends BrunoError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'BruValidationError';
  }
}

export class BruFileError extends BrunoError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'FILE_ERROR', details);
    this.name = 'BruFileError';
  }
}

// Utility types for better type safety
export type BrunoCollectionConfig = Omit<BrunoCollection, 'type'> & {
  type?: 'collection';
};

export type HttpRequestMethod = Extract<HttpMethod, 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'>;

export type AuthenticationMethod = Extract<AuthType, 'bearer' | 'basic' | 'oauth2' | 'api-key'>;

// File system related types
export interface FileOperationResult {
  success: boolean;
  path?: string;
  error?: string;
}

export interface DirectoryStructure {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: DirectoryStructure[];
}