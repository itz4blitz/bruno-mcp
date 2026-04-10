import { promises as fs } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { BrunoError, BruFileError, FileOperationResult } from './types.js';
import {
  environmentVariablesToObject,
  loadEnvironmentDocument,
  loadWorkspace,
  normalizeVariableEntries,
  saveEnvironmentDocument,
  saveWorkspace,
} from './store.js';

export interface WorkspaceSummary {
  collections: Array<{
    exists: boolean;
    name: string;
    path: string;
  }>;
  docs?: string;
  path: string;
  specs?: unknown;
  workspaceEnvironments: string[];
  workspaceName: string;
}

export class WorkspaceManager {
  async getWorkspaceSummary(workspacePath: string): Promise<WorkspaceSummary> {
    const resolvedWorkspacePath = resolve(workspacePath);
    const workspaceDocument = await loadWorkspace(resolvedWorkspacePath);
    const workspaceEnvironments = await this.listWorkspaceEnvironments(resolvedWorkspacePath);

    return {
      collections: await Promise.all(
        workspaceDocument.collections.map(async (collection) => ({
          exists: await this.exists(join(resolvedWorkspacePath, collection.path)),
          name: collection.name,
          path: collection.path,
        })),
      ),
      docs: workspaceDocument.docs,
      path: resolvedWorkspacePath,
      specs: workspaceDocument.specs,
      workspaceEnvironments,
      workspaceName: workspaceDocument.info.name,
    };
  }

  async addCollection(
    workspacePath: string,
    collectionName: string,
    collectionPath: string,
  ): Promise<FileOperationResult> {
    try {
      const resolvedWorkspacePath = resolve(workspacePath);
      const workspaceDocument = await loadWorkspace(resolvedWorkspacePath);
      const relativeCollectionPath = this.toWorkspaceRelativePath(
        resolvedWorkspacePath,
        collectionPath,
      );

      const duplicate = workspaceDocument.collections.find(
        (collection) =>
          collection.path === relativeCollectionPath || collection.name === collectionName,
      );
      if (duplicate) {
        throw new BrunoError(
          `Collection ${collectionName} (${relativeCollectionPath}) is already registered in the workspace`,
          'VALIDATION_ERROR',
        );
      }

      workspaceDocument.collections.push({
        name: collectionName,
        path: relativeCollectionPath,
      });

      workspaceDocument.collections = workspaceDocument.collections.toSorted((left, right) =>
        left.name.localeCompare(right.name),
      );

      await saveWorkspace(resolvedWorkspacePath, workspaceDocument);

      return {
        path: join(resolvedWorkspacePath, 'workspace.yml'),
        success: true,
      };
    } catch (error) {
      return this.toFailure(error);
    }
  }

  async removeCollection(
    workspacePath: string,
    collectionPath: string,
  ): Promise<FileOperationResult> {
    try {
      const resolvedWorkspacePath = resolve(workspacePath);
      const workspaceDocument = await loadWorkspace(resolvedWorkspacePath);
      const relativeCollectionPath = this.toWorkspaceRelativePath(
        resolvedWorkspacePath,
        collectionPath,
      );

      const beforeCount = workspaceDocument.collections.length;
      workspaceDocument.collections = workspaceDocument.collections.filter(
        (collection) => collection.path !== relativeCollectionPath,
      );

      if (workspaceDocument.collections.length === beforeCount) {
        throw new BrunoError(
          `Collection ${relativeCollectionPath} is not registered in the workspace`,
          'NOT_FOUND',
        );
      }

      await saveWorkspace(resolvedWorkspacePath, workspaceDocument);

      return {
        path: join(resolvedWorkspacePath, 'workspace.yml'),
        success: true,
      };
    } catch (error) {
      return this.toFailure(error);
    }
  }

  async listWorkspaceEnvironments(workspacePath: string): Promise<string[]> {
    try {
      const environmentsDirectoryPath = join(resolve(workspacePath), 'environments');
      const entries = await fs.readdir(environmentsDirectoryPath, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.yml'))
        .map((entry) => entry.name.replace(/\.yml$/, ''))
        .toSorted();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }

      throw new BruFileError(`Failed to list workspace environments in ${workspacePath}`, {
        originalError: error,
      });
    }
  }

  async getWorkspaceEnvironment(
    workspacePath: string,
    environmentName: string,
  ): Promise<Record<string, string>> {
    const environmentPath = this.getWorkspaceEnvironmentPath(workspacePath, environmentName);
    return environmentVariablesToObject(await loadEnvironmentDocument(environmentPath));
  }

  async createWorkspaceEnvironment(
    workspacePath: string,
    environmentName: string,
    variables: Record<string, string | number | boolean>,
  ): Promise<FileOperationResult> {
    try {
      const environmentPath = this.getWorkspaceEnvironmentPath(workspacePath, environmentName);
      await fs.mkdir(join(resolve(workspacePath), 'environments'), { recursive: true });
      await saveEnvironmentDocument(environmentPath, {
        name: environmentName,
        variables: normalizeVariableEntries(variables),
      });

      return {
        path: environmentPath,
        success: true,
      };
    } catch (error) {
      return this.toFailure(error);
    }
  }

  async updateWorkspaceEnvironment(
    workspacePath: string,
    environmentName: string,
    set: Record<string, string | number | boolean>,
    unset: string[],
  ): Promise<FileOperationResult> {
    try {
      const environmentPath = this.getWorkspaceEnvironmentPath(workspacePath, environmentName);
      const existingVariables = environmentVariablesToObject(
        await loadEnvironmentDocument(environmentPath),
      );

      for (const key of unset) {
        delete existingVariables[key];
      }

      Object.assign(
        existingVariables,
        Object.fromEntries(Object.entries(set).map(([key, value]) => [key, String(value)])),
      );

      await saveEnvironmentDocument(environmentPath, {
        name: environmentName,
        variables: normalizeVariableEntries(existingVariables),
      });

      return {
        path: environmentPath,
        success: true,
      };
    } catch (error) {
      return this.toFailure(error);
    }
  }

  async deleteWorkspaceEnvironment(
    workspacePath: string,
    environmentName: string,
  ): Promise<FileOperationResult> {
    try {
      const environmentPath = this.getWorkspaceEnvironmentPath(workspacePath, environmentName);
      await fs.unlink(environmentPath);

      return {
        path: environmentPath,
        success: true,
      };
    } catch (error) {
      return this.toFailure(error);
    }
  }

  async validateWorkspace(workspacePath: string): Promise<{
    collections: Array<{ name: string; path: string }>;
    errors: string[];
  }> {
    const resolvedWorkspacePath = resolve(workspacePath);
    const workspaceDocument = await loadWorkspace(resolvedWorkspacePath);
    const errors: string[] = [];
    const seenNames = new Set<string>();
    const seenPaths = new Set<string>();

    for (const collection of workspaceDocument.collections) {
      if (seenNames.has(collection.name)) {
        errors.push(`Duplicate collection name: ${collection.name}`);
      }
      seenNames.add(collection.name);

      if (seenPaths.has(collection.path)) {
        errors.push(`Duplicate collection path: ${collection.path}`);
      }
      seenPaths.add(collection.path);

      if (!(await this.exists(join(resolvedWorkspacePath, collection.path)))) {
        errors.push(`Missing collection path: ${collection.path}`);
      }
    }

    return {
      collections: workspaceDocument.collections,
      errors,
    };
  }

  private getWorkspaceEnvironmentPath(workspacePath: string, environmentName: string): string {
    return join(resolve(workspacePath), 'environments', `${environmentName}.yml`);
  }

  private toWorkspaceRelativePath(workspacePath: string, collectionPath: string): string {
    const resolvedWorkspacePath = resolve(workspacePath);
    const resolvedCollectionPath = resolve(collectionPath);
    const relativePath = relative(resolvedWorkspacePath, resolvedCollectionPath);
    if (relativePath.startsWith('..')) {
      throw new BrunoError(
        `Collection path ${resolvedCollectionPath} is outside workspace ${resolvedWorkspacePath}`,
        'VALIDATION_ERROR',
      );
    }
    return relativePath.replace(/\\/g, '/');
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private toFailure(error: unknown): FileOperationResult {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export function createWorkspaceManager(): WorkspaceManager {
  return new WorkspaceManager();
}
