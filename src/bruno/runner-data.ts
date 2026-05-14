import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { BrunoError, FileOperationResult } from './types.js';
import { resolveWithinCollection, toRelativeCollectionPath } from './store.js';

export type RunnerDataFormat = 'csv' | 'json';
export type RunnerDataValue = string | number | boolean | null;

export interface CreateRunnerDataFileInput {
  collectionPath: string;
  filePath: string;
  format: RunnerDataFormat;
  manifestPath?: string;
  requestPaths?: string[];
  requiredFields?: string[];
  rows: Array<Record<string, RunnerDataValue>>;
}

export interface RunnerDataFileResult extends FileOperationResult {
  fields: string[];
  format: RunnerDataFormat;
  manifestPath?: string;
  rowCount: number;
  runCommand: string;
}

export interface RunnerDataManifest {
  collectionPath: string;
  dataFiles: Array<{
    commandOption: '--csv-file-path' | '--json-file-path';
    fields: string[];
    format: RunnerDataFormat;
    path: string;
    requestPaths: string[];
    requiredFields: string[];
    rowCount: number;
  }>;
  version: 1;
}

export interface RunnerDataManifestValidation {
  errors: string[];
  manifest?: RunnerDataManifest;
  valid: boolean;
}

export class RunnerDataManager {
  async createDataFile(input: CreateRunnerDataFileInput): Promise<RunnerDataFileResult> {
    this.validateRows(input.rows, input.requiredFields || []);

    const dataFilePath = resolveWithinCollection(input.collectionPath, input.filePath);
    await fs.mkdir(dirname(dataFilePath), { recursive: true });
    await fs.writeFile(
      dataFilePath,
      input.format === 'json'
        ? this.stringifyJsonRows(input.rows)
        : this.stringifyCsvRows(input.rows),
    );

    const relativeDataFilePath = toRelativeCollectionPath(input.collectionPath, dataFilePath);
    const fields = this.collectFields(input.rows);
    const commandOption = input.format === 'json' ? '--json-file-path' : '--csv-file-path';
    const result: RunnerDataFileResult = {
      fields,
      format: input.format,
      path: dataFilePath,
      rowCount: input.rows.length,
      runCommand: `bru run . ${commandOption} ${relativeDataFilePath}`,
      success: true,
    };

    if (input.manifestPath) {
      const manifestPath = resolveWithinCollection(input.collectionPath, input.manifestPath);
      await fs.mkdir(dirname(manifestPath), { recursive: true });
      const manifest: RunnerDataManifest = {
        collectionPath: resolve(input.collectionPath),
        dataFiles: [
          {
            commandOption,
            fields,
            format: input.format,
            path: relativeDataFilePath,
            requestPaths: input.requestPaths || [],
            requiredFields: input.requiredFields || [],
            rowCount: input.rows.length,
          },
        ],
        version: 1,
      };
      await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      result.manifestPath = manifestPath;
    }

    return result;
  }

  async validateManifest(manifestPath: string): Promise<RunnerDataManifestValidation> {
    const errors: string[] = [];
    let manifest: RunnerDataManifest;
    try {
      manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as RunnerDataManifest;
    } catch (error) {
      return {
        errors: [error instanceof Error ? error.message : 'Failed to read manifest'],
        valid: false,
      };
    }

    if (manifest.version !== 1) {
      errors.push('Manifest version must be 1.');
    }

    if (!manifest.collectionPath) {
      errors.push('Manifest collectionPath is required.');
    }

    for (const [index, dataFile] of (manifest.dataFiles || []).entries()) {
      if (!['csv', 'json'].includes(dataFile.format)) {
        errors.push(`dataFiles[${index}].format must be csv or json.`);
      }
      if (!dataFile.path) {
        errors.push(`dataFiles[${index}].path is required.`);
      }
      if (
        dataFile.commandOption !== '--csv-file-path' &&
        dataFile.commandOption !== '--json-file-path'
      ) {
        errors.push(`dataFiles[${index}].commandOption is invalid.`);
      }
      if (!Array.isArray(dataFile.fields) || dataFile.fields.length === 0) {
        errors.push(`dataFiles[${index}].fields must not be empty.`);
      }
      if (!Number.isInteger(dataFile.rowCount) || dataFile.rowCount < 1) {
        errors.push(`dataFiles[${index}].rowCount must be a positive integer.`);
      }
    }

    return {
      errors,
      manifest,
      valid: errors.length === 0,
    };
  }

  private validateRows(
    rows: Array<Record<string, RunnerDataValue>>,
    requiredFields: string[],
  ): void {
    if (rows.length === 0) {
      throw new BrunoError('Runner data file requires at least one row.', 'VALIDATION_ERROR');
    }

    rows.forEach((row, index) => {
      for (const field of requiredFields) {
        if (!(field in row)) {
          throw new BrunoError(
            `Row ${index + 1} is missing required data-file field "${field}".`,
            'VALIDATION_ERROR',
          );
        }
      }
    });
  }

  private collectFields(rows: Array<Record<string, RunnerDataValue>>): string[] {
    return [...new Set(rows.flatMap((row) => Object.keys(row)))].toSorted();
  }

  private stringifyJsonRows(rows: Array<Record<string, RunnerDataValue>>): string {
    return `${JSON.stringify(rows, null, 2)}\n`;
  }

  private stringifyCsvRows(rows: Array<Record<string, RunnerDataValue>>): string {
    const fields = this.collectFields(rows);
    const lines = [fields.join(',')];
    for (const row of rows) {
      lines.push(fields.map((field) => this.escapeCsvCell(row[field])).join(','));
    }
    return `${lines.join('\n')}\n`;
  }

  private escapeCsvCell(value: RunnerDataValue | undefined): string {
    const text = value === undefined || value === null ? '' : String(value);
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }
}

export function createRunnerDataManager(): RunnerDataManager {
  return new RunnerDataManager();
}
