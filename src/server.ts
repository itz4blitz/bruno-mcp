/**
 * Bruno MCP Server
 * Main MCP server implementation for Bruno API testing file generation
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { createCollectionManager } from './bruno/collection.js';
import { createEnvironmentManager } from './bruno/environment.js';
import { createRequestBuilder } from './bruno/request.js';
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

export class BrunoMcpServer {
  private server: McpServer;
  private collectionManager;
  private environmentManager;
  private requestBuilder;

  constructor() {
    this.server = new McpServer({
      name: 'bruno-mcp',
      version: '1.0.0',
    });

    this.collectionManager = createCollectionManager();
    this.environmentManager = createEnvironmentManager();
    this.requestBuilder = createRequestBuilder();

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
          const result = await this.environmentManager.createEnvironment(args);

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
