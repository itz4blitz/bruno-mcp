import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface BrunoRunInput {
  bail?: boolean;
  cacert?: string;
  clientCertConfig?: string;
  collectionPath: string;
  csvFilePath?: string;
  delay?: number;
  disableCookies?: boolean;
  dryRun?: boolean;
  env?: string;
  envFile?: string;
  envVars?: Record<string, string | number | boolean>;
  excludeTags?: string[];
  globalEnv?: string;
  insecure?: boolean;
  iterationCount?: number;
  jsonFilePath?: string;
  noProxy?: boolean;
  parallel?: boolean;
  recursive?: boolean;
  reporterHtml?: string;
  reporterJson?: string;
  reporterJunit?: string;
  sandbox?: 'developer' | 'safe';
  tags?: string[];
  targets?: string[];
  testsOnly?: boolean;
  workspacePath?: string;
}

export interface BrunoRunResult {
  args: string[];
  command: string;
  cwd: string;
  dryRun: boolean;
  durationMs?: number;
  exitCode?: number;
  stderr?: string;
  stdout?: string;
}

export class BrunoRunner {
  buildRunCommand(input: BrunoRunInput): BrunoRunResult {
    const cwd = resolve(input.collectionPath);
    const args = ['run', ...(input.targets || [])];

    this.pushStringOption(args, '--env', input.env);
    this.pushStringOption(args, '--env-file', input.envFile);
    this.pushStringOption(args, '--global-env', input.globalEnv);
    this.pushStringOption(args, '--workspace-path', input.workspacePath);
    this.pushStringOption(args, '--sandbox', input.sandbox);
    this.pushStringOption(args, '--csv-file-path', input.csvFilePath);
    this.pushStringOption(args, '--json-file-path', input.jsonFilePath);
    this.pushStringOption(args, '--reporter-json', input.reporterJson);
    this.pushStringOption(args, '--reporter-junit', input.reporterJunit);
    this.pushStringOption(args, '--reporter-html', input.reporterHtml);
    this.pushStringOption(args, '--cacert', input.cacert);
    this.pushStringOption(args, '--client-cert-config', input.clientCertConfig);
    this.pushNumberOption(args, '--iteration-count', input.iterationCount);
    this.pushNumberOption(args, '--delay', input.delay);
    this.pushCsvOption(args, '--tags', input.tags);
    this.pushCsvOption(args, '--exclude-tags', input.excludeTags);

    for (const [name, value] of Object.entries(input.envVars || {})) {
      args.push('--env-var', `${name}=${String(value)}`);
    }

    this.pushFlag(args, '--tests-only', input.testsOnly);
    this.pushFlag(args, '--bail', input.bail);
    this.pushFlag(args, '--parallel', input.parallel);
    this.pushFlag(args, '-r', input.recursive);
    this.pushFlag(args, '--insecure', input.insecure);
    this.pushFlag(args, '--disable-cookies', input.disableCookies);
    this.pushFlag(args, '--noproxy', input.noProxy);

    return {
      args,
      command: this.resolveBruCommand(),
      cwd,
      dryRun: input.dryRun === true,
    };
  }

  async runCollection(input: BrunoRunInput): Promise<BrunoRunResult> {
    const command = this.buildRunCommand(input);
    if (input.dryRun) {
      return command;
    }

    const startedAt = Date.now();
    const spawned = await new Promise<{ exitCode: number; stderr: string; stdout: string }>(
      (resolvePromise, reject) => {
        const child = spawn(command.command, command.args, {
          cwd: command.cwd,
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

  private pushNumberOption(args: string[], name: string, value?: number): void {
    if (value !== undefined) {
      args.push(name, String(value));
    }
  }

  private pushCsvOption(args: string[], name: string, values?: string[]): void {
    if (values && values.length > 0) {
      args.push(name, values.join(','));
    }
  }

  private pushFlag(args: string[], name: string, enabled?: boolean): void {
    if (enabled) {
      args.push(name);
    }
  }
}

export function createBrunoRunner(): BrunoRunner {
  return new BrunoRunner();
}
