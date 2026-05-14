import type { ContractCoverageItem, ContractCoverageManifest } from './contract-coverage.js';

export type BrunoRunReportFormat = 'bruno-json' | 'junit-xml';
export type BrunoRunRequestStatus = 'failed' | 'passed' | 'skipped';
export type ContractRuntimeStatus = BrunoRunRequestStatus | 'not-run';

export interface BrunoRunRequest {
  durationMs?: number;
  error?: string;
  iterationIndex?: number;
  method?: string;
  name: string;
  path: string;
  status: BrunoRunRequestStatus;
  statusCode?: number;
  url?: string;
}

export interface BrunoRunReport {
  format: BrunoRunReportFormat;
  requests: BrunoRunRequest[];
  summary: BrunoRunReportSummary;
}

export interface BrunoRunReportSummary {
  failed: number;
  passed: number;
  skipped: number;
  total: number;
}

export interface ContractCoverageRuntimeMatch {
  error?: string;
  path: string;
  requestName?: string;
  status: BrunoRunRequestStatus | 'not-run';
}

export type ContractCoverageRuntimeItem = ContractCoverageItem & {
  runtime?: {
    coveredBy: ContractCoverageRuntimeMatch[];
  };
  runtimeStatus: ContractRuntimeStatus;
};

export interface ContractCoverageRuntimeSummary {
  failedItems: number;
  notRunItems: number;
  passedItems: number;
  skippedItems: number;
  totalItems: number;
}

export type ContractCoverageRuntimeReconciliation = Omit<ContractCoverageManifest, 'items'> & {
  items: ContractCoverageRuntimeItem[];
  summary: ContractCoverageManifest['summary'] & {
    runtime: ContractCoverageRuntimeSummary;
  };
};

interface BrunoJsonIteration {
  iterationIndex?: number;
  results?: BrunoJsonRequest[];
  summary?: Record<string, unknown>;
}

interface BrunoJsonRequest {
  assertionResults?: Array<{ error?: string; status?: string }>;
  error?: string;
  iterationIndex?: number;
  name?: string;
  path?: string;
  postResponseTestResults?: Array<{ error?: string; isScriptError?: boolean; status?: string }>;
  preRequestTestResults?: Array<{ error?: string; isScriptError?: boolean; status?: string }>;
  request?: {
    method?: string;
    url?: string;
  };
  response?: {
    status?: number | string;
  };
  runDuration?: number;
  status?: string;
  testResults?: Array<{ error?: string; isScriptError?: boolean; status?: string }>;
}

export class BrunoRunReportManager {
  parseJsonReport(input: string | unknown): BrunoRunReport {
    const parsed = typeof input === 'string' ? (JSON.parse(input) as unknown) : input;
    const iterations = this.normalizeJsonIterations(parsed);
    const requests = iterations.flatMap((iteration) =>
      (iteration.results || []).map((result) => this.normalizeJsonRequest(result, iteration)),
    );

    return {
      format: 'bruno-json',
      requests,
      summary: this.summarizeRequests(requests),
    };
  }

  parseJunitReport(xml: string): BrunoRunReport {
    const requests: BrunoRunRequest[] = [];
    const testcasePattern = /<testcase\b([^>]*?)\/>|<testcase\b([^>]*?)>([\s\S]*?)<\/testcase>/gi;
    let match: RegExpExecArray | null;

    while ((match = testcasePattern.exec(xml))) {
      const attributes = this.parseXmlAttributes(match[1] || match[2] || '');
      const body = match[3] || '';
      const failure = this.firstXmlElement(body, ['failure', 'error']);
      const skipped = this.firstXmlElement(body, ['skipped']);
      const status: BrunoRunRequestStatus = failure ? 'failed' : skipped ? 'skipped' : 'passed';
      const timeSeconds = this.toNumber(attributes.time);
      const error = failure?.attributes.message || skipped?.attributes.message || failure?.text;

      requests.push({
        durationMs: timeSeconds === undefined ? undefined : Math.round(timeSeconds * 1000),
        error: error ? this.decodeXml(error.trim()) : undefined,
        name: this.decodeXml(attributes.name || attributes.classname || '<unnamed>'),
        path: this.normalizePath(
          attributes.file ||
            attributes.path ||
            attributes.name ||
            `${attributes.classname || 'junit'}.${attributes.name || 'testcase'}`,
        ),
        status,
      });
    }

    return {
      format: 'junit-xml',
      requests,
      summary: this.summarizeRequests(requests),
    };
  }

  reconcileCoverage(
    manifest: ContractCoverageManifest,
    report: BrunoRunReport,
  ): ContractCoverageRuntimeReconciliation {
    const requestsByPath = new Map<string, BrunoRunRequest[]>();
    for (const request of report.requests) {
      const normalizedPath = this.normalizePath(request.path);
      const existing = requestsByPath.get(normalizedPath) || [];
      existing.push(request);
      requestsByPath.set(normalizedPath, existing);
    }

    const items = manifest.items.map((item) => this.reconcileItem(item, requestsByPath));
    return {
      ...manifest,
      items,
      summary: {
        ...manifest.summary,
        runtime: this.summarizeRuntimeItems(items),
      },
    };
  }

  private reconcileItem(
    item: ContractCoverageItem,
    requestsByPath: Map<string, BrunoRunRequest[]>,
  ): ContractCoverageRuntimeItem {
    const coveredBy = item.coveredBy.length > 0 ? item.coveredBy : [];
    const matches = coveredBy.flatMap((requestPath): ContractCoverageRuntimeMatch[] => {
      const matchingRequests = requestsByPath.get(this.normalizePath(requestPath));
      if (!matchingRequests || matchingRequests.length === 0) {
        return [{ path: requestPath, status: 'not-run' }];
      }

      return matchingRequests.map((request) => ({
        error: request.error,
        path: request.path,
        requestName: request.name,
        status: request.status,
      }));
    });
    const runtimeStatus = this.rollUpRuntimeStatus(matches);

    return {
      ...item,
      runtime: { coveredBy: matches },
      runtimeStatus,
    };
  }

  private rollUpRuntimeStatus(matches: ContractCoverageRuntimeMatch[]): ContractRuntimeStatus {
    if (matches.length === 0) {
      return 'not-run';
    }
    if (matches.some((match) => match.status === 'failed')) {
      return 'failed';
    }
    if (matches.some((match) => match.status === 'skipped')) {
      return 'skipped';
    }
    if (matches.some((match) => match.status === 'not-run')) {
      return 'not-run';
    }
    return 'passed';
  }

  private normalizeJsonIterations(input: unknown): BrunoJsonIteration[] {
    if (Array.isArray(input)) {
      return input.map((entry) => (this.isRecord(entry) ? entry : {}));
    }
    if (!this.isRecord(input)) {
      return [];
    }
    if (Array.isArray(input.iterations)) {
      return input.iterations.map((entry) => (this.isRecord(entry) ? entry : {}));
    }
    if (Array.isArray(input.results)) {
      return [input as BrunoJsonIteration];
    }
    return [];
  }

  private normalizeJsonRequest(
    result: BrunoJsonRequest,
    iteration: BrunoJsonIteration,
  ): BrunoRunRequest {
    const status = this.normalizeJsonStatus(result);
    const statusCode = this.toNumber(result.response?.status);
    return {
      durationMs: this.toNumber(result.runDuration),
      error: this.extractJsonError(result),
      iterationIndex: this.toNumber(result.iterationIndex ?? iteration.iterationIndex),
      method: result.request?.method?.toUpperCase(),
      name: result.name || result.path || '<unnamed>',
      path: this.normalizePath(result.path || result.name || '<unknown>'),
      status,
      statusCode,
      url: result.request?.url,
    };
  }

  private normalizeJsonStatus(result: BrunoJsonRequest): BrunoRunRequestStatus {
    const status = result.status?.toLowerCase();
    if (status === 'skipped' || status === 'skip') {
      return 'skipped';
    }
    if (status === 'fail' || status === 'failed' || status === 'error') {
      return 'failed';
    }
    if (result.error || this.hasFailedCheck(result)) {
      return 'failed';
    }
    return 'passed';
  }

  private hasFailedCheck(result: BrunoJsonRequest): boolean {
    return [
      ...(result.assertionResults || []),
      ...(result.preRequestTestResults || []),
      ...(result.postResponseTestResults || []),
      ...(result.testResults || []),
    ].some((entry) => entry.status === 'fail' || Boolean(entry.error));
  }

  private extractJsonError(result: BrunoJsonRequest): string | undefined {
    if (typeof result.error === 'string' && result.error.trim()) {
      return result.error;
    }
    const failedCheck = [
      ...(result.preRequestTestResults || []),
      ...(result.postResponseTestResults || []),
      ...(result.testResults || []),
      ...(result.assertionResults || []),
    ].find((entry) => entry.status === 'fail' || Boolean(entry.error));
    return failedCheck?.error;
  }

  private summarizeRequests(requests: BrunoRunRequest[]): BrunoRunReportSummary {
    return {
      failed: requests.filter((request) => request.status === 'failed').length,
      passed: requests.filter((request) => request.status === 'passed').length,
      skipped: requests.filter((request) => request.status === 'skipped').length,
      total: requests.length,
    };
  }

  private summarizeRuntimeItems(
    items: ContractCoverageRuntimeItem[],
  ): ContractCoverageRuntimeSummary {
    return {
      failedItems: items.filter((item) => item.runtimeStatus === 'failed').length,
      notRunItems: items.filter((item) => item.runtimeStatus === 'not-run').length,
      passedItems: items.filter((item) => item.runtimeStatus === 'passed').length,
      skippedItems: items.filter((item) => item.runtimeStatus === 'skipped').length,
      totalItems: items.length,
    };
  }

  private firstXmlElement(
    body: string,
    names: string[],
  ): { attributes: Record<string, string>; text: string } | undefined {
    for (const name of names) {
      const elementPattern = new RegExp(
        `<${name}\\b([^>]*?)>([\\s\\S]*?)<\\/${name}>|<${name}\\b([^>]*?)\\/>`,
        'i',
      );
      const match = elementPattern.exec(body);
      if (!match) {
        continue;
      }

      return {
        attributes: this.parseXmlAttributes(match[1] || match[3] || ''),
        text: this.stripXmlTags(match[2] || ''),
      };
    }
    return undefined;
  }

  private parseXmlAttributes(value: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    const attributePattern = /([:\w-]+)\s*=\s*(["'])(.*?)\2/g;
    let match: RegExpExecArray | null;
    while ((match = attributePattern.exec(value))) {
      attributes[match[1]!] = this.decodeXml(match[3] || '');
    }
    return attributes;
  }

  private stripXmlTags(value: string): string {
    return this.decodeXml(value.replace(/<[^>]+>/g, '').trim());
  }

  private decodeXml(value: string): string {
    return value
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  private normalizePath(value: string): string {
    return value
      .trim()
      .replace(/^['"]+|['"]+$/g, '')
      .replace(/\\/g, '/')
      .replace(/^\.\//, '');
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}

export function createBrunoRunReportManager(): BrunoRunReportManager {
  return new BrunoRunReportManager();
}
