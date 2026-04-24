import { promises as fs } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';

import { BodyType, BrunoError, FileOperationResult, HttpMethod, RequestAuthMode } from './types.js';
import {
  DetectedCollectionFormat,
  createEmptyRequestRoot,
  detectCollectionFormat,
  environmentVariablesToObject,
  findContainingCollectionPath,
  listCollectionRequestPaths,
  loadCollectionDocument,
  loadEnvironmentDocument,
  loadFolderDocument,
  loadRequestDocument,
  resolveWithinCollection,
  saveCollectionDocument,
  saveEnvironmentDocument,
  saveFolderDocument,
  saveRequestDocument,
  toRelativeCollectionPath,
} from './store.js';

type VariablePatchValue = string | number | boolean;

export interface RequestDefaultsPatch {
  auth?: { config?: Record<string, string>; type: RequestAuthMode };
  docs?: string;
  headers?: Record<string, string>;
  postResponseScript?: string;
  postResponseVars?: Record<string, VariablePatchValue>;
  preRequestScript?: string;
  preRequestVars?: Record<string, VariablePatchValue>;
  tests?: string;
  unsetHeaders?: string[];
  unsetPostResponseVars?: string[];
  unsetPreRequestVars?: string[];
}

export interface RequestUpdatePatch extends RequestDefaultsPatch {
  assertions?: Array<{ enabled?: boolean; name: string; value: string }>;
  body?: {
    content?: string;
    contentType?: string;
    filePath?: string;
    formData?: Array<{ name: string; type?: 'text' | 'file'; value: string }>;
    formUrlEncoded?: Array<{ name: string; value: string }>;
    type: BodyType;
    variables?: string;
  };
  method?: HttpMethod;
  name?: string;
  query?: Record<string, string | number | boolean>;
  sequence?: number;
  settings?: Record<string, boolean | number | string | null>;
  tags?: string[];
  unsetQuery?: string[];
  url?: string;
}

export class BrunoNativeManager {
  async getCollectionDefaults(collectionPath: string): Promise<Record<string, unknown>> {
    const format = await detectCollectionFormat(collectionPath);
    const document = await loadCollectionDocument(format);
    return this.toDefaultsSummary(document.collectionRoot, format.defaultsPath);
  }

  async updateCollectionDefaults(
    collectionPath: string,
    patch: RequestDefaultsPatch,
  ): Promise<FileOperationResult> {
    try {
      const format = await detectCollectionFormat(collectionPath);
      const document = await loadCollectionDocument(format);
      document.collectionRoot = this.applyDefaultsPatch(document.collectionRoot, patch);
      await saveCollectionDocument(format, document);

      return {
        path: format.defaultsPath,
        success: true,
      };
    } catch (error) {
      return this.toFailure(error);
    }
  }

  async listFolders(collectionPath: string): Promise<string[]> {
    const format = await detectCollectionFormat(collectionPath);
    const folders: string[] = [];
    await this.walkFolders(format.collectionPath, format, folders);
    return folders.toSorted();
  }

  async getFolderDefaults(
    collectionPath: string,
    folderPath: string,
  ): Promise<Record<string, unknown>> {
    const format = await detectCollectionFormat(collectionPath);
    const resolvedFolderPath = resolveWithinCollection(collectionPath, folderPath);
    const document = await loadFolderDocument(format, resolvedFolderPath);
    return this.toDefaultsSummary(
      document,
      join(resolvedFolderPath, format.folderFileName),
      toRelativeCollectionPath(collectionPath, resolvedFolderPath),
    );
  }

  async createFolder(
    collectionPath: string,
    folderPath: string,
    defaults?: RequestDefaultsPatch,
  ): Promise<FileOperationResult> {
    try {
      const format = await detectCollectionFormat(collectionPath);
      const resolvedFolderPath = resolveWithinCollection(collectionPath, folderPath);
      await fs.mkdir(resolvedFolderPath, { recursive: true });

      if (defaults) {
        const document = await loadFolderDocument(format, resolvedFolderPath);
        const updatedDocument = this.applyDefaultsPatch(document, defaults);
        await saveFolderDocument(format, resolvedFolderPath, updatedDocument);
      }

      return {
        path: resolvedFolderPath,
        success: true,
      };
    } catch (error) {
      return this.toFailure(error);
    }
  }

  async updateFolderDefaults(
    collectionPath: string,
    folderPath: string,
    patch: RequestDefaultsPatch,
  ): Promise<FileOperationResult> {
    try {
      const format = await detectCollectionFormat(collectionPath);
      const resolvedFolderPath = resolveWithinCollection(collectionPath, folderPath);
      const document = await loadFolderDocument(format, resolvedFolderPath);
      const updatedDocument = this.applyDefaultsPatch(document, patch);
      await saveFolderDocument(format, resolvedFolderPath, updatedDocument);

      return {
        path: join(resolvedFolderPath, format.folderFileName),
        success: true,
      };
    } catch (error) {
      return this.toFailure(error);
    }
  }

  async deleteFolder(
    collectionPath: string,
    folderPath: string,
    deleteContents: boolean,
  ): Promise<FileOperationResult> {
    try {
      const resolvedFolderPath = resolveWithinCollection(collectionPath, folderPath);

      if (!deleteContents) {
        const entries = await fs.readdir(resolvedFolderPath);
        if (entries.length > 0) {
          throw new BrunoError(
            `Folder ${folderPath} is not empty. Set deleteContents=true to remove it recursively.`,
            'VALIDATION_ERROR',
          );
        }
      }

      await fs.rm(resolvedFolderPath, { force: true, recursive: deleteContents });

      return {
        path: resolvedFolderPath,
        success: true,
      };
    } catch (error) {
      return this.toFailure(error);
    }
  }

  async listRequests(collectionPath: string): Promise<Array<Record<string, unknown>>> {
    const requestPaths = await listCollectionRequestPaths(collectionPath);
    return Promise.all(requestPaths.map((requestPath) => this.getRequest(requestPath)));
  }

  async getRequest(requestPath: string): Promise<Record<string, unknown>> {
    const collectionPath = await findContainingCollectionPath(requestPath);
    const document = await loadRequestDocument(requestPath);
    return this.toRequestSummary(document, requestPath, collectionPath);
  }

  async updateRequest(
    requestPath: string,
    patch: RequestUpdatePatch,
  ): Promise<FileOperationResult> {
    try {
      const document = await loadRequestDocument(requestPath);
      const updatedDocument = this.applyRequestPatch(document, patch);
      const nextPath = this.getUpdatedRequestPath(requestPath, patch.name);

      if (nextPath !== resolve(requestPath)) {
        await fs.mkdir(dirname(nextPath), { recursive: true });
      }

      await saveRequestDocument(nextPath, updatedDocument);
      if (nextPath !== resolve(requestPath)) {
        await fs.unlink(resolve(requestPath));
      }

      return {
        path: nextPath,
        success: true,
      };
    } catch (error) {
      return this.toFailure(error);
    }
  }

  async deleteRequest(requestPath: string): Promise<FileOperationResult> {
    try {
      const resolvedRequestPath = resolve(requestPath);
      await fs.unlink(resolvedRequestPath);
      return {
        path: resolvedRequestPath,
        success: true,
      };
    } catch (error) {
      return this.toFailure(error);
    }
  }

  async moveRequest(
    requestPath: string,
    targetFolderPath: string,
    newName?: string,
    sequence?: number,
  ): Promise<FileOperationResult> {
    try {
      const collectionPath = await findContainingCollectionPath(requestPath);
      const document = await loadRequestDocument(requestPath);
      if (newName) {
        document.name = newName;
      }
      if (sequence !== undefined) {
        document.seq = sequence;
      }

      const targetCollectionFormat = await detectCollectionFormat(collectionPath);
      const resolvedTargetFolderPath = resolveWithinCollection(collectionPath, targetFolderPath);
      const targetFilePath = join(
        resolvedTargetFolderPath,
        `${this.sanitizeRequestFileName(newName || String(document.name || basename(requestPath, extname(requestPath))))}${targetCollectionFormat.requestExtension}`,
      );

      await saveRequestDocument(targetFilePath, document);
      await fs.unlink(resolve(requestPath));

      return {
        path: targetFilePath,
        success: true,
      };
    } catch (error) {
      return this.toFailure(error);
    }
  }

  async createEnvironment(
    collectionPath: string,
    environmentName: string,
    variables: Record<string, VariablePatchValue>,
  ): Promise<FileOperationResult> {
    try {
      const format = await detectCollectionFormat(collectionPath);
      await fs.mkdir(format.environmentDirectoryPath, { recursive: true });
      const environmentPath = join(
        format.environmentDirectoryPath,
        `${environmentName}${format.environmentExtension}`,
      );
      await saveEnvironmentDocument(environmentPath, {
        name: environmentName,
        variables: this.toVariableArray(variables),
      });

      return {
        path: environmentPath,
        success: true,
      };
    } catch (error) {
      return this.toFailure(error);
    }
  }

  async listEnvironments(collectionPath: string): Promise<string[]> {
    const format = await detectCollectionFormat(collectionPath);
    try {
      const entries = await fs.readdir(format.environmentDirectoryPath, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(format.environmentExtension))
        .map((entry) => entry.name.replace(new RegExp(`${format.environmentExtension}$`), ''))
        .toSorted();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }

  async getEnvironment(
    collectionPath: string,
    environmentName: string,
  ): Promise<Record<string, string>> {
    const format = await detectCollectionFormat(collectionPath);
    const environmentPath = join(
      format.environmentDirectoryPath,
      `${environmentName}${format.environmentExtension}`,
    );
    return environmentVariablesToObject(await loadEnvironmentDocument(environmentPath));
  }

  async updateEnvironmentVariables(
    collectionPath: string,
    environmentName: string,
    set: Record<string, VariablePatchValue>,
    unset: string[],
  ): Promise<FileOperationResult> {
    try {
      const format = await detectCollectionFormat(collectionPath);
      const environmentPath = join(
        format.environmentDirectoryPath,
        `${environmentName}${format.environmentExtension}`,
      );
      const variables = environmentVariablesToObject(
        await loadEnvironmentDocument(environmentPath),
      );

      for (const key of unset) {
        delete variables[key];
      }

      Object.assign(
        variables,
        Object.fromEntries(Object.entries(set).map(([key, value]) => [key, String(value)])),
      );

      await saveEnvironmentDocument(environmentPath, {
        name: environmentName,
        variables: this.toVariableArray(variables),
      });

      return {
        path: environmentPath,
        success: true,
      };
    } catch (error) {
      return this.toFailure(error);
    }
  }

  async deleteEnvironment(
    collectionPath: string,
    environmentName: string,
  ): Promise<FileOperationResult> {
    try {
      const format = await detectCollectionFormat(collectionPath);
      const environmentPath = join(
        format.environmentDirectoryPath,
        `${environmentName}${format.environmentExtension}`,
      );
      await fs.unlink(environmentPath);

      return {
        path: environmentPath,
        success: true,
      };
    } catch (error) {
      return this.toFailure(error);
    }
  }

  private applyDefaultsPatch(
    document: Record<string, unknown>,
    patch: RequestDefaultsPatch,
  ): Record<string, unknown> {
    const nextDocument = this.cloneJson(document);
    const request = this.ensureRequestRoot(nextDocument);

    if (patch.headers || patch.unsetHeaders) {
      request.headers = this.mergeNamedValueArray(
        Array.isArray(request.headers) ? request.headers : [],
        patch.headers,
        patch.unsetHeaders,
      );
    }

    if (patch.preRequestVars || patch.unsetPreRequestVars) {
      const vars = this.ensureVarsRoot(request);
      vars.req = this.mergeNamedValueArray(
        Array.isArray(vars.req) ? vars.req : [],
        patch.preRequestVars,
        patch.unsetPreRequestVars,
      );
    }

    if (patch.postResponseVars || patch.unsetPostResponseVars) {
      const vars = this.ensureVarsRoot(request);
      vars.res = this.mergeNamedValueArray(
        Array.isArray(vars.res) ? vars.res : [],
        patch.postResponseVars,
        patch.unsetPostResponseVars,
      );
    }

    if (patch.preRequestScript !== undefined || patch.postResponseScript !== undefined) {
      const script = this.ensureScriptRoot(request);
      if (patch.preRequestScript !== undefined) {
        script.req = patch.preRequestScript || '';
      }
      if (patch.postResponseScript !== undefined) {
        script.res = patch.postResponseScript || '';
      }
    }

    if (patch.tests !== undefined) {
      request.tests = patch.tests || '';
    }

    if (patch.docs !== undefined) {
      nextDocument.docs = patch.docs || '';
    }

    if (patch.auth) {
      request.auth = this.buildNativeAuth(patch.auth.type, patch.auth.config || {});
    }

    return nextDocument;
  }

  private applyRequestPatch(
    document: Record<string, unknown>,
    patch: RequestUpdatePatch,
  ): Record<string, unknown> {
    const nextDocument = this.cloneJson(document);
    const request = this.ensureRequestNode(nextDocument);

    if (patch.name) {
      nextDocument.name = patch.name;
    }

    if (patch.method) {
      request.method = patch.method;
    }

    if (patch.url) {
      request.url = patch.url;
    }

    if (patch.sequence !== undefined) {
      nextDocument.seq = patch.sequence;
    }

    if (patch.headers || patch.unsetHeaders) {
      request.headers = this.mergeNamedValueArray(
        Array.isArray(request.headers) ? request.headers : [],
        patch.headers,
        patch.unsetHeaders,
      );
    }

    if (patch.query || patch.unsetQuery) {
      const params = Array.isArray(request.params) ? request.params : [];
      const nonQueryParams = params.filter(
        (param) =>
          typeof param === 'object' && param && (param as { type?: string }).type !== 'query',
      );
      const queryParams = params.filter(
        (param) =>
          typeof param === 'object' && param && (param as { type?: string }).type === 'query',
      );

      const mergedQueryParams = this.mergeNamedValueArray(
        queryParams,
        patch.query,
        patch.unsetQuery,
      ).map((param) => ({ ...param, type: 'query' }));

      request.params = [...nonQueryParams, ...mergedQueryParams];
    }

    if (patch.body) {
      request.body = this.buildNativeBody(patch.body);
    }

    if (patch.auth) {
      request.auth = this.buildNativeAuth(patch.auth.type, patch.auth.config || {});
    }

    if (
      patch.preRequestVars ||
      patch.unsetPreRequestVars ||
      patch.postResponseVars ||
      patch.unsetPostResponseVars
    ) {
      const vars = this.ensureRequestVars(request);

      if (patch.preRequestVars || patch.unsetPreRequestVars) {
        vars.req = this.mergeNamedValueArray(
          Array.isArray(vars.req) ? vars.req : [],
          patch.preRequestVars,
          patch.unsetPreRequestVars,
        );
      }

      if (patch.postResponseVars || patch.unsetPostResponseVars) {
        vars.res = this.mergeNamedValueArray(
          Array.isArray(vars.res) ? vars.res : [],
          patch.postResponseVars,
          patch.unsetPostResponseVars,
        );
      }
    }

    if (patch.preRequestScript !== undefined || patch.postResponseScript !== undefined) {
      const script = this.ensureRequestScript(request);
      if (patch.preRequestScript !== undefined) {
        script.req = patch.preRequestScript || '';
      }
      if (patch.postResponseScript !== undefined) {
        script.res = patch.postResponseScript || '';
      }
    }

    if (patch.tests !== undefined) {
      request.tests = patch.tests || '';
    }

    if (patch.docs !== undefined) {
      request.docs = patch.docs || '';
    }

    if (patch.tags !== undefined) {
      nextDocument.tags = patch.tags;
    }

    if (patch.settings) {
      nextDocument.settings = {
        ...(nextDocument.settings as Record<string, unknown> | undefined),
        ...patch.settings,
      };
    }

    if (patch.assertions !== undefined) {
      request.assertions = patch.assertions.map((assertion) => ({
        enabled: assertion.enabled !== false,
        name: assertion.name,
        value: assertion.value,
      }));
    }

    return nextDocument;
  }

  private buildNativeAuth(
    type: RequestAuthMode,
    config: Record<string, string>,
  ): Record<string, unknown> {
    switch (type) {
      case 'inherit':
        return { mode: 'inherit' };
      case 'bearer':
        return { bearer: { token: config.token || '' }, mode: 'bearer' };
      case 'basic':
        return {
          basic: { password: config.password || '', username: config.username || '' },
          mode: 'basic',
        };
      case 'digest':
        return {
          digest: { password: config.password || '', username: config.username || '' },
          mode: 'digest',
        };
      case 'api-key':
        return {
          mode: 'apikey',
          apikey: {
            in: config.in || 'header',
            key: config.key || '',
            value: config.value || '',
          },
        };
      case 'oauth2':
        return {
          mode: 'oauth2',
          oauth2: {
            accessTokenUrl: config.accessTokenUrl || config.access_token_url || '',
            authorizationUrl: config.authorizationUrl || config.authorization_url || '',
            clientId: config.clientId || config.client_id || '',
            clientSecret: config.clientSecret || config.client_secret || '',
            grantType: config.grantType || config.grant_type || 'authorization_code',
            password: config.password || '',
            scope: config.scope || '',
            username: config.username || '',
          },
        };
      case 'none':
      default:
        return { mode: 'none' };
    }
  }

  private buildNativeBody(body: NonNullable<RequestUpdatePatch['body']>): Record<string, unknown> {
    switch (body.type) {
      case 'json':
        return { json: body.content || '{}', mode: 'json' };
      case 'text':
        return { mode: 'text', text: body.content || '' };
      case 'xml':
        return { mode: 'xml', xml: body.content || '' };
      case 'form-data':
        return {
          formdata: (body.formData || []).map((field) => ({
            enabled: true,
            name: field.name,
            type: field.type || 'text',
            value: field.value,
          })),
          mode: 'multipartForm',
        };
      case 'form-urlencoded':
        return {
          formUrlEncoded: (body.formUrlEncoded || []).map((field) => ({
            enabled: true,
            name: field.name,
            value: field.value,
          })),
          mode: 'formUrlEncoded',
        };
      case 'binary':
        return {
          file: [
            {
              contentType: body.contentType || '',
              filePath: body.filePath || '',
              selected: true,
            },
          ],
          mode: 'file',
        };
      case 'graphql':
        return {
          graphql: {
            query: body.content || '',
            variables: body.variables || '',
          },
          mode: 'graphql',
        };
      case 'none':
      default:
        return { mode: 'none' };
    }
  }

  private ensureRequestRoot(document: Record<string, unknown>): Record<string, unknown> {
    if (!document.request || typeof document.request !== 'object') {
      document.request = createEmptyRequestRoot();
    }
    return document.request as Record<string, unknown>;
  }

  private ensureRequestNode(document: Record<string, unknown>): Record<string, unknown> {
    if (!document.request || typeof document.request !== 'object') {
      document.request = {
        auth: { mode: 'none' },
        body: { mode: 'none' },
        headers: [],
        params: [],
        script: {},
        vars: {},
      };
    }
    return document.request as Record<string, unknown>;
  }

  private ensureVarsRoot(request: Record<string, unknown>): Record<string, unknown> {
    if (!request.vars || typeof request.vars !== 'object') {
      request.vars = { req: [], res: [] };
    }
    return request.vars as Record<string, unknown>;
  }

  private ensureScriptRoot(request: Record<string, unknown>): Record<string, unknown> {
    if (!request.script || typeof request.script !== 'object') {
      request.script = { req: '', res: '' };
    }
    return request.script as Record<string, unknown>;
  }

  private ensureRequestVars(request: Record<string, unknown>): Record<string, unknown> {
    if (!request.vars || typeof request.vars !== 'object') {
      request.vars = {};
    }
    return request.vars as Record<string, unknown>;
  }

  private ensureRequestScript(request: Record<string, unknown>): Record<string, unknown> {
    if (!request.script || typeof request.script !== 'object') {
      request.script = {};
    }
    return request.script as Record<string, unknown>;
  }

  private mergeNamedValueArray(
    existingEntries: unknown[],
    set?: Record<string, VariablePatchValue>,
    unset?: string[],
  ): Array<Record<string, unknown>> {
    const nextEntries = new Map<string, Record<string, unknown>>();

    for (const entry of existingEntries) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const typedEntry = entry as Record<string, unknown>;
      if (typeof typedEntry.name !== 'string') {
        continue;
      }

      nextEntries.set(typedEntry.name, { ...typedEntry });
    }

    for (const key of unset || []) {
      nextEntries.delete(key);
    }

    for (const [name, value] of Object.entries(set || {})) {
      nextEntries.set(name, {
        enabled: true,
        ...nextEntries.get(name),
        name,
        value: String(value),
      });
    }

    return [...nextEntries.values()].toSorted((left, right) =>
      String(left.name).localeCompare(String(right.name)),
    );
  }

  private toRequestSummary(
    document: Record<string, unknown>,
    requestPath: string,
    collectionPath: string,
  ): Record<string, unknown> {
    const request = (document.request || {}) as Record<string, unknown>;
    const params = Array.isArray(request.params) ? request.params : [];

    return {
      assertions: Array.isArray(request.assertions) ? request.assertions : [],
      auth: request.auth || { mode: 'none' },
      body: request.body || { mode: 'none' },
      docs: request.docs || '',
      headers: request.headers || [],
      method: request.method || '',
      name: document.name || basename(requestPath, extname(requestPath)),
      path: requestPath,
      query: params.filter(
        (param: unknown) =>
          typeof param === 'object' && param && (param as { type?: string }).type === 'query',
      ),
      relativePath: toRelativeCollectionPath(collectionPath, requestPath),
      scripts: request.script || {},
      seq: document.seq || 1,
      settings: (document.settings as Record<string, unknown> | undefined) || {},
      tags: this.normalizeTags(document.tags),
      tests: request.tests || '',
      type: document.type || 'http-request',
      url: request.url || '',
      vars: request.vars || {},
    };
  }

  private toDefaultsSummary(
    document: Record<string, unknown>,
    path: string,
    relativePath?: string,
  ): Record<string, unknown> {
    const request = (document.request || {}) as Record<string, unknown>;
    return {
      auth: request.auth || { mode: 'none' },
      docs: document.docs || '',
      headers: request.headers || [],
      meta: document.meta || null,
      path,
      relativePath,
      scripts: request.script || { req: '', res: '' },
      tests: request.tests || '',
      vars: request.vars || { req: [], res: [] },
    };
  }

  private toVariableArray(
    variables: Record<string, VariablePatchValue>,
  ): Array<Record<string, unknown>> {
    return Object.entries(variables).map(([name, value]) => ({
      enabled: true,
      name,
      value: String(value),
    }));
  }

  private normalizeTags(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map(String);
    }

    if (typeof value !== 'string') {
      return [];
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return [];
    }

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      return trimmed
        .slice(1, -1)
        .split(',')
        .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
        .filter((part) => part.length > 0);
    }

    return trimmed
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }

  private sanitizeRequestFileName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  private getUpdatedRequestPath(currentRequestPath: string, nextName?: string): string {
    if (!nextName) {
      return resolve(currentRequestPath);
    }

    return join(
      dirname(resolve(currentRequestPath)),
      `${this.sanitizeRequestFileName(nextName)}${extname(currentRequestPath) || '.bru'}`,
    );
  }

  private async walkFolders(
    currentPath: string,
    format: DetectedCollectionFormat,
    folders: string[],
  ): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      if (['.git', 'environments', 'node_modules'].includes(entry.name)) {
        continue;
      }

      const fullPath = join(currentPath, entry.name);
      folders.push(toRelativeCollectionPath(format.collectionPath, fullPath));
      await this.walkFolders(fullPath, format, folders);
    }
  }

  private cloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private toFailure(error: unknown): FileOperationResult {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export function createBrunoNativeManager(): BrunoNativeManager {
  return new BrunoNativeManager();
}
