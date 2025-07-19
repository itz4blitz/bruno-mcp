/**
 * Bruno request builder
 * Handles creation and management of .bru request files
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import {
  BruFile,
  CreateRequestInput,
  FileOperationResult,
  BrunoError,
  BruFileError,
  HttpMethod,
  AuthType,
  BodyType
} from './types.js';
import { generateBruFile } from './generator.js';

export class RequestBuilder {

  /**
   * Create a new .bru request file
   */
  async createRequest(input: CreateRequestInput): Promise<FileOperationResult> {
    try {
      // Validate input
      this.validateRequestInput(input);

      // Build BRU file structure
      const bruFile = this.buildBruFile(input);

      // Determine file path
      const filePath = this.getRequestFilePath(input);

      // Ensure directory exists
      await this.ensureDirectory(dirname(filePath));

      // Generate and write BRU file
      const bruContent = generateBruFile(bruFile);
      await fs.writeFile(filePath, bruContent);

      return {
        success: true,
        path: filePath
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Load an existing .bru request file
   */
  async loadRequest(filePath: string): Promise<BruFile> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.parseBruFile(content);

    } catch (error) {
      throw new BruFileError(
        `Failed to load request from ${filePath}`,
        { originalError: error }
      );
    }
  }

  /**
   * Update an existing request
   */
  async updateRequest(filePath: string, updates: Partial<CreateRequestInput>): Promise<FileOperationResult> {
    try {
      // Load existing request
      const existingBru = await this.loadRequest(filePath);

      // Apply updates
      const updatedBru = this.applyUpdates(existingBru, updates);

      // Generate and write updated content
      const bruContent = generateBruFile(updatedBru);
      await fs.writeFile(filePath, bruContent);

      return {
        success: true,
        path: filePath
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Create multiple related requests (CRUD operations)
   */
  async createCrudRequests(
    collectionPath: string,
    entityName: string,
    baseUrl: string,
    folder?: string
  ): Promise<FileOperationResult[]> {
    const results: FileOperationResult[] = [];

    const crudOperations = [
      {
        name: `Get All ${entityName}`,
        method: 'GET' as HttpMethod,
        url: `${baseUrl}/${entityName.toLowerCase()}`,
        sequence: 1
      },
      {
        name: `Get ${entityName} by ID`,
        method: 'GET' as HttpMethod,
        url: `${baseUrl}/${entityName.toLowerCase()}/{{id}}`,
        sequence: 2
      },
      {
        name: `Create ${entityName}`,
        method: 'POST' as HttpMethod,
        url: `${baseUrl}/${entityName.toLowerCase()}`,
        body: {
          type: 'json' as BodyType,
          content: JSON.stringify({
            name: `New ${entityName}`,
            description: `Description for ${entityName}`
          }, null, 2)
        },
        headers: {
          'Content-Type': 'application/json'
        },
        sequence: 3
      },
      {
        name: `Update ${entityName}`,
        method: 'PUT' as HttpMethod,
        url: `${baseUrl}/${entityName.toLowerCase()}/{{id}}`,
        body: {
          type: 'json' as BodyType,
          content: JSON.stringify({
            name: `Updated ${entityName}`,
            description: `Updated description for ${entityName}`
          }, null, 2)
        },
        headers: {
          'Content-Type': 'application/json'
        },
        sequence: 4
      },
      {
        name: `Delete ${entityName}`,
        method: 'DELETE' as HttpMethod,
        url: `${baseUrl}/${entityName.toLowerCase()}/{{id}}`,
        sequence: 5
      }
    ];

    for (const operation of crudOperations) {
      const result = await this.createRequest({
        collectionPath,
        ...operation,
        folder
      });
      results.push(result);
    }

    return results;
  }

  /**
   * Create authentication test requests
   */
  async createAuthRequests(
    collectionPath: string,
    baseUrl: string,
    authType: AuthType,
    folder = 'auth'
  ): Promise<FileOperationResult[]> {
    const results: FileOperationResult[] = [];

    const authRequests = [
      {
        name: 'Login',
        method: 'POST' as HttpMethod,
        url: `${baseUrl}/auth/login`,
        body: {
          type: 'json' as BodyType,
          content: JSON.stringify({
            username: '{{username}}',
            password: '{{password}}'
          }, null, 2)
        },
        headers: {
          'Content-Type': 'application/json'
        },
        sequence: 1
      },
      {
        name: 'Get Profile',
        method: 'GET' as HttpMethod,
        url: `${baseUrl}/auth/profile`,
        auth: authType !== 'none' ? {
          type: authType,
          config: authType === 'bearer' ? { token: '{{token}}' } : { username: '{{username}}', password: '{{password}}' }
        } as { type: AuthType; config: Record<string, string> } : undefined,
        sequence: 2
      },
      {
        name: 'Refresh Token',
        method: 'POST' as HttpMethod,
        url: `${baseUrl}/auth/refresh`,
        body: {
          type: 'json' as BodyType,
          content: JSON.stringify({
            refreshToken: '{{refreshToken}}'
          }, null, 2)
        },
        headers: {
          'Content-Type': 'application/json'
        },
        sequence: 3
      },
      {
        name: 'Logout',
        method: 'POST' as HttpMethod,
        url: `${baseUrl}/auth/logout`,
        auth: authType !== 'none' ? {
          type: authType,
          config: authType === 'bearer' ? { token: '{{token}}' } : { username: '{{username}}', password: '{{password}}' }
        } as { type: AuthType; config: Record<string, string> } : undefined,
        sequence: 4
      }
    ];

    for (const authRequest of authRequests) {
      const result = await this.createRequest({
        collectionPath,
        ...authRequest,
        folder
      });
      results.push(result);
    }

    return results;
  }

  /**
   * Build BRU file structure from input
   */
  private buildBruFile(input: CreateRequestInput): BruFile {
    const bruFile: BruFile = {
      meta: {
        name: input.name,
        type: 'http',
        seq: input.sequence
      },
      http: {
        method: input.method,
        url: input.url,
        body: input.body?.type || 'none',
        auth: input.auth?.type || 'none'
      }
    };

    // Add headers if provided
    if (input.headers && Object.keys(input.headers).length > 0) {
      bruFile.headers = input.headers;
    }

    // Add query parameters if provided
    if (input.query && Object.keys(input.query).length > 0) {
      bruFile.query = input.query;
    }

    // Add body if provided
    if (input.body && input.body.type !== 'none') {
      bruFile.body = {
        type: input.body.type,
        content: input.body.content
      };

      // Handle form data
      if (input.body.formData) {
        bruFile.body.formData = input.body.formData.map(field => ({
          name: field.name,
          value: field.value,
          type: field.type || 'text',
          enabled: true
        }));
      }
    }

    // Add authentication if provided
    if (input.auth && input.auth.type !== 'none') {
      bruFile.auth = {
        type: input.auth.type
      };

      // Configure auth based on type
      switch (input.auth.type) {
        case 'bearer':
          bruFile.auth.bearer = {
            token: input.auth.config.token || '{{token}}'
          };
          break;
        case 'basic':
          bruFile.auth.basic = {
            username: input.auth.config.username || '{{username}}',
            password: input.auth.config.password || '{{password}}'
          };
          break;
        case 'api-key':
          bruFile.auth.apikey = {
            key: input.auth.config.key || 'X-API-Key',
            value: input.auth.config.value || '{{apiKey}}',
            in: (input.auth.config.in as 'header' | 'query') || 'header'
          };
          break;
      }
    }

    return bruFile;
  }

  /**
   * Get file path for request
   */
  private getRequestFilePath(input: CreateRequestInput): string {
    const fileName = this.sanitizeFileName(input.name) + '.bru';
    
    if (input.folder) {
      return join(input.collectionPath, input.folder, fileName);
    }
    
    return join(input.collectionPath, fileName);
  }

  /**
   * Sanitize file name for filesystem
   */
  private sanitizeFileName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  /**
   * Parse BRU file content (basic implementation)
   */
  private parseBruFile(content: string): BruFile {
    // This is a simplified parser - in a production environment,
    // you'd want a more robust BRU parser
    const bruFile: BruFile = {
      meta: {
        name: 'Parsed Request',
        type: 'http'
      },
      http: {
        method: 'GET',
        url: '',
        body: 'none',
        auth: 'none'
      }
    };

    // Extract meta information
    const metaMatch = content.match(/meta\s*\{([^}]*)\}/s);
    if (metaMatch) {
      const metaContent = metaMatch[1];
      const nameMatch = metaContent.match(/name:\s*'([^']*)'|name:\s*([^\n]*)/);
      if (nameMatch) {
        bruFile.meta.name = nameMatch[1] || nameMatch[2].trim();
      }
    }

    // Extract HTTP method and URL
    const httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
    for (const method of httpMethods) {
      const methodMatch = content.match(new RegExp(`${method}\\s*\\{([^}]*)\\}`, 's'));
      if (methodMatch) {
        bruFile.http.method = method.toUpperCase() as HttpMethod;
        const httpContent = methodMatch[1];
        const urlMatch = httpContent.match(/url:\s*'([^']*)'|url:\s*([^\n]*)/);
        if (urlMatch) {
          bruFile.http.url = urlMatch[1] || urlMatch[2].trim();
        }
        break;
      }
    }

    return bruFile;
  }

  /**
   * Apply updates to existing BRU file
   */
  private applyUpdates(existingBru: BruFile, updates: Partial<CreateRequestInput>): BruFile {
    const updated = { ...existingBru };

    if (updates.name) {
      updated.meta.name = updates.name;
    }

    if (updates.method) {
      updated.http.method = updates.method;
    }

    if (updates.url) {
      updated.http.url = updates.url;
    }

    if (updates.headers) {
      updated.headers = { ...updated.headers, ...updates.headers };
    }

    if (updates.body) {
      updated.http.body = updates.body.type;
      updated.body = {
        type: updates.body.type,
        content: updates.body.content
      };
    }

    if (updates.auth) {
      updated.http.auth = updates.auth.type;
      updated.auth = {
        type: updates.auth.type
      };
    }

    return updated;
  }

  /**
   * Validate request input
   */
  private validateRequestInput(input: CreateRequestInput): void {
    if (!input.name || input.name.trim().length === 0) {
      throw new BrunoError('Request name is required', 'VALIDATION_ERROR');
    }

    if (!input.collectionPath || input.collectionPath.trim().length === 0) {
      throw new BrunoError('Collection path is required', 'VALIDATION_ERROR');
    }

    if (!input.method) {
      throw new BrunoError('HTTP method is required', 'VALIDATION_ERROR');
    }

    if (!input.url || input.url.trim().length === 0) {
      throw new BrunoError('URL is required', 'VALIDATION_ERROR');
    }

    // Validate HTTP method
    const validMethods: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    if (!validMethods.includes(input.method)) {
      throw new BrunoError(
        `Invalid HTTP method: ${input.method}`,
        'VALIDATION_ERROR'
      );
    }

    // Validate auth configuration if provided
    if (input.auth && input.auth.type !== 'none') {
      this.validateAuthConfig(input.auth.type, input.auth.config);
    }
  }

  /**
   * Validate authentication configuration
   */
  private validateAuthConfig(authType: AuthType, config: Record<string, string>): void {
    switch (authType) {
      case 'bearer':
        if (!config.token) {
          throw new BrunoError('Bearer token is required', 'VALIDATION_ERROR');
        }
        break;
      case 'basic':
        if (!config.username || !config.password) {
          throw new BrunoError('Username and password are required for basic auth', 'VALIDATION_ERROR');
        }
        break;
      case 'api-key':
        if (!config.key || !config.value) {
          throw new BrunoError('Key and value are required for API key auth', 'VALIDATION_ERROR');
        }
        break;
    }
  }

  /**
   * Ensure directory exists
   */
  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }
}

/**
 * Create a new request builder instance
 */
export function createRequestBuilder(): RequestBuilder {
  return new RequestBuilder();
}