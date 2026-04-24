import { posix as pathPosix } from 'node:path';

import { BrunoNativeManager } from './native.js';

export type CollectionAuditDepth = 'deep' | 'moderate' | 'none' | 'shallow';

export interface CollectionAuditFinding {
  category:
    | 'coverage-gap'
    | 'destructive-risk'
    | 'documentation-gap'
    | 'duplication'
    | 'placeholder'
    | 'request-design';
  message: string;
  requestPath?: string;
  severity: 'high' | 'low' | 'medium';
}

export interface CollectionAuditRequestSummary {
  assertionCount: number;
  authMode: string;
  depth: CollectionAuditDepth;
  docsPresent: boolean;
  findings: CollectionAuditFinding[];
  hasPostResponseScript: boolean;
  hasPreRequestScript: boolean;
  issues: string[];
  method: string;
  name: string;
  relativePath: string;
  tagCount: number;
  testPresent: boolean;
  url: string;
}

export interface CollectionAuditDuplicateEndpoint {
  method: string;
  requestPaths: string[];
  url: string;
}

export interface CollectionAuditSummary {
  deepRequests: number;
  destructiveRequests: number;
  docsPresentRequests: number;
  duplicateEndpointGroups: number;
  enterpriseReadinessScore: number;
  literalPlaceholderRequests: number;
  moderateRequests: number;
  noneRequests: number;
  requestsWithAssertions: number;
  requestsWithScripts: number;
  requestsWithTests: number;
  shallowRequests: number;
  totalRequests: number;
}

export interface CollectionAuditReport {
  collectionPath: string;
  duplicateEndpoints: CollectionAuditDuplicateEndpoint[];
  findings: CollectionAuditFinding[];
  generatedAt: string;
  requestPathPrefix?: string;
  requests?: CollectionAuditRequestSummary[];
  summary: CollectionAuditSummary;
}

type AuditCollectionOptions = {
  includeRequests?: boolean;
  maxFindings?: number;
  requestPathPrefix?: string;
};

type RequestRecord = {
  assertions: Array<Record<string, unknown>>;
  auth: Record<string, unknown>;
  body?: Record<string, unknown>;
  docs: string;
  headers: Array<Record<string, unknown>>;
  method: string;
  name: string;
  relativePath: string;
  scripts: Record<string, unknown>;
  tags: string[];
  tests: string;
  url: string;
};

type InheritedDefaults = {
  authMode?: string;
  reqScript: string;
  resScript: string;
  tests: string;
};

const LITERAL_PLACEHOLDER_PATTERN = /\bTODAY\b|YYYY-MM-DD/;
const GENERIC_ID_PATTERN = /\{\{id\}\}/;
const STATUS_SIGNAL_PATTERN = /res\.(status|getStatus\()/;
const BODY_SIGNAL_PATTERN = /res\.(body|getBody\()|res\('/;
const HEADER_SIGNAL_PATTERN = /res\.(headers|getHeader\()/;
const RUNTIME_CAPTURE_PATTERN = /bru\.(setVar|setEnvVar)\(/;
const BASELINE_SUCCESS_PATTERN = /oneOf\s*\(\s*\[\s*200\s*,\s*201\s*,\s*202\s*,\s*204\s*\]\s*\)/;
const BASELINE_HTML_PATTERN = /text\/html/;

export class CollectionAuditManager {
  constructor(private readonly nativeManager: BrunoNativeManager) {}

  async auditCollection(
    collectionPath: string,
    options: AuditCollectionOptions = {},
  ): Promise<CollectionAuditReport> {
    const requestPathPrefix = this.normalizePrefix(options.requestPathPrefix);
    const rawRequests = (await this.nativeManager.listRequests(collectionPath)) as Array<
      Record<string, unknown>
    >;

    const requests = rawRequests
      .map((request) => this.toRequestRecord(request))
      .filter((request): request is RequestRecord => request !== null)
      .filter((request) =>
        requestPathPrefix ? request.relativePath.startsWith(requestPathPrefix) : true,
      );

    const collectionDefaults = await this.nativeManager.getCollectionDefaults(collectionPath);
    const folderDefaultsCache = new Map<string, Record<string, unknown>>();

    const requestSummaries = await Promise.all(
      requests.map(async (request) => {
        const inheritedDefaults = await this.resolveInheritedDefaults(
          collectionPath,
          request.relativePath,
          collectionDefaults,
          folderDefaultsCache,
        );
        return this.auditRequest(request, inheritedDefaults);
      }),
    );
    const duplicateEndpoints = this.findDuplicateEndpoints(requestSummaries);
    const duplicateFindings = duplicateEndpoints.map((endpoint) => ({
      category: 'duplication' as const,
      message: `Duplicate endpoint coverage for ${endpoint.method} ${endpoint.url}`,
      severity: 'low' as const,
    }));
    const findings = [
      ...requestSummaries.flatMap((request) => request.findings),
      ...duplicateFindings,
    ];

    return {
      collectionPath,
      duplicateEndpoints,
      findings: findings.slice(0, options.maxFindings || 200),
      generatedAt: new Date().toISOString(),
      requestPathPrefix,
      requests: options.includeRequests === false ? undefined : requestSummaries,
      summary: this.buildSummary(requestSummaries, duplicateEndpoints.length),
    };
  }

  private auditRequest(
    request: RequestRecord,
    inheritedDefaults: InheritedDefaults,
  ): CollectionAuditRequestSummary {
    const testSignals = this.analyzeTestSignals(request, inheritedDefaults);
    const issues: string[] = [];
    const findings: CollectionAuditFinding[] = [];
    const destructive = ['DELETE', 'PATCH', 'POST', 'PUT'].includes(request.method.toUpperCase());
    const effectiveAuthMode = this.resolveEffectiveAuthMode(request, inheritedDefaults);

    if (!request.docs.trim()) {
      issues.push('missing-docs');
      findings.push({
        category: 'documentation-gap',
        message: 'Request is missing meaningful docs.',
        requestPath: request.relativePath,
        severity: 'low',
      });
    }

    if (!testSignals.hasAnyCoverage) {
      issues.push('missing-tests');
      findings.push({
        category: 'coverage-gap',
        message: 'Request has no request-level tests or assertions.',
        requestPath: request.relativePath,
        severity: destructive ? 'high' : 'medium',
      });
    }

    if (testSignals.baselineOnly) {
      issues.push('baseline-only-tests');
      findings.push({
        category: 'coverage-gap',
        message: 'Request relies only on shallow baseline success checks.',
        requestPath: request.relativePath,
        severity: destructive ? 'high' : 'medium',
      });
    }

    if (this.shouldFlagAuthNone(effectiveAuthMode, request.url)) {
      issues.push('auth-none-override');
      findings.push({
        category: 'request-design',
        message: 'Request resolves to auth:none and may bypass inherited auth defaults.',
        requestPath: request.relativePath,
        severity: 'medium',
      });
    }

    if (GENERIC_ID_PATTERN.test(this.getRequestContent(request))) {
      issues.push('generic-id-variable');
      findings.push({
        category: 'request-design',
        message: 'Request uses generic {{id}} instead of a resource-specific variable.',
        requestPath: request.relativePath,
        severity: 'medium',
      });
    }

    if (LITERAL_PLACEHOLDER_PATTERN.test(this.getRequestContent(request))) {
      issues.push('literal-placeholders');
      findings.push({
        category: 'placeholder',
        message: 'Request still contains literal placeholder values like TODAY or YYYY-MM-DD.',
        requestPath: request.relativePath,
        severity: 'high',
      });
    }

    if (destructive && testSignals.depth !== 'deep') {
      issues.push('destructive-without-deep-tests');
      findings.push({
        category: 'destructive-risk',
        message: 'Destructive/stateful request lacks deep, request-specific verification.',
        requestPath: request.relativePath,
        severity: 'high',
      });
    }

    return {
      assertionCount: request.assertions.length,
      authMode: effectiveAuthMode,
      depth: testSignals.depth,
      docsPresent: request.docs.trim().length > 0,
      findings,
      hasPostResponseScript:
        `${inheritedDefaults.resScript}${request.scripts.res}`.trim().length > 0,
      hasPreRequestScript: `${inheritedDefaults.reqScript}${request.scripts.req}`.trim().length > 0,
      issues,
      method: request.method,
      name: request.name,
      relativePath: request.relativePath,
      tagCount: request.tags.length,
      testPresent: testSignals.hasAnyCoverage,
      url: request.url,
    };
  }

  private analyzeTestSignals(
    request: RequestRecord,
    inheritedDefaults: InheritedDefaults,
  ): {
    baselineOnly: boolean;
    depth: CollectionAuditDepth;
    hasAnyCoverage: boolean;
  } {
    const tests = [inheritedDefaults.tests, request.tests].filter(Boolean).join('\n');
    const assertionNames = request.assertions
      .map((assertion) => String(assertion.name || ''))
      .join('\n');
    const assertionValues = request.assertions
      .map((assertion) => String(assertion.value || ''))
      .join('\n');
    const combined = `${tests}\n${assertionNames}\n${assertionValues}`;
    const hasAnyCoverage = tests.trim().length > 0 || request.assertions.length > 0;

    if (!hasAnyCoverage) {
      return {
        baselineOnly: false,
        depth: 'none',
        hasAnyCoverage: false,
      };
    }

    const hasStatus = STATUS_SIGNAL_PATTERN.test(combined);
    const hasBody =
      BODY_SIGNAL_PATTERN.test(combined) || this.hasNonStatusAssertions(request.assertions);
    const hasHeaders = HEADER_SIGNAL_PATTERN.test(combined);
    const hasRuntimeCapture =
      RUNTIME_CAPTURE_PATTERN.test(combined) ||
      RUNTIME_CAPTURE_PATTERN.test(`${inheritedDefaults.reqScript}\n${request.scripts.req}`) ||
      RUNTIME_CAPTURE_PATTERN.test(`${inheritedDefaults.resScript}\n${request.scripts.res}`);
    const baselineOnly =
      BASELINE_SUCCESS_PATTERN.test(combined) &&
      BASELINE_HTML_PATTERN.test(combined) &&
      !hasBody &&
      !hasRuntimeCapture &&
      request.assertions.length <= 2;
    const signalCount = [
      hasStatus,
      hasBody,
      hasHeaders,
      hasRuntimeCapture,
      `${inheritedDefaults.reqScript}${request.scripts.req}`.trim().length > 0,
      `${inheritedDefaults.resScript}${request.scripts.res}`.trim().length > 0,
      request.assertions.length >= 2,
    ].filter(Boolean).length;

    if (baselineOnly) {
      return {
        baselineOnly: true,
        depth: 'shallow',
        hasAnyCoverage: true,
      };
    }

    if (hasBody && (hasRuntimeCapture || request.assertions.length >= 2 || signalCount >= 4)) {
      return {
        baselineOnly: false,
        depth: 'deep',
        hasAnyCoverage: true,
      };
    }

    if (
      hasStatus ||
      hasBody ||
      hasHeaders ||
      `${inheritedDefaults.reqScript}${request.scripts.req}`.trim() ||
      `${inheritedDefaults.resScript}${request.scripts.res}`.trim()
    ) {
      return {
        baselineOnly: false,
        depth: signalCount >= 3 ? 'moderate' : 'shallow',
        hasAnyCoverage: true,
      };
    }

    return {
      baselineOnly: false,
      depth: 'shallow',
      hasAnyCoverage: true,
    };
  }

  private buildSummary(
    requests: CollectionAuditRequestSummary[],
    duplicateEndpointGroups: number,
  ): CollectionAuditSummary {
    const totalRequests = requests.length;
    const deepRequests = requests.filter((request) => request.depth === 'deep').length;
    const moderateRequests = requests.filter((request) => request.depth === 'moderate').length;
    const shallowRequests = requests.filter((request) => request.depth === 'shallow').length;
    const noneRequests = requests.filter((request) => request.depth === 'none').length;
    const literalPlaceholderRequests = requests.filter((request) =>
      request.issues.includes('literal-placeholders'),
    ).length;
    const destructiveRequests = requests.filter((request) =>
      ['DELETE', 'PATCH', 'POST', 'PUT'].includes(request.method.toUpperCase()),
    ).length;
    const requestsWithTests = requests.filter((request) => request.testPresent).length;
    const requestsWithAssertions = requests.filter((request) => request.assertionCount > 0).length;
    const requestsWithScripts = requests.filter(
      (request) => request.hasPreRequestScript || request.hasPostResponseScript,
    ).length;
    const docsPresentRequests = requests.filter((request) => request.docsPresent).length;
    const enterpriseReadinessScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          100 -
            noneRequests * 6 -
            shallowRequests * 2 -
            literalPlaceholderRequests * 5 -
            duplicateEndpointGroups * 2,
        ),
      ),
    );

    return {
      deepRequests,
      destructiveRequests,
      docsPresentRequests,
      duplicateEndpointGroups,
      enterpriseReadinessScore,
      literalPlaceholderRequests,
      moderateRequests,
      noneRequests,
      requestsWithAssertions,
      requestsWithScripts,
      requestsWithTests,
      shallowRequests,
      totalRequests,
    };
  }

  private findDuplicateEndpoints(
    requests: CollectionAuditRequestSummary[],
  ): CollectionAuditDuplicateEndpoint[] {
    const groups = new Map<string, CollectionAuditDuplicateEndpoint>();

    for (const request of requests) {
      const key = `${request.method.toUpperCase()} ${request.url}`;
      if (!groups.has(key)) {
        groups.set(key, {
          method: request.method.toUpperCase(),
          requestPaths: [],
          url: request.url,
        });
      }
      groups.get(key)?.requestPaths.push(request.relativePath);
    }

    return [...groups.values()].filter((group) => group.requestPaths.length > 1);
  }

  private getRequestContent(request: RequestRecord): string {
    return [
      request.url,
      request.tests,
      request.scripts.req,
      request.scripts.res,
      this.bodyToText(request),
    ]
      .filter(Boolean)
      .join('\n');
  }

  private bodyToText(request: RequestRecord): string {
    const body = request.body;
    if (!body || typeof body !== 'object') {
      return '';
    }

    if (typeof body.json === 'string') {
      return body.json;
    }
    if (typeof body.text === 'string') {
      return body.text;
    }
    if (typeof body.xml === 'string') {
      return body.xml;
    }
    if (body.graphql && typeof body.graphql === 'object') {
      return JSON.stringify(body.graphql);
    }
    if (
      Array.isArray(body.formdata) ||
      Array.isArray(body.formUrlEncoded) ||
      Array.isArray(body.file)
    ) {
      return JSON.stringify(body);
    }

    return JSON.stringify(body);
  }

  private hasNonStatusAssertions(assertions: Array<Record<string, unknown>>): boolean {
    return assertions.some((assertion) => String(assertion.name || '').trim() !== 'res.status');
  }

  private resolveEffectiveAuthMode(
    request: RequestRecord,
    inheritedDefaults: InheritedDefaults,
  ): string {
    const requestMode = String(request.auth.mode || '');
    if (requestMode.length > 0 && requestMode !== 'inherit') {
      return requestMode;
    }
    if (requestMode === 'inherit' && inheritedDefaults.authMode) {
      return inheritedDefaults.authMode;
    }
    return inheritedDefaults.authMode || requestMode || 'none';
  }

  private async resolveInheritedDefaults(
    collectionPath: string,
    relativePath: string,
    collectionDefaults: Record<string, unknown>,
    folderDefaultsCache: Map<string, Record<string, unknown>>,
  ): Promise<InheritedDefaults> {
    const folderPath = pathPosix.dirname(relativePath);
    const folderChain = this.buildFolderChain(folderPath);
    const defaultsChain: Array<Record<string, unknown>> = [collectionDefaults];

    for (const folder of folderChain) {
      if (!folderDefaultsCache.has(folder)) {
        folderDefaultsCache.set(
          folder,
          await this.nativeManager.getFolderDefaults(collectionPath, folder),
        );
      }
      defaultsChain.push(folderDefaultsCache.get(folder) || {});
    }

    return {
      authMode: defaultsChain
        .map((defaults) => String((defaults.auth as { mode?: unknown } | undefined)?.mode || ''))
        .filter(Boolean)
        .at(-1),
      reqScript: defaultsChain
        .map((defaults) => String((defaults.scripts as { req?: unknown } | undefined)?.req || ''))
        .filter(Boolean)
        .join('\n'),
      resScript: defaultsChain
        .map((defaults) => String((defaults.scripts as { res?: unknown } | undefined)?.res || ''))
        .filter(Boolean)
        .join('\n'),
      tests: defaultsChain
        .map((defaults) => String(defaults.tests || ''))
        .filter(Boolean)
        .join('\n'),
    };
  }

  private buildFolderChain(folderPath: string): string[] {
    if (!folderPath || folderPath === '.') {
      return [];
    }

    const parts = folderPath.split('/').filter(Boolean);
    const chain: string[] = [];
    for (let index = 0; index < parts.length; index += 1) {
      chain.push(parts.slice(0, index + 1).join('/'));
    }
    return chain;
  }

  private normalizePrefix(prefix?: string): string | undefined {
    if (!prefix) {
      return undefined;
    }

    const trimmed = prefix.trim().replace(/^\.\//, '').replace(/^\//, '');
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private shouldFlagAuthNone(authMode: string, url: string): boolean {
    if (authMode !== 'none') {
      return false;
    }

    return !/\/auth(?:$|[/?#])/.test(url);
  }

  private toRequestRecord(request: Record<string, unknown>): RequestRecord | null {
    if (typeof request.relativePath !== 'string' || typeof request.url !== 'string') {
      return null;
    }

    return {
      assertions: Array.isArray(request.assertions)
        ? request.assertions.filter((assertion): assertion is Record<string, unknown> =>
            Boolean(assertion && typeof assertion === 'object'),
          )
        : [],
      auth:
        request.auth && typeof request.auth === 'object'
          ? (request.auth as Record<string, unknown>)
          : { mode: 'none' },
      body:
        request.body && typeof request.body === 'object'
          ? (request.body as Record<string, unknown>)
          : undefined,
      docs: typeof request.docs === 'string' ? request.docs : '',
      headers: Array.isArray(request.headers)
        ? request.headers.filter((header): header is Record<string, unknown> =>
            Boolean(header && typeof header === 'object'),
          )
        : [],
      method: typeof request.method === 'string' ? request.method : '',
      name:
        typeof request.name === 'string'
          ? this.normalizeTextValue(request.name)
          : String(request.relativePath),
      relativePath: request.relativePath,
      scripts:
        request.scripts && typeof request.scripts === 'object'
          ? {
              req: String((request.scripts as Record<string, unknown>).req || ''),
              res: String((request.scripts as Record<string, unknown>).res || ''),
            }
          : { req: '', res: '' },
      tags: Array.isArray(request.tags) ? request.tags.map(String) : [],
      tests: typeof request.tests === 'string' ? request.tests : '',
      url: request.url,
    };
  }

  private normalizeTextValue(value: string): string {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))
    ) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  }
}

export function createCollectionAuditManager(nativeManager: BrunoNativeManager) {
  return new CollectionAuditManager(nativeManager);
}
