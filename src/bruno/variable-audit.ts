import { promises as fs } from 'node:fs';
import { basename, join } from 'node:path';

import { BrunoNativeManager } from './native.js';
import { listCollectionRequestPaths, toRelativeCollectionPath } from './store.js';

export type VariableSourceType =
  | 'collection'
  | 'environment'
  | 'folder'
  | 'missing'
  | 'oauth2'
  | 'process-env'
  | 'prompt'
  | 'request'
  | 'runtime'
  | 'secret';

export interface VariableReferenceAudit {
  directRequestReady: boolean;
  expression: string;
  filePath: string;
  name: string;
  sourceTypes: VariableSourceType[];
}

export interface VariableSourceAuditReport {
  collectionPath: string;
  generatedAt: string;
  references: VariableReferenceAudit[];
  summary: {
    directRequestReadyReferences: number;
    missingReferences: number;
    runtimeOnlyReferences: number;
    totalReferences: number;
    uniqueMissingVariables: string[];
  };
}

type VariableSourceIndex = {
  collection: Set<string>;
  environment: Set<string>;
  folder: Set<string>;
  request: Set<string>;
  runtime: Set<string>;
};

const TEMPLATE_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;
const RUNTIME_SETTER_PATTERN = /bru\.setVar\(\s*['"`]([^'"`]+)['"`]/g;
const ENV_SETTER_PATTERN = /bru\.setEnvVar\(\s*['"`]([^'"`]+)['"`]/g;

export class VariableAuditManager {
  constructor(private readonly nativeManager: BrunoNativeManager) {}

  async auditCollection(collectionPath: string): Promise<VariableSourceAuditReport> {
    const [sourceIndex, requestFiles] = await Promise.all([
      this.buildSourceIndex(collectionPath),
      listCollectionRequestPaths(collectionPath),
    ]);
    const references: VariableReferenceAudit[] = [];

    for (const filePath of [
      join(collectionPath, 'collection.bru'),
      join(collectionPath, 'opencollection.yml'),
      ...requestFiles,
    ]) {
      const content = await this.readOptionalFile(filePath);
      if (!content) {
        continue;
      }

      for (const expression of this.extractTemplateExpressions(content)) {
        references.push(this.resolveReference(collectionPath, filePath, expression, sourceIndex));
      }
    }

    const uniqueReferences = this.dedupeReferences(references);
    const missingVariables = uniqueReferences
      .filter((reference) => reference.sourceTypes.includes('missing'))
      .map((reference) => reference.name);

    return {
      collectionPath,
      generatedAt: new Date().toISOString(),
      references: uniqueReferences,
      summary: {
        directRequestReadyReferences: uniqueReferences.filter(
          (reference) => reference.directRequestReady,
        ).length,
        missingReferences: uniqueReferences.filter((reference) =>
          reference.sourceTypes.includes('missing'),
        ).length,
        runtimeOnlyReferences: uniqueReferences.filter((reference) => this.isRuntimeOnly(reference))
          .length,
        totalReferences: uniqueReferences.length,
        uniqueMissingVariables: [...new Set(missingVariables)].toSorted(),
      },
    };
  }

  private async buildSourceIndex(collectionPath: string): Promise<VariableSourceIndex> {
    const index: VariableSourceIndex = {
      collection: new Set(),
      environment: new Set(),
      folder: new Set(),
      request: new Set(),
      runtime: new Set(),
    };

    await this.addDefaultsVars(
      index.collection,
      await this.nativeManager.getCollectionDefaults(collectionPath),
    );

    for (const environmentName of await this.nativeManager.listEnvironments(collectionPath)) {
      const variables = await this.nativeManager.getEnvironment(collectionPath, environmentName);
      for (const name of Object.keys(variables)) {
        index.environment.add(name);
      }
    }

    for (const folder of await this.nativeManager.listFolders(collectionPath)) {
      await this.addDefaultsVars(
        index.folder,
        await this.nativeManager.getFolderDefaults(collectionPath, folder),
      );
    }

    for (const requestPath of await listCollectionRequestPaths(collectionPath)) {
      const request = await this.nativeManager.getRequest(requestPath);
      this.addVars(index.request, request.vars);
      const content = await this.readOptionalFile(requestPath);
      this.addRuntimeSetters(index.runtime, content || '');
    }

    return index;
  }

  private async addDefaultsVars(
    target: Set<string>,
    defaults: Record<string, unknown>,
  ): Promise<void> {
    this.addVars(target, defaults.vars);
  }

  private addVars(target: Set<string>, vars: unknown): void {
    if (!vars || typeof vars !== 'object') {
      return;
    }

    const record = vars as { req?: unknown; res?: unknown };
    for (const entries of [record.req, record.res]) {
      if (!Array.isArray(entries)) {
        continue;
      }
      for (const entry of entries) {
        if (
          entry &&
          typeof entry === 'object' &&
          typeof (entry as { name?: unknown }).name === 'string'
        ) {
          target.add(String((entry as { name: string }).name));
        }
      }
    }
  }

  private addRuntimeSetters(target: Set<string>, content: string): void {
    for (const pattern of [RUNTIME_SETTER_PATTERN, ENV_SETTER_PATTERN]) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        target.add(match[1]!);
      }
    }
  }

  private extractTemplateExpressions(content: string): string[] {
    const expressions: string[] = [];
    TEMPLATE_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TEMPLATE_PATTERN.exec(content)) !== null) {
      expressions.push(match[1]!.trim());
    }
    return expressions;
  }

  private resolveReference(
    collectionPath: string,
    filePath: string,
    expression: string,
    sourceIndex: VariableSourceIndex,
  ): VariableReferenceAudit {
    const name = this.normalizeVariableName(expression);
    const sourceTypes = this.resolveSourceTypes(expression, name, sourceIndex);
    return {
      directRequestReady: this.isDirectRequestReady(sourceTypes),
      expression,
      filePath: filePath.startsWith(collectionPath)
        ? toRelativeCollectionPath(collectionPath, filePath)
        : basename(filePath),
      name,
      sourceTypes,
    };
  }

  private resolveSourceTypes(
    expression: string,
    name: string,
    sourceIndex: VariableSourceIndex,
  ): VariableSourceType[] {
    if (expression.startsWith('?')) {
      return ['prompt'];
    }
    if (expression.startsWith('process.env')) {
      return ['process-env'];
    }
    if (expression.startsWith('$oauth2')) {
      return ['oauth2'];
    }
    if (expression.startsWith('$secrets')) {
      return ['secret'];
    }

    const sources: VariableSourceType[] = [];
    for (const sourceType of [
      'environment',
      'collection',
      'folder',
      'request',
      'runtime',
    ] as const) {
      if (sourceIndex[sourceType].has(name)) {
        sources.push(sourceType);
      }
    }

    return sources.length > 0 ? sources : ['missing'];
  }

  private normalizeVariableName(expression: string): string {
    if (expression.startsWith('?')) {
      return expression.slice(1).trim();
    }

    if (expression.startsWith("process.env['") || expression.startsWith('process.env["')) {
      return expression.replace(/^process\.env\[['"]/, '').replace(/['"]\]$/, '');
    }

    return expression.split(/[.[\s]/)[0]!.trim();
  }

  private isDirectRequestReady(sourceTypes: VariableSourceType[]): boolean {
    return sourceTypes.some((sourceType) =>
      [
        'collection',
        'environment',
        'folder',
        'oauth2',
        'process-env',
        'prompt',
        'request',
        'secret',
      ].includes(sourceType),
    );
  }

  private isRuntimeOnly(reference: VariableReferenceAudit): boolean {
    return reference.sourceTypes.length === 1 && reference.sourceTypes[0] === 'runtime';
  }

  private dedupeReferences(references: VariableReferenceAudit[]): VariableReferenceAudit[] {
    return [
      ...new Map(
        references.map((reference) => [`${reference.filePath}:${reference.expression}`, reference]),
      ).values(),
    ].toSorted(
      (left, right) =>
        left.filePath.localeCompare(right.filePath) ||
        left.expression.localeCompare(right.expression),
    );
  }

  private async readOptionalFile(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch {
      return null;
    }
  }
}

export function createVariableAuditManager(
  nativeManager: BrunoNativeManager,
): VariableAuditManager {
  return new VariableAuditManager(nativeManager);
}
