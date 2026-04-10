/**
 * Bruno MCP Server
 * Main MCP server implementation for Bruno API testing file generation
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { completable } from '@modelcontextprotocol/sdk/server/completable.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { promises as fs } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { createCollectionManager } from './bruno/collection.js';
import {
  createFeatureSliceManager,
  DynamicDataPolicy,
  FEATURE_SLICE_OVERLAY_VALUES,
  FEATURE_SLICE_TYPE_VALUES,
  FeatureRunProfile,
  FeatureSliceType,
  MatrixScenarioDelta,
  RunFeatureSliceInput,
  SliceFinding,
  SupportRequestRole,
} from './bruno/feature-slice.js';
import { createBrunoNativeManager } from './bruno/native.js';
import { createRequestBuilder } from './bruno/request.js';
import { createWorkspaceManager } from './bruno/workspace.js';
import {
  AddTestScriptInput,
  AuthType,
  BodyType,
  CreateCollectionInput,
  CreateEnvironmentInput,
  CreateRequestInput,
  CreateTestSuiteInput,
  HttpMethod,
} from './bruno/types.js';

type ToolSchema = Record<string, z.ZodTypeAny>;

const METHOD_VALUES = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const;
const AUTH_VALUES = ['none', 'bearer', 'basic', 'oauth2', 'api-key', 'digest'] as const;
const BODY_VALUES = [
  'none',
  'json',
  'text',
  'xml',
  'form-data',
  'form-urlencoded',
  'binary',
  'graphql',
] as const;

const requestBodySchema = z.object({
  type: z.enum(BODY_VALUES),
  content: z.string().optional(),
  contentType: z.string().optional(),
  filePath: z.string().optional(),
  variables: z.string().optional(),
  formData: z
    .array(
      z.object({
        name: z.string(),
        value: z.string(),
        type: z.enum(['text', 'file']).optional(),
      }),
    )
    .optional(),
  formUrlEncoded: z
    .array(
      z.object({
        name: z.string(),
        value: z.string(),
      }),
    )
    .optional(),
});

const requestAuthSchema = z.object({
  type: z.enum(AUTH_VALUES),
  config: z.record(z.string()),
});

const requestAssertionSchema = z.object({
  name: z.string().min(1, 'Assertion target is required'),
  value: z.string().min(1, 'Assertion expression is required'),
  enabled: z.boolean().optional(),
});

const requestSettingsSchema = z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]));

const createCollectionToolSchema: ToolSchema = {
  name: z.string().min(1, 'Collection name is required'),
  description: z.string().optional(),
  baseUrl: z.string().url().optional(),
  outputPath: z.string().min(1, 'Output path is required'),
  ignore: z.array(z.string()).optional(),
};

const createEnvironmentToolSchema: ToolSchema = {
  collectionPath: z.string().min(1, 'Collection path is required'),
  name: z.string().min(1, 'Environment name is required'),
  variables: z.record(z.union([z.string(), z.number(), z.boolean()])),
};

const createRequestToolSchema: ToolSchema = {
  collectionPath: z.string().min(1, 'Collection path is required'),
  name: z.string().min(1, 'Request name is required'),
  method: z.enum(METHOD_VALUES),
  url: z.string().min(1, 'URL is required'),
  headers: z.record(z.string()).optional(),
  body: requestBodySchema.optional(),
  auth: requestAuthSchema.optional(),
  query: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  folder: z.string().optional(),
  sequence: z.number().int().positive().optional(),
  docs: z.string().optional(),
  tags: z.array(z.string()).optional(),
  settings: requestSettingsSchema.optional(),
  assertions: z.array(requestAssertionSchema).optional(),
  preRequestVars: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  postResponseVars: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  preRequestScript: z.string().optional(),
  postResponseScript: z.string().optional(),
  tests: z.string().optional(),
};

const addTestScriptToolSchema: ToolSchema = {
  bruFilePath: z.string().min(1, 'BRU file path is required'),
  scriptType: z.enum(['pre-request', 'post-response', 'tests']),
  script: z.string().min(1, 'Script content is required'),
};

const createTestSuiteToolSchema: ToolSchema = {
  collectionPath: z.string().min(1, 'Collection path is required'),
  suiteName: z.string().min(1, 'Suite name is required'),
  requests: z.array(
    z.object({
      name: z.string().min(1, 'Request name is required'),
      method: z.enum(METHOD_VALUES),
      url: z.string().min(1, 'URL is required'),
      headers: z.record(z.string()).optional(),
      body: requestBodySchema.optional(),
      auth: requestAuthSchema.optional(),
      query: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
      folder: z.string().optional(),
    }),
  ),
  dependencies: z
    .array(
      z.object({
        from: z.string().min(1, 'Source request name is required'),
        to: z.string().min(1, 'Target request name is required'),
        variable: z.string().min(1, 'Runtime variable name is required'),
        sourcePath: z.string().optional(),
      }),
    )
    .optional(),
};

const createCrudRequestsToolSchema: ToolSchema = {
  collectionPath: z.string().min(1, 'Collection path is required'),
  entityName: z.string().min(1, 'Entity name is required'),
  baseUrl: z.string().min(1, 'Base URL is required'),
  folder: z.string().optional(),
};

const listCollectionsToolSchema: ToolSchema = {
  path: z.string().min(1, 'Directory path is required'),
};

const getCollectionStatsToolSchema: ToolSchema = {
  collectionPath: z.string().min(1, 'Collection path is required'),
};

const workspaceToolSchema: ToolSchema = {
  workspacePath: z.string().min(1, 'Workspace path is required'),
};

const workspaceCollectionToolSchema: ToolSchema = {
  workspacePath: z.string().min(1, 'Workspace path is required'),
  collectionPath: z.string().min(1, 'Collection path is required'),
  name: z.string().min(1, 'Collection name is required').optional(),
};

const defaultsPatchSchema = {
  auth: requestAuthSchema.optional(),
  docs: z.string().optional(),
  headers: z.record(z.string()).optional(),
  postResponseScript: z.string().optional(),
  postResponseVars: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  preRequestScript: z.string().optional(),
  preRequestVars: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  tests: z.string().optional(),
  unsetHeaders: z.array(z.string()).optional(),
  unsetPostResponseVars: z.array(z.string()).optional(),
  unsetPreRequestVars: z.array(z.string()).optional(),
};

const collectionDefaultsToolSchema: ToolSchema = {
  collectionPath: z.string().min(1, 'Collection path is required'),
  ...defaultsPatchSchema,
};

const folderToolSchema: ToolSchema = {
  collectionPath: z.string().min(1, 'Collection path is required'),
  folderPath: z.string().min(1, 'Folder path is required'),
};

const createFolderToolSchema: ToolSchema = {
  collectionPath: z.string().min(1, 'Collection path is required'),
  folderPath: z.string().min(1, 'Folder path is required'),
  ...defaultsPatchSchema,
};

const deleteFolderToolSchema: ToolSchema = {
  collectionPath: z.string().min(1, 'Collection path is required'),
  folderPath: z.string().min(1, 'Folder path is required'),
  deleteContents: z.boolean().default(false),
};

const requestPathToolSchema: ToolSchema = {
  requestPath: z.string().min(1, 'Request path is required'),
};

const updateRequestToolSchema: ToolSchema = {
  requestPath: z.string().min(1, 'Request path is required'),
  name: z.string().min(1).optional(),
  method: z.enum(METHOD_VALUES).optional(),
  url: z.string().min(1).optional(),
  sequence: z.number().int().positive().optional(),
  headers: z.record(z.string()).optional(),
  unsetHeaders: z.array(z.string()).optional(),
  query: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  unsetQuery: z.array(z.string()).optional(),
  body: requestBodySchema.optional(),
  auth: requestAuthSchema.optional(),
  preRequestVars: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  unsetPreRequestVars: z.array(z.string()).optional(),
  postResponseVars: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  unsetPostResponseVars: z.array(z.string()).optional(),
  preRequestScript: z.string().optional(),
  postResponseScript: z.string().optional(),
  tests: z.string().optional(),
  docs: z.string().optional(),
  tags: z.array(z.string()).optional(),
  settings: requestSettingsSchema.optional(),
  assertions: z.array(requestAssertionSchema).optional(),
};

const moveRequestToolSchema: ToolSchema = {
  requestPath: z.string().min(1, 'Request path is required'),
  targetFolderPath: z.string().min(1, 'Target folder path is required'),
  newName: z.string().min(1).optional(),
  sequence: z.number().int().positive().optional(),
};

const environmentPathToolSchema: ToolSchema = {
  collectionPath: z.string().min(1, 'Collection path is required'),
  environmentName: z.string().min(1, 'Environment name is required'),
};

const updateEnvironmentToolSchema: ToolSchema = {
  collectionPath: z.string().min(1, 'Collection path is required'),
  environmentName: z.string().min(1, 'Environment name is required'),
  set: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  unset: z.array(z.string()).optional(),
};

const workspaceEnvironmentToolSchema: ToolSchema = {
  workspacePath: z.string().min(1, 'Workspace path is required'),
  environmentName: z.string().min(1, 'Environment name is required'),
  variables: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  set: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  unset: z.array(z.string()).optional(),
};

const SUPPORT_ROLE_VALUES = ['auth', 'cleanup', 'lookup', 'resolve', 'seed'] as const;

const dynamicDataPolicySchema = z.object({
  fakerProfile: z.enum(['commerce', 'person', 'simple']).optional(),
  mode: z.enum(['builtin', 'faker']).optional(),
  persistAsVars: z.boolean().optional(),
  scope: z.enum(['bruno-runtime', 'mcp']).optional(),
});

const matrixScenarioSchema = z.object({
  caseId: z.string().optional(),
  scenarioId: z.string().min(1, 'Scenario id is required'),
  delta: z
    .object({
      removePaths: z.array(z.string().min(1)).optional(),
      set: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
    })
    .optional(),
  expectedStatus: z.number().int(),
  expectedOutcome: z.string().min(1, 'Expected outcome is required'),
  field: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
});

const sliceFindingSchema = z.object({
  evidence: z.string().optional(),
  expectedBehavior: z.string().optional(),
  kind: z.enum(['collection-defect', 'coverage-gap', 'design-warning', 'product-defect']),
  observedBehavior: z.string().optional(),
  recommendedAction: z.string().optional(),
  requestPath: z.string().optional(),
  severity: z.enum(['high', 'medium', 'low']),
  title: z.string().min(1, 'Finding title is required'),
});

const inspectFeatureSliceToolSchema: ToolSchema = {
  workspacePath: z.string().optional(),
  collectionPath: z.string().min(1, 'Collection path is required'),
  featureName: z.string().min(1, 'Feature name is required'),
  basePath: z.string().optional(),
};

const planFeatureSliceToolSchema: ToolSchema = {
  collectionPath: z.string().min(1, 'Collection path is required'),
  featureName: z.string().min(1, 'Feature name is required'),
  featureType: z.enum(FEATURE_SLICE_TYPE_VALUES),
  targetResource: z.string().optional(),
  basePath: z.string().optional(),
  sourceOfTruth: z.string().optional(),
  overlay: z.enum(FEATURE_SLICE_OVERLAY_VALUES).optional(),
  strictMode: z.boolean().optional(),
  convenienceMode: z.boolean().optional(),
};

const scaffoldFeatureSliceToolSchema: ToolSchema = {
  ...planFeatureSliceToolSchema,
  includeSupportRequests: z.boolean().optional(),
  includeMatrices: z.boolean().optional(),
  dataPolicy: dynamicDataPolicySchema.optional(),
};

const scaffoldMatrixRequestToolSchema: ToolSchema = {
  collectionPath: z.string().min(1, 'Collection path is required'),
  sliceId: z.string().min(1, 'Slice id is required'),
  requestFolder: z.string().min(1, 'Request folder is required'),
  requestName: z.string().min(1, 'Request name is required'),
  requestUrl: z.string().min(1, 'Request URL is required'),
  category: z.enum(['negative', 'security']),
  basePayload: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  scenarioDeltas: z.array(matrixScenarioSchema).min(1, 'At least one scenario is required'),
  requiredIterationFields: z.array(z.string().min(1)).min(1),
  allowedDeltaPaths: z.array(z.string().min(1)).min(1),
  strictMode: z.boolean().optional(),
};

const scaffoldSupportRequestsToolSchema: ToolSchema = {
  collectionPath: z.string().min(1, 'Collection path is required'),
  featureName: z.string().min(1, 'Feature name is required'),
  targetResource: z.string().optional(),
  strictMode: z.boolean().optional(),
  supportKinds: z.array(z.enum(SUPPORT_ROLE_VALUES)).min(1, 'Support kinds are required'),
};

const auditFeatureSliceToolSchema: ToolSchema = {
  collectionPath: z.string().min(1, 'Collection path is required'),
  sliceId: z.string().min(1, 'Slice id is required'),
  sourceOfTruth: z.string().optional(),
  overlay: z.string().optional(),
};

const recordSliceFindingsToolSchema: ToolSchema = {
  collectionPath: z.string().min(1, 'Collection path is required'),
  sliceId: z.string().min(1, 'Slice id is required'),
  findings: z.array(sliceFindingSchema),
  writeMode: z.enum(['docs-only', 'request-docs', 'slice-manifest']).optional(),
};

const refreshGeneratedDataToolSchema: ToolSchema = {
  collectionPath: z.string().min(1, 'Collection path is required'),
  sliceId: z.string().min(1, 'Slice id is required'),
  policy: dynamicDataPolicySchema.optional(),
};

const generateFeatureRunManifestToolSchema: ToolSchema = {
  collectionPath: z.string().min(1, 'Collection path is required'),
  sliceId: z.string().min(1, 'Slice id is required'),
};

const runFeatureSliceToolSchema: ToolSchema = {
  collectionPath: z.string().min(1, 'Collection path is required'),
  sliceId: z.string().min(1, 'Slice id is required'),
  env: z.string().min(1, 'Environment is required'),
  profile: z.enum(['smoke', 'full', 'negative_only', 'security_only', 'support_only']).optional(),
  workspacePath: z.string().optional(),
  globalEnv: z.string().optional(),
};

export class BrunoMcpServer {
  private server: McpServer;
  private collectionManager;
  private featureSliceManager;
  private nativeManager;
  private requestBuilder;
  private workspaceManager;
  private rootCache?: { paths: string[]; timestamp: number };

  constructor() {
    this.server = new McpServer(
      {
        name: 'bruno-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          completions: {},
          logging: {},
          prompts: {
            listChanged: true,
          },
          resources: {
            listChanged: true,
          },
          tools: {
            listChanged: true,
          },
        },
      },
    );

    this.collectionManager = createCollectionManager();
    this.nativeManager = createBrunoNativeManager();
    this.requestBuilder = createRequestBuilder();
    this.workspaceManager = createWorkspaceManager();
    this.featureSliceManager = createFeatureSliceManager(
      this.nativeManager,
      this.requestBuilder,
      this.workspaceManager,
    );

    this.setupTools();
  }

  /**
   * Set up all MCP tools
   */
  private setupTools(): void {
    this.setupCreateCollectionTool();
    this.setupCreateEnvironmentTool();
    this.setupCreateRequestTool();
    this.setupAddTestScriptTool();
    this.setupCreateTestSuiteTool();
    this.setupCreateCrudRequestsTool();
    this.setupListCollectionsTool();
    this.setupGetCollectionStatsTool();
    this.setupWorkspaceTools();
    this.setupCollectionDefaultsTools();
    this.setupFolderTools();
    this.setupRequestCrudTools();
    this.setupEnvironmentCrudTools();
    this.setupFeatureSliceTools();
    this.setupResources();
    this.setupPrompts();
  }

  /**
   * Tool: create_collection
   */
  private setupCreateCollectionTool(): void {
    this.server.registerTool(
      'create_collection',
      {
        title: 'Create Bruno Collection',
        description: 'Create a new Bruno collection with configuration.',
        inputSchema: createCollectionToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as CreateCollectionInput;
          await this.assertPathAllowed(args.outputPath, 'Output path');
          const result = await this.collectionManager.createCollection(args);

          return result.success
            ? this.textResult(`Created Bruno collection "${args.name}" at ${result.path}`)
            : this.errorResult(`Failed to create collection: ${result.error}`);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('creating collection', error));
        }
      },
    );
  }

  /**
   * Tool: create_environment
   */
  private setupCreateEnvironmentTool(): void {
    this.server.registerTool(
      'create_environment',
      {
        title: 'Create Bruno Environment',
        description: 'Create an environment file for a Bruno collection.',
        inputSchema: createEnvironmentToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as CreateEnvironmentInput;
          await this.assertPathAllowed(args.collectionPath, 'Collection path');
          const result = await this.nativeManager.createEnvironment(
            args.collectionPath,
            args.name,
            args.variables,
          );

          return result.success
            ? this.textResult(`Created environment "${args.name}" at ${result.path}`)
            : this.errorResult(`Failed to create environment: ${result.error}`);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('creating environment', error));
        }
      },
    );
  }

  /**
   * Tool: create_request
   */
  private setupCreateRequestTool(): void {
    this.server.registerTool(
      'create_request',
      {
        title: 'Create Bruno Request',
        description: 'Generate a Bruno .bru request file for REST or GraphQL over HTTP.',
        inputSchema: createRequestToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as {
            collectionPath: string;
            name: string;
            method: HttpMethod;
            url: string;
            headers?: Record<string, string>;
            body?: {
              type: BodyType;
              content?: string;
              contentType?: string;
              filePath?: string;
              variables?: string;
              formData?: Array<{
                name: string;
                value: string;
                type?: 'text' | 'file';
              }>;
              formUrlEncoded?: Array<{ name: string; value: string }>;
            };
            auth?: {
              type: AuthType;
              config: Record<string, string>;
            };
            query?: Record<string, string | number | boolean>;
            folder?: string;
            sequence?: number;
            docs?: string;
            tags?: string[];
            settings?: Record<string, boolean | number | string | null>;
            assertions?: Array<{ enabled?: boolean; name: string; value: string }>;
            preRequestVars?: Record<string, string | number | boolean>;
            postResponseVars?: Record<string, string | number | boolean>;
            preRequestScript?: string;
            postResponseScript?: string;
            tests?: string;
          };

          await this.assertPathAllowed(args.collectionPath, 'Collection path');

          const result = await this.requestBuilder.createRequest(
            this.toCreateRequestInput({
              auth: args.auth,
              body: args.body,
              collectionPath: args.collectionPath,
              folder: args.folder,
              headers: args.headers,
              method: args.method,
              name: args.name,
              query: args.query,
              sequence: args.sequence,
              url: args.url,
            }),
          );

          if (result.success && result.path) {
            const metadataPatch = this.toRequestPatch(args);
            if (this.hasRequestMetadataPatch(metadataPatch)) {
              const patchResult = await this.nativeManager.updateRequest(
                result.path,
                metadataPatch,
              );
              if (!patchResult.success) {
                return this.errorResult(
                  `Request created at ${result.path} but metadata update failed: ${patchResult.error}`,
                );
              }
            }
          }

          return result.success
            ? this.textResult(`Created request "${args.name}" at ${result.path}`)
            : this.errorResult(`Failed to create request: ${result.error}`);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('creating request', error));
        }
      },
    );
  }

  /**
   * Tool: add_test_script
   */
  private setupAddTestScriptTool(): void {
    this.server.registerTool(
      'add_test_script',
      {
        title: 'Add Test Script',
        description: 'Add or replace a pre-request, post-response, or tests block in a .bru file.',
        inputSchema: addTestScriptToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as AddTestScriptInput;
          await this.assertPathAllowed(args.bruFilePath, 'Request path');
          const result = await this.requestBuilder.addTestScript(args);

          return result.success
            ? this.textResult(`Updated ${args.scriptType} block in ${result.path}`)
            : this.errorResult(`Failed to add script: ${result.error}`);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('adding test script', error));
        }
      },
    );
  }

  /**
   * Tool: create_test_suite
   */
  private setupCreateTestSuiteTool(): void {
    this.server.registerTool(
      'create_test_suite',
      {
        title: 'Create Test Suite',
        description:
          'Generate multiple related requests into a suite folder with optional runtime dependencies.',
        inputSchema: createTestSuiteToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as CreateTestSuiteInput;
          await this.assertPathAllowed(args.collectionPath, 'Collection path');
          const results = [];

          for (const request of this.prepareSuiteRequests(args)) {
            const result = await this.requestBuilder.createRequest(request);
            results.push({ name: request.name, result });
          }

          const failures = results.filter(({ result }) => !result.success);
          const successCount = results.length - failures.length;
          const lines = [
            `Created test suite "${args.suiteName}" with ${successCount}/${results.length} requests.`,
          ];

          if (failures.length > 0) {
            lines.push('Failed requests:');
            lines.push(...failures.map(({ name, result }) => `- ${name}: ${result.error}`));
          }

          return failures.length > 0
            ? this.errorResult(lines.join('\n'))
            : this.textResult(lines.join('\n'));
        } catch (error) {
          return this.errorResult(this.getErrorMessage('creating test suite', error));
        }
      },
    );
  }

  /**
   * Tool: create_crud_requests
   */
  private setupCreateCrudRequestsTool(): void {
    this.server.registerTool(
      'create_crud_requests',
      {
        title: 'Create CRUD Requests',
        description: 'Generate a REST CRUD request set for an entity.',
        inputSchema: createCrudRequestsToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as {
            collectionPath: string;
            entityName: string;
            baseUrl: string;
            folder?: string;
          };

          await this.assertPathAllowed(args.collectionPath, 'Collection path');

          const results = await this.requestBuilder.createCrudRequests(
            args.collectionPath,
            args.entityName,
            args.baseUrl,
            args.folder,
          );

          const successCount = results.filter((result) => result.success).length;
          const failures = results.filter((result) => !result.success);
          const lines = [
            `Created CRUD request set for "${args.entityName}" with ${successCount}/${results.length} requests.`,
          ];

          if (failures.length > 0) {
            lines.push(...failures.map((result) => `- ${result.error}`));
          }

          return failures.length > 0
            ? this.errorResult(lines.join('\n'))
            : this.textResult(lines.join('\n'));
        } catch (error) {
          return this.errorResult(this.getErrorMessage('creating CRUD requests', error));
        }
      },
    );
  }

  /**
   * Tool: list_collections
   */
  private setupListCollectionsTool(): void {
    this.server.registerTool(
      'list_collections',
      {
        title: 'List Collections',
        description: 'List Bruno collections under a directory.',
        inputSchema: listCollectionsToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as { path: string };
          await this.assertPathAllowed(args.path, 'Directory path');
          const collections = await this.collectionManager.listCollections(args.path);

          if (collections.length === 0) {
            return this.textResult(`No Bruno collections found under ${args.path}`);
          }

          const lines = [`Found ${collections.length} Bruno collection(s) under ${args.path}:`];
          lines.push(
            ...collections.map(
              (collection) =>
                `- ${collection.name}: ${collection.path} (${collection.requestCount} requests, ${collection.environmentCount} environments)`,
            ),
          );

          return this.textResult(lines.join('\n'));
        } catch (error) {
          return this.errorResult(this.getErrorMessage('listing collections', error));
        }
      },
    );
  }

  /**
   * Tool: get_collection_stats
   */
  private setupGetCollectionStatsTool(): void {
    this.server.registerTool(
      'get_collection_stats',
      {
        title: 'Get Collection Statistics',
        description: 'Get statistics about a Bruno collection.',
        inputSchema: getCollectionStatsToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as { collectionPath: string };
          await this.assertPathAllowed(args.collectionPath, 'Collection path');
          const stats = await this.collectionManager.getCollectionStats(args.collectionPath);

          const methodLines =
            Object.entries(stats.requestsByMethod).length > 0
              ? Object.entries(stats.requestsByMethod).map(
                  ([method, count]) => `- ${method}: ${count}`,
                )
              : ['- No requests detected'];

          return this.textResult(
            [
              `Collection statistics for ${args.collectionPath}`,
              `Total requests: ${stats.totalRequests}`,
              `Folders: ${stats.folders.length > 0 ? stats.folders.join(', ') : 'None'}`,
              `Environments: ${stats.environments.length > 0 ? stats.environments.join(', ') : 'None'}`,
              'Request methods:',
              ...methodLines,
            ].join('\n'),
          );
        } catch (error) {
          return this.errorResult(this.getErrorMessage('getting collection stats', error));
        }
      },
    );
  }

  private setupWorkspaceTools(): void {
    this.server.registerTool(
      'get_workspace',
      {
        title: 'Get Workspace',
        description: 'Get Bruno workspace metadata and registered collections.',
        inputSchema: workspaceToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as { workspacePath: string };
          await this.assertPathAllowed(args.workspacePath, 'Workspace path');
          const workspace = await this.workspaceManager.getWorkspaceSummary(args.workspacePath);
          return this.jsonResult(workspace);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('getting workspace', error));
        }
      },
    );

    this.server.registerTool(
      'add_collection_to_workspace',
      {
        title: 'Add Collection To Workspace',
        description: 'Register an existing collection in a Bruno workspace.',
        inputSchema: workspaceCollectionToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as {
            workspacePath: string;
            collectionPath: string;
            name?: string;
          };
          await this.assertPathAllowed(args.workspacePath, 'Workspace path');
          await this.assertPathAllowed(args.collectionPath, 'Collection path');
          const result = await this.workspaceManager.addCollection(
            args.workspacePath,
            args.name || this.basename(args.collectionPath),
            args.collectionPath,
          );
          return result.success
            ? this.textResult(`Added ${args.collectionPath} to workspace ${args.workspacePath}`)
            : this.errorResult(`Failed to add collection to workspace: ${result.error}`);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('adding collection to workspace', error));
        }
      },
    );

    this.server.registerTool(
      'remove_collection_from_workspace',
      {
        title: 'Remove Collection From Workspace',
        description: 'Remove a collection reference from a Bruno workspace.',
        inputSchema: workspaceCollectionToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as { workspacePath: string; collectionPath: string };
          await this.assertPathAllowed(args.workspacePath, 'Workspace path');
          await this.assertPathAllowed(args.collectionPath, 'Collection path');
          const result = await this.workspaceManager.removeCollection(
            args.workspacePath,
            args.collectionPath,
          );
          return result.success
            ? this.textResult(`Removed ${args.collectionPath} from workspace ${args.workspacePath}`)
            : this.errorResult(`Failed to remove collection from workspace: ${result.error}`);
        } catch (error) {
          return this.errorResult(
            this.getErrorMessage('removing collection from workspace', error),
          );
        }
      },
    );

    this.server.registerTool(
      'validate_workspace',
      {
        title: 'Validate Workspace',
        description: 'Validate workspace collection references and duplicates.',
        inputSchema: workspaceToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as { workspacePath: string };
          await this.assertPathAllowed(args.workspacePath, 'Workspace path');
          const validation = await this.workspaceManager.validateWorkspace(args.workspacePath);
          return this.jsonResult(validation);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('validating workspace', error));
        }
      },
    );

    this.server.registerTool(
      'list_workspace_environments',
      {
        title: 'List Workspace Environments',
        description: 'List global workspace environments stored under environments/*.yml.',
        inputSchema: workspaceToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as { workspacePath: string };
          await this.assertPathAllowed(args.workspacePath, 'Workspace path');
          const environments = await this.workspaceManager.listWorkspaceEnvironments(
            args.workspacePath,
          );
          return this.jsonResult({ environments, workspacePath: args.workspacePath });
        } catch (error) {
          return this.errorResult(this.getErrorMessage('listing workspace environments', error));
        }
      },
    );

    this.server.registerTool(
      'get_workspace_environment',
      {
        title: 'Get Workspace Environment',
        description: 'Get a workspace-level Bruno environment.',
        inputSchema: workspaceEnvironmentToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as { workspacePath: string; environmentName: string };
          await this.assertPathAllowed(args.workspacePath, 'Workspace path');
          const environment = await this.workspaceManager.getWorkspaceEnvironment(
            args.workspacePath,
            args.environmentName,
          );
          return this.jsonResult({ environmentName: args.environmentName, variables: environment });
        } catch (error) {
          return this.errorResult(this.getErrorMessage('getting workspace environment', error));
        }
      },
    );

    this.server.registerTool(
      'create_workspace_environment',
      {
        title: 'Create Workspace Environment',
        description: 'Create a workspace-level Bruno environment YAML file.',
        inputSchema: workspaceEnvironmentToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as {
            environmentName: string;
            variables?: Record<string, string | number | boolean>;
            workspacePath: string;
          };
          await this.assertPathAllowed(args.workspacePath, 'Workspace path');
          const result = await this.workspaceManager.createWorkspaceEnvironment(
            args.workspacePath,
            args.environmentName,
            args.variables || {},
          );
          return result.success
            ? this.textResult(`Created workspace environment ${args.environmentName}`)
            : this.errorResult(`Failed to create workspace environment: ${result.error}`);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('creating workspace environment', error));
        }
      },
    );

    this.server.registerTool(
      'update_workspace_environment',
      {
        title: 'Update Workspace Environment',
        description: 'Set and unset variables on a workspace-level environment.',
        inputSchema: workspaceEnvironmentToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as {
            environmentName: string;
            set?: Record<string, string | number | boolean>;
            unset?: string[];
            workspacePath: string;
          };
          await this.assertPathAllowed(args.workspacePath, 'Workspace path');
          const result = await this.workspaceManager.updateWorkspaceEnvironment(
            args.workspacePath,
            args.environmentName,
            args.set || {},
            args.unset || [],
          );
          return result.success
            ? this.textResult(`Updated workspace environment ${args.environmentName}`)
            : this.errorResult(`Failed to update workspace environment: ${result.error}`);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('updating workspace environment', error));
        }
      },
    );

    this.server.registerTool(
      'delete_workspace_environment',
      {
        title: 'Delete Workspace Environment',
        description: 'Delete a workspace-level environment file.',
        inputSchema: workspaceEnvironmentToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as { workspacePath: string; environmentName: string };
          await this.assertPathAllowed(args.workspacePath, 'Workspace path');
          const result = await this.workspaceManager.deleteWorkspaceEnvironment(
            args.workspacePath,
            args.environmentName,
          );
          return result.success
            ? this.textResult(`Deleted workspace environment ${args.environmentName}`)
            : this.errorResult(`Failed to delete workspace environment: ${result.error}`);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('deleting workspace environment', error));
        }
      },
    );
  }

  private setupCollectionDefaultsTools(): void {
    this.server.registerTool(
      'get_collection_defaults',
      {
        title: 'Get Collection Defaults',
        description: 'Get collection-level default headers, vars, scripts, and tests.',
        inputSchema: { collectionPath: z.string().min(1, 'Collection path is required') },
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as { collectionPath: string };
          await this.assertPathAllowed(args.collectionPath, 'Collection path');
          const defaults = await this.nativeManager.getCollectionDefaults(args.collectionPath);
          return this.jsonResult(defaults);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('getting collection defaults', error));
        }
      },
    );

    this.server.registerTool(
      'update_collection_defaults',
      {
        title: 'Update Collection Defaults',
        description: 'Update collection-level headers, vars, scripts, tests, docs, or auth.',
        inputSchema: collectionDefaultsToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as { collectionPath: string } & Record<string, unknown>;
          await this.assertPathAllowed(args.collectionPath, 'Collection path');
          const result = await this.nativeManager.updateCollectionDefaults(
            args.collectionPath,
            this.toDefaultsPatch(args),
          );
          return result.success
            ? this.textResult(`Updated collection defaults for ${args.collectionPath}`)
            : this.errorResult(`Failed to update collection defaults: ${result.error}`);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('updating collection defaults', error));
        }
      },
    );
  }

  private setupFolderTools(): void {
    this.server.registerTool(
      'list_folders',
      {
        title: 'List Folders',
        description: 'List folders inside a Bruno collection.',
        inputSchema: { collectionPath: z.string().min(1, 'Collection path is required') },
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as { collectionPath: string };
          await this.assertPathAllowed(args.collectionPath, 'Collection path');
          const folders = await this.nativeManager.listFolders(args.collectionPath);
          return this.jsonResult({ collectionPath: args.collectionPath, folders });
        } catch (error) {
          return this.errorResult(this.getErrorMessage('listing folders', error));
        }
      },
    );

    this.server.registerTool(
      'get_folder',
      {
        title: 'Get Folder Defaults',
        description: 'Get folder-level default headers, vars, scripts, and tests.',
        inputSchema: folderToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as { collectionPath: string; folderPath: string };
          await this.assertPathAllowed(args.collectionPath, 'Collection path');
          const folder = await this.nativeManager.getFolderDefaults(
            args.collectionPath,
            args.folderPath,
          );
          return this.jsonResult(folder);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('getting folder defaults', error));
        }
      },
    );

    this.server.registerTool(
      'create_folder',
      {
        title: 'Create Folder',
        description: 'Create a folder inside a Bruno collection, optionally with defaults.',
        inputSchema: createFolderToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as { collectionPath: string; folderPath: string } & Record<
            string,
            unknown
          >;
          await this.assertPathAllowed(args.collectionPath, 'Collection path');
          const result = await this.nativeManager.createFolder(
            args.collectionPath,
            args.folderPath,
            this.toDefaultsPatch(args),
          );
          return result.success
            ? this.textResult(`Created folder ${args.folderPath}`)
            : this.errorResult(`Failed to create folder: ${result.error}`);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('creating folder', error));
        }
      },
    );

    this.server.registerTool(
      'update_folder_defaults',
      {
        title: 'Update Folder Defaults',
        description: 'Update folder-level headers, vars, scripts, tests, docs, or auth.',
        inputSchema: createFolderToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as { collectionPath: string; folderPath: string } & Record<
            string,
            unknown
          >;
          await this.assertPathAllowed(args.collectionPath, 'Collection path');
          const result = await this.nativeManager.updateFolderDefaults(
            args.collectionPath,
            args.folderPath,
            this.toDefaultsPatch(args),
          );
          return result.success
            ? this.textResult(`Updated folder defaults for ${args.folderPath}`)
            : this.errorResult(`Failed to update folder defaults: ${result.error}`);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('updating folder defaults', error));
        }
      },
    );

    this.server.registerTool(
      'delete_folder',
      {
        title: 'Delete Folder',
        description: 'Delete a folder from a Bruno collection.',
        inputSchema: deleteFolderToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as {
            collectionPath: string;
            deleteContents: boolean;
            folderPath: string;
          };
          await this.assertPathAllowed(args.collectionPath, 'Collection path');
          let result = await this.nativeManager.deleteFolder(
            args.collectionPath,
            args.folderPath,
            args.deleteContents,
          );

          if (
            !result.success &&
            !args.deleteContents &&
            result.error?.includes('not empty') &&
            (await this.confirmRecursiveDelete(args.folderPath))
          ) {
            result = await this.nativeManager.deleteFolder(
              args.collectionPath,
              args.folderPath,
              true,
            );
          }

          return result.success
            ? this.textResult(`Deleted folder ${args.folderPath}`)
            : this.errorResult(`Failed to delete folder: ${result.error}`);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('deleting folder', error));
        }
      },
    );
  }

  private setupRequestCrudTools(): void {
    this.server.registerTool(
      'list_requests',
      {
        title: 'List Requests',
        description: 'List requests inside a Bruno collection.',
        inputSchema: { collectionPath: z.string().min(1, 'Collection path is required') },
      },
      async (rawArgs, extra) => {
        try {
          const args = rawArgs as { collectionPath: string };
          await this.assertPathAllowed(args.collectionPath, 'Collection path');
          await this.logMessage('info', 'Listing Bruno requests', {
            collectionPath: args.collectionPath,
            operation: 'list_requests',
            progressToken: extra._meta?.progressToken,
          });
          await this.sendProgress(extra, 0, 'Scanning requests');
          const requests = await this.nativeManager.listRequests(args.collectionPath);
          await this.sendProgress(extra, 1, 'Finished scanning requests');
          return this.jsonResult({ collectionPath: args.collectionPath, requests });
        } catch (error) {
          return this.errorResult(this.getErrorMessage('listing requests', error));
        }
      },
    );

    this.server.registerTool(
      'get_request',
      {
        title: 'Get Request',
        description: 'Read a Bruno request file with structured metadata.',
        inputSchema: requestPathToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as { requestPath: string };
          await this.assertPathAllowed(args.requestPath, 'Request path');
          const request = await this.nativeManager.getRequest(args.requestPath);
          return this.jsonResult(request);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('getting request', error));
        }
      },
    );

    this.server.registerTool(
      'update_request',
      {
        title: 'Update Request',
        description: 'Update an existing Bruno request file in place.',
        inputSchema: updateRequestToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as { requestPath: string } & Record<string, unknown>;
          await this.assertPathAllowed(args.requestPath, 'Request path');
          const result = await this.nativeManager.updateRequest(
            args.requestPath,
            this.toRequestPatch(args),
          );
          return result.success
            ? this.textResult(`Updated request ${result.path}`)
            : this.errorResult(`Failed to update request: ${result.error}`);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('updating request', error));
        }
      },
    );

    this.server.registerTool(
      'move_request',
      {
        title: 'Move Request',
        description: 'Move or rename a request inside its collection.',
        inputSchema: moveRequestToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as {
            newName?: string;
            requestPath: string;
            sequence?: number;
            targetFolderPath: string;
          };
          await this.assertPathAllowed(args.requestPath, 'Request path');
          const result = await this.nativeManager.moveRequest(
            args.requestPath,
            args.targetFolderPath,
            args.newName,
            args.sequence,
          );
          return result.success
            ? this.textResult(`Moved request to ${result.path}`)
            : this.errorResult(`Failed to move request: ${result.error}`);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('moving request', error));
        }
      },
    );

    this.server.registerTool(
      'delete_request',
      {
        title: 'Delete Request',
        description: 'Delete a Bruno request file.',
        inputSchema: requestPathToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as { requestPath: string };
          await this.assertPathAllowed(args.requestPath, 'Request path');
          const result = await this.nativeManager.deleteRequest(args.requestPath);
          return result.success
            ? this.textResult(`Deleted request ${args.requestPath}`)
            : this.errorResult(`Failed to delete request: ${result.error}`);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('deleting request', error));
        }
      },
    );
  }

  private setupEnvironmentCrudTools(): void {
    this.server.registerTool(
      'list_environments',
      {
        title: 'List Environments',
        description: 'List collection-level Bruno environments.',
        inputSchema: { collectionPath: z.string().min(1, 'Collection path is required') },
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as { collectionPath: string };
          await this.assertPathAllowed(args.collectionPath, 'Collection path');
          const environments = await this.nativeManager.listEnvironments(args.collectionPath);
          return this.jsonResult({ collectionPath: args.collectionPath, environments });
        } catch (error) {
          return this.errorResult(this.getErrorMessage('listing environments', error));
        }
      },
    );

    this.server.registerTool(
      'get_environment',
      {
        title: 'Get Environment',
        description: 'Get a collection-level Bruno environment.',
        inputSchema: environmentPathToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as { collectionPath: string; environmentName: string };
          await this.assertPathAllowed(args.collectionPath, 'Collection path');
          const environment = await this.nativeManager.getEnvironment(
            args.collectionPath,
            args.environmentName,
          );
          return this.jsonResult({ environmentName: args.environmentName, variables: environment });
        } catch (error) {
          return this.errorResult(this.getErrorMessage('getting environment', error));
        }
      },
    );

    this.server.registerTool(
      'update_environment_vars',
      {
        title: 'Update Environment Variables',
        description: 'Set and unset variables on a collection-level environment.',
        inputSchema: updateEnvironmentToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as {
            collectionPath: string;
            environmentName: string;
            set?: Record<string, string | number | boolean>;
            unset?: string[];
          };
          await this.assertPathAllowed(args.collectionPath, 'Collection path');
          const result = await this.nativeManager.updateEnvironmentVariables(
            args.collectionPath,
            args.environmentName,
            args.set || {},
            args.unset || [],
          );
          return result.success
            ? this.textResult(`Updated environment ${args.environmentName}`)
            : this.errorResult(`Failed to update environment: ${result.error}`);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('updating environment', error));
        }
      },
    );

    this.server.registerTool(
      'delete_environment',
      {
        title: 'Delete Environment',
        description: 'Delete a collection-level Bruno environment.',
        inputSchema: environmentPathToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as { collectionPath: string; environmentName: string };
          await this.assertPathAllowed(args.collectionPath, 'Collection path');
          const result = await this.nativeManager.deleteEnvironment(
            args.collectionPath,
            args.environmentName,
          );
          return result.success
            ? this.textResult(`Deleted environment ${args.environmentName}`)
            : this.errorResult(`Failed to delete environment: ${result.error}`);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('deleting environment', error));
        }
      },
    );
  }

  private setupFeatureSliceTools(): void {
    this.server.registerTool(
      'inspect_feature_slice_context',
      {
        title: 'Inspect Feature Slice Context',
        description:
          'Inspect workspace and collection state, related requests, and missing Bruno-native coverage for a feature slice.',
        inputSchema: inspectFeatureSliceToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as {
            basePath?: string;
            collectionPath: string;
            featureName: string;
            workspacePath?: string;
          };
          await this.assertPathAllowed(args.collectionPath, 'Collection path');
          if (args.workspacePath) {
            await this.assertPathAllowed(args.workspacePath, 'Workspace path');
          }
          const result = await this.featureSliceManager.inspectContext(args);
          return this.jsonResult(result);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('inspecting feature slice context', error));
        }
      },
    );

    this.server.registerTool(
      'plan_feature_slice',
      {
        title: 'Plan Feature Slice',
        description:
          'Propose a deterministic feature slice structure, support requests, matrices, cleanup truth, and required inputs.',
        inputSchema: planFeatureSliceToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as {
            basePath?: string;
            collectionPath: string;
            convenienceMode?: boolean;
            featureName: string;
            featureType: FeatureSliceType;
            overlay?: string;
            sourceOfTruth?: string;
            strictMode?: boolean;
            targetResource?: string;
          };
          await this.assertPathAllowed(args.collectionPath, 'Collection path');
          const result = await this.featureSliceManager.planFeatureSlice(args);
          return this.jsonResult(result);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('planning feature slice', error));
        }
      },
    );

    this.server.registerTool(
      'scaffold_feature_slice',
      {
        title: 'Scaffold Feature Slice',
        description:
          'Create support folders, happy path/read/negative/security requests, strict matrix assets, docs, and findings scaffolding.',
        inputSchema: scaffoldFeatureSliceToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as {
            basePath?: string;
            collectionPath: string;
            convenienceMode?: boolean;
            dataPolicy?: DynamicDataPolicy;
            featureName: string;
            featureType: FeatureSliceType;
            includeMatrices?: boolean;
            includeSupportRequests?: boolean;
            overlay?: string;
            sourceOfTruth?: string;
            strictMode?: boolean;
            targetResource?: string;
          };
          await this.assertPathAllowed(args.collectionPath, 'Collection path');
          const result = await this.featureSliceManager.scaffoldFeatureSlice(args);
          return this.jsonResult(result);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('scaffolding feature slice', error));
        }
      },
    );

    this.server.registerTool(
      'scaffold_matrix_request',
      {
        title: 'Scaffold Matrix Request',
        description:
          'Create a strict matrix request and scenario file using base valid payload plus scenario deltas.',
        inputSchema: scaffoldMatrixRequestToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as {
            allowedDeltaPaths: string[];
            basePayload: Record<string, string | number | boolean | null>;
            category: 'negative' | 'security';
            collectionPath: string;
            requestFolder: string;
            requestName: string;
            requestUrl: string;
            requiredIterationFields: string[];
            scenarioDeltas: MatrixScenarioDelta[];
            sliceId: string;
            strictMode?: boolean;
          };
          await this.assertPathAllowed(args.collectionPath, 'Collection path');
          const result = await this.featureSliceManager.scaffoldMatrixRequest(args);
          return this.jsonResult(result);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('scaffolding matrix request', error));
        }
      },
    );

    this.server.registerTool(
      'scaffold_support_requests',
      {
        title: 'Scaffold Support Requests',
        description:
          'Create explicit auth, seed, resolve, lookup, or cleanup support requests for a feature slice.',
        inputSchema: scaffoldSupportRequestsToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as {
            collectionPath: string;
            featureName: string;
            strictMode?: boolean;
            supportKinds: SupportRequestRole[];
            targetResource?: string;
          };
          await this.assertPathAllowed(args.collectionPath, 'Collection path');
          const result = await this.featureSliceManager.scaffoldSupportRequests(args);
          return this.jsonResult(result);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('scaffolding support requests', error));
        }
      },
    );

    this.server.registerTool(
      'audit_feature_slice',
      {
        title: 'Audit Feature Slice',
        description:
          'Audit a feature slice for missing coverage, collection defects, product defects, and cleanup truth gaps.',
        inputSchema: auditFeatureSliceToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as {
            collectionPath: string;
            overlay?: string;
            sliceId: string;
            sourceOfTruth?: string;
          };
          await this.assertPathAllowed(args.collectionPath, 'Collection path');
          const result = await this.featureSliceManager.auditFeatureSlice(args);
          return this.jsonResult(result);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('auditing feature slice', error));
        }
      },
    );

    this.server.registerTool(
      'record_slice_findings',
      {
        title: 'Record Slice Findings',
        description:
          'Persist feature-slice findings into the slice manifest and documentation without weakening assertions.',
        inputSchema: recordSliceFindingsToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as {
            collectionPath: string;
            findings: SliceFinding[];
            sliceId: string;
            writeMode?: 'docs-only' | 'request-docs' | 'slice-manifest';
          };
          await this.assertPathAllowed(args.collectionPath, 'Collection path');
          for (const finding of args.findings) {
            if (finding.requestPath) {
              await this.assertPathAllowed(finding.requestPath, 'Finding request path');
            }
          }
          const result = await this.featureSliceManager.recordFindings(args);
          return this.jsonResult(result);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('recording slice findings', error));
        }
      },
    );

    this.server.registerTool(
      'refresh_generated_data',
      {
        title: 'Refresh Generated Data',
        description:
          'Generate fresh deterministic unique data for a feature slice using builtin or faker-backed MCP-side generation.',
        inputSchema: refreshGeneratedDataToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as {
            collectionPath: string;
            policy?: DynamicDataPolicy;
            sliceId: string;
          };
          await this.assertPathAllowed(args.collectionPath, 'Collection path');
          const result = await this.featureSliceManager.refreshGeneratedData(args);
          return this.jsonResult(result);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('refreshing generated data', error));
        }
      },
    );

    this.server.registerTool(
      'generate_feature_run_manifest',
      {
        title: 'Generate Feature Run Manifest',
        description:
          'Generate or refresh the ordered automation manifest for a feature slice, including phases, profiles, and cleanup metadata.',
        inputSchema: generateFeatureRunManifestToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as { collectionPath: string; sliceId: string };
          await this.assertPathAllowed(args.collectionPath, 'Collection path');
          const result = await this.featureSliceManager.generateRunManifest(
            args.collectionPath,
            args.sliceId,
          );
          return this.jsonResult(result);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('generating feature run manifest', error));
        }
      },
    );

    this.server.registerTool(
      'run_feature_slice',
      {
        title: 'Run Feature Slice',
        description:
          'Run a feature slice end to end using its generated manifest and aggregate setup, collection, product, and cleanup results truthfully.',
        inputSchema: runFeatureSliceToolSchema,
      },
      async (rawArgs) => {
        try {
          const args = rawArgs as RunFeatureSliceInput & { profile?: FeatureRunProfile };
          await this.assertPathAllowed(args.collectionPath, 'Collection path');
          if (args.workspacePath) {
            await this.assertPathAllowed(args.workspacePath, 'Workspace path');
          }
          const result = await this.featureSliceManager.runFeatureSlice(args);
          return this.jsonResult(result);
        } catch (error) {
          return this.errorResult(this.getErrorMessage('running feature slice', error));
        }
      },
    );
  }

  private setupResources(): void {
    this.server.registerResource(
      'bruno_capabilities',
      'bruno://capabilities',
      {
        description: 'High-level capabilities exposed by the Bruno MCP server.',
        mimeType: 'application/json',
        title: 'Bruno MCP Capabilities',
      },
      async (uri) =>
        this.jsonResource(uri.toString(), {
          features: {
            generations: [
              'classic collections',
              'REST',
              'GraphQL over HTTP',
              'binary uploads',
              'feature slice planning',
              'feature slice scaffolding',
              'strict matrices',
            ],
            metadata: [
              'workspace',
              'collection defaults',
              'folder defaults',
              'request CRUD',
              'environments',
              'slice findings',
              'cleanup truth',
            ],
            protocols: ['tools', 'resources', 'prompts', 'prompt completions'],
          },
        }),
    );

    this.server.registerResource(
      'bruno_workspace',
      new ResourceTemplate('bruno://workspace/{+workspacePath}', {
        complete: {
          workspacePath: async (value) => this.completeWorkspacePaths(String(value || '')),
        },
        list: undefined,
      }),
      {
        description: 'Read-only summary of a Bruno workspace.',
        mimeType: 'application/json',
        title: 'Bruno Workspace',
      },
      async (uri, variables) => {
        const workspacePath = this.getTemplateVariable(variables, 'workspacePath');
        await this.assertPathAllowed(workspacePath, 'Workspace path');
        const workspace = await this.workspaceManager.getWorkspaceSummary(workspacePath);
        return this.jsonResource(uri.toString(), workspace);
      },
    );

    this.server.registerResource(
      'bruno_collection',
      new ResourceTemplate('bruno://collection/{+collectionPath}', {
        complete: {
          collectionPath: async (value) => this.completeCollectionPaths(String(value || '')),
        },
        list: undefined,
      }),
      {
        description: 'Read-only summary of a Bruno collection defaults and structure.',
        mimeType: 'application/json',
        title: 'Bruno Collection',
      },
      async (uri, variables) => {
        const collectionPath = this.getTemplateVariable(variables, 'collectionPath');
        await this.assertPathAllowed(collectionPath, 'Collection path');
        const defaults = await this.nativeManager.getCollectionDefaults(collectionPath);
        const folders = await this.nativeManager.listFolders(collectionPath);
        const requests = await this.nativeManager.listRequests(collectionPath);
        return this.jsonResource(uri.toString(), {
          collectionPath,
          defaults,
          folders,
          requests,
        });
      },
    );

    this.server.registerResource(
      'bruno_slice',
      new ResourceTemplate('bruno://slice/{+collectionPath}/{sliceId}', {
        complete: {
          collectionPath: async (value) => this.completeCollectionPaths(String(value || '')),
          sliceId: async (value, context) => {
            const collectionPath = context?.arguments?.collectionPath;
            if (typeof collectionPath !== 'string' || collectionPath.length === 0) {
              return [];
            }
            return this.completeSliceIds(collectionPath, String(value || ''));
          },
        },
        list: undefined,
      }),
      {
        description: 'Read-only summary of a feature slice manifest and audit state.',
        mimeType: 'application/json',
        title: 'Bruno Feature Slice',
      },
      async (uri, variables) => {
        const collectionPath = this.getTemplateVariable(variables, 'collectionPath');
        const sliceId = this.getTemplateVariable(variables, 'sliceId');
        await this.assertPathAllowed(collectionPath, 'Collection path');
        const slice = await this.featureSliceManager.getSliceState(collectionPath, sliceId);
        return this.jsonResource(uri.toString(), slice);
      },
    );

    this.server.registerResource(
      'bruno_slice_run_manifest',
      new ResourceTemplate('bruno://slice-run-manifest/{+collectionPath}/{sliceId}', {
        complete: {
          collectionPath: async (value) => this.completeCollectionPaths(String(value || '')),
          sliceId: async (value, context) => {
            const collectionPath = context?.arguments?.collectionPath;
            if (typeof collectionPath !== 'string' || collectionPath.length === 0) {
              return [];
            }
            return this.completeSliceIds(collectionPath, String(value || ''));
          },
        },
        list: undefined,
      }),
      {
        description: 'Read-only ordered run manifest for a feature slice.',
        mimeType: 'application/json',
        title: 'Bruno Feature Slice Run Manifest',
      },
      async (uri, variables) => {
        const collectionPath = this.getTemplateVariable(variables, 'collectionPath');
        const sliceId = this.getTemplateVariable(variables, 'sliceId');
        await this.assertPathAllowed(collectionPath, 'Collection path');
        const manifest = await this.featureSliceManager.generateRunManifest(collectionPath, sliceId);
        return this.jsonResource(uri.toString(), manifest);
      },
    );

    this.server.registerResource(
      'bruno_request',
      new ResourceTemplate('bruno://request/{+requestPath}', {
        complete: {
          requestPath: async (value) => this.completeRequestPaths(String(value || '')),
        },
        list: undefined,
      }),
      {
        description: 'Read-only structured representation of a Bruno request file.',
        mimeType: 'application/json',
        title: 'Bruno Request',
      },
      async (uri, variables) => {
        const requestPath = this.getTemplateVariable(variables, 'requestPath');
        await this.assertPathAllowed(requestPath, 'Request path');
        const request = await this.nativeManager.getRequest(requestPath);
        return this.jsonResource(uri.toString(), request);
      },
    );

    this.server.registerResource(
      'bruno_environment',
      new ResourceTemplate('bruno://environment/{+collectionPath}/{environmentName}', {
        complete: {
          collectionPath: async (value) => this.completeCollectionPaths(String(value || '')),
          environmentName: async (_value, context) => {
            const collectionPath = context?.arguments?.collectionPath;
            return collectionPath ? this.completeEnvironmentNames(collectionPath, '') : [];
          },
        },
        list: undefined,
      }),
      {
        description: 'Read-only view of a collection-level Bruno environment.',
        mimeType: 'application/json',
        title: 'Bruno Environment',
      },
      async (uri, variables) => {
        const collectionPath = this.getTemplateVariable(variables, 'collectionPath');
        const environmentName = this.getTemplateVariable(variables, 'environmentName');
        await this.assertPathAllowed(collectionPath, 'Collection path');
        const environment = await this.nativeManager.getEnvironment(
          collectionPath,
          environmentName,
        );
        return this.jsonResource(uri.toString(), {
          collectionPath,
          environmentName,
          variables: environment,
        });
      },
    );
  }

  private setupPrompts(): void {
    this.server.registerPrompt(
      'build_feature_slice',
      {
        title: 'Build Feature Slice',
        description:
          'Create a prompt for building a Bruno feature slice with explicit support requests, strict matrices, cleanup truth, and findings.',
        argsSchema: {
          collectionPath: completable(z.string().min(1), async (value) =>
            this.completeCollectionPaths(String(value || '')),
          ),
          featureName: z.string().min(1),
          featureType: completable(z.string().min(1), async (value) =>
            this.completeStaticValues(String(value || ''), [...FEATURE_SLICE_TYPE_VALUES]),
          ),
          strictMode: z.boolean().optional(),
          overlay: completable(z.string().optional(), async (value) =>
            this.completeStaticValues(String(value || ''), [...FEATURE_SLICE_OVERLAY_VALUES]),
          ),
        },
      },
      async (args) => ({
        description: 'Prompt for building a Bruno feature slice end to end.',
        messages: [
          {
            content: {
              text: `Build a Bruno feature slice in collection \`${args.collectionPath}\` for feature \`${args.featureName}\`.

Feature type: \`${args.featureType}\`
Strict mode: \`${args.strictMode !== false}\`
Overlay: \`${args.overlay || 'none'}\`

Requirements:
- inspect workspace and collection state first
- identify missing Bruno-native coverage
- scaffold explicit support requests for auth, seed, resolve, and cleanup when needed
- use strict matrix mode with one stable valid request payload plus scenario deltas only
- generate truthful docs, tags, assertions, tests, defaults, and findings
- distinguish collection defects from product defects
- document cleanup truthfully with no fake passing or hidden skips`,
              type: 'text',
            },
            role: 'user',
          },
        ],
      }),
    );

    this.server.registerPrompt(
      'generate_rest_feature',
      {
        title: 'Generate REST Feature',
        description:
          'Create a reusable prompt for generating a high-coverage Bruno REST feature slice.',
        argsSchema: {
          collectionPath: completable(z.string().min(1), async (value) =>
            this.completeCollectionPaths(String(value || '')),
          ),
          featureName: z.string().min(1),
          featureStyle: completable(z.string().min(1), async (value) =>
            this.completeStaticValues(String(value || ''), [
              'resource-crud',
              'workflow',
              'auth',
              'search-filtering',
              'upload',
              'admin-resource',
            ]),
          ),
          sourceOfTruth: z.string().optional(),
        },
      },
      async (args) => ({
        description: 'Prompt for generating a Bruno REST feature slice.',
        messages: [
          {
            content: {
              text: `Create or extend a Bruno feature slice in collection \`${args.collectionPath}\` for feature \`${args.featureName}\`.

Style: \`${args.featureStyle}\`
Primary source of truth: \`${args.sourceOfTruth || 'controllers + DTOs + runtime behavior'}\`

Rules:
- prefer collection/folder defaults over repeated per-request setup
- create truthful assertions and tests; do not weaken expectations to match bugs
- use data-driven templates for create-heavy scenario matrices
- populate docs, tags, vars, settings, and assertions where they add real value
- keep scenarios outside the collection tree when that improves Bruno UX`,
              type: 'text',
            },
            role: 'user',
          },
        ],
      }),
    );

    this.server.registerPrompt(
      'audit_bruno_collection',
      {
        title: 'Audit Bruno Collection',
        description:
          'Create a prompt for auditing a Bruno collection for duplication, missing coverage, and broken Bruno-native patterns.',
        argsSchema: {
          collectionPath: completable(z.string().min(1), async (value) =>
            this.completeCollectionPaths(String(value || '')),
          ),
          focus: completable(z.string().min(1), async (value) =>
            this.completeStaticValues(String(value || ''), [
              'coverage',
              'duplication',
              'assertions',
              'workspace-structure',
              'data-driven-design',
            ]),
          ),
        },
      },
      async (args) => ({
        description: 'Prompt for auditing a Bruno collection.',
        messages: [
          {
            content: {
              text: `Audit the Bruno collection at \`${args.collectionPath}\` with focus \`${args.focus}\`.

Look for:
- request-level duplication that should be lifted to collection/folder defaults
- empty or missing assertions, tags, settings, docs, and vars tabs where they should be populated
- scenario-matrix gaps
- structure that is technically valid but poor Bruno UX
- places where tests should fail to reveal product bugs instead of normalizing defects`,
              type: 'text',
            },
            role: 'user',
          },
        ],
      }),
    );

    this.server.registerPrompt(
      'normalize_bruno_collection',
      {
        title: 'Normalize Bruno Collection',
        description:
          'Create a prompt for refactoring a Bruno collection toward workspace-native reuse and lower duplication.',
        argsSchema: {
          collectionPath: completable(z.string().min(1), async (value) =>
            this.completeCollectionPaths(String(value || '')),
          ),
          objective: completable(z.string().min(1), async (value) =>
            this.completeStaticValues(String(value || ''), [
              'lift-folder-defaults',
              'lift-collection-defaults',
              'reduce-auth-duplication',
              'normalize-scenarios',
              'prepare-for-packaging',
            ]),
          ),
        },
      },
      async (args) => ({
        description: 'Prompt for normalizing a Bruno collection.',
        messages: [
          {
            content: {
              text: `Refactor the Bruno collection at \`${args.collectionPath}\` with objective \`${args.objective}\`.

Prefer:
- collection/folder defaults for shared headers, auth, scripts, vars, tests, and docs
- request-specific logic only where it is truly request-specific
- data-driven request templates over many nearly-identical requests
- tags and docs that make bugs and intent visible in Bruno UI`,
              type: 'text',
            },
            role: 'user',
          },
        ],
      }),
    );
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error('Bruno MCP Server started successfully!');
    console.error('Ready to generate Bruno API testing files.');
  }

  /**
   * Convert raw MCP args into a request input.
   */
  private toCreateRequestInput(args: {
    collectionPath: string;
    name: string;
    method: HttpMethod;
    url: string;
    headers?: Record<string, string>;
    body?: {
      type: BodyType;
      content?: string;
      contentType?: string;
      filePath?: string;
      variables?: string;
      formData?: Array<{ name: string; value: string; type?: 'text' | 'file' }>;
      formUrlEncoded?: Array<{ name: string; value: string }>;
    };
    auth?: {
      type: AuthType;
      config: Record<string, string>;
    };
    query?: Record<string, string | number | boolean>;
    folder?: string;
    sequence?: number;
    script?: {
      'pre-request'?: string[];
      'post-response'?: string[];
    };
    tests?: string[];
  }): CreateRequestInput {
    return {
      collectionPath: args.collectionPath,
      name: args.name,
      method: args.method,
      url: args.url,
      headers: args.headers,
      body: args.body
        ? {
            type: args.body.type,
            content: args.body.content,
            contentType: args.body.contentType,
            filePath: args.body.filePath,
            variables: args.body.variables,
            formData: args.body.formData,
            formUrlEncoded: args.body.formUrlEncoded,
          }
        : undefined,
      auth: args.auth
        ? {
            type: args.auth.type,
            config: args.auth.config,
          }
        : undefined,
      query: args.query,
      folder: args.folder,
      sequence: args.sequence,
      script: args.script,
      tests: args.tests,
    };
  }

  /**
   * Prepare suite requests with dependency-aware ordering and runtime variable extraction.
   */
  private prepareSuiteRequests(args: CreateTestSuiteInput): CreateRequestInput[] {
    const preparedRequests = new Map<string, CreateRequestInput>();

    for (const request of args.requests) {
      if (preparedRequests.has(request.name)) {
        throw new Error(`Duplicate request name in suite: ${request.name}`);
      }

      preparedRequests.set(
        request.name,
        this.toCreateRequestInput({
          collectionPath: args.collectionPath,
          ...request,
          folder: request.folder || args.suiteName,
        }),
      );
    }

    for (const dependency of args.dependencies ?? []) {
      const sourceRequest = preparedRequests.get(dependency.from);
      const targetRequest = preparedRequests.get(dependency.to);

      if (!sourceRequest) {
        throw new Error(`Unknown dependency source request: ${dependency.from}`);
      }

      if (!targetRequest) {
        throw new Error(`Unknown dependency target request: ${dependency.to}`);
      }

      const expression = this.buildDependencyExpression(
        dependency.sourcePath || dependency.variable,
      );
      const generatedLine = `bru.setVar('${dependency.variable}', ${expression});`;
      const existingLines = sourceRequest.script?.['post-response'] || [];

      sourceRequest.script = {
        ...sourceRequest.script,
        'post-response': existingLines.includes(generatedLine)
          ? existingLines
          : [...existingLines, generatedLine],
      };
    }

    return this.orderSuiteRequests(preparedRequests, args.dependencies ?? []);
  }

  /**
   * Build a Bruno runtime variable extraction expression from a response path.
   */
  private buildDependencyExpression(sourcePath: string): string {
    return sourcePath
      .split('.')
      .filter((segment) => segment.length > 0)
      .reduce((expression, segment) => {
        if (/^\d+$/.test(segment)) {
          return `${expression}?.[${segment}]`;
        }

        if (/^[A-Za-z_$][\w$]*$/.test(segment)) {
          return `${expression}?.${segment}`;
        }

        return `${expression}?.[${JSON.stringify(segment)}]`;
      }, 'res.getBody()');
  }

  private async getAllowedRootPaths(): Promise<string[] | undefined> {
    const now = Date.now();
    if (this.rootCache && now - this.rootCache.timestamp < 1000) {
      return this.rootCache.paths;
    }

    try {
      const result = await this.server.server.listRoots();
      const paths = result.roots
        .map((root) => {
          try {
            return fileURLToPath(root.uri);
          } catch {
            return undefined;
          }
        })
        .filter((path): path is string => Boolean(path))
        .map((path) => resolve(path));

      this.rootCache = { paths, timestamp: now };
      return paths;
    } catch {
      return undefined;
    }
  }

  private async assertPathAllowed(path: string, description: string): Promise<void> {
    const allowedRoots = await this.getAllowedRootPaths();
    if (!allowedRoots) {
      return;
    }

    const resolvedPath = resolve(path);
    const isAllowed = allowedRoots.some((rootPath) => {
      const relativePath = resolve(path).startsWith(rootPath)
        ? resolvedPath.slice(rootPath.length)
        : undefined;

      return (
        resolvedPath === rootPath ||
        (relativePath !== undefined && (relativePath === '' || relativePath.startsWith('/')))
      );
    });

    if (!isAllowed) {
      throw new Error(`${description} ${resolvedPath} is outside allowed roots`);
    }
  }

  private async confirmRecursiveDelete(folderPath: string) {
    try {
      const result = await this.server.server.elicitInput({
        message: `Folder ${folderPath} is not empty. Delete it recursively?`,
        mode: 'form',
        requestedSchema: {
          type: 'object',
          properties: {
            deleteContents: {
              type: 'boolean',
              title: 'Delete folder contents',
              description: 'Delete the folder and all nested requests/subfolders.',
              default: true,
            },
          },
          required: ['deleteContents'],
        },
      });

      return result.action === 'accept' && result.content?.deleteContents === true;
    } catch {
      return false;
    }
  }

  private async logMessage(
    level: 'alert' | 'critical' | 'debug' | 'emergency' | 'error' | 'info' | 'notice' | 'warning',
    message: string,
    data: unknown,
  ): Promise<void> {
    try {
      await this.server.sendLoggingMessage({
        data: {
          message,
          ...(typeof data === 'object' && data ? (data as Record<string, unknown>) : { data }),
        },
        level,
        logger: 'bruno-mcp',
      });
    } catch {
      // Logging is best-effort only.
    }
  }

  private async sendProgress(
    extra: {
      _meta?: { progressToken?: number | string };
      sendNotification?: (notification: never) => Promise<void>;
    },
    progress: number,
    message: string,
    total = 1,
  ): Promise<void> {
    const progressToken = extra._meta?.progressToken;
    if (progressToken === undefined || !extra.sendNotification) {
      return;
    }

    await extra.sendNotification({
      method: 'notifications/progress',
      params: {
        message,
        progress,
        progressToken,
        total,
      },
    } as never);
  }

  private async filterPathsByRoots(paths: string[]): Promise<string[]> {
    const allowedRoots = await this.getAllowedRootPaths();
    if (!allowedRoots) {
      return paths;
    }

    return paths.filter((path) =>
      allowedRoots.some((rootPath) => path === rootPath || path.startsWith(`${rootPath}/`)),
    );
  }

  private async completeWorkspacePaths(prefix: string): Promise<string[]> {
    return this.completeFilesystemPaths(prefix, async (candidatePath) =>
      this.pathExists(join(candidatePath, 'workspace.yml')),
    );
  }

  private async completeCollectionPaths(prefix: string): Promise<string[]> {
    return this.completeFilesystemPaths(prefix, async (candidatePath) => {
      return (
        (await this.pathExists(join(candidatePath, 'bruno.json'))) ||
        (await this.pathExists(join(candidatePath, 'collection.bru'))) ||
        (await this.pathExists(join(candidatePath, 'opencollection.yml')))
      );
    });
  }

  private async completeRequestPaths(prefix: string): Promise<string[]> {
    return this.completeFilesystemPaths(prefix, async (candidatePath) => {
      const extension = extname(candidatePath).toLowerCase();
      if (!['.bru', '.yml'].includes(extension)) {
        return false;
      }

      const fileName = basename(candidatePath);
      return ![
        'collection.bru',
        'folder.bru',
        'opencollection.yml',
        'folder.yml',
        'workspace.yml',
      ].includes(fileName);
    });
  }

  private async completeEnvironmentNames(
    collectionPath: string,
    prefix: string,
  ): Promise<string[]> {
    try {
      const environments = await this.nativeManager.listEnvironments(collectionPath);
      return environments.filter((name) => name.toLowerCase().startsWith(prefix.toLowerCase()));
    } catch {
      return [];
    }
  }

  private async completeSliceIds(collectionPath: string, prefix: string): Promise<string[]> {
    try {
      const slicesRoot = join(resolve(collectionPath), '.bruno-mcp', 'feature-slices');
      const entries = await fs.readdir(slicesRoot, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => name.toLowerCase().startsWith(prefix.toLowerCase()))
        .toSorted()
        .slice(0, 50);
    } catch {
      return [];
    }
  }

  private completeStaticValues(prefix: string, values: string[]): string[] {
    return values.filter((value) => value.toLowerCase().startsWith(prefix.toLowerCase()));
  }

  private async completeFilesystemPaths(
    prefix: string,
    predicate: (candidatePath: string) => Promise<boolean>,
  ): Promise<string[]> {
    const normalizedPrefix = prefix.trim();
    const resolvedPrefix =
      normalizedPrefix.length === 0 ? process.cwd() : resolve(normalizedPrefix);
    const parentPath = await this.resolveCompletionParentPath(resolvedPrefix);
    const partialName = this.getCompletionPartialName(normalizedPrefix, resolvedPrefix, parentPath);

    try {
      const entries = await fs.readdir(parentPath, { withFileTypes: true });
      const matches: string[] = [];

      for (const entry of entries) {
        if (!entry.name.toLowerCase().startsWith(partialName.toLowerCase())) {
          continue;
        }

        const candidatePath = join(parentPath, entry.name);
        if (!(await predicate(candidatePath))) {
          continue;
        }

        matches.push(candidatePath);
      }

      return (await this.filterPathsByRoots(matches)).toSorted().slice(0, 50);
    } catch {
      return [];
    }
  }

  private async resolveCompletionParentPath(resolvedPrefix: string): Promise<string> {
    try {
      const stats = await fs.stat(resolvedPrefix);
      return stats.isDirectory() ? resolvedPrefix : dirname(resolvedPrefix);
    } catch {
      return dirname(resolvedPrefix);
    }
  }

  private getCompletionPartialName(
    originalPrefix: string,
    resolvedPrefix: string,
    parentPath: string,
  ): string {
    if (originalPrefix.trim().length === 0) {
      return '';
    }

    return parentPath === resolvedPrefix ? '' : basename(resolvedPrefix);
  }

  private getTemplateVariable(variables: Record<string, unknown>, key: string): string {
    const value = variables[key];
    if (Array.isArray(value)) {
      return decodeURIComponent(String(value[0] || ''));
    }
    return decodeURIComponent(String(value || ''));
  }

  private jsonResource(uri: string, value: unknown) {
    return {
      contents: [
        {
          mimeType: 'application/json',
          text: JSON.stringify(value, null, 2),
          uri,
        },
      ],
    };
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  private toDefaultsPatch(args: Record<string, unknown>) {
    return {
      auth: args.auth as { config?: Record<string, string>; type: AuthType } | undefined,
      docs: args.docs as string | undefined,
      headers: args.headers as Record<string, string> | undefined,
      postResponseScript: args.postResponseScript as string | undefined,
      postResponseVars: args.postResponseVars as
        | Record<string, string | number | boolean>
        | undefined,
      preRequestScript: args.preRequestScript as string | undefined,
      preRequestVars: args.preRequestVars as Record<string, string | number | boolean> | undefined,
      tests: args.tests as string | undefined,
      unsetHeaders: args.unsetHeaders as string[] | undefined,
      unsetPostResponseVars: args.unsetPostResponseVars as string[] | undefined,
      unsetPreRequestVars: args.unsetPreRequestVars as string[] | undefined,
    };
  }

  private toRequestPatch(args: Record<string, unknown>) {
    return {
      ...this.toDefaultsPatch(args),
      assertions: args.assertions as
        | Array<{ enabled?: boolean; name: string; value: string }>
        | undefined,
      auth: args.auth as { config?: Record<string, string>; type: AuthType } | undefined,
      body: args.body as
        | {
            content?: string;
            contentType?: string;
            filePath?: string;
            formData?: Array<{ name: string; type?: 'text' | 'file'; value: string }>;
            formUrlEncoded?: Array<{ name: string; value: string }>;
            type: BodyType;
            variables?: string;
          }
        | undefined,
      method: args.method as HttpMethod | undefined,
      name: args.name as string | undefined,
      query: args.query as Record<string, string | number | boolean> | undefined,
      sequence: args.sequence as number | undefined,
      settings: args.settings as Record<string, boolean | number | string | null> | undefined,
      tags: args.tags as string[] | undefined,
      unsetQuery: args.unsetQuery as string[] | undefined,
      url: args.url as string | undefined,
    };
  }

  private hasRequestMetadataPatch(patch: ReturnType<BrunoMcpServer['toRequestPatch']>): boolean {
    return Boolean(
      patch.assertions !== undefined ||
      patch.auth !== undefined ||
      patch.body !== undefined ||
      patch.docs !== undefined ||
      patch.headers !== undefined ||
      patch.method !== undefined ||
      patch.name !== undefined ||
      patch.postResponseScript !== undefined ||
      patch.postResponseVars !== undefined ||
      patch.preRequestScript !== undefined ||
      patch.preRequestVars !== undefined ||
      patch.query !== undefined ||
      patch.sequence !== undefined ||
      patch.settings !== undefined ||
      patch.tags !== undefined ||
      patch.tests !== undefined ||
      patch.unsetHeaders !== undefined ||
      patch.unsetPostResponseVars !== undefined ||
      patch.unsetPreRequestVars !== undefined ||
      patch.unsetQuery !== undefined ||
      patch.url !== undefined,
    );
  }

  private jsonResult(value: unknown) {
    return this.textResult(JSON.stringify(value, null, 2));
  }

  private basename(value: string): string {
    return value.split('/').pop()?.split('\\').pop() || value;
  }

  /**
   * Order suite requests so dependency sources run before their targets.
   */
  private orderSuiteRequests(
    requests: Map<string, CreateRequestInput>,
    dependencies: NonNullable<CreateTestSuiteInput['dependencies']>,
  ): CreateRequestInput[] {
    const requestNames = [...requests.keys()];
    const indexByName = new Map(requestNames.map((name, index) => [name, index]));
    const outgoing = new Map(requestNames.map((name) => [name, [] as string[]]));
    const indegree = new Map(requestNames.map((name) => [name, 0]));

    for (const dependency of dependencies) {
      outgoing.get(dependency.from)?.push(dependency.to);
      indegree.set(dependency.to, (indegree.get(dependency.to) || 0) + 1);
    }

    const ready = requestNames.filter((name) => (indegree.get(name) || 0) === 0);
    const orderedNames: string[] = [];

    while (ready.length > 0) {
      ready.sort((left, right) => (indexByName.get(left) || 0) - (indexByName.get(right) || 0));
      const current = ready.shift();

      if (!current) {
        break;
      }

      orderedNames.push(current);

      for (const target of outgoing.get(current) || []) {
        const nextIndegree = (indegree.get(target) || 0) - 1;
        indegree.set(target, nextIndegree);
        if (nextIndegree === 0) {
          ready.push(target);
        }
      }
    }

    if (orderedNames.length !== requestNames.length) {
      throw new Error('Suite dependencies contain a cycle and cannot be ordered');
    }

    return orderedNames.map((name, index) => ({
      ...requests.get(name)!,
      sequence: index + 1,
    }));
  }

  private textResult(text: string) {
    return {
      content: [
        {
          type: 'text' as const,
          text,
        },
      ],
    };
  }

  private errorResult(text: string) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${text}`,
        },
      ],
      isError: true,
    };
  }

  private getErrorMessage(action: string, error: unknown): string {
    return error instanceof Error ? `Error ${action}: ${error.message}` : `Unknown error ${action}`;
  }
}

/**
 * Create and export server instance
 */
export function createBrunoMcpServer(): BrunoMcpServer {
  return new BrunoMcpServer();
}
