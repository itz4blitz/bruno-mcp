import { promises as fs } from 'node:fs';
import { join } from 'node:path';

import { createBrunoNativeManager } from './native.js';
import { detectCollectionFormat } from './store.js';
import { FileOperationResult } from './types.js';

export interface ConfigureCollectionSecretsInput {
  collectionPath: string;
  environmentName?: string;
  processEnvVariables?: string[];
  sampleValues?: Record<string, string>;
  secretVariables?: string[];
  updateGitignore?: boolean;
}

export interface ConfigureCollectionSecretsResult extends FileOperationResult {
  environmentName?: string;
  envSamplePath?: string;
  gitignorePath?: string;
  processEnvVariables: string[];
  secretVariables: string[];
}

export class SecretManager {
  async configureCollectionSecrets(
    input: ConfigureCollectionSecretsInput,
  ): Promise<ConfigureCollectionSecretsResult> {
    try {
      const format = await detectCollectionFormat(input.collectionPath);
      const collectionPath = format.collectionPath;
      const processEnvVariables = this.uniqueSorted(input.processEnvVariables || []);
      const secretVariables = this.uniqueSorted(input.secretVariables || []);
      let envSamplePath: string | undefined;
      let gitignorePath: string | undefined;

      if (processEnvVariables.length > 0) {
        envSamplePath = await this.writeEnvSample(
          collectionPath,
          processEnvVariables,
          input.sampleValues || {},
        );
        if (input.updateGitignore !== false) {
          gitignorePath = await this.ensureGitignore(collectionPath, ['.env']);
        }
      }

      if (input.environmentName) {
        const nativeManager = createBrunoNativeManager();
        const existing = await nativeManager.listEnvironments(collectionPath);
        const variables = Object.fromEntries(
          processEnvVariables.map((name) => [name, this.processEnvReference(name)]),
        );

        if (existing.includes(input.environmentName)) {
          await nativeManager.updateEnvironmentVariables(
            collectionPath,
            input.environmentName,
            variables,
            [],
            {
              secretVariables,
            },
          );
        } else {
          await nativeManager.createEnvironment(collectionPath, input.environmentName, variables, {
            secretVariables,
          });
        }
      }

      return {
        environmentName: input.environmentName,
        envSamplePath,
        gitignorePath,
        processEnvVariables,
        secretVariables,
        success: true,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        processEnvVariables: [],
        secretVariables: [],
        success: false,
      };
    }
  }

  private async writeEnvSample(
    collectionPath: string,
    processEnvVariables: string[],
    sampleValues: Record<string, string>,
  ): Promise<string> {
    const envSamplePath = join(collectionPath, '.env.sample');
    const lines = processEnvVariables.map((name) => `${name}=${sampleValues[name] || ''}`);
    await fs.writeFile(envSamplePath, `${lines.join('\n')}\n`);
    return envSamplePath;
  }

  private async ensureGitignore(collectionPath: string, entries: string[]): Promise<string> {
    const gitignorePath = join(collectionPath, '.gitignore');
    const existing = await fs.readFile(gitignorePath, 'utf8').catch(() => '');
    const existingLines = new Set(existing.split(/\r?\n/).filter((line) => line.length > 0));
    for (const entry of entries) {
      existingLines.add(entry);
    }
    await fs.writeFile(gitignorePath, `${[...existingLines].join('\n')}\n`);
    return gitignorePath;
  }

  private processEnvReference(name: string): string {
    return `{{process.env['${name.replace(/'/g, "\\'")}']}}`;
  }

  private uniqueSorted(values: string[]): string[] {
    return [
      ...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)),
    ].toSorted();
  }
}

export function createSecretManager(): SecretManager {
  return new SecretManager();
}
