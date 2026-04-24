import { promises as fs } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';

import {
  parseCollection,
  parseEnvironment,
  parseFolder,
  parseRequest,
  stringifyCollection,
  stringifyEnvironment,
  stringifyFolder,
  stringifyRequest,
} from '@usebruno/filestore';
import YAML from 'yaml';

import { BrunoError, BruFileError } from './types.js';

export type BrunoFileFormat = 'bru' | 'yml';
export type BrunoCollectionKind = 'classic' | 'opencollection';

export interface DetectedCollectionFormat {
  collectionPath: string;
  configPath: string;
  defaultsPath: string;
  environmentDirectoryPath: string;
  environmentExtension: '.bru' | '.yml';
  folderFileName: 'folder.bru' | 'folder.yml';
  format: BrunoFileFormat;
  kind: BrunoCollectionKind;
  requestExtension: '.bru' | '.yml';
}

export interface WorkspaceCollectionEntry {
  name: string;
  path: string;
}

export interface BrunoWorkspaceFile {
  opencollection: string;
  info: {
    name: string;
    type: 'workspace';
  };
  collections: WorkspaceCollectionEntry[];
  docs?: string;
  specs?: unknown;
}

export async function detectCollectionFormat(
  collectionPath: string,
): Promise<DetectedCollectionFormat> {
  const resolvedCollectionPath = resolve(collectionPath);
  const classicConfigPath = join(resolvedCollectionPath, 'bruno.json');
  const classicDefaultsPath = join(resolvedCollectionPath, 'collection.bru');
  const openCollectionConfigPath = join(resolvedCollectionPath, 'opencollection.yml');

  if ((await exists(classicConfigPath)) || (await exists(classicDefaultsPath))) {
    return {
      collectionPath: resolvedCollectionPath,
      configPath: classicConfigPath,
      defaultsPath: classicDefaultsPath,
      environmentDirectoryPath: join(resolvedCollectionPath, 'environments'),
      environmentExtension: '.bru',
      folderFileName: 'folder.bru',
      format: 'bru',
      kind: 'classic',
      requestExtension: '.bru',
    };
  }

  if (await exists(openCollectionConfigPath)) {
    return {
      collectionPath: resolvedCollectionPath,
      configPath: openCollectionConfigPath,
      defaultsPath: openCollectionConfigPath,
      environmentDirectoryPath: join(resolvedCollectionPath, 'environments'),
      environmentExtension: '.yml',
      folderFileName: 'folder.yml',
      format: 'yml',
      kind: 'opencollection',
      requestExtension: '.yml',
    };
  }

  throw new BrunoError(
    `Unable to detect Bruno collection format in ${resolvedCollectionPath}`,
    'NOT_FOUND',
  );
}

export async function findContainingCollectionPath(startPath: string): Promise<string> {
  let currentPath = resolve(startPath);

  try {
    const stats = await fs.stat(currentPath);
    if (stats.isFile()) {
      currentPath = dirname(currentPath);
    }
  } catch {
    currentPath = dirname(currentPath);
  }

  while (true) {
    const hasClassic = await exists(join(currentPath, 'bruno.json'));
    const hasClassicDefaults = await exists(join(currentPath, 'collection.bru'));
    const hasYaml = await exists(join(currentPath, 'opencollection.yml'));
    if (hasClassic || hasClassicDefaults || hasYaml) {
      return currentPath;
    }

    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) {
      throw new BrunoError(`Unable to locate containing collection for ${startPath}`, 'NOT_FOUND');
    }

    currentPath = parentPath;
  }
}

export async function loadCollectionDocument(format: DetectedCollectionFormat): Promise<{
  brunoConfig: Record<string, unknown>;
  collectionRoot: Record<string, unknown>;
}> {
  if (format.kind === 'classic') {
    const brunoConfig = (await exists(format.configPath))
      ? JSON.parse(await fs.readFile(format.configPath, 'utf8'))
      : { ignore: [], name: basename(format.collectionPath), type: 'collection', version: '1' };

    const collectionRoot = (await exists(format.defaultsPath))
      ? parseCollection(await fs.readFile(format.defaultsPath, 'utf8'), { format: 'bru' })
      : createEmptyCollectionRoot();

    return {
      brunoConfig,
      collectionRoot,
    };
  }

  const parsed = parseCollection(await fs.readFile(format.configPath, 'utf8'), {
    format: 'yml',
  }) as {
    brunoConfig?: Record<string, unknown>;
    collectionRoot?: Record<string, unknown>;
  };

  return {
    brunoConfig: parsed.brunoConfig || { ignore: [], name: basename(format.collectionPath) },
    collectionRoot: parsed.collectionRoot || createEmptyCollectionRoot(),
  };
}

export async function saveCollectionDocument(
  format: DetectedCollectionFormat,
  document: {
    brunoConfig: Record<string, unknown>;
    collectionRoot: Record<string, unknown>;
  },
): Promise<void> {
  if (format.kind === 'classic') {
    await fs.writeFile(format.configPath, JSON.stringify(document.brunoConfig, null, 2));

    if (hasCollectionRootContent(document.collectionRoot)) {
      const content = normalizeBruTemplateScalars(
        stringifyCollection(document.collectionRoot as never, {}, { format: 'bru' }),
        'bru',
      );
      await fs.writeFile(format.defaultsPath, content);
    } else if (await exists(format.defaultsPath)) {
      await fs.unlink(format.defaultsPath);
    }

    return;
  }

  const content = stringifyCollection(document.collectionRoot as never, document.brunoConfig, {
    format: 'yml',
  });
  await fs.writeFile(format.configPath, content);
}

export async function loadFolderDocument(
  format: DetectedCollectionFormat,
  folderPath: string,
): Promise<Record<string, unknown>> {
  const resolvedFolderPath = resolve(folderPath);
  const folderFilePath = join(resolvedFolderPath, format.folderFileName);

  if (!(await exists(folderFilePath))) {
    return {
      docs: '',
      meta: {
        name: basename(resolvedFolderPath),
      },
      request: createEmptyRequestRoot(),
    };
  }

  return parseFolder(await fs.readFile(folderFilePath, 'utf8'), {
    format: format.format,
  }) as Record<string, unknown>;
}

export async function saveFolderDocument(
  format: DetectedCollectionFormat,
  folderPath: string,
  folderDocument: Record<string, unknown>,
): Promise<void> {
  const resolvedFolderPath = resolve(folderPath);
  await fs.mkdir(resolvedFolderPath, { recursive: true });

  const folderFilePath = join(resolvedFolderPath, format.folderFileName);
  if (hasFolderDocumentContent(folderDocument)) {
    const content = normalizeBruTemplateScalars(
      stringifyFolder(folderDocument as never, { format: format.format }),
      format.format,
    );
    await fs.writeFile(folderFilePath, content);
  } else if (await exists(folderFilePath)) {
    await fs.unlink(folderFilePath);
  }
}

export async function loadRequestDocument(requestPath: string): Promise<Record<string, unknown>> {
  const resolvedRequestPath = resolve(requestPath);
  const format = detectFileFormat(resolvedRequestPath);
  const content = await fs.readFile(resolvedRequestPath, 'utf8');
  return parseRequest(content, { format }) as Record<string, unknown>;
}

export async function saveRequestDocument(
  requestPath: string,
  requestDocument: Record<string, unknown>,
): Promise<void> {
  const resolvedRequestPath = resolve(requestPath);
  const format = detectFileFormat(resolvedRequestPath);
  const content = normalizeBruTemplateScalars(
    stringifyRequest(requestDocument as never, { format }),
    format,
  );
  await fs.mkdir(dirname(resolvedRequestPath), { recursive: true });
  await fs.writeFile(resolvedRequestPath, content);
}

export async function loadEnvironmentDocument(
  environmentPath: string,
): Promise<Record<string, unknown>> {
  const resolvedEnvironmentPath = resolve(environmentPath);
  const format = detectFileFormat(resolvedEnvironmentPath);
  const content = await fs.readFile(resolvedEnvironmentPath, 'utf8');
  return parseEnvironment(content, { format }) as Record<string, unknown>;
}

export async function saveEnvironmentDocument(
  environmentPath: string,
  environmentDocument: Record<string, unknown>,
): Promise<void> {
  const resolvedEnvironmentPath = resolve(environmentPath);
  const format = detectFileFormat(resolvedEnvironmentPath);
  const content = normalizeBruTemplateScalars(
    stringifyEnvironment(environmentDocument as never, { format }),
    format,
  );
  await fs.mkdir(dirname(resolvedEnvironmentPath), { recursive: true });
  await fs.writeFile(resolvedEnvironmentPath, content);
}

export async function listCollectionRequestPaths(collectionPath: string): Promise<string[]> {
  const format = await detectCollectionFormat(collectionPath);
  const requestPaths: string[] = [];
  await walkCollection(collectionPath, format, requestPaths);
  return requestPaths.toSorted();
}

export function toRelativeCollectionPath(collectionPath: string, targetPath: string): string {
  return relative(resolve(collectionPath), resolve(targetPath)).replace(/\\/g, '/');
}

export function resolveWithinCollection(collectionPath: string, value: string): string {
  const resolvedCollectionPath = resolve(collectionPath);
  const resolvedValue = value.startsWith('/')
    ? resolve(value)
    : resolve(join(collectionPath, value));
  const relativePath = relative(resolvedCollectionPath, resolvedValue);

  if (relativePath.startsWith('..')) {
    throw new BrunoError(
      `Resolved path ${resolvedValue} escapes collection root ${resolvedCollectionPath}`,
      'VALIDATION_ERROR',
    );
  }

  return resolvedValue;
}

export async function loadWorkspace(workspacePath: string): Promise<BrunoWorkspaceFile> {
  const resolvedWorkspacePath = resolve(workspacePath);
  const workspaceFilePath = join(resolvedWorkspacePath, 'workspace.yml');
  if (!(await exists(workspaceFilePath))) {
    throw new BrunoError(`workspace.yml not found in ${resolvedWorkspacePath}`, 'NOT_FOUND');
  }

  const workspaceDocument = YAML.parse(
    await fs.readFile(workspaceFilePath, 'utf8'),
  ) as BrunoWorkspaceFile;
  if (!workspaceDocument?.info?.name || workspaceDocument?.info?.type !== 'workspace') {
    throw new BruFileError(`Invalid workspace.yml in ${resolvedWorkspacePath}`);
  }

  workspaceDocument.collections = workspaceDocument.collections || [];
  return workspaceDocument;
}

export async function saveWorkspace(
  workspacePath: string,
  workspaceDocument: BrunoWorkspaceFile,
): Promise<void> {
  const resolvedWorkspacePath = resolve(workspacePath);
  const workspaceFilePath = join(resolvedWorkspacePath, 'workspace.yml');
  const content = YAML.stringify(workspaceDocument, {
    defaultStringType: 'QUOTE_DOUBLE',
  });
  await fs.writeFile(workspaceFilePath, content);
}

export function createEmptyCollectionRoot(): Record<string, unknown> {
  return {
    docs: '',
    request: createEmptyRequestRoot(),
  };
}

export function createEmptyRequestRoot(): Record<string, unknown> {
  return {
    auth: {
      mode: 'none',
    },
    headers: [],
    script: {
      req: '',
      res: '',
    },
    tests: '',
    vars: {
      req: [],
      res: [],
    },
  };
}

export function hasCollectionRootContent(collectionRoot: Record<string, unknown>): boolean {
  return hasFolderDocumentContent(collectionRoot);
}

export function hasFolderDocumentContent(folderDocument: Record<string, unknown>): boolean {
  const request = (folderDocument.request || {}) as Record<string, unknown>;
  const vars = (request.vars || {}) as Record<string, unknown>;
  const script = (request.script || {}) as Record<string, unknown>;

  return Boolean(
    (folderDocument.docs && String(folderDocument.docs).trim().length > 0) ||
    (Array.isArray(request.headers) && request.headers.length > 0) ||
    (request.auth && (request.auth as Record<string, unknown>).mode !== 'none') ||
    (Array.isArray(vars.req) && vars.req.length > 0) ||
    (Array.isArray(vars.res) && vars.res.length > 0) ||
    (script.req && String(script.req).trim().length > 0) ||
    (script.res && String(script.res).trim().length > 0) ||
    (request.tests && String(request.tests).trim().length > 0),
  );
}

export function normalizeVariableEntries(
  value: Record<string, unknown>,
): Array<Record<string, unknown>> {
  return Object.entries(value).map(([name, entryValue]) => ({
    enabled: true,
    name,
    value: entryValue === null || entryValue === undefined ? '' : String(entryValue),
  }));
}

export function environmentVariablesToObject(
  environmentDocument: Record<string, unknown>,
): Record<string, string> {
  const variables = Array.isArray(environmentDocument.variables)
    ? environmentDocument.variables
    : [];
  return Object.fromEntries(
    variables
      .filter((variable): variable is { enabled?: boolean; name: string; value?: unknown } =>
        Boolean(variable && typeof variable === 'object' && 'name' in variable),
      )
      .filter((variable) => variable.enabled !== false)
      .map((variable) => [
        variable.name,
        variable.value === undefined ? '' : String(variable.value),
      ]),
  );
}

async function walkCollection(
  currentPath: string,
  format: DetectedCollectionFormat,
  requestPaths: string[],
): Promise<void> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(currentPath, entry.name);
    if (entry.isDirectory()) {
      if (['.git', 'environments', 'node_modules'].includes(entry.name)) {
        continue;
      }
      await walkCollection(fullPath, format, requestPaths);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (
      entry.name === basename(format.configPath) ||
      entry.name === basename(format.defaultsPath)
    ) {
      continue;
    }

    if (entry.name === format.folderFileName) {
      continue;
    }

    if (extname(entry.name) === format.requestExtension) {
      requestPaths.push(fullPath);
    }
  }
}

function normalizeBruTemplateScalars(content: string, format: BrunoFileFormat): string {
  if (format !== 'bru') {
    return content;
  }

  return content.replace(/(:\s*)'((?:\{\{[^'\n]+\}\})+)'/g, '$1$2');
}

function detectFileFormat(filePath: string): BrunoFileFormat {
  return extname(filePath).toLowerCase() === '.yml' ? 'yml' : 'bru';
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
