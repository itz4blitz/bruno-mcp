import { posix as pathPosix } from 'node:path';

import { BrunoNativeManager } from './native.js';

export type CollectionAuditDepth = 'deep' | 'moderate' | 'none' | 'shallow';

export type CollectionAuditDocumentationQuality =
  | 'decision-grade'
  | 'meaningful'
  | 'missing'
  | 'placeholder'
  | 'thin';

export type CollectionAuditAssertionDepthClassification =
  | 'contract-doc'
  | 'event-or-file'
  | 'key-read'
  | 'mutation'
  | 'negative'
  | 'query-read'
  | 'read'
  | 'support';

export type CollectionAuditAssertionDimensionKey =
  | 'business-semantics'
  | 'content-type'
  | 'docs'
  | 'negative-envelope'
  | 'no-unexpected-side-effects'
  | 'query-semantics'
  | 'response-shape'
  | 'schema-fields'
  | 'seed-identity'
  | 'side-effects'
  | 'status'
  | 'variable-capture';

export interface CollectionAuditAssertionDimension {
  evidence: string[];
  key: CollectionAuditAssertionDimensionKey;
  label: string;
  present: boolean;
  required: boolean;
}

export interface CollectionAuditAssertionDepthScore {
  classification: CollectionAuditAssertionDepthClassification;
  covered: number;
  dimensions: CollectionAuditAssertionDimension[];
  missingRequired: CollectionAuditAssertionDimensionKey[];
  percent: number;
  total: number;
}

export interface CollectionAuditFinding {
  category:
    | 'assertion-depth'
    | 'coverage-gap'
    | 'destructive-risk'
    | 'documentation-gap'
    | 'duplication'
    | 'parity-risk'
    | 'placeholder'
    | 'request-design'
    | 'semantic-risk';
  message: string;
  requestPath?: string;
  severity: 'high' | 'low' | 'medium';
}

export interface CollectionAuditDocumentationScore {
  evidence: string[];
  issues: string[];
  quality: CollectionAuditDocumentationQuality;
  score: number;
  wordCount: number;
}

export type CollectionAuditSemanticRiskKind =
  | 'broad-status-oracle'
  | 'conditional-oracle'
  | 'env-state-oracle'
  | 'emulator-gap-oracle'
  | 'mixed-success-failure-oracle'
  | 'odata-count-optional'
  | 'odata-order-single-row'
  | 'odata-skip-zero'
  | 'odata-top-not-bounded'
  | 'stubbed-or-gap-scenario'
  | 'token-claims-underasserted';

export interface CollectionAuditSemanticRisk {
  evidence: string;
  kind: CollectionAuditSemanticRiskKind;
  message: string;
  severity: 'high' | 'low' | 'medium';
}

export type CollectionAuditParityRiskKind =
  | 'external-dependency-stub'
  | 'emulator-gap'
  | 'known-gap-or-stub'
  | 'product-infra-defect'
  | 'route-config-gap'
  | 'seed-data-gap';

export interface CollectionAuditParityRisk {
  evidence: string;
  kind: CollectionAuditParityRiskKind;
  message: string;
  severity: 'high' | 'low' | 'medium';
}

export interface CollectionAuditRequestSummary {
  assertionCount: number;
  authMode: string;
  assertionDepth: CollectionAuditAssertionDepthScore;
  depth: CollectionAuditDepth;
  duplicateFingerprint: string;
  documentation: CollectionAuditDocumentationScore;
  docsPresent: boolean;
  findings: CollectionAuditFinding[];
  hasPostResponseScript: boolean;
  hasPreRequestScript: boolean;
  issues: string[];
  method: string;
  name: string;
  parityRisks: CollectionAuditParityRisk[];
  relativePath: string;
  semanticRisks: CollectionAuditSemanticRisk[];
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
  assertionDepthCovered: number;
  assertionDepthScore: number;
  assertionDepthTotal: number;
  assertionIncompleteRequests: number;
  assertionPerfectRequests: number;
  deepRequests: number;
  destructiveRequests: number;
  docsDecisionGradeRequests: number;
  docsDepthScore: number;
  docsMeaningfulRequests: number;
  docsPresentRequests: number;
  docsThinRequests: number;
  duplicateEndpointGroups: number;
  enterpriseReadinessScore: number;
  externalStubFindings: number;
  literalPlaceholderRequests: number;
  moderateRequests: number;
  noneRequests: number;
  parityRiskFindings: number;
  parityRiskScore: number;
  productDefectFindings: number;
  requestsWithAssertions: number;
  requestsWithScripts: number;
  requestsWithTests: number;
  seedDataGapFindings: number;
  semanticRiskFindings: number;
  semanticRiskScore: number;
  shallowRequests: number;
  testInfraParityFindings: number;
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
  docs: string;
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
const TEST_ASSERTION_PATTERN = /\b(?:expect|assert)\s*\(/g;
const BASELINE_SUCCESS_PATTERN = /oneOf\s*\(\s*\[\s*200\s*,\s*201\s*,\s*202\s*,\s*204\s*\]\s*\)/;
const BASELINE_HTML_PATTERN = /text\/html/;
const MUTATING_METHODS = ['DELETE', 'PATCH', 'POST', 'PUT'];
const STATUS_ORACLE_CONTEXT_PATTERN =
  /(?:status|tokenStatus|code|res\.getStatus\(\)|res\.status)\s*(?:\)|,|\.|===|!==|==|!=|=>|:)?/i;
const PLACEHOLDER_DOC_PATTERN =
  /\b(?:todo|tbd|lorem ipsum|placeholder|add docs|documentation goes here|welcome to your collection documentation|overview|best practices|markdown support)\b/i;
const DOC_DECISION_SIGNAL_PATTERN =
  /\b(?:decision|because|why|intentionally|deliberately|source of truth|known bug|known product bug|known gap|emulator gap|dependency mode|seed gap|contract mismatch|failure means|do not|must|coverage decision|interpretation|risk)\b/i;
const DOC_MEANING_SIGNAL_PATTERN =
  /\b(?:validates|asserts|proves|covers|exercises|resolves|captures|negative|positive|dependency|seed|tenant|auth|gateway|event|odata|schema|contract|payload|side effect|fail(?:s)? closed)\b/i;

const ASSERTION_DIMENSION_LABELS: Record<CollectionAuditAssertionDimensionKey, string> = {
  'business-semantics': 'business semantics',
  'content-type': 'content type',
  docs: 'request docs',
  'negative-envelope': 'negative/error envelope',
  'no-unexpected-side-effects': 'no unexpected side effects',
  'query-semantics': 'query semantics',
  'response-shape': 'response shape',
  'schema-fields': 'schema fields',
  'seed-identity': 'seed identity',
  'side-effects': 'side effects',
  status: 'status',
  'variable-capture': 'variable capture',
};

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
    const destructive = MUTATING_METHODS.includes(request.method.toUpperCase());
    const effectiveAuthMode = this.resolveEffectiveAuthMode(request, inheritedDefaults);
    const documentation = this.scoreDocumentation(request, inheritedDefaults);
    const assertionDepth = this.scoreAssertionDepth(request, inheritedDefaults, documentation);
    const semanticRisks = this.detectSemanticRisks(request, inheritedDefaults, assertionDepth);
    const parityRisks = this.detectParityRisks(request, inheritedDefaults, assertionDepth);

    if (documentation.score < 70) {
      issues.push(...documentation.issues);
      findings.push({
        category: 'documentation-gap',
        message: this.documentationFindingMessage(documentation),
        requestPath: request.relativePath,
        severity: documentation.score < 40 ? 'medium' : 'low',
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

    if (this.shouldFlagAuthNone(effectiveAuthMode, request, inheritedDefaults)) {
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

    if (assertionDepth.percent < 100) {
      issues.push('assertion-depth-incomplete');
      findings.push({
        category: 'assertion-depth',
        message: `Request assertion depth is ${assertionDepth.percent}% for ${assertionDepth.classification}; missing ${assertionDepth.missingRequired
          .map((key) => ASSERTION_DIMENSION_LABELS[key])
          .join(', ')}.`,
        requestPath: request.relativePath,
        severity: assertionDepth.percent < 70 ? 'high' : 'medium',
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

    for (const risk of semanticRisks) {
      issues.push(`semantic-risk:${risk.kind}`);
      findings.push({
        category: 'semantic-risk',
        message: risk.message,
        requestPath: request.relativePath,
        severity: risk.severity,
      });
    }

    for (const risk of parityRisks) {
      findings.push({
        category: 'parity-risk',
        message: risk.message,
        requestPath: request.relativePath,
        severity: risk.severity,
      });
    }

    return {
      assertionCount: request.assertions.length,
      assertionDepth,
      authMode: effectiveAuthMode,
      depth: testSignals.depth,
      duplicateFingerprint: this.buildDuplicateFingerprint(request, assertionDepth.classification),
      documentation,
      docsPresent: documentation.wordCount > 0,
      findings,
      hasPostResponseScript:
        `${inheritedDefaults.resScript}${request.scripts.res}`.trim().length > 0,
      hasPreRequestScript: `${inheritedDefaults.reqScript}${request.scripts.req}`.trim().length > 0,
      issues,
      method: request.method,
      name: request.name,
      parityRisks,
      relativePath: request.relativePath,
      semanticRisks,
      tagCount: request.tags.length,
      testPresent: testSignals.hasAnyCoverage,
      url: request.url,
    };
  }

  private scoreDocumentation(
    request: RequestRecord,
    inheritedDefaults: InheritedDefaults,
  ): CollectionAuditDocumentationScore {
    const docs = request.docs.trim();
    const inheritedDocs = inheritedDefaults.docs.trim();
    const combined = [inheritedDocs, docs].filter(Boolean).join('\n\n');
    const normalized = combined.replace(/\s+/g, ' ').trim();
    const wordCount = normalized ? normalized.split(/\s+/).length : 0;
    const evidence: string[] = [];
    const issues: string[] = [];

    if (wordCount === 0) {
      return {
        evidence,
        issues: ['missing-docs'],
        quality: 'missing',
        score: 0,
        wordCount,
      };
    }

    if (docs.length > 0) {
      evidence.push('request docs');
    } else if (inheritedDocs.length > 0) {
      evidence.push('inherited folder/collection docs');
    }

    if (PLACEHOLDER_DOC_PATTERN.test(normalized)) {
      issues.push('placeholder-docs');
      return {
        evidence,
        issues,
        quality: 'placeholder',
        score: 10,
        wordCount,
      };
    }

    if (DOC_MEANING_SIGNAL_PATTERN.test(normalized)) {
      evidence.push('test intent');
    }
    if (DOC_DECISION_SIGNAL_PATTERN.test(normalized)) {
      evidence.push('decision/risk rationale');
    }

    const hasRequestSpecificDocs = docs.length > 0;
    const hasMeaning = DOC_MEANING_SIGNAL_PATTERN.test(normalized);
    const hasDecisionRationale = DOC_DECISION_SIGNAL_PATTERN.test(normalized);
    const hasStructure = /[-*]\s+\S|\n\s*\n|#/.test(combined);

    if (hasRequestSpecificDocs && wordCount >= 35 && hasMeaning && hasDecisionRationale) {
      return {
        evidence,
        issues,
        quality: 'decision-grade',
        score: 100,
        wordCount,
      };
    }

    if (wordCount >= 12 && hasMeaning) {
      return {
        evidence,
        issues: hasRequestSpecificDocs ? issues : [...issues, 'inherited-only-docs'],
        quality: 'meaningful',
        score: hasRequestSpecificDocs ? (hasStructure || hasDecisionRationale ? 90 : 80) : 70,
        wordCount,
      };
    }

    issues.push('thin-docs');
    return {
      evidence,
      issues,
      quality: 'thin',
      score: Math.min(60, Math.max(30, wordCount * 3)),
      wordCount,
    };
  }

  private documentationFindingMessage(documentation: CollectionAuditDocumentationScore): string {
    if (documentation.quality === 'missing') {
      return 'Request is missing docs; generated suites need visible intent in Bruno Desktop.';
    }

    if (documentation.quality === 'placeholder') {
      return 'Request docs look like placeholder/default documentation rather than test intent.';
    }

    if (documentation.issues.includes('inherited-only-docs')) {
      return 'Request relies only on inherited folder/collection docs; add request-specific intent for this scenario.';
    }

    return 'Request docs are too thin to explain the scenario, decision, dependency, or failure interpretation.';
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
    const scriptedAssertionCount = (combined.match(TEST_ASSERTION_PATTERN) || []).length;
    const assertionSignalCount = request.assertions.length + scriptedAssertionCount;
    const baselineOnly =
      BASELINE_SUCCESS_PATTERN.test(combined) &&
      BASELINE_HTML_PATTERN.test(combined) &&
      !hasBody &&
      !hasRuntimeCapture &&
      assertionSignalCount <= 2;
    const signalCount = [
      hasStatus,
      hasBody,
      hasHeaders,
      hasRuntimeCapture,
      `${inheritedDefaults.reqScript}${request.scripts.req}`.trim().length > 0,
      `${inheritedDefaults.resScript}${request.scripts.res}`.trim().length > 0,
      assertionSignalCount >= 2,
    ].filter(Boolean).length;

    if (baselineOnly) {
      return {
        baselineOnly: true,
        depth: 'shallow',
        hasAnyCoverage: true,
      };
    }

    if (hasBody && (hasRuntimeCapture || assertionSignalCount >= 2 || signalCount >= 4)) {
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

  private detectSemanticRisks(
    request: RequestRecord,
    inheritedDefaults: InheritedDefaults,
    assertionDepth: CollectionAuditAssertionDepthScore,
  ): CollectionAuditSemanticRisk[] {
    const tests = [inheritedDefaults.tests, request.tests].filter(Boolean).join('\n');
    const assertionNames = request.assertions
      .map((assertion) => String(assertion.name || ''))
      .join('\n');
    const assertionValues = request.assertions
      .map((assertion) => String(assertion.value || ''))
      .join('\n');
    const scripts = [
      inheritedDefaults.reqScript,
      inheritedDefaults.resScript,
      request.scripts.req,
      request.scripts.res,
    ]
      .filter(Boolean)
      .join('\n');
    const context = [
      request.name,
      request.relativePath,
      request.url,
      request.tags.join('\n'),
      request.docs,
      tests,
      assertionNames,
      assertionValues,
      scripts,
      this.bodyToText(request),
    ].join('\n');
    const assertionContext = [
      request.name,
      request.relativePath,
      request.url,
      request.tags.join('\n'),
      request.docs,
      tests,
      assertionNames,
      assertionValues,
      this.bodyToText(request),
    ].join('\n');
    const risks: CollectionAuditSemanticRisk[] = [];
    const seen = new Set<string>();
    const addRisk = (risk: CollectionAuditSemanticRisk) => {
      const key = `${risk.kind}:${risk.evidence}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      risks.push(risk);
    };

    for (const range of this.extractStatusRanges(context)) {
      if (range.values.length < 2) {
        continue;
      }

      const hasSuccess = range.values.some((value) => value >= 200 && value < 300);
      const hasFailure = range.values.some((value) => value >= 400);
      const hasServerError = range.values.some((value) => value >= 500);
      const evidence = `[${range.values.join(', ')}]`;

      if (hasSuccess && hasFailure) {
        addRisk({
          evidence,
          kind: 'mixed-success-failure-oracle',
          message:
            'Request accepts both successful and failing statuses, so a passing run may hide a behavior split that should be represented as separate scenarios or an explicit dependency mode.',
          severity: 'high',
        });
        continue;
      }

      addRisk({
        evidence,
        kind: 'broad-status-oracle',
        message:
          range.values.length > 2 || hasServerError
            ? 'Request uses a broad status oracle with multiple possible outcomes, including a server-error path. This should be narrowed or modeled as explicit scenario outcomes.'
            : 'Request accepts multiple status outcomes. This may be valid for emulator variance, but it is not an exact behavioral oracle.',
        severity: range.values.length > 2 || hasServerError ? 'high' : 'medium',
      });
    }

    const decodedUrl = this.safeDecodeURIComponent(request.url);
    const topMatch = /(?:[?&]|\b)\$top=(\d+)/i.exec(decodedUrl);
    if (topMatch && assertionDepth.classification !== 'negative') {
      const top = Number(topMatch[1]);
      const topBoundPattern = new RegExp(
        `(?:at\\.most\\(\\s*${top}\\s*\\)|length\\s*(?:<=|<)\\s*${top + 1}|to\\.have\\.length\\(\\s*${top}\\s*\\))`,
        'i',
      );
      if (!topBoundPattern.test(assertionContext)) {
        addRisk({
          evidence: `$top=${top}`,
          kind: 'odata-top-not-bounded',
          message:
            'Request includes $top but does not assert the returned collection is bounded by that value.',
          severity: 'medium',
        });
      }
    }

    if (
      /[?&]\$count=true\b/i.test(decodedUrl) &&
      !/have\.property\(["']@odata\.count["']\)|\[\s*["']@odata\.count["']\s*\]\)?\.to\.be\.a\(["']number["']\)|@odata\.count["']?\)\.to\.be\.a\(["']number["']\)/i.test(
        assertionContext,
      )
    ) {
      addRisk({
        evidence: '$count=true',
        kind: 'odata-count-optional',
        message:
          'Request asks for $count=true but treats @odata.count as optional instead of a required part of the response contract.',
        severity: 'medium',
      });
    }

    if (
      /[?&]\$count=true\b/i.test(decodedUrl) &&
      /if\s*\([^)]*@odata\.count[^)]*undefined[^)]*\)/i.test(assertionContext)
    ) {
      addRisk({
        evidence: 'optional @odata.count branch',
        kind: 'odata-count-optional',
        message:
          'Request guards @odata.count behind an optional branch even though $count=true is present.',
        severity: 'medium',
      });
    }

    if (/[?&]\$skip=0\b/i.test(decodedUrl)) {
      addRisk({
        evidence: '$skip=0',
        kind: 'odata-skip-zero',
        message:
          'Request uses $skip=0, which does not prove skip behavior. Use a positive skip and compare against a deterministic baseline.',
        severity: 'medium',
      });
    }

    if (
      /[?&]\$orderby=/i.test(decodedUrl) &&
      /\$top=1\b/i.test(decodedUrl) &&
      !/deterministic|seed anchor|stable runtime anchor|captured.*id|known product bug|known-bug|column override|translation/i.test(
        assertionContext,
      )
    ) {
      addRisk({
        evidence: '$orderby with $top=1',
        kind: 'odata-order-single-row',
        message:
          'Request combines $orderby with a single-row page, so ordering is not semantically proven.',
        severity: 'medium',
      });
    }

    if (
      /seed-resolver|expand resolver|_expand_id/i.test(
        `${request.name}\n${request.relativePath}\n${request.tags.join('\n')}`,
      ) &&
      /expect\(\s*bru\.getEnvVar\(/i.test(context) &&
      !/findResolvedRow|resolvedRow|current response|currentResponse/i.test(context)
    ) {
      addRisk({
        evidence: 'bru.getEnvVar resolver assertion',
        kind: 'env-state-oracle',
        message:
          'Resolver assertion depends on environment state instead of proving the current response resolved the variable. Stale Bruno Desktop variables can create false positives.',
        severity: 'high',
      });
    }

    if (
      /client-credentials|bearer token|accessToken|enhanced-token|enterprise-token/i.test(
        context,
      ) &&
      !/\b(?:invalid|missing|malformed|reject(?:ed)?|without issuing|without minting|policy|authorizer|denies?)\b/i.test(
        `${request.name}\n${request.relativePath}\n${request.docs}`,
      ) &&
      !/\b(?:client_id|clientId|token_use|scope|scp|jwt|claims?)\b/i.test(context)
    ) {
      addRisk({
        evidence: 'token without claim assertions',
        kind: 'token-claims-underasserted',
        message:
          'Token request asserts that a token exists but does not prove token claims such as client id, scope, token use, tenant, or plan mapping.',
        severity: 'medium',
      });
    }

    if (
      /if\s*\([^)]*(?:status|tokenStatus|code|res\.getStatus\(\)|res\.status)[^)]*\)\s*\{?[^{}\n;]*\breturn\b/is.test(
        context,
      ) ||
      /if\s*\(\s*\[[^\]]+\]\.includes\([^)]*(?:status|tokenStatus|code|res\.getStatus\(\)|res\.status)/is.test(
        context,
      )
    ) {
      addRisk({
        evidence: 'conditional status branch',
        kind: 'conditional-oracle',
        message:
          'Request has status-dependent early-return logic. That can be useful for known emulator variance, but the audit cannot treat all branches as equally proven.',
        severity: 'medium',
      });
    }

    if (
      /\[[^\]]*(?:4\d\d|5\d\d)[^\]]*\]\.includes\([^)]*(?:status|tokenStatus|code|res\.getStatus\(\)|res\.status)/is.test(
        context,
      ) &&
      /(?:status|tokenStatus|code|res\.getStatus\(\)|res\.status)[\s\S]{0,120}(?:equal|eql|equals?)\(\s*2\d\d\s*\)/i.test(
        context,
      )
    ) {
      addRisk({
        evidence: 'conditional failure branch plus exact success branch',
        kind: 'mixed-success-failure-oracle',
        message:
          'Request can pass through both an early accepted failure branch and a later success assertion. Split these into separate scenarios or make the dependency mode explicit.',
        severity: 'high',
      });
    }

    return risks;
  }

  private detectParityRisks(
    request: RequestRecord,
    inheritedDefaults: InheritedDefaults,
    assertionDepth: CollectionAuditAssertionDepthScore,
  ): CollectionAuditParityRisk[] {
    const tests = [inheritedDefaults.tests, request.tests].filter(Boolean).join('\n');
    const scripts = [
      inheritedDefaults.reqScript,
      inheritedDefaults.resScript,
      request.scripts.req,
      request.scripts.res,
    ]
      .filter(Boolean)
      .join('\n');
    const context = [
      request.name,
      request.relativePath,
      request.url,
      request.tags.join('\n'),
      request.docs,
      tests,
      scripts,
      this.bodyToText(request),
    ].join('\n');
    const parityRisks: CollectionAuditParityRisk[] = [];
    const seen = new Set<string>();
    const addRisk = (risk: CollectionAuditParityRisk) => {
      const key = `${risk.kind}:${risk.evidence}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      parityRisks.push(risk);
    };

    if (
      /localstack[\s\S]{0,160}(?:emulator|may allow|currently allows|variance)|emulator gap|usage-plan[\s\S]{0,120}(?:emulator|gap)|method throttle gap/i.test(
        context,
      )
    ) {
      addRisk({
        evidence: 'LocalStack/emulator parity gap wording',
        kind: 'emulator-gap',
        message:
          'Request documents a LocalStack/emulator parity gap. The test can still be exact and deep locally, but this scenario is not equivalent to deployed AWS proof.',
        severity: 'medium',
      });
    }

    if (/\b(?:product-defect|infra-defect|authz-defect|known-bug)\b/i.test(context)) {
      addRisk({
        evidence: 'product/infra defect tag or known-bug tag',
        kind: 'product-infra-defect',
        message:
          'Request exposes a product or deployed-infrastructure defect. This is not a weak test oracle; use release gates to fail on it until the product/config is fixed.',
        severity: 'high',
      });
    }

    if (
      /\b(?:seed-data-gap|seed gap|seed-state|post-delete seed state|coverage-gap)\b/i.test(context)
    ) {
      addRisk({
        evidence: 'seed/data coverage gap wording',
        kind: 'seed-data-gap',
        message:
          'Request reaches the target path but seed data is not rich enough to prove the full business invariant.',
        severity: 'medium',
      });
    }

    if (
      /\b(?:external-dependency-stub|stubbed|stubbed dependency|downstream.*stub)\b/i.test(context)
    ) {
      addRisk({
        evidence: 'external dependency stub wording',
        kind: 'external-dependency-stub',
        message:
          'Request covers dispatch but still relies on a stubbed or unavailable external dependency, so it is not full prod-parity proof.',
        severity: 'medium',
      });
    }

    if (/\b(?:route gap|stale gateway|stale deployed route|stale route)\b/i.test(context)) {
      addRisk({
        evidence: 'route configuration gap wording',
        kind: 'route-config-gap',
        message:
          'Request documents a deployed route/configuration gap. Keep this visible as parity coverage without treating it as a weak test oracle.',
        severity: 'low',
      });
    }

    if (
      /\b(?:known-infra-gap|stubbed|known[- ]?gap|stub)\b/i.test(context) ||
      (assertionDepth.classification === 'negative' && /\bgap\b/i.test(request.docs))
    ) {
      addRisk({
        evidence: 'known gap/stubbed scenario wording',
        kind: 'known-gap-or-stub',
        message:
          'Request documents a known gap or stubbed path. This is a product/environment parity finding, not a test-depth failure when the local oracle is exact.',
        severity: 'low',
      });
    }

    return parityRisks;
  }

  private extractStatusRanges(context: string): Array<{ values: number[] }> {
    const ranges: Array<{ values: number[] }> = [];
    const arrayPattern = /\[\s*((?:\d{3}\s*,\s*)+\d{3})\s*\]/g;
    let match: RegExpExecArray | null;

    while ((match = arrayPattern.exec(context)) !== null) {
      const start = Math.max(0, match.index - 120);
      const end = Math.min(context.length, match.index + match[0].length + 120);
      const surroundingText = context.slice(start, end);
      if (!STATUS_ORACLE_CONTEXT_PATTERN.test(surroundingText)) {
        continue;
      }

      const values = match[1]
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value));
      ranges.push({ values: [...new Set(values)].toSorted((left, right) => left - right) });
    }

    return ranges;
  }

  private safeDecodeURIComponent(value: string): string {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  private scoreAssertionDepth(
    request: RequestRecord,
    inheritedDefaults: InheritedDefaults,
    documentation: CollectionAuditDocumentationScore,
  ): CollectionAuditAssertionDepthScore {
    const classification = this.classifyAssertionScenario(request);
    const required = new Set(this.requiredAssertionDimensions(classification, request));
    const evidence = this.collectAssertionEvidence(request, inheritedDefaults, documentation);
    const dimensions = Object.entries(ASSERTION_DIMENSION_LABELS).map(([key, label]) => {
      const dimensionKey = key as CollectionAuditAssertionDimensionKey;
      return {
        evidence: evidence[dimensionKey],
        key: dimensionKey,
        label,
        present: evidence[dimensionKey].length > 0,
        required: required.has(dimensionKey),
      };
    });
    const requiredDimensions = dimensions.filter((dimension) => dimension.required);
    const covered = requiredDimensions.filter((dimension) => dimension.present).length;
    const total = requiredDimensions.length;
    const missingRequired = requiredDimensions
      .filter((dimension) => !dimension.present)
      .map((dimension) => dimension.key);

    return {
      classification,
      covered,
      dimensions,
      missingRequired,
      percent: total === 0 ? 100 : Math.round((covered / total) * 100),
      total,
    };
  }

  private classifyAssertionScenario(
    request: RequestRecord,
  ): CollectionAuditAssertionDepthClassification {
    const method = request.method.toUpperCase();
    const content = this.getRequestContent(request).toLowerCase();
    const routeContext =
      `${request.name}\n${request.relativePath}\n${request.url}\n${request.tags.join('\n')}`.toLowerCase();

    if (
      /\/\$metadata\b|\/openapi\.json\b|\/swagger\b|(^|[-/ ])service-document($|[-/ ])|swagger|openapi/.test(
        routeContext,
      )
    ) {
      return 'contract-doc';
    }

    if (
      /(^|\/)(00-setup|support|seed|resolver)(\/|$)|seed-resolver|seed resolver|bootstrap|health|client-credentials|token/.test(
        routeContext,
      )
    ) {
      return 'support';
    }

    if (
      /\b(?:invalid|missing|unsupported|reject(?:ed)?|denied|forbidden|unauthorized|negative|known-bug|malformed|stale|gap)\b|bad[- ](?:entity|key|request)|not[- ]found/.test(
        routeContext,
      )
    ) {
      return 'negative';
    }

    if (
      /\b(?:event|eventbridge|sqs|s3|file-scan|upload|download|formotion|firehose|phi-audit)\b/.test(
        routeContext,
      )
    ) {
      return 'event-or-file';
    }

    if (MUTATING_METHODS.includes(method)) {
      return 'mutation';
    }

    if (/[?&](?:%24|\$)(select|filter|orderby|top|skip|count|expand)=/.test(content)) {
      return 'query-read';
    }

    if (/\([^)]*\)|\{\{[^}]*id[^}]*\}\}|\/\{[^}]*id[^}]*\}/i.test(request.url)) {
      return 'key-read';
    }

    return 'read';
  }

  private requiredAssertionDimensions(
    classification: CollectionAuditAssertionDepthClassification,
    request: RequestRecord,
  ): CollectionAuditAssertionDimensionKey[] {
    switch (classification) {
      case 'contract-doc':
        return ['status', 'content-type', 'response-shape', 'docs'];
      case 'event-or-file':
        return [
          'status',
          'response-shape',
          'business-semantics',
          'side-effects',
          'no-unexpected-side-effects',
          'docs',
        ];
      case 'key-read':
        return [
          'status',
          'content-type',
          'response-shape',
          'schema-fields',
          'seed-identity',
          'docs',
        ];
      case 'mutation':
        return [
          'status',
          'response-shape',
          'schema-fields',
          'business-semantics',
          'side-effects',
          'no-unexpected-side-effects',
          'docs',
        ];
      case 'negative':
        return this.negativeAssertionDimensions(request);
      case 'query-read':
        return [
          'status',
          'content-type',
          'response-shape',
          'schema-fields',
          'seed-identity',
          'query-semantics',
          'docs',
        ];
      case 'support':
        return this.supportAssertionDimensions(request);
      case 'read':
      default:
        return [
          'status',
          'content-type',
          'response-shape',
          'schema-fields',
          'seed-identity',
          'docs',
        ];
    }
  }

  private supportAssertionDimensions(
    request: RequestRecord,
  ): CollectionAuditAssertionDimensionKey[] {
    const routeContext =
      `${request.name}\n${request.relativePath}\n${request.url}\n${request.tags.join('\n')}`.toLowerCase();
    if (/seed|resolver|bootstrap|runtime|token|client-credentials/.test(routeContext)) {
      return ['status', 'response-shape', 'seed-identity', 'variable-capture', 'docs'];
    }

    return ['status', 'response-shape', 'business-semantics', 'docs'];
  }

  private negativeAssertionDimensions(
    request: RequestRecord,
  ): CollectionAuditAssertionDimensionKey[] {
    const routeContext =
      `${request.name}\n${request.relativePath}\n${request.url}\n${request.tags.join('\n')}`.toLowerCase();
    const method = request.method.toUpperCase();
    const dimensions: CollectionAuditAssertionDimensionKey[] = [
      'status',
      'negative-envelope',
      'business-semantics',
      'docs',
    ];
    const needsSideEffectGuard =
      !['GET', 'HEAD', 'OPTIONS'].includes(method) ||
      /auth|authorizer|gateway|token|plan|\/file(?:\/|$|\?)|file-upload|file-download|upload|download|\bevent\b|sqs|s3|firehose|formotion/.test(
        routeContext,
      );

    if (needsSideEffectGuard) {
      dimensions.push('no-unexpected-side-effects');
    }

    return dimensions;
  }

  private collectAssertionEvidence(
    request: RequestRecord,
    inheritedDefaults: InheritedDefaults,
    documentation: CollectionAuditDocumentationScore,
  ): Record<CollectionAuditAssertionDimensionKey, string[]> {
    const tests = [inheritedDefaults.tests, request.tests].filter(Boolean).join('\n');
    const assertionNames = request.assertions
      .map((assertion) => String(assertion.name || ''))
      .join('\n');
    const assertionValues = request.assertions
      .map((assertion) => String(assertion.value || ''))
      .join('\n');
    const scripts = [
      inheritedDefaults.reqScript,
      inheritedDefaults.resScript,
      request.scripts.req,
      request.scripts.res,
    ]
      .filter(Boolean)
      .join('\n');
    const executableContext = [tests, assertionNames, assertionValues, scripts].join('\n');

    return {
      'business-semantics': this.matchEvidence(executableContext, [
        [
          /business|semantic|mapping|plan|scope|tenant|authorizer|gateway|policy|dependency/i,
          'business wording',
        ],
        [
          /persist|created|updated|deleted|sync|reimbursement|invoice|payment|job|event|publish/i,
          'domain effect',
        ],
        [/identity|same|matches?|expected|configured|seeded/i, 'expected domain value'],
      ]),
      'content-type': this.matchEvidence(executableContext, [
        [/content-type|content type|getHeader\(["']content-type["']\)/i, 'content type check'],
        [
          /application\/json|application\/xml|text\/html|xml through|json through/i,
          'media type expectation',
        ],
      ]),
      docs: documentation.score >= 70 ? documentation.evidence : [],
      'negative-envelope': this.matchEvidence(executableContext, [
        [
          /error|envelope|message|reject|denied|forbidden|unauthorized|not-found|not found/i,
          'error contract',
        ],
        [
          /ignored|fails closed|failure|failed|stubbed|unknown|processingfailed/i,
          'fail-closed or stubbed contract',
        ],
        [/401|403|404|400|500|4xx|5xx|missing authentication token/i, 'negative status family'],
      ]),
      'no-unexpected-side-effects': this.matchEvidence(executableContext, [
        [
          /does not|do not|no .*calls?|without .*call|not create|not update|not return .*mutation/i,
          'absence assertion',
        ],
        [
          /emits no|safely ignored|fails closed|before .*data access|before .*customer api/i,
          'fail-closed assertion',
        ],
        [/does not masquerade|does not create|does not proxy/i, 'route gap guard'],
      ]),
      'query-semantics': this.matchEvidence(executableContext, [
        [/\$select|%24select|selected fields?|projection/i, 'select semantics'],
        [/\$filter|%24filter|filter effect|lambda filter/i, 'filter semantics'],
        [/\$orderby|%24orderby|order effect|sorted/i, 'order semantics'],
        [/\$top|%24top|\$skip|%24skip|pagination|page/i, 'pagination semantics'],
        [/\$count|%24count|@odata\.count/i, 'count semantics'],
        [/\$expand|%24expand|expanded navigation|navigation property/i, 'expand semantics'],
      ]),
      'response-shape': this.matchEvidence(executableContext, [
        [
          /to\.have\.property|have\.keys?|property\(|keys\(|Array\.isArray|array|object/i,
          'shape assertion',
        ],
        [/\bjson\.[A-Za-z_][A-Za-z0-9_]*/, 'response field access'],
        [/@odata|\.value\b|body shape|payload|response shape|schema/i, 'payload shape'],
        [/length(?:\.of)?|at\.least|empty|not\.empty/i, 'collection cardinality'],
      ]),
      'schema-fields': this.matchEvidence(executableContext, [
        [
          /field|fields|property|properties|required|nullability|null|type|typeof/i,
          'field/type assertion',
        ],
        [
          /string|number|boolean|array|object|date|enum|max(?:imum)?|min(?:imum)?|length/i,
          'primitive constraint',
        ],
        [/id\b|identifier|primary key|foreign key|@odata\.id/i, 'identity field'],
      ]),
      'seed-identity': this.matchEvidence(executableContext, [
        [/seed|seeded|fixture|resolver|manifest|coverage/i, 'seed source'],
        [
          /\{\{[^}]*_id\}\}|\{\{[^}]*Id\}\}|bru\.(?:getVar|getEnvVar|setVar|setEnvVar)\(/,
          'seed variable',
        ],
        [/identity|same id|key identity|live data|real data/i, 'seed identity assertion'],
      ]),
      'side-effects': this.matchEvidence(executableContext, [
        [
          /created|updated|deleted|mutat|persist|write|publish|published|emits?|sends?|posts?|uploads?|downloads?/i,
          'side effect',
        ],
        [
          /s3|sqs|eventbridge|lambda|bc |business central|umbrella|firehose/i,
          'external dependency effect',
        ],
        [/call count|captur|request includes|payload contains|writes/i, 'captured dependency call'],
      ]),
      status: this.matchEvidence(executableContext, [
        [
          /res\.(?:status|getStatus\()|response status|status is|status was asserted|res\.status/i,
          'status assertion',
        ],
        [/\bexpect\([^)]*status/i, 'status expectation'],
      ]),
      'variable-capture': this.matchEvidence(executableContext, [
        [/bru\.(?:setVar|setEnvVar|getVar|getEnvVar)\(/, 'Bruno variable API'],
        [
          /store|stored|capture|captured|resolver|runtime var|environment variable/i,
          'runtime variable wording',
        ],
      ]),
    };
  }

  private matchEvidence(context: string, patterns: Array<[RegExp, string]>): string[] {
    return patterns.filter(([pattern]) => pattern.test(context)).map(([, evidence]) => evidence);
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
    const docsMeaningfulRequests = requests.filter((request) =>
      ['decision-grade', 'meaningful'].includes(request.documentation.quality),
    ).length;
    const docsDecisionGradeRequests = requests.filter(
      (request) => request.documentation.quality === 'decision-grade',
    ).length;
    const docsThinRequests = requests.filter((request) =>
      ['placeholder', 'thin'].includes(request.documentation.quality),
    ).length;
    const docsDepthScore =
      totalRequests === 0
        ? 100
        : Math.round(
            requests.reduce((total, request) => total + request.documentation.score, 0) /
              totalRequests,
          );
    const assertionDepthCovered = requests.reduce(
      (total, request) => total + request.assertionDepth.covered,
      0,
    );
    const assertionDepthTotal = requests.reduce(
      (total, request) => total + request.assertionDepth.total,
      0,
    );
    const assertionDepthScore =
      assertionDepthTotal === 0
        ? 100
        : Math.round((assertionDepthCovered / assertionDepthTotal) * 100);
    const assertionPerfectRequests = requests.filter(
      (request) => request.assertionDepth.percent === 100,
    ).length;
    const assertionIncompleteRequests = totalRequests - assertionPerfectRequests;
    const semanticRiskFindings = requests.reduce(
      (total, request) => total + request.semanticRisks.length,
      0,
    );
    const parityRiskFindings = requests.reduce(
      (total, request) => total + request.parityRisks.length,
      0,
    );
    const productDefectFindings = this.countParityRisks(requests, 'product-infra-defect');
    const seedDataGapFindings = this.countParityRisks(requests, 'seed-data-gap');
    const testInfraParityFindings = this.countParityRisks(requests, 'emulator-gap');
    const externalStubFindings = this.countParityRisks(requests, 'external-dependency-stub');
    const semanticRiskPenalty = requests.reduce(
      (total, request) =>
        total +
        request.semanticRisks.reduce((riskTotal, risk) => {
          if (risk.severity === 'high') {
            return riskTotal + 10;
          }
          if (risk.severity === 'medium') {
            return riskTotal + 5;
          }
          return riskTotal + 2;
        }, 0),
      0,
    );
    const parityRiskPenalty = requests.reduce(
      (total, request) =>
        total +
        request.parityRisks.reduce((riskTotal, risk) => {
          if (risk.severity === 'high') {
            return riskTotal + 10;
          }
          if (risk.severity === 'medium') {
            return riskTotal + 5;
          }
          return riskTotal + 2;
        }, 0),
      0,
    );
    const semanticRiskScore = Math.max(0, 100 - semanticRiskPenalty);
    const parityRiskScore = Math.max(0, 100 - parityRiskPenalty);
    const documentationPenalty = Math.round((100 - docsDepthScore) / 5);
    const enterpriseReadinessScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          100 -
            noneRequests * 6 -
            shallowRequests * 2 -
            assertionIncompleteRequests * 3 -
            literalPlaceholderRequests * 5 -
            duplicateEndpointGroups * 2 -
            documentationPenalty -
            semanticRiskPenalty,
        ),
      ),
    );

    return {
      assertionDepthCovered,
      assertionDepthScore,
      assertionDepthTotal,
      assertionIncompleteRequests,
      assertionPerfectRequests,
      deepRequests,
      destructiveRequests,
      docsDecisionGradeRequests,
      docsDepthScore,
      docsMeaningfulRequests,
      docsPresentRequests,
      docsThinRequests,
      duplicateEndpointGroups,
      enterpriseReadinessScore,
      externalStubFindings,
      literalPlaceholderRequests,
      moderateRequests,
      noneRequests,
      parityRiskFindings,
      parityRiskScore,
      productDefectFindings,
      requestsWithAssertions,
      requestsWithScripts,
      requestsWithTests,
      seedDataGapFindings,
      semanticRiskFindings,
      semanticRiskScore,
      shallowRequests,
      testInfraParityFindings,
      totalRequests,
    };
  }

  private countParityRisks(
    requests: CollectionAuditRequestSummary[],
    kind: CollectionAuditParityRiskKind,
  ): number {
    return requests.reduce(
      (total, request) => total + request.parityRisks.filter((risk) => risk.kind === kind).length,
      0,
    );
  }

  private findDuplicateEndpoints(
    requests: CollectionAuditRequestSummary[],
  ): CollectionAuditDuplicateEndpoint[] {
    const groups = new Map<string, CollectionAuditDuplicateEndpoint>();

    for (const request of requests) {
      const key = `${request.method.toUpperCase()} ${request.url} ${request.duplicateFingerprint}`;
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

  private buildDuplicateFingerprint(
    request: RequestRecord,
    classification: CollectionAuditAssertionDepthClassification,
  ): string {
    return [
      classification,
      this.normalizeDuplicateText(this.bodyToText(request)),
      this.normalizeDuplicateText(request.docs),
      request.tags.toSorted().join(','),
    ].join('|');
  }

  private normalizeDuplicateText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
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
      docs: defaultsChain
        .map((defaults) => String(defaults.docs || ''))
        .filter(Boolean)
        .join('\n\n'),
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

  private shouldFlagAuthNone(
    authMode: string,
    request: RequestRecord,
    inheritedDefaults: InheritedDefaults,
  ): boolean {
    if (authMode !== 'none') {
      return false;
    }

    const inheritedAuthMode = inheritedDefaults.authMode || '';
    const requestMode = String(request.auth.mode || '');
    return inheritedAuthMode.length > 0 && inheritedAuthMode !== 'none' && requestMode === 'none';
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
