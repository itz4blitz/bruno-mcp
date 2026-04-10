/**
 * Bruno request builder
 * Handles creation and management of .bru request files
 */

import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  AddTestScriptInput,
  AuthType,
  BodyType,
  BruAuth,
  BruBody,
  BruFile,
  BruFileError,
  BrunoError,
  CreateRequestInput,
  FileOperationResult,
  HttpMethod,
} from './types.js';
import { generateBruFile } from './generator.js';

type ParsedValue = string | number | boolean;
type ParsedBlock = {
  name: string;
  content: string;
};

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
const HTTP_METHOD_BLOCKS = HTTP_METHODS.map((method) => method.toLowerCase());

export class RequestBuilder {
  /**
   * Create a new .bru request file
   */
  async createRequest(input: CreateRequestInput): Promise<FileOperationResult> {
    try {
      this.validateRequestInput(input);

      const bruFile = this.buildBruFile(input);
      const filePath = this.getRequestFilePath(input);

      await this.ensureDirectory(dirname(filePath));
      await fs.writeFile(filePath, generateBruFile(bruFile));

      return {
        success: true,
        path: filePath,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Add or replace a script block in an existing request.
   */
  async addTestScript(input: AddTestScriptInput): Promise<FileOperationResult> {
    try {
      const bruFile = await this.loadRequest(input.bruFilePath);
      const exec = this.normalizeScriptLines(input.script);

      if (exec.length === 0) {
        throw new BrunoError('Script content is required', 'VALIDATION_ERROR');
      }

      if (input.scriptType === 'tests') {
        bruFile.tests = { exec };
      } else {
        bruFile.script = {
          ...bruFile.script,
          [input.scriptType]: { exec },
        };
      }

      await fs.writeFile(input.bruFilePath, generateBruFile(bruFile));

      return {
        success: true,
        path: input.bruFilePath,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Load an existing .bru request file
   */
  async loadRequest(filePath: string): Promise<BruFile> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.parseBruFile(content);
    } catch (error) {
      throw new BruFileError(`Failed to load request from ${filePath}`, {
        originalError: error,
      });
    }
  }

  /**
   * Update an existing request
   */
  async updateRequest(
    filePath: string,
    updates: Partial<CreateRequestInput>,
  ): Promise<FileOperationResult> {
    try {
      const existingBru = await this.loadRequest(filePath);
      const updatedBru = this.applyUpdates(existingBru, updates);

      await fs.writeFile(filePath, generateBruFile(updatedBru));

      return {
        success: true,
        path: filePath,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create multiple related requests (CRUD operations)
   */
  async createCrudRequests(
    collectionPath: string,
    entityName: string,
    baseUrl: string,
    folder?: string,
  ): Promise<FileOperationResult[]> {
    const results: FileOperationResult[] = [];
    const entityPath = this.getEntityPath(entityName);

    const crudOperations = [
      {
        name: `Get All ${entityName}`,
        method: 'GET' as HttpMethod,
        url: `${baseUrl}/${entityPath}`,
        sequence: 1,
      },
      {
        name: `Get ${entityName} by ID`,
        method: 'GET' as HttpMethod,
        url: `${baseUrl}/${entityPath}/{{id}}`,
        sequence: 2,
      },
      {
        name: `Create ${entityName}`,
        method: 'POST' as HttpMethod,
        url: `${baseUrl}/${entityPath}`,
        body: {
          type: 'json' as BodyType,
          content: JSON.stringify(
            {
              name: `New ${entityName}`,
              description: `Description for ${entityName}`,
            },
            null,
            2,
          ),
        },
        headers: {
          'Content-Type': 'application/json',
        },
        sequence: 3,
      },
      {
        name: `Update ${entityName}`,
        method: 'PUT' as HttpMethod,
        url: `${baseUrl}/${entityPath}/{{id}}`,
        body: {
          type: 'json' as BodyType,
          content: JSON.stringify(
            {
              name: `Updated ${entityName}`,
              description: `Updated description for ${entityName}`,
            },
            null,
            2,
          ),
        },
        headers: {
          'Content-Type': 'application/json',
        },
        sequence: 4,
      },
      {
        name: `Delete ${entityName}`,
        method: 'DELETE' as HttpMethod,
        url: `${baseUrl}/${entityPath}/{{id}}`,
        sequence: 5,
      },
    ];

    for (const operation of crudOperations) {
      results.push(
        await this.createRequest({
          collectionPath,
          ...operation,
          folder,
        }),
      );
    }

    return results;
  }

  /**
   * Create authentication test requests
   */
  async createAuthRequests(
    collectionPath: string,
    baseUrl: string,
    authType: AuthType,
    folder = 'auth',
  ): Promise<FileOperationResult[]> {
    const results: FileOperationResult[] = [];

    const authConfig = this.getDefaultAuthConfig(authType);

    const authRequests = [
      {
        name: 'Login',
        method: 'POST' as HttpMethod,
        url: `${baseUrl}/auth/login`,
        body: {
          type: 'json' as BodyType,
          content: JSON.stringify(
            {
              username: '{{username}}',
              password: '{{password}}',
            },
            null,
            2,
          ),
        },
        headers: {
          'Content-Type': 'application/json',
        },
        sequence: 1,
      },
      {
        name: 'Get Profile',
        method: 'GET' as HttpMethod,
        url: `${baseUrl}/auth/profile`,
        auth: authConfig,
        sequence: 2,
      },
      {
        name: 'Refresh Token',
        method: 'POST' as HttpMethod,
        url: `${baseUrl}/auth/refresh`,
        body: {
          type: 'json' as BodyType,
          content: JSON.stringify(
            {
              refreshToken: '{{refreshToken}}',
            },
            null,
            2,
          ),
        },
        headers: {
          'Content-Type': 'application/json',
        },
        sequence: 3,
      },
      {
        name: 'Logout',
        method: 'POST' as HttpMethod,
        url: `${baseUrl}/auth/logout`,
        auth: authConfig,
        sequence: 4,
      },
    ];

    for (const authRequest of authRequests) {
      results.push(
        await this.createRequest({
          collectionPath,
          ...authRequest,
          folder,
        }),
      );
    }

    return results;
  }

  /**
   * Build BRU file structure from input
   */
  private buildBruFile(input: CreateRequestInput): BruFile {
    const bruFile: BruFile = {
      meta: {
        name: input.name,
        type: 'http',
        seq: input.sequence,
      },
      http: {
        method: input.method,
        url: input.url,
        body: input.body?.type || 'none',
        auth: input.auth?.type || 'none',
      },
    };

    if (input.headers && Object.keys(input.headers).length > 0) {
      bruFile.headers = input.headers;
    }

    if (input.query && Object.keys(input.query).length > 0) {
      bruFile.query = input.query;
    }

    const body = this.buildBruBody(input.body);
    if (body) {
      bruFile.body = body;
    }

    const auth = this.buildBruAuth(input.auth);
    if (auth) {
      bruFile.auth = auth;
    }

    if (input.script?.['pre-request'] || input.script?.['post-response']) {
      bruFile.script = {};

      if (input.script['pre-request']) {
        bruFile.script['pre-request'] = { exec: input.script['pre-request'] };
      }

      if (input.script['post-response']) {
        bruFile.script['post-response'] = {
          exec: input.script['post-response'],
        };
      }
    }

    if (input.tests && input.tests.length > 0) {
      bruFile.tests = { exec: input.tests };
    }

    return bruFile;
  }

  /**
   * Get file path for request
   */
  private getRequestFilePath(input: CreateRequestInput): string {
    const fileName = `${this.sanitizeFileName(input.name)}.bru`;
    return input.folder
      ? join(input.collectionPath, input.folder, fileName)
      : join(input.collectionPath, fileName);
  }

  /**
   * Sanitize file name for filesystem
   */
  private sanitizeFileName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  /**
   * Parse BRU file content for the supported REST feature set.
   */
  private parseBruFile(content: string): BruFile {
    const blocks = this.extractBlocks(content);
    const metaBlock = this.getBlock(blocks, 'meta');
    const httpBlock = this.getHttpBlock(blocks);

    if (!metaBlock || !httpBlock) {
      throw new BrunoError('BRU file must contain meta and HTTP blocks', 'VALIDATION_ERROR');
    }

    const metaFields = this.parseKeyValueLines(metaBlock.content);
    const httpFields = this.parseKeyValueLines(httpBlock.content);

    const bruFile: BruFile = {
      meta: {
        name: this.toStringValue(metaFields.name) || 'Parsed Request',
        type: (this.toStringValue(metaFields.type) as 'http' | 'graphql') || 'http',
        seq: this.toOptionalNumber(metaFields.seq),
      },
      http: {
        method: httpBlock.name.toUpperCase() as HttpMethod,
        url: this.toStringValue(httpFields.url) || '',
        body: this.parseHttpBodyMode(this.toStringValue(httpFields.body)),
        auth: (this.toStringValue(httpFields.auth) as AuthType) || 'none',
      },
    };

    const headersBlock = this.getBlock(blocks, 'headers');
    if (headersBlock) {
      const headers = this.parseStringRecord(headersBlock.content);
      if (Object.keys(headers).length > 0) {
        bruFile.headers = headers;
      }
    }

    const queryBlock = this.getBlock(blocks, 'query');
    if (queryBlock) {
      const query = this.parseKeyValueLines(queryBlock.content);
      if (Object.keys(query).length > 0) {
        bruFile.query = query;
      }
    }

    const body = this.parseBodyBlock(blocks);
    if (body) {
      bruFile.body = body;
      bruFile.http.body = body.type;
    }

    const auth = this.parseAuthBlock(bruFile.http.auth, blocks);
    if (auth) {
      bruFile.auth = auth;
      bruFile.http.auth = auth.type;
    }

    const preRequest = this.getBlock(blocks, 'script:pre-request');
    const postResponse = this.getBlock(blocks, 'script:post-response');
    if (preRequest || postResponse) {
      bruFile.script = {};

      if (preRequest) {
        bruFile.script['pre-request'] = {
          exec: this.normalizeScriptLines(preRequest.content),
        };
      }

      if (postResponse) {
        bruFile.script['post-response'] = {
          exec: this.normalizeScriptLines(postResponse.content),
        };
      }
    }

    const testsBlock = this.getBlock(blocks, 'tests');
    if (testsBlock) {
      bruFile.tests = { exec: this.normalizeScriptLines(testsBlock.content) };
    }

    const docsBlock = this.getBlock(blocks, 'docs');
    if (docsBlock) {
      const docs = this.normalizeBlockContent(docsBlock.content);
      if (docs) {
        bruFile.docs = docs;
      }
    }

    return bruFile;
  }

  /**
   * Apply updates to existing BRU file
   */
  private applyUpdates(existingBru: BruFile, updates: Partial<CreateRequestInput>): BruFile {
    const updated: BruFile = {
      ...existingBru,
      meta: { ...existingBru.meta },
      http: { ...existingBru.http },
      headers: existingBru.headers ? { ...existingBru.headers } : undefined,
      query: existingBru.query ? { ...existingBru.query } : undefined,
      body: existingBru.body ? { ...existingBru.body } : undefined,
      auth: existingBru.auth ? { ...existingBru.auth } : undefined,
      script: existingBru.script ? { ...existingBru.script } : undefined,
    };

    if (updates.name) {
      updated.meta.name = updates.name;
    }

    if (updates.sequence !== undefined) {
      updated.meta.seq = updates.sequence;
    }

    if (updates.method) {
      updated.http.method = updates.method;
    }

    if (updates.url) {
      updated.http.url = updates.url;
    }

    if (updates.headers) {
      updated.headers = { ...updated.headers, ...updates.headers };
    }

    if (updates.query) {
      updated.query = { ...updated.query, ...updates.query };
    }

    if (updates.body) {
      updated.http.body = updates.body.type;
      updated.body = this.buildBruBody(updates.body);
    }

    if (updates.auth) {
      updated.http.auth = updates.auth.type;
      updated.auth = this.buildBruAuth(updates.auth);
    }

    return updated;
  }

  /**
   * Validate request input
   */
  private validateRequestInput(input: CreateRequestInput): void {
    if (!input.name || input.name.trim().length === 0) {
      throw new BrunoError('Request name is required', 'VALIDATION_ERROR');
    }

    if (!input.collectionPath || input.collectionPath.trim().length === 0) {
      throw new BrunoError('Collection path is required', 'VALIDATION_ERROR');
    }

    if (!input.method) {
      throw new BrunoError('HTTP method is required', 'VALIDATION_ERROR');
    }

    if (!input.url || input.url.trim().length === 0) {
      throw new BrunoError('URL is required', 'VALIDATION_ERROR');
    }

    if (!HTTP_METHODS.includes(input.method)) {
      throw new BrunoError(`Invalid HTTP method: ${input.method}`, 'VALIDATION_ERROR');
    }

    if (
      input.body?.type === 'form-data' &&
      (!input.body.formData || input.body.formData.length === 0)
    ) {
      throw new BrunoError('Form-data body requires at least one field', 'VALIDATION_ERROR');
    }

    if (
      input.body?.type === 'form-urlencoded' &&
      (!input.body.formUrlEncoded || input.body.formUrlEncoded.length === 0)
    ) {
      throw new BrunoError('Form-urlencoded body requires at least one field', 'VALIDATION_ERROR');
    }

    if (input.body?.type === 'graphql' && !input.body.content?.trim()) {
      throw new BrunoError('GraphQL body requires a query document', 'VALIDATION_ERROR');
    }

    if (input.body?.type === 'graphql' && input.body.variables) {
      this.validateJsonString(input.body.variables, 'GraphQL variables must be valid JSON');
    }

    if (input.body?.type === 'binary' && !input.body.filePath?.trim()) {
      throw new BrunoError('Binary body requires a file path', 'VALIDATION_ERROR');
    }

    if (input.auth && input.auth.type !== 'none') {
      this.validateAuthConfig(input.auth.type, input.auth.config);
    }
  }

  /**
   * Validate authentication configuration
   */
  private validateAuthConfig(authType: AuthType, config: Record<string, string>): void {
    switch (authType) {
      case 'bearer':
        if (!config.token) {
          throw new BrunoError('Bearer token is required', 'VALIDATION_ERROR');
        }
        break;
      case 'basic':
      case 'digest':
        if (!config.username || !config.password) {
          throw new BrunoError('Username and password are required', 'VALIDATION_ERROR');
        }
        break;
      case 'api-key':
        if (!config.key || !config.value) {
          throw new BrunoError('Key and value are required for API key auth', 'VALIDATION_ERROR');
        }
        break;
      case 'oauth2':
        if (!config.grantType && !config.grant_type) {
          throw new BrunoError('grantType is required for oauth2 auth', 'VALIDATION_ERROR');
        }
        break;
    }
  }

  /**
   * Build request body configuration.
   */
  private buildBruBody(input?: CreateRequestInput['body']): BruBody | undefined {
    if (!input || input.type === 'none') {
      return undefined;
    }

    const body: BruBody = {
      type: input.type,
      content: input.content,
      contentType: input.contentType,
      filePath: input.filePath,
      variables: input.variables,
    };

    if (input.formData) {
      body.formData = input.formData.map((field) => ({
        name: field.name,
        value: field.value,
        type: field.type || 'text',
        enabled: true,
      }));
    }

    if (input.formUrlEncoded) {
      body.formUrlEncoded = input.formUrlEncoded.map((field) => ({
        name: field.name,
        value: field.value,
        enabled: true,
      }));
    }

    return body;
  }

  /**
   * Build request auth configuration.
   */
  private buildBruAuth(input?: CreateRequestInput['auth']): BruAuth | undefined {
    if (!input || input.type === 'none') {
      return undefined;
    }

    const auth: BruAuth = {
      type: input.type,
    };

    switch (input.type) {
      case 'bearer':
        auth.bearer = {
          token: input.config.token || '{{token}}',
        };
        break;
      case 'basic':
        auth.basic = {
          username: input.config.username || '{{username}}',
          password: input.config.password || '{{password}}',
        };
        break;
      case 'oauth2':
        auth.oauth2 = {
          grantType: this.toGrantType(input.config.grantType || input.config.grant_type),
          accessTokenUrl: input.config.accessTokenUrl || input.config.access_token_url,
          authorizationUrl: input.config.authorizationUrl || input.config.authorization_url,
          clientId: input.config.clientId || input.config.client_id,
          clientSecret: input.config.clientSecret || input.config.client_secret,
          scope: input.config.scope,
          username: input.config.username,
          password: input.config.password,
        };
        break;
      case 'api-key':
        auth.apikey = {
          key: input.config.key || 'X-API-Key',
          value: input.config.value || '{{apiKey}}',
          in: (input.config.in as 'header' | 'query') || 'header',
        };
        break;
      case 'digest':
        auth.digest = {
          username: input.config.username || '{{username}}',
          password: input.config.password || '{{password}}',
        };
        break;
    }

    return auth;
  }

  /**
   * Parse the body block from a BRU file.
   */
  private parseBodyBlock(blocks: ParsedBlock[]): BruBody | undefined {
    const jsonBody = this.getBlock(blocks, 'body:json');
    if (jsonBody) {
      return {
        type: 'json',
        content: this.normalizeBlockContent(jsonBody.content),
      };
    }

    const textBody = this.getBlock(blocks, 'body:text');
    if (textBody) {
      return {
        type: 'text',
        content: this.normalizeBlockContent(textBody.content),
      };
    }

    const xmlBody = this.getBlock(blocks, 'body:xml');
    if (xmlBody) {
      return {
        type: 'xml',
        content: this.normalizeBlockContent(xmlBody.content),
      };
    }

    const formDataBody = this.getBlock(blocks, 'body:multipart-form');
    if (formDataBody) {
      return {
        type: 'form-data',
        formData: Object.entries(this.parseStringRecord(formDataBody.content)).map(
          ([name, value]) => ({
            name,
            value,
            type: 'text',
            enabled: true,
          }),
        ),
      };
    }

    const formUrlEncodedBody = this.getBlock(blocks, 'body:form-urlencoded');
    if (formUrlEncodedBody) {
      return {
        type: 'form-urlencoded',
        formUrlEncoded: Object.entries(this.parseStringRecord(formUrlEncodedBody.content)).map(
          ([name, value]) => ({
            name,
            value,
            enabled: true,
          }),
        ),
      };
    }

    const binaryBody = this.getBlock(blocks, 'body:file');
    if (binaryBody) {
      return this.parseBinaryBody(binaryBody.content);
    }

    const graphqlBody = this.getBlock(blocks, 'body:graphql');
    if (graphqlBody) {
      const graphqlVars = this.getBlock(blocks, 'body:graphql:vars');
      return {
        type: 'graphql',
        content: this.normalizeBlockContent(graphqlBody.content),
        variables: graphqlVars ? this.normalizeBlockContent(graphqlVars.content) : undefined,
      };
    }

    return undefined;
  }

  /**
   * Parse the auth block from a BRU file.
   */
  private parseAuthBlock(authType: AuthType, blocks: ParsedBlock[]): BruAuth | undefined {
    if (!authType || authType === 'none') {
      return undefined;
    }

    const authBlock = this.getBlock(blocks, `auth:${authType}`);
    if (!authBlock) {
      return undefined;
    }

    const fields = this.parseStringRecord(authBlock.content);
    const auth: BruAuth = { type: authType };

    switch (authType) {
      case 'bearer':
        auth.bearer = { token: fields.token || '{{token}}' };
        break;
      case 'basic':
        auth.basic = {
          username: fields.username || '{{username}}',
          password: fields.password || '{{password}}',
        };
        break;
      case 'oauth2':
        auth.oauth2 = {
          grantType: this.toGrantType(fields.grant_type || fields.grantType),
          accessTokenUrl: fields.access_token_url || fields.accessTokenUrl,
          authorizationUrl: fields.authorization_url || fields.authorizationUrl,
          clientId: fields.client_id || fields.clientId,
          clientSecret: fields.client_secret || fields.clientSecret,
          scope: fields.scope,
          username: fields.username,
          password: fields.password,
        };
        break;
      case 'api-key':
        auth.apikey = {
          key: fields.key || 'X-API-Key',
          value: fields.value || '{{apiKey}}',
          in: (fields.in as 'header' | 'query') || 'header',
        };
        break;
      case 'digest':
        auth.digest = {
          username: fields.username || '{{username}}',
          password: fields.password || '{{password}}',
        };
        break;
    }

    return auth;
  }

  /**
   * Extract top-level BRU blocks while preserving nested braces within block content.
   */
  private extractBlocks(content: string): ParsedBlock[] {
    const blocks: ParsedBlock[] = [];
    const blockPattern = /^([a-z][a-z0-9:-]*)\s*\{/gim;
    let match: RegExpExecArray | null;

    while ((match = blockPattern.exec(content)) !== null) {
      const name = match[1];
      const openBraceIndex = content.indexOf('{', match.index);
      const closeBraceIndex = this.findMatchingBrace(content, openBraceIndex);

      blocks.push({
        name,
        content: content.slice(openBraceIndex + 1, closeBraceIndex),
      });

      blockPattern.lastIndex = closeBraceIndex + 1;
    }

    return blocks;
  }

  /**
   * Find the closing brace for a block, accounting for nested braces.
   */
  private findMatchingBrace(content: string, openBraceIndex: number): number {
    let depth = 0;

    for (let index = openBraceIndex; index < content.length; index += 1) {
      const character = content[index];

      if (character === '{') {
        depth += 1;
      } else if (character === '}') {
        depth -= 1;
        if (depth === 0) {
          return index;
        }
      }
    }

    throw new BrunoError('Unbalanced BRU block braces', 'VALIDATION_ERROR');
  }

  /**
   * Get a named parsed block.
   */
  private getBlock(blocks: ParsedBlock[], name: string): ParsedBlock | undefined {
    return blocks.find((block) => block.name.toLowerCase() === name.toLowerCase());
  }

  /**
   * Get the single HTTP method block.
   */
  private getHttpBlock(blocks: ParsedBlock[]): ParsedBlock | undefined {
    return blocks.find((block) => HTTP_METHOD_BLOCKS.includes(block.name.toLowerCase()));
  }

  /**
   * Parse a simple key/value block.
   */
  private parseKeyValueLines(content: string): Record<string, ParsedValue> {
    const values: Record<string, ParsedValue> = {};

    for (const rawLine of this.normalizeBlockContent(content).split('\n')) {
      const line = rawLine.trim();

      if (!line || line.startsWith('#')) {
        continue;
      }

      const separatorIndex = line.indexOf(':');
      if (separatorIndex === -1) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      const rawValue = line.slice(separatorIndex + 1).trim();
      values[key] = this.parseScalarValue(rawValue);
    }

    return values;
  }

  /**
   * Parse a block containing only string values.
   */
  private parseStringRecord(content: string): Record<string, string> {
    const values = this.parseKeyValueLines(content);
    return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)]));
  }

  /**
   * Parse a scalar BRU value.
   */
  private parseScalarValue(value: string): ParsedValue {
    if (value.startsWith("'''") && value.endsWith("'''")) {
      return value.slice(3, -3);
    }

    if (value.startsWith("'") && value.endsWith("'")) {
      return value.slice(1, -1);
    }

    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }

    if (/^-?\d+(\.\d+)?$/.test(value)) {
      return Number(value);
    }

    return value;
  }

  /**
   * Normalize the body mode used in the HTTP block.
   */
  private parseHttpBodyMode(value: string | undefined): BodyType {
    if (value === 'file') {
      return 'binary';
    }

    return (value as BodyType) || 'none';
  }

  /**
   * Validate that a user-provided JSON string is parseable.
   */
  private validateJsonString(value: string, message: string): void {
    try {
      JSON.parse(value);
    } catch {
      throw new BrunoError(message, 'VALIDATION_ERROR');
    }
  }

  /**
   * Parse a Bruno binary file body block.
   */
  private parseBinaryBody(content: string): BruBody {
    const normalized = this.normalizeBlockContent(content);
    const fileLine = normalized
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith('~file:') && line.startsWith('file:'));

    if (!fileLine) {
      throw new BrunoError('Binary body block must contain a file entry', 'VALIDATION_ERROR');
    }

    const match = fileLine.match(/^file:\s*@file\(([^)]+)\)(?:\s+@contentType\(([^)]+)\))?$/);
    if (!match) {
      throw new BrunoError('Unsupported binary body syntax', 'VALIDATION_ERROR');
    }

    return {
      type: 'binary',
      filePath: match[1],
      contentType: match[2],
    };
  }

  /**
   * Normalize block indentation while preserving nested structure.
   */
  private normalizeBlockContent(content: string): string {
    const lines = content.replace(/\r\n/g, '\n').split('\n');

    while (lines.length > 0 && lines[0].trim() === '') {
      lines.shift();
    }

    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }

    const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
    const minIndent =
      nonEmptyLines.length === 0
        ? 0
        : Math.min(...nonEmptyLines.map((line) => line.match(/^\s*/)?.[0].length || 0));

    return lines.map((line) => line.slice(minIndent)).join('\n');
  }

  /**
   * Normalize multiline script content into exec lines.
   */
  private normalizeScriptLines(script: string): string[] {
    const normalized = this.normalizeBlockContent(script);
    return normalized
      .split('\n')
      .map((line) => line.replace(/\s+$/, ''))
      .filter((line, index, lines) => {
        if (line.trim().length > 0) {
          return true;
        }

        const hasNonEmptyBefore = lines.slice(0, index).some((entry) => entry.trim().length > 0);
        const hasNonEmptyAfter = lines.slice(index + 1).some((entry) => entry.trim().length > 0);
        return hasNonEmptyBefore && hasNonEmptyAfter;
      });
  }

  /**
   * Convert values safely.
   */
  private toStringValue(value: ParsedValue | undefined): string | undefined {
    return value === undefined ? undefined : String(value);
  }

  private toOptionalNumber(value: ParsedValue | undefined): number | undefined {
    return typeof value === 'number' ? value : undefined;
  }

  /**
   * Derive a REST-style entity path from the display name.
   */
  private getEntityPath(entityName: string): string {
    const sanitized = this.sanitizeFileName(entityName.replace(/-/g, ' '));
    return sanitized.endsWith('s') ? sanitized : `${sanitized}s`;
  }

  /**
   * Provide simple default auth configs for helper request generation.
   */
  private getDefaultAuthConfig(authType: AuthType): CreateRequestInput['auth'] | undefined {
    switch (authType) {
      case 'none':
        return undefined;
      case 'bearer':
        return { type: 'bearer', config: { token: '{{token}}' } };
      case 'basic':
        return {
          type: 'basic',
          config: { username: '{{username}}', password: '{{password}}' },
        };
      case 'oauth2':
        return {
          type: 'oauth2',
          config: {
            grantType: 'client_credentials',
            accessTokenUrl: '{{accessTokenUrl}}',
            clientId: '{{clientId}}',
            clientSecret: '{{clientSecret}}',
          },
        };
      case 'api-key':
        return {
          type: 'api-key',
          config: { key: 'X-API-Key', value: '{{apiKey}}', in: 'header' },
        };
      case 'digest':
        return {
          type: 'digest',
          config: { username: '{{username}}', password: '{{password}}' },
        };
    }
  }

  /**
   * Normalize OAuth grant types.
   */
  private toGrantType(value?: string): 'authorization_code' | 'client_credentials' | 'password' {
    switch (value) {
      case 'client_credentials':
      case 'password':
        return value;
      default:
        return 'authorization_code';
    }
  }

  /**
   * Ensure directory exists
   */
  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }
}

/**
 * Create a new request builder instance
 */
export function createRequestBuilder(): RequestBuilder {
  return new RequestBuilder();
}
