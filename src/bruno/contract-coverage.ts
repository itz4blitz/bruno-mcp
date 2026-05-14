import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { ApiContractEndpoint, ApiContractField, ApiContractIr } from './api-contract.js';
import { BrunoError } from './types.js';

export type ContractCoverageCategory =
  | 'endpoint'
  | 'file-route'
  | 'method'
  | 'negative-scenario'
  | 'odata-key'
  | 'odata-metadata'
  | 'odata-query-option'
  | 'payload-field'
  | 'response-field'
  | 'seed-variable';

export interface SeedVariableContract {
  defaultValue?: boolean | number | string;
  name: string;
  required: boolean;
  source?: string;
  value?: boolean | number | string;
}

export interface SeedManifestContract {
  variables?:
    | Array<SeedVariableContract | string>
    | Record<string, Partial<SeedVariableContract> | string>;
}

export interface ContractCoverageItem {
  category: ContractCoverageCategory;
  coveredBy: string[];
  endpointId?: string;
  fieldPath?: string;
  id: string;
  method?: string;
  notes?: string;
  path?: string;
  queryOption?: string;
  required: boolean;
  requirement: string;
  scenario?: string;
  seedVariable?: string;
  status: 'covered' | 'documented-skip' | 'uncovered';
}

export interface ContractCoverageManifest {
  generatedAt: string;
  items: ContractCoverageItem[];
  schemaVersion: 1;
  source: ApiContractIr['source'];
  summary: {
    byCategory: Record<string, number>;
    requiredItems: number;
    totalItems: number;
  };
}

export interface ContractCoverageValidation {
  duplicateIds: string[];
  errors: string[];
  valid: boolean;
  warnings: string[];
}

export class ContractCoverageManager {
  buildManifest(
    contract: ApiContractIr,
    seedManifest?: SeedManifestContract,
  ): ContractCoverageManifest {
    const items: ContractCoverageItem[] = [];

    for (const endpoint of contract.endpoints) {
      items.push(this.endpointItem(endpoint));
      items.push(this.methodItem(endpoint));

      if (this.isFileEndpoint(endpoint)) {
        items.push(this.fileRouteItem(endpoint));
      }

      for (const body of endpoint.requestBodies) {
        for (const field of body.fields) {
          items.push(this.payloadFieldItem(endpoint, field));
          if (field.required) {
            items.push(
              this.negativeScenarioItem(
                endpoint,
                `missing-required:${field.path}`,
                `Reject payload missing required field ${field.path}`,
              ),
            );
          }
          if (this.hasBoundary(field)) {
            items.push(
              this.negativeScenarioItem(
                endpoint,
                `boundary:${field.path}`,
                `Validate documented bounds for payload field ${field.path}`,
              ),
            );
          }
        }

        if (body.fields.length > 0) {
          items.push(
            this.negativeScenarioItem(
              endpoint,
              'malformed-payload',
              'Reject malformed request payload',
            ),
          );
        }
      }

      for (const response of endpoint.responses.filter((entry) =>
        /^2\d\d$/.test(entry.statusCode),
      )) {
        for (const field of response.fields) {
          items.push(this.responseFieldItem(endpoint, response.statusCode, field));
        }
      }

      if (endpoint.parameters.some((parameter) => parameter.in === 'path')) {
        items.push(
          this.negativeScenarioItem(
            endpoint,
            'bad-key',
            'Reject or not-found invalid resource key',
          ),
        );
      }
    }

    items.push(...this.unsupportedMethodItems(contract.endpoints));

    if (contract.odata) {
      if (contract.odata.entitySets.length > 0) {
        items.push({
          category: 'negative-scenario',
          coveredBy: [],
          id: 'negative:odata:bad-entity-set',
          method: 'GET',
          path: '/__bruno_mcp_missing_entity_set__',
          required: true,
          requirement: 'Reject unknown OData entity set',
          scenario: 'bad-entity-set',
          status: 'uncovered',
        });
      }

      for (const path of contract.odata.serviceRootPaths) {
        items.push(
          this.odataMetadataItem(`service-root:${path}`, path, 'Validate OData service root'),
        );
      }
      for (const path of contract.odata.metadataPaths) {
        items.push(
          this.odataMetadataItem(`metadata:${path}`, path, 'Validate OData metadata document'),
        );
      }
      for (const path of contract.odata.documentationPaths) {
        items.push(
          this.odataMetadataItem(`docs:${path}`, path, 'Validate API documentation route'),
        );
      }

      for (const entitySet of contract.odata.entitySets) {
        items.push({
          category: 'odata-key',
          coveredBy: [],
          endpointId: entitySet.keyEndpointId,
          id: `odata-key:${this.slug(entitySet.name)}`,
          path: entitySet.path,
          required: Boolean(entitySet.keyEndpointId),
          requirement: `Validate OData key lookup for ${entitySet.name}`,
          status: 'uncovered',
        });

        for (const queryOption of entitySet.queryOptions) {
          items.push({
            category: 'odata-query-option',
            coveredBy: [],
            endpointId: entitySet.listEndpointId,
            id: `odata-query:${this.slug(entitySet.name)}:${this.slug(queryOption)}`,
            path: entitySet.path,
            queryOption,
            required: true,
            requirement: `Validate ${queryOption} on OData entity set ${entitySet.name}`,
            status: 'uncovered',
          });
        }

        if (entitySet.queryOptions.length > 0) {
          items.push({
            category: 'negative-scenario',
            coveredBy: [],
            endpointId: entitySet.listEndpointId,
            id: `negative:${this.slug(entitySet.name)}:malformed-odata-query`,
            path: entitySet.path,
            required: true,
            requirement: `Reject malformed OData query for ${entitySet.name}`,
            scenario: 'malformed-odata-query',
            status: 'uncovered',
          });
        }
      }
    }

    for (const variable of this.normalizeSeedVariables(seedManifest)) {
      items.push({
        category: 'seed-variable',
        coveredBy: [],
        id: `seed-variable:${this.slug(variable.name)}`,
        required: variable.required,
        requirement: `Resolve seeded variable ${variable.name}`,
        seedVariable: variable.name,
        status: 'uncovered',
        notes: variable.source,
      });
    }

    const dedupedItems = this.dedupeItems(items);
    return {
      generatedAt: new Date().toISOString(),
      items: dedupedItems,
      schemaVersion: 1,
      source: contract.source,
      summary: this.summarize(dedupedItems),
    };
  }

  async writeManifest(collectionPath: string, manifest: ContractCoverageManifest): Promise<string> {
    const manifestPath = join(
      resolve(collectionPath),
      '.bruno-mcp',
      'coverage',
      'contract-coverage.json',
    );
    await fs.mkdir(dirname(manifestPath), { recursive: true });
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return manifestPath;
  }

  async readManifest(manifestPath: string): Promise<ContractCoverageManifest> {
    try {
      return JSON.parse(await fs.readFile(manifestPath, 'utf8')) as ContractCoverageManifest;
    } catch (error) {
      throw new BrunoError(
        `Failed to read coverage manifest at ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`,
        'VALIDATION_ERROR',
      );
    }
  }

  validateManifest(manifest: ContractCoverageManifest): ContractCoverageValidation {
    const errors: string[] = [];
    const warnings: string[] = [];
    const ids = new Set<string>();
    const duplicateIds: string[] = [];

    if (manifest.schemaVersion !== 1) {
      errors.push('Unsupported contract coverage manifest schemaVersion.');
    }

    for (const item of manifest.items || []) {
      if (!item.id) {
        errors.push('Coverage item is missing id.');
      } else if (ids.has(item.id)) {
        duplicateIds.push(item.id);
      } else {
        ids.add(item.id);
      }

      if (!item.category) {
        errors.push(`Coverage item ${item.id || '<unknown>'} is missing category.`);
      }
      if (!item.requirement) {
        errors.push(`Coverage item ${item.id || '<unknown>'} is missing requirement.`);
      }
      if (!['covered', 'documented-skip', 'uncovered'].includes(item.status)) {
        errors.push(`Coverage item ${item.id || '<unknown>'} has invalid status.`);
      }
      if (item.required === false && item.status === 'uncovered') {
        warnings.push(`Optional coverage item ${item.id} is uncovered.`);
      }
    }

    return {
      duplicateIds,
      errors: [...errors, ...duplicateIds.map((id) => `Duplicate coverage item id: ${id}`)],
      valid: errors.length === 0 && duplicateIds.length === 0,
      warnings,
    };
  }

  private endpointItem(endpoint: ApiContractEndpoint): ContractCoverageItem {
    return {
      category: 'endpoint',
      coveredBy: [],
      endpointId: endpoint.id,
      id: `endpoint:${this.slug(endpoint.method)}:${this.slug(endpoint.path)}`,
      method: endpoint.method,
      path: endpoint.path,
      required: true,
      requirement: `Exercise endpoint ${endpoint.method} ${endpoint.path}`,
      status: 'uncovered',
    };
  }

  private methodItem(endpoint: ApiContractEndpoint): ContractCoverageItem {
    return {
      category: 'method',
      coveredBy: [],
      endpointId: endpoint.id,
      id: `method:${this.slug(endpoint.method)}:${this.slug(endpoint.path)}`,
      method: endpoint.method,
      path: endpoint.path,
      required: true,
      requirement: `Verify method ${endpoint.method} is supported on ${endpoint.path}`,
      status: 'uncovered',
    };
  }

  private fileRouteItem(endpoint: ApiContractEndpoint): ContractCoverageItem {
    return {
      category: 'file-route',
      coveredBy: [],
      endpointId: endpoint.id,
      id: `file-route:${this.slug(endpoint.method)}:${this.slug(endpoint.path)}`,
      method: endpoint.method,
      path: endpoint.path,
      required: true,
      requirement: `Validate file route behavior for ${endpoint.method} ${endpoint.path}`,
      status: 'uncovered',
    };
  }

  private payloadFieldItem(
    endpoint: ApiContractEndpoint,
    field: ApiContractField,
  ): ContractCoverageItem {
    return {
      category: 'payload-field',
      coveredBy: [],
      endpointId: endpoint.id,
      fieldPath: field.path,
      id: `payload:${this.slug(endpoint.method)}:${this.slug(endpoint.path)}:${this.slug(field.path)}`,
      method: endpoint.method,
      path: endpoint.path,
      required: field.required,
      requirement: `Cover request payload field ${field.path} for ${endpoint.method} ${endpoint.path}`,
      status: 'uncovered',
    };
  }

  private responseFieldItem(
    endpoint: ApiContractEndpoint,
    statusCode: string,
    field: ApiContractField,
  ): ContractCoverageItem {
    return {
      category: 'response-field',
      coveredBy: [],
      endpointId: endpoint.id,
      fieldPath: field.path,
      id: `response:${this.slug(endpoint.method)}:${this.slug(endpoint.path)}:${this.slug(statusCode)}:${this.slug(field.path)}`,
      method: endpoint.method,
      path: endpoint.path,
      required: true,
      requirement: `Assert response field ${field.path} for ${endpoint.method} ${endpoint.path} ${statusCode}`,
      status: 'uncovered',
    };
  }

  private negativeScenarioItem(
    endpoint: ApiContractEndpoint,
    scenario: string,
    requirement: string,
  ): ContractCoverageItem {
    return {
      category: 'negative-scenario',
      coveredBy: [],
      endpointId: endpoint.id,
      id: `negative:${this.slug(endpoint.method)}:${this.slug(endpoint.path)}:${this.slug(scenario)}`,
      method: endpoint.method,
      path: endpoint.path,
      required: true,
      requirement,
      scenario,
      status: 'uncovered',
    };
  }

  private odataMetadataItem(
    idSuffix: string,
    path: string,
    requirement: string,
  ): ContractCoverageItem {
    return {
      category: 'odata-metadata',
      coveredBy: [],
      id: `odata-metadata:${this.slug(idSuffix)}`,
      method: 'GET',
      path,
      required: true,
      requirement,
      status: 'uncovered',
    };
  }

  private isFileEndpoint(endpoint: ApiContractEndpoint): boolean {
    const filePathSignal = /(?:file|upload|download|artifact|attachment)/i.test(endpoint.path);
    const fileBodySignal = endpoint.requestBodies.some((body) =>
      /multipart|octet-stream|binary/i.test(body.contentType),
    );
    return filePathSignal || fileBodySignal;
  }

  private hasBoundary(field: ApiContractField): boolean {
    return [
      field.maxItems,
      field.maxLength,
      field.maximum,
      field.minItems,
      field.minLength,
      field.minimum,
    ].some((value) => value !== undefined);
  }

  private unsupportedMethodItems(endpoints: ApiContractEndpoint[]): ContractCoverageItem[] {
    const commonMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
    const methodsByPath = new Map<string, Set<string>>();

    for (const endpoint of endpoints) {
      if (!methodsByPath.has(endpoint.path)) {
        methodsByPath.set(endpoint.path, new Set());
      }
      methodsByPath.get(endpoint.path)!.add(endpoint.method);
    }

    const items: ContractCoverageItem[] = [];
    for (const [path, methods] of methodsByPath.entries()) {
      const unsupportedMethod = commonMethods.find((method) => !methods.has(method));
      if (!unsupportedMethod) {
        continue;
      }

      items.push({
        category: 'negative-scenario' as const,
        coveredBy: [],
        id: `negative:${this.slug(path)}:unsupported-method`,
        method: unsupportedMethod,
        path,
        required: true,
        requirement: `Reject unsupported method ${unsupportedMethod} on ${path}`,
        scenario: 'unsupported-method',
        status: 'uncovered' as const,
      });
    }
    return items;
  }

  private normalizeSeedVariables(seedManifest?: SeedManifestContract): SeedVariableContract[] {
    const variables = seedManifest?.variables;
    if (!variables) {
      return [];
    }

    if (Array.isArray(variables)) {
      return variables.map((variable) =>
        typeof variable === 'string'
          ? { name: variable, required: true }
          : { ...variable, required: variable.required !== false },
      );
    }

    return Object.entries(variables).map(([name, value]) =>
      typeof value === 'string'
        ? { name, required: true, source: value }
        : {
            defaultValue: value.defaultValue,
            name,
            required: value.required !== false,
            source: value.source,
            value: value.value,
          },
    );
  }

  private dedupeItems(items: ContractCoverageItem[]): ContractCoverageItem[] {
    return [...new Map(items.map((item) => [item.id, item])).values()].toSorted((left, right) =>
      left.id.localeCompare(right.id),
    );
  }

  private summarize(items: ContractCoverageItem[]): ContractCoverageManifest['summary'] {
    const byCategory: Record<string, number> = {};
    for (const item of items) {
      byCategory[item.category] = (byCategory[item.category] || 0) + 1;
    }

    return {
      byCategory,
      requiredItems: items.filter((item) => item.required).length,
      totalItems: items.length,
    };
  }

  private slug(value: string): string {
    return (
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'root'
    );
  }
}

export function createContractCoverageManager(): ContractCoverageManager {
  return new ContractCoverageManager();
}
