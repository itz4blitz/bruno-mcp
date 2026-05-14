import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { BrunoError, FileOperationResult } from './types.js';
import {
  detectCollectionFormat,
  resolveWithinCollection,
  toRelativeCollectionPath,
} from './store.js';

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
    } else {
      try {
        await detectCollectionFormat(manifest.collectionPath);
      } catch (error) {
        errors.push(
          `Manifest collectionPath does not load as a Bruno collection: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    if (!Array.isArray(manifest.dataFiles)) {
      errors.push('Manifest dataFiles must be an array.');
    }

    for (const [index, dataFile] of (Array.isArray(manifest.dataFiles)
      ? manifest.dataFiles
      : []
    ).entries()) {
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
      } else if (dataFile.format === 'csv' && dataFile.commandOption !== '--csv-file-path') {
        errors.push(
          `dataFiles[${index}].commandOption must be --csv-file-path for csv data files.`,
        );
      } else if (dataFile.format === 'json' && dataFile.commandOption !== '--json-file-path') {
        errors.push(
          `dataFiles[${index}].commandOption must be --json-file-path for json data files.`,
        );
      }
      if (!Array.isArray(dataFile.fields) || dataFile.fields.length === 0) {
        errors.push(`dataFiles[${index}].fields must not be empty.`);
      }
      if (!Array.isArray(dataFile.requiredFields)) {
        errors.push(`dataFiles[${index}].requiredFields must be an array.`);
      } else {
        for (const [fieldIndex, field] of dataFile.requiredFields.entries()) {
          if (!Array.isArray(dataFile.fields) || !dataFile.fields.includes(field)) {
            errors.push(
              `dataFiles[${index}].requiredFields[${fieldIndex}] "${field}" is not present in fields.`,
            );
          }
        }
      }
      if (!Number.isInteger(dataFile.rowCount) || dataFile.rowCount < 1) {
        errors.push(`dataFiles[${index}].rowCount must be a positive integer.`);
      }

      const collectionPath =
        typeof manifest.collectionPath === 'string' ? manifest.collectionPath : '';
      const resolvedDataFilePath = collectionPath
        ? this.resolveManifestPath(
            collectionPath,
            dataFile.path,
            `dataFiles[${index}].path`,
            errors,
          )
        : undefined;

      if (Array.isArray(dataFile.requestPaths)) {
        for (const [requestIndex, requestPath] of dataFile.requestPaths.entries()) {
          const resolvedRequestPath = collectionPath
            ? this.resolveManifestPath(
                collectionPath,
                requestPath,
                `dataFiles[${index}].requestPaths[${requestIndex}]`,
                errors,
              )
            : undefined;
          if (resolvedRequestPath && !(await this.isFile(resolvedRequestPath))) {
            errors.push(
              `dataFiles[${index}].requestPaths[${requestIndex}] does not exist: ${requestPath}.`,
            );
          }
        }
      } else {
        errors.push(`dataFiles[${index}].requestPaths must be an array.`);
      }

      if (resolvedDataFilePath) {
        if (!(await this.isFile(resolvedDataFilePath))) {
          errors.push(`dataFiles[${index}].path does not exist: ${dataFile.path}.`);
        } else if (dataFile.format === 'csv' || dataFile.format === 'json') {
          await this.validateManifestDataFile(index, resolvedDataFilePath, dataFile, errors);
        }
      }
    }

    return {
      errors,
      manifest,
      valid: errors.length === 0,
    };
  }

  private async validateManifestDataFile(
    index: number,
    dataFilePath: string,
    dataFile: RunnerDataManifest['dataFiles'][number],
    errors: string[],
  ): Promise<void> {
    const rows = await this.loadRowsForValidation(index, dataFilePath, dataFile.format, errors);
    if (!rows) {
      return;
    }

    if (Number.isInteger(dataFile.rowCount) && dataFile.rowCount !== rows.length) {
      errors.push(`dataFiles[${index}].rowCount must match actual row count ${rows.length}.`);
    }

    const actualFields = this.collectFields(rows);
    if (Array.isArray(dataFile.fields)) {
      const declaredFields = [...dataFile.fields].toSorted();
      if (!this.sameStringSet(declaredFields, actualFields)) {
        errors.push(
          `dataFiles[${index}].fields must match actual fields: ${actualFields.join(', ')}.`,
        );
      }
    }

    if (!Array.isArray(dataFile.requiredFields)) {
      errors.push(`dataFiles[${index}].requiredFields must be an array.`);
      return;
    }

    for (const [fieldIndex, field] of dataFile.requiredFields.entries()) {
      if (!actualFields.includes(field)) {
        errors.push(
          `dataFiles[${index}].requiredFields[${fieldIndex}] "${field}" is not present in data file.`,
        );
        continue;
      }

      rows.forEach((row, rowIndex) => {
        const value = row[field];
        if (value === undefined || value === null || value === '') {
          errors.push(
            `dataFiles[${index}].requiredFields[${fieldIndex}] "${field}" is empty in row ${
              rowIndex + 1
            }.`,
          );
        }
      });
    }
  }

  private async loadRowsForValidation(
    index: number,
    dataFilePath: string,
    format: RunnerDataFormat,
    errors: string[],
  ): Promise<Array<Record<string, RunnerDataValue>> | undefined> {
    try {
      const content = await fs.readFile(dataFilePath, 'utf8');
      if (format === 'json') {
        const parsed = JSON.parse(content) as unknown;
        if (!Array.isArray(parsed) || !parsed.every((row) => this.isObjectRow(row))) {
          errors.push(`dataFiles[${index}].path must contain a JSON array of objects.`);
          return undefined;
        }
        return parsed as Array<Record<string, RunnerDataValue>>;
      }

      return this.parseCsvRows(content);
    } catch (error) {
      errors.push(
        `dataFiles[${index}].path could not be loaded: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return undefined;
    }
  }

  private resolveManifestPath(
    collectionPath: string,
    value: string,
    label: string,
    errors: string[],
  ): string | undefined {
    try {
      return resolveWithinCollection(collectionPath, value);
    } catch {
      errors.push(`${label} escapes collection root: ${value}.`);
      return undefined;
    }
  }

  private async isFile(path: string): Promise<boolean> {
    try {
      return (await fs.stat(path)).isFile();
    } catch {
      return false;
    }
  }

  private isObjectRow(value: unknown): value is Record<string, RunnerDataValue> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private sameStringSet(left: string[], right: string[]): boolean {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => value === right[index]);
  }

  private parseCsvRows(content: string): Array<Record<string, RunnerDataValue>> {
    const records = this.parseCsvRecords(content);
    if (records.length === 0) {
      return [];
    }

    const [headers, ...rows] = records;
    return rows
      .filter((row) => row.some((value) => value !== ''))
      .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
  }

  private parseCsvRecords(content: string): string[][] {
    const records: string[][] = [];
    let field = '';
    let record: string[] = [];
    let inQuotes = false;

    for (let index = 0; index < content.length; index += 1) {
      const char = content[index];
      const nextChar = content[index + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          field += '"';
          index += 1;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        record.push(field);
        field = '';
      } else if (char === '\n') {
        record.push(field);
        records.push(record);
        field = '';
        record = [];
      } else if (char !== '\r') {
        field += char;
      }
    }

    if (field !== '' || record.length > 0) {
      record.push(field);
      records.push(record);
    }

    return records;
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
