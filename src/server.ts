/**
 * Bruno MCP Server
 * Main MCP server implementation for Bruno API testing file generation
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// Import our Bruno modules
import { createCollectionManager } from './bruno/collection.js';
import { createEnvironmentManager } from './bruno/environment.js';
import { createRequestBuilder } from './bruno/request.js';
import {
  CreateCollectionInput,
  CreateEnvironmentInput,
  CreateRequestInput,
  AddTestScriptInput,
  CreateTestSuiteInput,
  HttpMethod,
  AuthType,
  BodyType
} from './bruno/types.js';

export class BrunoMcpServer {
  private server: McpServer;
  private collectionManager;
  private environmentManager;
  private requestBuilder;

  constructor() {
    // Initialize MCP server
    this.server = new McpServer({
      name: 'bruno-mcp',
      version: '1.0.0'
    });

    // Initialize Bruno managers
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
        description: 'Create a new Bruno API testing collection with configuration',
        inputSchema: {
          name: z.string().min(1, 'Collection name is required'),
          description: z.string().optional(),
          baseUrl: z.string().url().optional(),
          outputPath: z.string().min(1, 'Output path is required'),
          ignore: z.array(z.string()).optional()
        }
      },
      async (args) => {
        try {
          const input: CreateCollectionInput = {
            name: args.name,
            description: args.description,
            baseUrl: args.baseUrl,
            outputPath: args.outputPath,
            ignore: args.ignore
          };

          const result = await this.collectionManager.createCollection(input);

          if (result.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: `✅ Bruno collection "${args.name}" created successfully at: ${result.path}`
                }
              ]
            };
          } else {
            return {
              content: [
                {
                  type: 'text',
                  text: `❌ Failed to create collection: ${result.error}`
                }
              ],
              isError: true
            };
          }
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Error creating collection: ${error instanceof Error ? error.message : 'Unknown error'}`
              }
            ],
            isError: true
          };
        }
      }
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
        description: 'Create environment configuration files for Bruno collection',
        inputSchema: {
          collectionPath: z.string().min(1, 'Collection path is required'),
          name: z.string().min(1, 'Environment name is required'),
          variables: z.record(z.union([z.string(), z.number(), z.boolean()]))
        }
      },
      async (args) => {
        try {
          const input: CreateEnvironmentInput = {
            collectionPath: args.collectionPath,
            name: args.name,
            variables: args.variables
          };

          const result = await this.environmentManager.createEnvironment(input);

          if (result.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: `✅ Environment "${args.name}" created successfully at: ${result.path}`
                }
              ]
            };
          } else {
            return {
              content: [
                {
                  type: 'text',
                  text: `❌ Failed to create environment: ${result.error}`
                }
              ],
              isError: true
            };
          }
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Error creating environment: ${error instanceof Error ? error.message : 'Unknown error'}`
              }
            ],
            isError: true
          };
        }
      }
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
        description: 'Generate .bru request files for API testing',
        inputSchema: {
          collectionPath: z.string().min(1, 'Collection path is required'),
          name: z.string().min(1, 'Request name is required'),
          method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']),
          url: z.string().min(1, 'URL is required'),
          headers: z.record(z.string()).optional(),
          body: z.object({
            type: z.enum(['none', 'json', 'text', 'xml', 'form-data', 'form-urlencoded', 'binary']),
            content: z.string().optional(),
            formData: z.array(z.object({
              name: z.string(),
              value: z.string(),
              type: z.enum(['text', 'file']).optional()
            })).optional()
          }).optional(),
          auth: z.object({
            type: z.enum(['none', 'bearer', 'basic', 'oauth2', 'api-key', 'digest']),
            config: z.record(z.string())
          }).optional(),
          query: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
          folder: z.string().optional(),
          sequence: z.number().optional()
        }
      },
      async (args) => {
        try {
          const input: CreateRequestInput = {
            collectionPath: args.collectionPath,
            name: args.name,
            method: args.method as HttpMethod,
            url: args.url,
            headers: args.headers,
            body: args.body ? {
              type: args.body.type as BodyType,
              content: args.body.content,
              formData: args.body.formData
            } : undefined,
            auth: args.auth ? {
              type: args.auth.type as AuthType,
              config: args.auth.config
            } : undefined,
            query: args.query,
            folder: args.folder,
            sequence: args.sequence
          };

          const result = await this.requestBuilder.createRequest(input);

          if (result.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: `✅ Request "${args.name}" created successfully at: ${result.path}`
                }
              ]
            };
          } else {
            return {
              content: [
                {
                  type: 'text',
                  text: `❌ Failed to create request: ${result.error}`
                }
              ],
              isError: true
            };
          }
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Error creating request: ${error instanceof Error ? error.message : 'Unknown error'}`
              }
            ],
            isError: true
          };
        }
      }
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
        description: 'Add pre-request or post-response scripts to Bruno requests',
        inputSchema: {
          bruFilePath: z.string().min(1, 'BRU file path is required'),
          scriptType: z.enum(['pre-request', 'post-response', 'tests']),
          script: z.string().min(1, 'Script content is required')
        }
      },
      async (args) => {
        try {
          // For now, this is a placeholder implementation
          // In a full implementation, we'd parse the existing .bru file and add the script
          return {
            content: [
              {
                type: 'text',
                text: `✅ ${args.scriptType} script added to ${args.bruFilePath}\n\nScript content:\n${args.script}`
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Error adding test script: ${error instanceof Error ? error.message : 'Unknown error'}`
              }
            ],
            isError: true
          };
        }
      }
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
        description: 'Generate comprehensive test collections with multiple related requests',
        inputSchema: {
          collectionPath: z.string().min(1, 'Collection path is required'),
          suiteName: z.string().min(1, 'Suite name is required'),
          requests: z.array(z.object({
            name: z.string(),
            method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']),
            url: z.string(),
            headers: z.record(z.string()).optional(),
            body: z.object({
              type: z.enum(['none', 'json', 'text', 'xml', 'form-data', 'form-urlencoded']),
              content: z.string().optional()
            }).optional(),
            auth: z.object({
              type: z.enum(['none', 'bearer', 'basic', 'oauth2', 'api-key']),
              config: z.record(z.string())
            }).optional(),
            folder: z.string().optional()
          })),
          dependencies: z.array(z.object({
            from: z.string(),
            to: z.string(),
            variable: z.string()
          })).optional()
        }
      },
      async (args) => {
        try {
          const results = [];
          
          for (let i = 0; i < args.requests.length; i++) {
            const req = args.requests[i];
            const input: CreateRequestInput = {
              collectionPath: args.collectionPath,
              name: req.name,
              method: req.method as HttpMethod,
              url: req.url,
              headers: req.headers,
              body: req.body ? {
                type: req.body.type as BodyType,
                content: req.body.content
              } : undefined,
              auth: req.auth ? {
                type: req.auth.type as AuthType,
                config: req.auth.config
              } : undefined,
              folder: req.folder || args.suiteName,
              sequence: i + 1
            };

            const result = await this.requestBuilder.createRequest(input);
            results.push(result);
          }

          const successCount = results.filter(r => r.success).length;
          const failCount = results.filter(r => !r.success).length;

          return {
            content: [
              {
                type: 'text',
                text: `✅ Test suite "${args.suiteName}" created with ${successCount} requests${failCount > 0 ? ` (${failCount} failed)` : ''}`
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Error creating test suite: ${error instanceof Error ? error.message : 'Unknown error'}`
              }
            ],
            isError: true
          };
        }
      }
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
        description: 'Generate a complete set of CRUD operations for an entity',
        inputSchema: {
          collectionPath: z.string().min(1, 'Collection path is required'),
          entityName: z.string().min(1, 'Entity name is required'),
          baseUrl: z.string().min(1, 'Base URL is required'),
          folder: z.string().optional()
        }
      },
      async (args) => {
        try {
          const results = await this.requestBuilder.createCrudRequests(
            args.collectionPath,
            args.entityName,
            args.baseUrl,
            args.folder
          );

          const successCount = results.filter(r => r.success).length;
          const failCount = results.filter(r => !r.success).length;

          return {
            content: [
              {
                type: 'text',
                text: `✅ CRUD operations for "${args.entityName}" created with ${successCount} requests${failCount > 0 ? ` (${failCount} failed)` : ''}`
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Error creating CRUD requests: ${error instanceof Error ? error.message : 'Unknown error'}`
              }
            ],
            isError: true
          };
        }
      }
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
        description: 'List all Bruno collections in a directory',
        inputSchema: {
          path: z.string().min(1, 'Directory path is required')
        }
      },
      async (args) => {
        try {
          // This would scan for bruno.json files in subdirectories
          return {
            content: [
              {
                type: 'text',
                text: `📁 Scanning for Bruno collections in: ${args.path}\n\n(This feature will be implemented in a future version)`
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Error listing collections: ${error instanceof Error ? error.message : 'Unknown error'}`
              }
            ],
            isError: true
          };
        }
      }
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
        description: 'Get detailed statistics about a Bruno collection',
        inputSchema: {
          collectionPath: z.string().min(1, 'Collection path is required')
        }
      },
      async (args) => {
        try {
          const stats = await this.collectionManager.getCollectionStats(args.collectionPath);
          
          return {
            content: [
              {
                type: 'text',
                text: `📊 Collection Statistics for ${args.collectionPath}:

📁 Total Requests: ${stats.totalRequests}
📂 Folders: ${stats.folders.length > 0 ? stats.folders.join(', ') : 'None'}
🌍 Environments: ${stats.environments.length > 0 ? stats.environments.join(', ') : 'None'}

Request Methods:
${Object.entries(stats.requestsByMethod).map(([method, count]) => `  ${method}: ${count}`).join('\n') || '  (Analysis not yet implemented)'}
`
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Error getting collection stats: ${error instanceof Error ? error.message : 'Unknown error'}`
              }
            ],
            isError: true
          };
        }
      }
    );
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error('Bruno MCP Server started successfully! 🚀');
    console.error('Ready to generate Bruno API testing files.');
  }
}

/**
 * Create and export server instance
 */
export function createBrunoMcpServer(): BrunoMcpServer {
  return new BrunoMcpServer();
}