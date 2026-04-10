/**
 * Bruno MCP Server
 * Main MCP server implementation for Bruno API testing file generation
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { createCollectionManager } from './bruno/collection.js';
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

export class BrunoMcpServer {
  private server: McpServer;
  private collectionManager;
  private nativeManager;
  private requestBuilder;
  private workspaceManager;

  constructor() {
    this.server = new McpServer({
      name: 'bruno-mcp',
      version: '1.0.0',
    });

    this.collectionManager = createCollectionManager();
    this.nativeManager = createBrunoNativeManager();
    this.requestBuilder = createRequestBuilder();
    this.workspaceManager = createWorkspaceManager();

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
          };

          const result = await this.requestBuilder.createRequest(this.toCreateRequestInput(args));

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
          const result = await this.nativeManager.deleteFolder(
            args.collectionPath,
            args.folderPath,
            args.deleteContents,
          );
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
      async (rawArgs) => {
        try {
          const args = rawArgs as { collectionPath: string };
          const requests = await this.nativeManager.listRequests(args.collectionPath);
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
      unsetQuery: args.unsetQuery as string[] | undefined,
      url: args.url as string | undefined,
    };
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
