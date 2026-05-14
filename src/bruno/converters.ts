import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { FileOperationResult } from './types.js';

export type BrunoImportType = 'openapi' | 'wsdl';
export type BrunoConvertType = 'postman' | 'insomnia' | 'openapi' | 'wsdl';

export interface BrunoImportInput {
  collectionFormat?: 'bru' | 'opencollection';
  collectionName?: string;
  dryRun?: boolean;
  groupBy?: 'tags' | 'path';
  insecure?: boolean;
  output?: string;
  outputFile?: string;
  source: string;
  type: BrunoImportType;
}

export interface BrunoImportCommand {
  args: string[];
  command: string;
  dryRun: boolean;
}

export interface BrunoImportResult extends BrunoImportCommand {
  durationMs?: number;
  exitCode?: number;
  stderr?: string;
  stdout?: string;
}

export interface BrunoConvertInput {
  outputFile: string;
  source: string;
  type: BrunoConvertType;
}

export interface BrunoExportConvertInput {
  outputFile: string;
  source: string;
  target: 'postman' | 'opencollection';
}

export interface BrunoConvertResult extends FileOperationResult {
  outputFile?: string;
  type?: BrunoConvertType | BrunoExportConvertInput['target'];
}

export class ConverterManager {
  buildImportCommand(input: BrunoImportInput): BrunoImportCommand {
    const args = ['import', input.type, '--source', input.source];
    this.pushStringOption(args, '--output', input.output);
    this.pushStringOption(args, '--output-file', input.outputFile);
    this.pushStringOption(args, '--collection-name', input.collectionName);
    this.pushStringOption(args, '--collection-format', input.collectionFormat);
    this.pushStringOption(args, '--group-by', input.groupBy);
    if (input.insecure) {
      args.push('--insecure');
    }

    return {
      args,
      command: this.resolveBruCommand(),
      dryRun: input.dryRun === true,
    };
  }

  async importCollection(input: BrunoImportInput): Promise<BrunoImportResult> {
    const command = this.buildImportCommand(input);
    if (input.dryRun) {
      return command;
    }

    const startedAt = Date.now();
    const spawned = await new Promise<{ exitCode: number; stderr: string; stdout: string }>(
      (resolvePromise, reject) => {
        const child = spawn(command.command, command.args, {
          cwd: process.cwd(),
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
          stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString();
        });
        child.on('error', reject);
        child.on('close', (exitCode) => {
          resolvePromise({ exitCode: exitCode ?? 1, stderr, stdout });
        });
      },
    );

    return {
      ...command,
      durationMs: Date.now() - startedAt,
      exitCode: spawned.exitCode,
      stderr: spawned.stderr,
      stdout: spawned.stdout,
    };
  }

  async convertToBrunoExport(input: BrunoConvertInput): Promise<BrunoConvertResult> {
    try {
      const source = await fs.readFile(input.source, 'utf8');
      const converters = this.loadConverters();
      let converted: unknown;

      switch (input.type) {
        case 'postman':
          converted = await converters.postmanToBruno(JSON.parse(source));
          break;
        case 'insomnia':
          converted = await converters.insomniaToBruno(JSON.parse(source));
          break;
        case 'openapi':
          converted = await converters.openApiToBruno(this.parseJsonOrYaml(source));
          break;
        case 'wsdl':
          converted = await converters.wsdlToBruno(source);
          break;
      }

      await fs.mkdir(dirname(resolve(input.outputFile)), { recursive: true });
      await fs.writeFile(resolve(input.outputFile), `${JSON.stringify(converted, null, 2)}\n`);

      return {
        outputFile: resolve(input.outputFile),
        path: resolve(input.outputFile),
        success: true,
        type: input.type,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
        type: input.type,
      };
    }
  }

  async convertFromBrunoExport(input: BrunoExportConvertInput): Promise<BrunoConvertResult> {
    try {
      const source = JSON.parse(await fs.readFile(input.source, 'utf8'));
      const converters = this.loadConverters();
      const converted =
        input.target === 'postman'
          ? await converters.brunoToPostman(source)
          : await converters.brunoToOpenCollection(source);

      await fs.mkdir(dirname(resolve(input.outputFile)), { recursive: true });
      await fs.writeFile(resolve(input.outputFile), `${JSON.stringify(converted, null, 2)}\n`);

      return {
        outputFile: resolve(input.outputFile),
        path: resolve(input.outputFile),
        success: true,
        type: input.target,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
        type: input.target,
      };
    }
  }

  private loadConverters(): Record<string, (input: unknown) => Promise<unknown> | unknown> {
    const require = createRequire(import.meta.url);
    return require('@usebruno/converters') as Record<
      string,
      (input: unknown) => Promise<unknown> | unknown
    >;
  }

  private parseJsonOrYaml(source: string): unknown {
    try {
      return JSON.parse(source);
    } catch {
      const require = createRequire(import.meta.url);
      const yaml = require('yaml') as { parse: (value: string) => unknown };
      return yaml.parse(source);
    }
  }

  private resolveBruCommand(): string {
    const localCommand = join(
      process.cwd(),
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'bru.cmd' : 'bru',
    );
    return existsSync(localCommand) ? localCommand : 'bru';
  }

  private pushStringOption(args: string[], name: string, value?: string): void {
    if (value) {
      args.push(name, value);
    }
  }
}

export function createConverterManager(): ConverterManager {
  return new ConverterManager();
}
