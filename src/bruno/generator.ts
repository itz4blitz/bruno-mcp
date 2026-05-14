/**
 * BRU file generator with proper syntax
 * Generates Bruno API testing files in the correct BRU format
 */

import {
  BruFile,
  BruMeta,
  BruHttpRequest,
  BruAuth,
  BruHeaders,
  BruQuery,
  BruBody,
  BruVars,
  BruPreRequestScript,
  BruPostResponseScript,
  BruTests,
  BruGeneratorOptions,
  BruValidationError,
} from './types.js';

export class BruGenerator {
  private options: Required<BruGeneratorOptions>;

  constructor(options: BruGeneratorOptions = {}) {
    this.options = {
      indentSize: options.indentSize ?? 2,
      useSpaces: options.useSpaces ?? true,
      addTimestamp: options.addTimestamp ?? false,
      validateSyntax: options.validateSyntax ?? true,
    };
  }

  /**
   * Generate a complete .bru file from a BruFile object
   */
  generateBruFile(bruFile: BruFile): string {
    if (this.options.validateSyntax) {
      this.validateBruFile(bruFile);
    }

    const sections: string[] = [];

    // Add timestamp comment if requested
    if (this.options.addTimestamp) {
      sections.push(`# Generated on ${new Date().toISOString()}`);
      sections.push('');
    }

    // Generate meta block
    sections.push(this.generateMetaBlock(bruFile.meta));
    sections.push('');

    // Generate HTTP block
    sections.push(this.generateHttpBlock(bruFile.http));
    sections.push('');

    // Generate auth block if present
    if (bruFile.auth && bruFile.auth.type !== 'none') {
      sections.push(this.generateAuthBlock(bruFile.auth));
      sections.push('');
    }

    // Generate headers block if present
    if (bruFile.headers && Object.keys(bruFile.headers).length > 0) {
      sections.push(this.generateHeadersBlock(bruFile.headers));
      sections.push('');
    }

    // Generate query block if present
    if (bruFile.query && Object.keys(bruFile.query).length > 0) {
      sections.push(this.generateQueryBlock(bruFile.query));
      sections.push('');
    }

    // Generate body block if present
    if (bruFile.body && bruFile.body.type !== 'none') {
      sections.push(this.generateBodyBlock(bruFile.body));
      sections.push('');
    }

    // Generate vars block if present
    if (bruFile.vars && Object.keys(bruFile.vars).length > 0) {
      sections.push(this.generateVarsBlock(bruFile.vars));
      sections.push('');
    }

    // Generate script blocks if present
    if (bruFile.script) {
      if (bruFile.script['pre-request']) {
        sections.push(this.generatePreRequestScript(bruFile.script['pre-request']));
        sections.push('');
      }
      if (bruFile.script['post-response']) {
        sections.push(this.generatePostResponseScript(bruFile.script['post-response']));
        sections.push('');
      }
    }

    // Generate tests block if present
    if (bruFile.tests) {
      sections.push(this.generateTestsBlock(bruFile.tests));
      sections.push('');
    }

    // Generate docs if present
    if (bruFile.docs) {
      sections.push('docs {');
      sections.push(this.indent(bruFile.docs));
      sections.push('}');
      sections.push('');
    }

    return sections.join('\n').trim() + '\n';
  }

  /**
   * Generate meta block
   */
  private generateMetaBlock(meta: BruMeta): string {
    const lines = ['meta {'];
    lines.push(this.indent(`name: ${this.escapeString(meta.name)}`));
    lines.push(this.indent(`type: ${meta.type}`));
    if (meta.seq !== undefined) {
      lines.push(this.indent(`seq: ${meta.seq}`));
    }
    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Generate HTTP request block
   */
  private generateHttpBlock(http: BruHttpRequest): string {
    const lines = [`${http.method.toLowerCase()} {`];
    lines.push(this.indent(`url: ${this.formatUrl(http.url)}`));
    lines.push(this.indent(`body: ${this.formatHttpBodyMode(http.body)}`));
    lines.push(this.indent(`auth: ${http.auth}`));
    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Generate auth block
   */
  private generateAuthBlock(auth: BruAuth): string {
    const authType =
      auth.type === 'api-key' ? 'apikey' : auth.type === 'aws-sig-v4' ? 'awsv4' : auth.type;
    const lines = [`auth:${authType} {`];

    switch (authType) {
      case 'awsv4':
        if (auth.awsv4) {
          this.pushOptionalAuthLine(lines, 'accessKeyId', auth.awsv4.accessKeyId);
          this.pushOptionalAuthLine(lines, 'secretAccessKey', auth.awsv4.secretAccessKey);
          this.pushOptionalAuthLine(lines, 'sessionToken', auth.awsv4.sessionToken);
          this.pushOptionalAuthLine(lines, 'service', auth.awsv4.service);
          this.pushOptionalAuthLine(lines, 'region', auth.awsv4.region);
          this.pushOptionalAuthLine(lines, 'profileName', auth.awsv4.profileName);
        }
        break;
      case 'bearer':
        if (auth.bearer) {
          lines.push(this.indent(`token: ${this.escapeString(auth.bearer.token)}`));
        }
        break;
      case 'basic':
        if (auth.basic) {
          lines.push(this.indent(`username: ${this.escapeString(auth.basic.username)}`));
          lines.push(this.indent(`password: ${this.escapeString(auth.basic.password)}`));
        }
        break;
      case 'oauth2':
        if (auth.oauth2) {
          lines.push(this.indent(`grant_type: ${auth.oauth2.grantType}`));
          if (auth.oauth2.callbackUrl) {
            lines.push(this.indent(`callback_url: ${this.escapeString(auth.oauth2.callbackUrl)}`));
          }
          if (auth.oauth2.accessTokenUrl) {
            lines.push(
              this.indent(`access_token_url: ${this.escapeString(auth.oauth2.accessTokenUrl)}`),
            );
          }
          if (auth.oauth2.refreshTokenUrl) {
            lines.push(
              this.indent(`refresh_token_url: ${this.escapeString(auth.oauth2.refreshTokenUrl)}`),
            );
          }
          if (auth.oauth2.authorizationUrl) {
            lines.push(
              this.indent(`authorization_url: ${this.escapeString(auth.oauth2.authorizationUrl)}`),
            );
          }
          if (auth.oauth2.clientId) {
            lines.push(this.indent(`client_id: ${this.escapeString(auth.oauth2.clientId)}`));
          }
          if (auth.oauth2.clientSecret) {
            lines.push(
              this.indent(`client_secret: ${this.escapeString(auth.oauth2.clientSecret)}`),
            );
          }
          if (auth.oauth2.credentialsPlacement) {
            lines.push(
              this.indent(
                `credentials_placement: ${this.escapeString(auth.oauth2.credentialsPlacement)}`,
              ),
            );
          }
          if (auth.oauth2.credentialsId) {
            lines.push(
              this.indent(`credentials_id: ${this.escapeString(auth.oauth2.credentialsId)}`),
            );
          }
          if (auth.oauth2.tokenSource) {
            lines.push(this.indent(`token_source: ${this.escapeString(auth.oauth2.tokenSource)}`));
          }
          if (auth.oauth2.tokenPlacement) {
            lines.push(
              this.indent(`token_placement: ${this.escapeString(auth.oauth2.tokenPlacement)}`),
            );
          }
          if (auth.oauth2.tokenHeaderPrefix) {
            lines.push(
              this.indent(
                `token_header_prefix: ${this.escapeString(auth.oauth2.tokenHeaderPrefix)}`,
              ),
            );
          }
          if (auth.oauth2.tokenQueryKey) {
            lines.push(
              this.indent(`token_query_key: ${this.escapeString(auth.oauth2.tokenQueryKey)}`),
            );
          }
          if (auth.oauth2.state) {
            lines.push(this.indent(`state: ${this.escapeString(auth.oauth2.state)}`));
          }
          if (auth.oauth2.pkce !== undefined) {
            lines.push(this.indent(`pkce: ${String(auth.oauth2.pkce)}`));
          }
          if (auth.oauth2.autoFetchToken !== undefined) {
            lines.push(this.indent(`auto_fetch_token: ${String(auth.oauth2.autoFetchToken)}`));
          }
          if (auth.oauth2.autoRefreshToken !== undefined) {
            lines.push(this.indent(`auto_refresh_token: ${String(auth.oauth2.autoRefreshToken)}`));
          }
          if (auth.oauth2.scope) {
            lines.push(this.indent(`scope: ${this.escapeString(auth.oauth2.scope)}`));
          }
          if (auth.oauth2.username) {
            lines.push(this.indent(`username: ${this.escapeString(auth.oauth2.username)}`));
          }
          if (auth.oauth2.password) {
            lines.push(this.indent(`password: ${this.escapeString(auth.oauth2.password)}`));
          }
        }
        break;
      case 'apikey':
        if (auth.apikey) {
          lines.push(this.indent(`key: ${this.escapeString(auth.apikey.key)}`));
          lines.push(this.indent(`value: ${this.escapeString(auth.apikey.value)}`));
          lines.push(
            this.indent(`placement: ${auth.apikey.placement || auth.apikey.in || 'header'}`),
          );
        }
        break;
      case 'digest':
        if (auth.digest) {
          lines.push(this.indent(`username: ${this.escapeString(auth.digest.username)}`));
          lines.push(this.indent(`password: ${this.escapeString(auth.digest.password)}`));
        }
        break;
      case 'ntlm':
        if (auth.ntlm) {
          lines.push(this.indent(`username: ${this.escapeString(auth.ntlm.username)}`));
          lines.push(this.indent(`password: ${this.escapeString(auth.ntlm.password)}`));
          if (auth.ntlm.domain) {
            lines.push(this.indent(`domain: ${this.escapeString(auth.ntlm.domain)}`));
          }
        }
        break;
      case 'wsse':
        if (auth.wsse) {
          lines.push(this.indent(`username: ${this.escapeString(auth.wsse.username)}`));
          lines.push(this.indent(`password: ${this.escapeString(auth.wsse.password)}`));
        }
        break;
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Generate headers block
   */
  private generateHeadersBlock(headers: BruHeaders): string {
    const lines = ['headers {'];
    Object.entries(headers).forEach(([key, value]) => {
      lines.push(this.indent(`${key}: ${this.escapeString(value)}`));
    });
    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Generate query parameters block
   */
  private generateQueryBlock(query: BruQuery): string {
    const lines = ['params:query {'];
    Object.entries(query).forEach(([key, value]) => {
      lines.push(this.indent(`${key}: ${this.formatValue(value)}`));
    });
    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Generate body block
   */
  private generateBodyBlock(body: BruBody): string {
    if (body.type === 'none') {
      return '';
    }

    if (body.type === 'json' || body.type === 'text' || body.type === 'xml') {
      const lines = [`body:${body.type} {`];
      if (body.content) {
        lines.push(this.indent(body.content));
      }
      lines.push('}');
      return lines.join('\n');
    }

    if (body.type === 'graphql') {
      const lines = ['body:graphql {'];
      if (body.content) {
        lines.push(this.indent(body.content));
      }
      lines.push('}');

      if (body.variables) {
        lines.push('');
        lines.push('body:graphql:vars {');
        lines.push(this.indent(body.variables));
        lines.push('}');
      }

      return lines.join('\n');
    }

    if (body.type === 'form-data' && body.formData) {
      const lines = ['body:multipart-form {'];
      body.formData.forEach((field) => {
        if (field.enabled !== false) {
          lines.push(this.indent(`${field.name}: ${this.escapeString(field.value)}`));
        }
      });
      lines.push('}');
      return lines.join('\n');
    }

    if (body.type === 'form-urlencoded' && body.formUrlEncoded) {
      const lines = ['body:form-urlencoded {'];
      body.formUrlEncoded.forEach((field) => {
        if (field.enabled !== false) {
          lines.push(this.indent(`${field.name}: ${this.escapeString(field.value)}`));
        }
      });
      lines.push('}');
      return lines.join('\n');
    }

    if (body.type === 'binary' && body.filePath) {
      const lines = ['body:file {'];
      let fileValue = `@file(${body.filePath})`;

      if (body.contentType) {
        fileValue += ` @contentType(${body.contentType})`;
      }

      lines.push(this.indent(`file: ${fileValue}`));
      lines.push('}');
      return lines.join('\n');
    }

    return '';
  }

  /**
   * Generate variables block
   */
  private generateVarsBlock(vars: BruVars): string {
    const lines = ['vars {'];
    Object.entries(vars).forEach(([key, value]) => {
      lines.push(this.indent(`${key}: ${this.formatValue(value)}`));
    });
    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Generate pre-request script block
   */
  private generatePreRequestScript(script: BruPreRequestScript): string {
    const lines = ['script:pre-request {'];
    script.exec.forEach((line) => {
      lines.push(this.indent(line));
    });
    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Generate post-response script block
   */
  private generatePostResponseScript(script: BruPostResponseScript): string {
    const lines = ['script:post-response {'];
    script.exec.forEach((line) => {
      lines.push(this.indent(line));
    });
    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Generate tests block
   */
  private generateTestsBlock(tests: BruTests): string {
    const lines = ['tests {'];
    tests.exec.forEach((line) => {
      lines.push(this.indent(line));
    });
    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Validate BRU file structure
   */
  private validateBruFile(bruFile: BruFile): void {
    if (!bruFile.meta || !bruFile.meta.name) {
      throw new BruValidationError('Meta block with name is required');
    }

    if (!bruFile.http || !bruFile.http.method || !bruFile.http.url) {
      throw new BruValidationError('HTTP block with method and URL is required');
    }

    // Validate URL format (basic check)
    if (!this.isValidUrl(bruFile.http.url)) {
      throw new BruValidationError(`Invalid URL format: ${bruFile.http.url}`);
    }

    // Validate auth configuration if present
    if (bruFile.auth && bruFile.auth.type !== 'none') {
      this.validateAuthConfig(bruFile.auth);
    }
  }

  /**
   * Validate authentication configuration
   */
  private validateAuthConfig(auth: BruAuth): void {
    const authType =
      auth.type === 'api-key' ? 'apikey' : auth.type === 'aws-sig-v4' ? 'awsv4' : auth.type;
    switch (authType) {
      case 'bearer':
        if (!auth.bearer?.token) {
          throw new BruValidationError('Bearer token is required for bearer auth');
        }
        break;
      case 'basic':
        if (!auth.basic?.username || !auth.basic?.password) {
          throw new BruValidationError('Username and password are required for basic auth');
        }
        break;
      case 'apikey':
        if (!auth.apikey?.key || !auth.apikey?.value) {
          throw new BruValidationError('Key and value are required for API key auth');
        }
        break;
      case 'oauth2':
        if (!auth.oauth2?.grantType) {
          throw new BruValidationError('Grant type is required for oauth2 auth');
        }
        break;
      case 'digest':
        if (!auth.digest?.username || !auth.digest?.password) {
          throw new BruValidationError('Username and password are required for digest auth');
        }
        break;
      case 'awsv4':
        if (
          !auth.awsv4?.profileName &&
          (!auth.awsv4?.accessKeyId || !auth.awsv4?.secretAccessKey)
        ) {
          throw new BruValidationError(
            'Access key and secret access key are required for AWS SigV4 auth unless profileName is provided',
          );
        }
        if (!auth.awsv4?.service || !auth.awsv4?.region) {
          throw new BruValidationError('Service and region are required for AWS SigV4 auth');
        }
        break;
      case 'ntlm':
        if (!auth.ntlm?.username || !auth.ntlm?.password) {
          throw new BruValidationError('Username and password are required for NTLM auth');
        }
        break;
      case 'wsse':
        if (!auth.wsse?.username || !auth.wsse?.password) {
          throw new BruValidationError('Username and password are required for WSSE auth');
        }
        break;
    }
  }

  private pushOptionalAuthLine(lines: string[], key: string, value?: string): void {
    if (value) {
      lines.push(this.indent(`${key}: ${this.escapeString(value)}`));
    }
  }

  /**
   * Basic URL validation
   */
  private isValidUrl(url: string): boolean {
    return URL.canParse(url) || url.startsWith('/') || url.includes('{{') || url.startsWith('http');
  }

  /**
   * URLs should stay unquoted so Bruno can resolve templates correctly.
   */
  private formatUrl(url: string): string {
    return url.trim();
  }

  /**
   * Bruno uses `file` in the request block for binary uploads.
   */
  private formatHttpBodyMode(body: BruHttpRequest['body']): string {
    return body === 'binary' ? 'file' : body;
  }

  /**
   * Escape string values for BRU format
   */
  private escapeString(value: string): string {
    if (this.isTemplateScalar(value)) {
      return value.trim();
    }

    if (this.isBareScalar(value)) {
      return value.trim();
    }

    // BRU uses single quotes for strings
    if (value.includes("'") || value.includes('\n') || value.includes('\r')) {
      // Use multiline string format for complex strings
      return `'''${value}'''`;
    }
    return `'${value}'`;
  }

  private isTemplateScalar(value: string): boolean {
    return /^(?:\{\{[^{}\n]+\}\})+$/.test(value.trim());
  }

  private isBareScalar(value: string): boolean {
    return /^[A-Za-z0-9_./:{}-]+$/.test(value.trim());
  }

  /**
   * Format various value types
   */
  private formatValue(value: string | number | boolean): string {
    if (typeof value === 'string') {
      return this.escapeString(value);
    }
    return String(value);
  }

  /**
   * Add indentation to a line
   */
  private indent(text: string): string {
    const indentChar = this.options.useSpaces ? ' ' : '\t';
    const indentString = this.options.useSpaces
      ? indentChar.repeat(this.options.indentSize)
      : indentChar;

    return text
      .split('\n')
      .map((line) => (line.trim() ? indentString + line : line))
      .join('\n');
  }
}

/**
 * Convenience function to generate a BRU file
 */
export function generateBruFile(bruFile: BruFile, options?: BruGeneratorOptions): string {
  const generator = new BruGenerator(options);
  return generator.generateBruFile(bruFile);
}

/**
 * Create a basic BRU file structure
 */
export function createBasicBruFile(
  name: string,
  method: string,
  url: string,
  sequence?: number,
): BruFile {
  return {
    meta: {
      name,
      type: 'http',
      seq: sequence,
    },
    http: {
      method: method.toUpperCase() as any,
      url,
      body: 'none',
      auth: 'none',
    },
  };
}
