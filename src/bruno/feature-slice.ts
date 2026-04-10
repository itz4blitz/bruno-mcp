import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';

import { faker } from '@faker-js/faker';

import { BrunoNativeManager, RequestUpdatePatch } from './native.js';
import { RequestBuilder } from './request.js';
import { WorkspaceManager } from './workspace.js';
import { BodyType, BrunoError, HttpMethod } from './types.js';

const FEATURE_FOLDER_GROUPS = [
  'Happy Path',
  'Read',
  'Negative',
  'Security',
  'Matrix',
  'Docs',
] as const;

const SUPPORT_FOLDER_GROUPS = ['Auth', 'Seed', 'Resolve', 'Cleanup'] as const;

export const FEATURE_SLICE_TYPE_VALUES = [
  'resource-crud',
  'workflow',
  'auth',
  'search-filtering',
  'upload',
  'admin-resource',
] as const;

export const FEATURE_SLICE_OVERLAY_VALUES = ['raw-dto-overlay'] as const;

export type FeatureSliceType =
  | (typeof FEATURE_SLICE_TYPE_VALUES)[number];

export type SupportRequestRole = 'auth' | 'cleanup' | 'lookup' | 'resolve' | 'seed';

export type CleanupTruthStatus = 'possible' | 'conditional' | 'best-effort' | 'impossible' | 'none';

export type FindingKind =
  | 'collection-defect'
  | 'coverage-gap'
  | 'design-warning'
  | 'product-defect';

export type DataGenerationMode = 'builtin' | 'faker';

export interface DynamicDataPolicy {
  fakerProfile?: 'commerce' | 'person' | 'simple';
  mode?: DataGenerationMode;
  persistAsVars?: boolean;
  scope?: 'bruno-runtime' | 'mcp';
}

export interface DynamicDataBundle {
  generatedAt: string;
  generatedVars: Record<string, string>;
  mode: DataGenerationMode;
  scope: 'bruno-runtime' | 'mcp';
  suffix: string;
  uniqueEmail: string;
  uniqueName: string;
}

export interface OverlayDefinition {
  cleanupPolicyStatus?: CleanupTruthStatus;
  description: string;
  docsNotes: string[];
  id: string;
  requiredInputs: string[];
  requestTags: string[];
}

export interface CleanupTruth {
  notes?: string;
  reason: string;
  requiredCondition?: string;
  requestPath?: string;
  status: CleanupTruthStatus;
}

export interface SliceFinding {
  evidence?: string;
  expectedBehavior?: string;
  kind: FindingKind;
  observedBehavior?: string;
  recommendedAction?: string;
  requestPath?: string;
  severity: 'high' | 'low' | 'medium';
  title: string;
}

export interface SupportRequestSpec {
  description: string;
  expectedStatus: number;
  folder: string;
  generatedData?: Record<string, string>;
  headers?: Record<string, string>;
  method: HttpMethod;
  name: string;
  outputs: string[];
  postResponseScript?: string;
  requiredInputs: string[];
  role: SupportRequestRole;
  url: string;
  usedBy: string[];
  visibility: 'convenience' | 'strict';
}

export interface MatrixScenarioDelta {
  caseId?: string;
  delta?: {
    removePaths?: string[];
    set?: Record<string, string | number | boolean | null>;
  };
  expectedOutcome: string;
  expectedStatus: number;
  field?: string;
  notes?: string;
  scenarioId: string;
  tags?: string[];
  value?: string | number | boolean | null;
}

export interface MatrixSpec {
  allowedDeltaPaths: string[];
  basePayload: Record<string, string | number | boolean | null>;
  basePayloadRef: string;
  category: 'negative' | 'security';
  expectedOutcomeField: 'expectedOutcome';
  expectedStatusField: 'expectedStatus';
  metadataFilePath: string;
  requestFolder: string;
  requestName: string;
  requestUrl: string;
  requiredIterationFields: string[];
  scenarioFilePath: string;
  scenarioKeys: string[];
  scenarios: MatrixScenarioDelta[];
  strategy: 'base-valid-payload-plus-deltas';
  strict: true;
}

export interface CoreRequestSpec {
  action: 'create' | 'delete' | 'get' | 'list' | 'update';
  authStrategy: 'explicit-support-var' | 'none';
  body?: {
    content?: string;
    type: BodyType;
  };
  category: 'happy-path' | 'read' | 'negative' | 'security' | 'support';
  description: string;
  expectedStatus: number;
  folder: string;
  headers?: Record<string, string>;
  method: HttpMethod;
  name: string;
  postResponseScript?: string;
  requiredSupportRoles?: SupportRequestRole[];
  tags: string[];
  url: string;
}

export interface SliceStructure {
  featureFolders: string[];
  metadataRoot: string;
  supportFolders: string[];
}

export interface FeatureSlicePlan {
  assumptions: string[];
  basePath: string;
  cleanupPolicy: CleanupTruth;
  collectionPath: string;
  convenienceMode: boolean;
  coreRequests: CoreRequestSpec[];
  featureName: string;
  featureType: FeatureSliceType;
  findings: SliceFinding[];
  matrixes: MatrixSpec[];
  overlay?: string;
  overlayDetails?: OverlayDefinition;
  requiredInputs: string[];
  sliceId: string;
  sourceOfTruth?: string;
  strictMode: boolean;
  structure: SliceStructure;
  supportRequests: SupportRequestSpec[];
  targetResource: string;
}

export interface SliceManifest {
  cleanupPolicy: CleanupTruth;
  collectionPath: string;
  createdAt: string;
  dynamicData?: DynamicDataBundle;
  featureName: string;
  featureType: FeatureSliceType;
  findings: SliceFinding[];
  matrixes: MatrixSpec[];
  overlay?: string;
  overlayDetails?: OverlayDefinition;
  plan: FeatureSlicePlan;
  runManifest?: FeatureRunManifest;
  runManifestPath?: string;
  sliceId: string;
  sourceOfTruth?: string;
  strictMode: boolean;
  updatedAt: string;
}

export type FeatureRunPhase =
  | 'auth'
  | 'support'
  | 'happy_path'
  | 'read'
  | 'negative'
  | 'security'
  | 'cleanup';

export type FeatureRunProfile =
  | 'smoke'
  | 'full'
  | 'negative_only'
  | 'security_only'
  | 'support_only';

export interface FeatureRunStep {
  cleanupPolicyStatus?: CleanupTruthStatus;
  continueOnFailure: boolean;
  dataFilePath?: string;
  env?: string;
  id: string;
  name: string;
  phase: FeatureRunPhase;
  profileMembership: FeatureRunProfile[];
  requestPath: string;
  stopOnFailure: boolean;
}

export interface FeatureRunManifest {
  cleanupPolicy: CleanupTruth;
  collectionPath: string;
  defaultEnv?: string;
  generatedAt: string;
  profiles: FeatureRunProfile[];
  sliceId: string;
  steps: FeatureRunStep[];
}

export interface RunFeatureSliceInput {
  collectionPath: string;
  env: string;
  globalEnv?: string;
  profile?: FeatureRunProfile;
  sliceId: string;
  workspacePath?: string;
}

export interface FeatureRunStepResult {
  classification: 'cleanup' | 'collection-defect' | 'product-defect' | 'setup-failure';
  dataFilePath?: string;
  durationMs: number;
  error?: string;
  exitCode: number;
  name: string;
  passed: boolean;
  phase: FeatureRunPhase;
  requestPath: string;
  stderr: string;
  stdout: string;
}

export interface FeatureRunReport {
  cleanupOutcomes: Array<{ name: string; outcome: string; requestPath: string }>;
  collectionDefects: Array<{ evidence: string; title: string }>;
  env: string;
  exitStatus: 'failed' | 'passed';
  passCount: number;
  productDefects: Array<{ evidence: string; title: string }>;
  profile: FeatureRunProfile;
  setupFailures: Array<{ evidence: string; title: string }>;
  sliceId: string;
  stepResults: FeatureRunStepResult[];
  totalSteps: number;
}

export interface InspectFeatureSliceContextInput {
  basePath?: string;
  collectionPath: string;
  featureName: string;
  workspacePath?: string;
}

export interface PlanFeatureSliceInput {
  basePath?: string;
  collectionPath: string;
  convenienceMode?: boolean;
  featureName: string;
  featureType: FeatureSliceType;
  overlay?: string;
  sourceOfTruth?: string;
  strictMode?: boolean;
  targetResource?: string;
}

export interface ScaffoldFeatureSliceInput extends PlanFeatureSliceInput {
  dataPolicy?: DynamicDataPolicy;
  includeMatrices?: boolean;
  includeSupportRequests?: boolean;
}

export interface ScaffoldMatrixRequestInput {
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
}

export interface ScaffoldSupportRequestsInput {
  collectionPath: string;
  featureName: string;
  strictMode?: boolean;
  supportKinds: SupportRequestRole[];
  targetResource?: string;
}

export interface AuditFeatureSliceInput {
  collectionPath: string;
  overlay?: string;
  sliceId: string;
  sourceOfTruth?: string;
}

export interface RecordSliceFindingsInput {
  collectionPath: string;
  findings: SliceFinding[];
  sliceId: string;
  writeMode?: 'docs-only' | 'request-docs' | 'slice-manifest';
}

export interface RefreshGeneratedDataInput {
  collectionPath: string;
  policy?: DynamicDataPolicy;
  sliceId: string;
}

type SliceScaffoldResult = {
  createdFolders: string[];
  createdRequests: string[];
  dynamicData: DynamicDataBundle;
  manifestPath: string;
  runManifestPath: string;
  scenarioFiles: string[];
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function titleCase(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(' ');
}

function singularize(value: string): string {
  if (value.endsWith('ies')) {
    return `${value.slice(0, -3)}y`;
  }
  if (value.endsWith('ses')) {
    return value.slice(0, -2);
  }
  if (value.endsWith('s') && value.length > 1) {
    return value.slice(0, -1);
  }
  return value;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

export class FeatureSliceManager {
  constructor(
    private nativeManager: BrunoNativeManager,
    private requestBuilder: RequestBuilder,
    private workspaceManager: WorkspaceManager,
  ) {}

  async inspectContext(input: InspectFeatureSliceContextInput): Promise<Record<string, unknown>> {
    const sliceId = slugify(input.featureName);
    const collectionDefaults = await this.nativeManager.getCollectionDefaults(input.collectionPath);
    const folders = await this.nativeManager.listFolders(input.collectionPath);
    const requests = (await this.nativeManager.listRequests(input.collectionPath)) as Array<
      Record<string, unknown>
    >;
    const manifest = await this.readManifest(input.collectionPath, sliceId);
    const relatedRequests = requests.filter((request) => this.isRequestRelated(request, input.featureName));
    const missingCoverage = this.getMissingCoverage(folders, relatedRequests, input.featureName);
    const duplicationSignals = this.getDuplicationSignals(relatedRequests, collectionDefaults);
    const brunoNativeOpportunities = this.getBrunoNativeOpportunities(
      relatedRequests,
      folders,
      collectionDefaults,
    );
    const controllerCoverage = this.getControllerCoverage(relatedRequests);
    const supportCoverage = this.getSupportCoverage(relatedRequests);
    const workspace = input.workspacePath
      ? await this.workspaceManager.getWorkspaceSummary(input.workspacePath)
      : null;

    return {
      brunoNativeOpportunities,
      collectionDefaults,
      collectionPath: input.collectionPath,
      controllerCoverage,
      duplicationSignals,
      existingManifest: manifest,
      featureName: input.featureName,
      inferredAuthMode:
        typeof (collectionDefaults.auth as { mode?: string } | undefined)?.mode === 'string'
          ? (collectionDefaults.auth as { mode?: string }).mode
          : 'none',
      missingBrunoCoverage: missingCoverage,
      relatedRequests,
      sliceId,
      supportCoverage,
      workspace,
    };
  }

  async planFeatureSlice(input: PlanFeatureSliceInput): Promise<FeatureSlicePlan> {
    const sliceId = slugify(input.featureName);
    const targetResource = singularize(slugify(input.targetResource || input.featureName));
    const featureFolderRoot = `Features/${titleCase(input.featureName)}`;
    const basePath = this.normalizeBasePath(input.basePath || `/${slugify(input.targetResource || input.featureName)}`);
    const strictMode = input.strictMode !== false;
    const convenienceMode = Boolean(input.convenienceMode);
    const overlayDetails = this.resolveOverlay(input.overlay, targetResource);
    const structure: SliceStructure = {
      featureFolders: FEATURE_FOLDER_GROUPS.map((name) => `${featureFolderRoot}/${name}`),
      metadataRoot: this.getMetadataRoot(input.collectionPath, sliceId),
      supportFolders: SUPPORT_FOLDER_GROUPS.map((name) => `Support/${name}`),
    };

    const requiredInputs = dedupe([
      'baseUrl',
      `${targetResource}Id`,
      strictMode ? `${targetResource}AuthToken` : '',
      ...overlayDetails.requiredInputs,
    ].filter(Boolean));

    const supportRequests = this.buildSupportRequests({
      basePath,
      convenienceMode,
      featureFolderRoot,
      overlayDetails,
      strictMode,
      targetResource,
    });

    const coreRequests = this.buildCoreRequests({
      basePath,
      featureFolderRoot,
      input,
      overlayDetails,
      targetResource,
    });

    const matrixes = this.buildDefaultMatrixes({
      basePath,
      collectionPath: input.collectionPath,
      featureFolderRoot,
      sliceId,
      strictMode,
      targetResource,
    });

    const cleanupPolicy = this.buildCleanupPolicy(featureFolderRoot, targetResource);
    if (overlayDetails.cleanupPolicyStatus) {
      cleanupPolicy.status = overlayDetails.cleanupPolicyStatus;
    }
    const assumptions = dedupe([
      'Feature slices should keep shared auth, vars, scripts, and tests in collection or folder defaults when possible.',
      'Support requests must stay explicit; core requests must not silently branch into hidden setup.',
      'Strict matrix mode requires scenario deltas to declare expectedStatus and expectedOutcome for every row.',
      input.overlay ? `Overlay ${input.overlay} will be treated as project-specific logic layered on top of generic Bruno mechanics.` : '',
      ...overlayDetails.docsNotes,
    ].filter(Boolean));

    return {
      assumptions,
      basePath,
      cleanupPolicy,
      collectionPath: input.collectionPath,
      convenienceMode,
      coreRequests,
      featureName: input.featureName,
      featureType: input.featureType,
      findings: [],
      matrixes,
      overlay: input.overlay,
      overlayDetails,
      requiredInputs,
      sliceId,
      sourceOfTruth: input.sourceOfTruth,
      strictMode,
      structure,
      supportRequests,
      targetResource,
    };
  }

  async scaffoldFeatureSlice(input: ScaffoldFeatureSliceInput): Promise<SliceScaffoldResult> {
    const plan = await this.planFeatureSlice(input);
    const createdFolders: string[] = [];
    const createdRequests: string[] = [];
    const scenarioFiles: string[] = [];
    const supportRequestPaths = new Map<string, string>();
    const coreRequestPaths = new Map<string, string>();
    const matrixRequestPaths = new Map<string, { dataFilePath: string; requestPath: string }>();

    for (const folder of [...plan.structure.featureFolders, ...plan.structure.supportFolders]) {
      const result = await this.nativeManager.createFolder(plan.collectionPath, folder);
      if (!result.success) {
        throw new BrunoError(result.error || `Failed to create folder ${folder}`, 'FILE_ERROR');
      }
      createdFolders.push(folder);
    }

    await this.applySliceFolderDefaults(plan);

    const dynamicData = this.generateDynamicData(input.dataPolicy);
    if (input.dataPolicy?.persistAsVars) {
      await this.applyGeneratedVarsToSliceFolders(plan, dynamicData.generatedVars);
    }

    if (input.includeSupportRequests !== false) {
      for (const support of plan.supportRequests) {
        const requestPath = await this.writeRequest(plan.collectionPath, {
          assertions: [
            { name: 'res.status', value: `eq ${support.expectedStatus}` },
          ],
          body: this.buildSupportRequestBody(support, dynamicData),
          docs: this.describeSupportRequest(support, plan.cleanupPolicy),
          folder: support.folder,
          headers: support.headers,
          method: support.method,
          name: support.name,
          tags: [plan.sliceId, 'support', support.role],
          tests: this.buildSupportRequestTests(support),
          url: support.url,
        }, {
          postResponseScript: support.postResponseScript,
        });
        createdRequests.push(requestPath);
        supportRequestPaths.set(support.name, requestPath);
      }
    }

    for (const coreRequest of plan.coreRequests) {
      const requestPath = await this.writeRequest(plan.collectionPath, {
        body: coreRequest.body,
        docs: this.describeCoreRequest(coreRequest, plan),
        folder: coreRequest.folder,
        headers: coreRequest.headers,
        method: coreRequest.method,
        name: coreRequest.name,
        tags: coreRequest.tags,
        tests: this.buildStatusTest(coreRequest.expectedStatus),
        url: coreRequest.url,
      }, this.getCoreRequestPatch(coreRequest, plan, dynamicData));
      createdRequests.push(requestPath);
      coreRequestPaths.set(coreRequest.name, requestPath);
    }

    if (input.includeMatrices !== false) {
      for (const matrix of plan.matrixes) {
        const result = await this.scaffoldMatrixRequest({
          allowedDeltaPaths: matrix.allowedDeltaPaths,
          basePayload: matrix.basePayload,
          category: matrix.category,
          collectionPath: plan.collectionPath,
          requestFolder: matrix.requestFolder,
          requestName: matrix.requestName,
          requestUrl: matrix.requestUrl,
          requiredIterationFields: matrix.requiredIterationFields,
          scenarioDeltas: matrix.scenarios,
          sliceId: plan.sliceId,
          strictMode: plan.strictMode,
        });
        createdRequests.push(result.requestPath);
        scenarioFiles.push(result.scenarioFilePath);
        matrixRequestPaths.set(matrix.requestName, {
          dataFilePath: result.scenarioFilePath,
          requestPath: result.requestPath,
        });
      }
    }

    const runManifest = this.buildRunManifest(plan, supportRequestPaths, coreRequestPaths, matrixRequestPaths);
    const manifest = await this.persistManifest(plan, dynamicData, runManifest);
    await this.writeFindingsDocument(plan.collectionPath, plan.sliceId, plan.findings);

    return {
      createdFolders,
      createdRequests,
      dynamicData,
      manifestPath: manifest,
      runManifestPath: this.getRunManifestPath(plan.collectionPath, plan.sliceId),
      scenarioFiles,
    };
  }

  async scaffoldMatrixRequest(input: ScaffoldMatrixRequestInput): Promise<{
    metadataFilePath: string;
    requestPath: string;
    scenarioFilePath: string;
  }> {
    if (input.strictMode !== false) {
      this.validateMatrixScenarios(input.requiredIterationFields, input.allowedDeltaPaths, input.scenarioDeltas);
    }

    const basePayloadRef = `${input.sliceId}.${slugify(input.requestName)}.basePayload`;
    const scenarioFilePath = await this.writeScenarioFile(
      input.collectionPath,
      input.sliceId,
      input.requestName,
      input.scenarioDeltas,
    );
    const metadataFilePath = await this.writeMatrixMetadataFile(
      input.collectionPath,
      input.sliceId,
      input.requestName,
      {
        allowedDeltaPaths: input.allowedDeltaPaths,
        basePayloadRef,
        expectedOutcomeField: 'expectedOutcome',
        expectedStatusField: 'expectedStatus',
        requiredIterationFields: input.requiredIterationFields,
        scenarioFilePath: relative(input.collectionPath, scenarioFilePath),
        scenarioKeys: ['scenarioId', 'delta', 'expectedStatus', 'expectedOutcome', 'notes', 'tags'],
        strategy: 'base-valid-payload-plus-deltas',
        strict: true,
      },
    );

    const requestPath = await this.writeRequest(
      input.collectionPath,
      {
        assertions: [{ name: 'res.status', value: 'gte 100' }],
        body: {
          content: JSON.stringify(input.basePayload, null, 2),
          type: 'json',
        },
        docs: [
          `Strict ${input.category} matrix request.`,
          '',
          'Authoring contract:',
          '- Base valid payload lives in the request body and pre-request helpers.',
          `- Scenario deltas live in ${relative(input.collectionPath, scenarioFilePath)} and contain deltas only.`,
          `- Matrix metadata lives in ${relative(input.collectionPath, metadataFilePath)}.`,
          `- Required iteration fields: ${input.requiredIterationFields.join(', ')}.`,
          `- Allowed delta paths: ${input.allowedDeltaPaths.join(', ')}.`,
          '- No silent fallback rows are permitted.',
        ].join('\n'),
        folder: input.requestFolder,
        method: 'POST',
        name: input.requestName,
        tags: [input.sliceId, 'matrix', input.category],
        tests: [
          "const expectedStatus = Number(bru.getVar('expectedStatus') || 0);",
          "test('expected status is declared', function () { expect(expectedStatus).to.be.greaterThan(0); });",
          "test('response matches declared status', function () { expect(res.status).to.equal(expectedStatus); });",
        ].join('\n'),
        url: input.requestUrl,
      },
      {
        assertions: [{ name: 'res.status', value: 'gte 100' }],
        docs: [
          `Strict ${input.category} matrix request.`,
          `Scenario file: ${relative(input.collectionPath, scenarioFilePath)}`,
          `Metadata file: ${relative(input.collectionPath, metadataFilePath)}`,
          `Base payload ref: ${basePayloadRef}`,
        ].join('\n'),
        preRequestScript: this.buildMatrixPreRequestScript(input.basePayload),
        settings: {
          featureSliceStrictMatrix: true,
          featureSliceMatrixMetadataPath: relative(input.collectionPath, metadataFilePath),
          featureSliceScenarioFilePath: relative(input.collectionPath, scenarioFilePath),
        },
        tags: [input.sliceId, 'matrix', input.category],
      },
    );

    return {
      metadataFilePath,
      requestPath,
      scenarioFilePath,
    };
  }

  async scaffoldSupportRequests(input: ScaffoldSupportRequestsInput): Promise<{ requestPaths: string[] }> {
    const plan = await this.planFeatureSlice({
      collectionPath: input.collectionPath,
      featureName: input.featureName,
      featureType: 'resource-crud',
      strictMode: input.strictMode,
      targetResource: input.targetResource,
    });
    const selected = plan.supportRequests.filter((support) => input.supportKinds.includes(support.role));
    const dynamicData = this.generateDynamicData();
    const requestPaths: string[] = [];

    for (const support of selected) {
      const requestPath = await this.writeRequest(input.collectionPath, {
        assertions: [
          { name: 'res.status', value: `eq ${support.expectedStatus}` },
        ],
        body: this.buildSupportRequestBody(support, dynamicData),
        docs: this.describeSupportRequest(support, plan.cleanupPolicy),
        folder: support.folder,
        headers: support.headers,
        method: support.method,
        name: support.name,
        tags: [plan.sliceId, 'support', support.role],
        tests: this.buildSupportRequestTests(support),
        url: support.url,
      }, {
        postResponseScript: support.postResponseScript,
      });
      requestPaths.push(requestPath);
    }

    return { requestPaths };
  }

  async auditFeatureSlice(input: AuditFeatureSliceInput): Promise<Record<string, unknown>> {
    const manifest = await this.readManifest(input.collectionPath, input.sliceId);
    if (!manifest) {
      throw new BrunoError(`Feature slice ${input.sliceId} has not been scaffolded`, 'VALIDATION_ERROR');
    }

    const requests = (await this.nativeManager.listRequests(input.collectionPath)) as Array<
      Record<string, unknown>
    >;
    const sliceRequests = requests.filter((request) =>
      Array.isArray(request.tags) && (request.tags as string[]).includes(input.sliceId),
    );
    const collectionDefects: SliceFinding[] = [];
    const coverageGaps: SliceFinding[] = [];
    const productDefects = manifest.findings.filter((finding) => finding.kind === 'product-defect');

    for (const request of sliceRequests) {
      if (!Array.isArray(request.assertions) || request.assertions.length === 0) {
        collectionDefects.push({
          kind: 'collection-defect',
          requestPath: String(request.path || ''),
          severity: 'medium',
          title: `${String(request.name)} is missing assertions`,
          recommendedAction: 'Add stable contract assertions instead of relying only on tests.',
        });
      }

      if (typeof request.docs !== 'string' || request.docs.trim().length === 0) {
        collectionDefects.push({
          kind: 'collection-defect',
          requestPath: String(request.path || ''),
          severity: 'medium',
          title: `${String(request.name)} is missing docs`,
          recommendedAction: 'Document intent, setup assumptions, and cleanup truth explicitly.',
        });
      }

      if (!Array.isArray(request.tags) || request.tags.length === 0) {
        collectionDefects.push({
          kind: 'collection-defect',
          requestPath: String(request.path || ''),
          severity: 'low',
          title: `${String(request.name)} is missing tags`,
          recommendedAction: 'Tag slice, scenario class, and notable state such as known-bug explicitly.',
        });
      }
    }

    const missingCategories = this.findMissingRequestCategories(manifest.plan, sliceRequests);
    for (const category of missingCategories) {
      coverageGaps.push({
        kind: 'coverage-gap',
        severity: 'high',
        title: `Missing ${category} request coverage`,
        recommendedAction: `Scaffold or restore the ${category} slice requests.`,
      });
    }

    if (manifest.cleanupPolicy.status !== 'possible' && !manifest.cleanupPolicy.reason) {
      collectionDefects.push({
        kind: 'collection-defect',
        severity: 'medium',
        title: 'Cleanup truth is incomplete',
        recommendedAction: 'State clearly why cleanup is conditional or impossible.',
      });
    }

    for (const matrix of manifest.matrixes) {
      const matrixFileFindings = await this.auditMatrixFiles(input.collectionPath, matrix);
      for (const finding of matrixFileFindings) {
        if (finding.kind === 'coverage-gap') {
          coverageGaps.push(finding);
        } else if (finding.kind === 'product-defect') {
          productDefects.push(finding);
        } else {
          collectionDefects.push(finding);
        }
      }
    }

    for (const request of sliceRequests) {
      const requestTags = Array.isArray(request.tags) ? request.tags.map(String) : [];
      if (requestTags.includes('known-bug')) {
        productDefects.push({
          kind: 'product-defect',
          requestPath: String(request.path || ''),
          severity: 'high',
          title: `${String(request.name)} is tagged known-bug`,
          recommendedAction: 'Keep the assertion correct and document the observed defect explicitly.',
        });
      }
    }

    return {
      cleanupPolicy: manifest.cleanupPolicy,
      collectionDefects,
      coverageGaps,
      overlay: input.overlay || manifest.overlay || null,
      productDefects,
      sliceId: input.sliceId,
    };
  }

  async recordFindings(input: RecordSliceFindingsInput): Promise<{ findingsPath: string; manifestPath: string }> {
    const manifest = await this.requireManifest(input.collectionPath, input.sliceId);
    manifest.findings = input.findings;
    manifest.updatedAt = new Date().toISOString();
    const manifestPath = await this.writeManifest(input.collectionPath, input.sliceId, manifest);
    const findingsPath = await this.writeFindingsDocument(input.collectionPath, input.sliceId, input.findings);

    if (input.writeMode === 'request-docs') {
      for (const finding of input.findings) {
        if (!finding.requestPath) {
          continue;
        }
        const existingRequest = (await this.nativeManager.getRequest(finding.requestPath)) as Record<string, unknown>;
        const updatedDocs = [
          String(existingRequest.docs || ''),
          '',
          `Finding: ${finding.title}`,
          finding.observedBehavior ? `Observed: ${finding.observedBehavior}` : '',
          finding.expectedBehavior ? `Expected: ${finding.expectedBehavior}` : '',
        ]
          .filter((line) => line.trim().length > 0)
          .join('\n');
        await this.nativeManager.updateRequest(finding.requestPath, { docs: updatedDocs });
      }
    }

    return {
      findingsPath,
      manifestPath,
    };
  }

  async refreshGeneratedData(input: RefreshGeneratedDataInput): Promise<DynamicDataBundle> {
    const manifest = await this.requireManifest(input.collectionPath, input.sliceId);
    const bundle = this.generateDynamicData(input.policy);
    manifest.dynamicData = bundle;
    manifest.updatedAt = new Date().toISOString();
    await this.writeManifest(input.collectionPath, input.sliceId, manifest);
    await this.writeGeneratedDataFile(input.collectionPath, input.sliceId, bundle);
    return bundle;
  }

  async generateRunManifest(collectionPath: string, sliceId: string): Promise<FeatureRunManifest> {
    const manifest = await this.requireManifest(collectionPath, sliceId);
    const requests = (await this.nativeManager.listRequests(collectionPath)) as Array<Record<string, unknown>>;
    const pathByName = new Map(
      requests.flatMap((request) => {
        const name = this.normalizeRequestName(String(request.name || ''));
        const path = String(request.path || '');
        return [
          [name, path],
          [String(request.name || ''), path],
        ] as Array<[string, string]>;
      }),
    );
    const supportRequestPaths = new Map<string, string>();
    const coreRequestPaths = new Map<string, string>();
    const matrixRequestPaths = new Map<string, { dataFilePath: string; requestPath: string }>();

    for (const support of manifest.plan.supportRequests) {
      const requestPath = pathByName.get(support.name);
      if (requestPath) {
        supportRequestPaths.set(support.name, requestPath);
      }
    }

    for (const core of manifest.plan.coreRequests) {
      const requestPath = pathByName.get(core.name);
      if (requestPath) {
        coreRequestPaths.set(core.name, requestPath);
      }
    }

    for (const matrix of manifest.plan.matrixes) {
      const requestPath = pathByName.get(matrix.requestName);
      if (requestPath) {
        matrixRequestPaths.set(matrix.requestName, {
          dataFilePath: matrix.scenarioFilePath,
          requestPath,
        });
      }
    }

    const runManifest = this.buildRunManifest(
      manifest.plan,
      supportRequestPaths,
      coreRequestPaths,
      matrixRequestPaths,
    );
    manifest.runManifest = runManifest;
    manifest.runManifestPath = await this.writeRunManifest(collectionPath, sliceId, runManifest);
    manifest.updatedAt = new Date().toISOString();
    await this.writeManifest(collectionPath, sliceId, manifest);
    return runManifest;
  }

  async runFeatureSlice(input: RunFeatureSliceInput): Promise<FeatureRunReport> {
    const manifest = await this.requireManifest(input.collectionPath, input.sliceId);
    const runManifest = manifest.runManifest || (await this.generateRunManifest(input.collectionPath, input.sliceId));
    const profile = input.profile || 'full';
    const steps = runManifest.steps.filter((step) => step.profileMembership.includes(profile));
    const stepResults: FeatureRunStepResult[] = [];
    const collectionDefects: Array<{ evidence: string; title: string }> = [];
    const productDefects: Array<{ evidence: string; title: string }> = [];
    const setupFailures: Array<{ evidence: string; title: string }> = [];
    const cleanupOutcomes: Array<{ name: string; outcome: string; requestPath: string }> = [];

    for (const step of steps) {
      const result = await this.executeRunStep(step, input);
      stepResults.push(result);

      if (result.passed) {
        if (result.phase === 'cleanup') {
          cleanupOutcomes.push({
            name: result.name,
            outcome: 'passed',
            requestPath: result.requestPath,
          });
        }
      } else {
        switch (result.classification) {
          case 'collection-defect':
            collectionDefects.push({ evidence: result.error || result.stderr || result.stdout, title: result.name });
            break;
          case 'setup-failure':
            setupFailures.push({ evidence: result.error || result.stderr || result.stdout, title: result.name });
            break;
          case 'cleanup':
            cleanupOutcomes.push({
              name: result.name,
              outcome: result.error || 'cleanup failed',
              requestPath: result.requestPath,
            });
            break;
          case 'product-defect':
          default:
            productDefects.push({ evidence: result.error || result.stderr || result.stdout, title: result.name });
            break;
        }

        if (step.stopOnFailure && !step.continueOnFailure) {
          break;
        }
      }
    }

    const passCount = stepResults.filter((result) => result.passed).length;
    return {
      cleanupOutcomes,
      collectionDefects,
      env: input.env,
      exitStatus:
        collectionDefects.length === 0 && productDefects.length === 0 && setupFailures.length === 0
          ? 'passed'
          : 'failed',
      passCount,
      productDefects,
      profile,
      setupFailures,
      sliceId: input.sliceId,
      stepResults,
      totalSteps: steps.length,
    };
  }

  async getSliceState(collectionPath: string, sliceId: string): Promise<Record<string, unknown>> {
    const manifest = await this.requireManifest(collectionPath, sliceId);
    const audit = await this.auditFeatureSlice({ collectionPath, sliceId });
    return {
      audit,
      manifest,
      runManifest: manifest.runManifest || null,
    };
  }

  private isRequestRelated(request: Record<string, unknown>, featureName: string): boolean {
    const normalized = slugify(featureName);
    const relativePath = slugify(String(request.relativePath || ''));
    const name = slugify(String(request.name || ''));
    const tags = Array.isArray(request.tags) ? request.tags.map((tag) => slugify(String(tag))) : [];
    return relativePath.includes(normalized) || name.includes(normalized) || tags.includes(normalized);
  }

  private getMissingCoverage(
    folders: string[],
    requests: Array<Record<string, unknown>>,
    featureName: string,
  ): string[] {
    const featureRoot = `Features/${titleCase(featureName)}`;
    const missing: string[] = [];
    for (const group of FEATURE_FOLDER_GROUPS) {
      const folder = `${featureRoot}/${group}`;
      if (!folders.includes(folder)) {
        missing.push(`missing folder ${folder}`);
      }
    }
    if (!requests.some((request) => String(request.relativePath || '').includes('/Support/'))) {
      missing.push('missing explicit support request coverage');
    }
    if (!requests.some((request) => Array.isArray(request.assertions) && request.assertions.length > 0)) {
      missing.push('missing request-level assertions for related requests');
    }
    if (!requests.some((request) => typeof request.docs === 'string' && request.docs.trim().length > 0)) {
      missing.push('missing request docs for related requests');
    }
    const controllerCoverage = this.getControllerCoverage(requests);
    for (const [action, present] of Object.entries(controllerCoverage)) {
      if (!present) {
        missing.push(`missing controller action coverage for ${action}`);
      }
    }
    return missing;
  }

  private getSupportCoverage(requests: Array<Record<string, unknown>>): Record<string, boolean> {
    const supportTags = new Set(
      requests.flatMap((request) =>
        Array.isArray(request.tags) ? request.tags.map((tag) => String(tag)) : [],
      ),
    );
    return {
      auth: supportTags.has('auth'),
      cleanup: supportTags.has('cleanup'),
      lookup: supportTags.has('lookup'),
      resolve: supportTags.has('resolve'),
      seed: supportTags.has('seed'),
    };
  }

  private getControllerCoverage(requests: Array<Record<string, unknown>>): Record<string, boolean> {
    const tags = new Set(
      requests.flatMap((request) =>
        Array.isArray(request.tags) ? request.tags.map((tag) => String(tag)) : [],
      ),
    );
    return {
      create: tags.has('create'),
      delete: tags.has('delete'),
      get: tags.has('get'),
      list: tags.has('list'),
      update: tags.has('update'),
    };
  }

  private getDuplicationSignals(
    requests: Array<Record<string, unknown>>,
    collectionDefaults: Record<string, unknown>,
  ): string[] {
    const signals: string[] = [];
    const requestHeaders = requests
      .map((request) => (Array.isArray(request.headers) ? request.headers : []))
      .flat()
      .map((entry) =>
        entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string'
          ? String((entry as { name: string }).name)
          : '',
      )
      .filter((value) => value.length > 0);
    const repeatedHeaders = [...new Set(requestHeaders)].filter(
      (header) => requestHeaders.filter((value) => value === header).length > 2,
    );
    if (repeatedHeaders.length > 0) {
      signals.push(`repeated headers across related requests: ${repeatedHeaders.join(', ')}`);
    }

    if (
      requests.filter((request) => typeof request.tests === 'string' && String(request.tests).trim().length > 0)
        .length > 2 &&
      String(collectionDefaults.tests || '').trim().length === 0
    ) {
      signals.push('request-level tests repeat while collection defaults tests are empty');
    }

    return signals;
  }

  private getBrunoNativeOpportunities(
    requests: Array<Record<string, unknown>>,
    folders: string[],
    collectionDefaults: Record<string, unknown>,
  ): string[] {
    const opportunities: string[] = [];
    if (requests.length > 0 && String(collectionDefaults.docs || '').trim().length === 0) {
      opportunities.push('collection defaults docs could state shared auth/setup/testing policy');
    }
    if (!folders.some((folder) => folder.startsWith('Support/'))) {
      opportunities.push('support folders are missing; explicit auth/seed/resolve/cleanup helpers would improve Bruno UX');
    }
    if (
      requests.some((request) => Array.isArray(request.headers) && request.headers.length > 0) &&
      Array.isArray(collectionDefaults.headers) &&
      collectionDefaults.headers.length === 0
    ) {
      opportunities.push('common headers may belong in collection or folder defaults instead of per-request duplication');
    }
    return opportunities;
  }

  private async auditMatrixFiles(
    collectionPath: string,
    matrix: MatrixSpec,
  ): Promise<SliceFinding[]> {
    const findings: SliceFinding[] = [];

    try {
      const scenarioContent = await fs.readFile(matrix.scenarioFilePath, 'utf8');
      const rows = JSON.parse(scenarioContent) as unknown;
      if (!Array.isArray(rows)) {
        findings.push({
          kind: 'collection-defect',
          severity: 'high',
          title: `${matrix.requestName} scenario file is not an array`,
          recommendedAction: 'Store strict matrix scenarios as an array of delta rows only.',
        });
      } else {
        for (const row of rows) {
          if (!row || typeof row !== 'object') {
            findings.push({
              kind: 'collection-defect',
              severity: 'high',
              title: `${matrix.requestName} contains an invalid scenario row`,
              recommendedAction: 'Each scenario row must be an object with only strict matrix keys.',
            });
            continue;
          }
          const keys = Object.keys(row as Record<string, unknown>);
          const unknownKeys = keys.filter((key) => !matrix.scenarioKeys.includes(key));
          if (unknownKeys.length > 0) {
            findings.push({
              kind: 'collection-defect',
              severity: 'high',
              title: `${matrix.requestName} scenario rows contain unsupported keys`,
              observedBehavior: unknownKeys.join(', '),
              recommendedAction:
                'Keep scenario files to caseId/scenarioId, field/value, delta, expectedStatus, expectedOutcome, notes, and tags only.',
            });
          }
          if ('basePayload' in (row as Record<string, unknown>)) {
            findings.push({
              kind: 'collection-defect',
              severity: 'high',
              title: `${matrix.requestName} scenario file contains basePayload`,
              recommendedAction: 'Move stable valid payload ownership back into the request and metadata file.',
            });
          }
        }
      }
    } catch {
      findings.push({
        kind: 'coverage-gap',
        severity: 'high',
        title: `${matrix.requestName} scenario file is missing`,
        recommendedAction: 'Restore the strict matrix scenario delta file.',
      });
    }

    try {
      const metadataContent = await fs.readFile(matrix.metadataFilePath, 'utf8');
      const metadata = JSON.parse(metadataContent) as Record<string, unknown>;
      if (metadata.strategy !== 'base-valid-payload-plus-deltas') {
        findings.push({
          kind: 'collection-defect',
          severity: 'medium',
          title: `${matrix.requestName} metadata strategy is incorrect`,
          recommendedAction: 'Use the strict base-valid-payload-plus-deltas strategy.',
        });
      }
    } catch {
      findings.push({
        kind: 'coverage-gap',
        severity: 'medium',
        title: `${matrix.requestName} metadata file is missing`,
        recommendedAction: 'Restore matrix metadata so required fields and allowed delta paths stay explicit.',
      });
    }

    return findings;
  }

  private buildSupportRequests(args: {
    basePath: string;
    convenienceMode: boolean;
    featureFolderRoot: string;
    strictMode: boolean;
    targetResource: string;
    overlayDetails?: OverlayDefinition;
  }): SupportRequestSpec[] {
    const title = titleCase(args.targetResource);
    return [
      {
        description: 'Authenticate explicitly and persist a token for the slice.',
        expectedStatus: 200,
        folder: 'Support/Auth',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        name: `Authenticate ${title} Slice`,
        outputs: ['authToken'],
        postResponseScript: this.buildSupportOutputScript('authToken', ['token', 'accessToken', 'data.token']),
        requiredInputs: ['username', 'password'],
        role: 'auth',
        url: '{{baseUrl}}/auth/login',
        usedBy: [`Features/${titleCase(args.targetResource)}/Happy Path`],
        visibility: args.strictMode ? 'strict' : 'convenience',
      },
      {
        description: 'Create a support fixture without hiding seed behavior in core requests.',
        expectedStatus: 201,
        folder: 'Support/Seed',
        generatedData: { name: `${title} Seed` },
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        name: `Seed ${title}`,
        outputs: [`${args.targetResource}Id`],
        postResponseScript: this.buildSupportOutputScript(`${args.targetResource}Id`, ['id', 'data.id']),
        requiredInputs: ['baseUrl'],
        role: 'seed',
        url: `{{baseUrl}}${args.basePath}`,
        usedBy: [`${args.featureFolderRoot}/Read`, `${args.featureFolderRoot}/Happy Path`],
        visibility: 'strict',
      },
      {
        description: 'Resolve a resource id from a stable unique key before read/update/delete flows.',
        expectedStatus: 200,
        folder: 'Support/Resolve',
        method: 'GET',
        name: `Resolve ${title}`,
        outputs: [`${args.targetResource}Id`],
        postResponseScript: this.buildSupportOutputScript(`${args.targetResource}Id`, ['id', 'data.id', 'items.0.id']),
        requiredInputs: ['baseUrl', `${args.targetResource}LookupKey`],
        role: 'resolve',
        url: `{{baseUrl}}${args.basePath}?lookup={{${args.targetResource}LookupKey}}`,
        usedBy: [`${args.featureFolderRoot}/Read`, `${args.featureFolderRoot}/Happy Path`],
        visibility: args.convenienceMode ? 'convenience' : 'strict',
      },
      {
        description: 'Lookup the resource collection by a support key without mutating product state.',
        expectedStatus: 200,
        folder: 'Support/Resolve',
        method: 'GET',
        name: `Lookup ${title}`,
        outputs: [`${args.targetResource}LookupResult`],
        postResponseScript: this.buildSupportOutputScript(
          `${args.targetResource}LookupResult`,
          ['items.0.id', 'data.id', 'id'],
        ),
        requiredInputs: ['baseUrl', `${args.targetResource}LookupKey`],
        role: 'lookup',
        url: `{{baseUrl}}${args.basePath}?lookup={{${args.targetResource}LookupKey}}`,
        usedBy: [`${args.featureFolderRoot}/Read`],
        visibility: args.convenienceMode ? 'convenience' : 'strict',
      },
      {
        description: 'Cleanup request is explicit and documents product cleanup limits truthfully.',
        expectedStatus: 204,
        folder: 'Support/Cleanup',
        method: 'DELETE',
        name: `Cleanup ${title}`,
        outputs: [],
        postResponseScript: [
          `if (res.status >= 200 && res.status < 300) {`,
          `  bru.setVar('${args.targetResource}Id', '');`,
          `}`,
        ].join('\n'),
        requiredInputs: ['baseUrl', `${args.targetResource}Id`],
        role: 'cleanup',
        url: `{{baseUrl}}${args.basePath}/{{${args.targetResource}Id}}`,
        usedBy: [`${args.featureFolderRoot}/Happy Path`, `${args.featureFolderRoot}/Read`],
        visibility: 'strict',
      },
    ];
  }

  private buildCoreRequests(args: {
    basePath: string;
    featureFolderRoot: string;
    input: PlanFeatureSliceInput;
    overlayDetails?: OverlayDefinition;
    targetResource: string;
  }): CoreRequestSpec[] {
    const title = titleCase(args.targetResource);
    const pluralTitle = title.endsWith('s') ? title : `${title}s`;
    const baseTags = [slugify(args.input.featureName), ...(args.overlayDetails?.requestTags || [])];
    return [
      {
        action: 'create',
        authStrategy: 'explicit-support-var',
        body: {
          content: JSON.stringify(this.getBasePayload(args.targetResource), null, 2),
          type: 'json',
        },
        category: 'happy-path',
        description: 'Create the resource using the stable valid payload owned by the request.',
        expectedStatus: 201,
        folder: `${args.featureFolderRoot}/Happy Path`,
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        name: `Create ${title}`,
        postResponseScript: this.buildSupportOutputScript(`${args.targetResource}Id`, ['id', 'data.id']),
        requiredSupportRoles: ['auth'],
        tags: [...baseTags, 'happy-path', 'create'],
        url: `{{baseUrl}}${args.basePath}`,
      },
      {
        action: 'list',
        authStrategy: 'explicit-support-var',
        category: 'read',
        description: 'List the resource collection.',
        expectedStatus: 200,
        folder: `${args.featureFolderRoot}/Read`,
        method: 'GET',
        name: `List ${pluralTitle}`,
        requiredSupportRoles: ['auth'],
        tags: [...baseTags, 'read', 'list'],
        url: `{{baseUrl}}${args.basePath}`,
      },
      {
        action: 'get',
        authStrategy: 'explicit-support-var',
        category: 'read',
        description: 'Get a single resource by id.',
        expectedStatus: 200,
        folder: `${args.featureFolderRoot}/Read`,
        method: 'GET',
        name: `Get ${title}`,
        requiredSupportRoles: ['auth', 'resolve'],
        tags: [...baseTags, 'read', 'get'],
        url: `{{baseUrl}}${args.basePath}/{{${args.targetResource}Id}}`,
      },
      {
        action: 'update',
        authStrategy: 'explicit-support-var',
        body: {
          content: JSON.stringify(this.getBasePayload(args.targetResource), null, 2),
          type: 'json',
        },
        category: 'happy-path',
        description: 'Update the resource using a valid payload and explicit resolved id.',
        expectedStatus: 200,
        folder: `${args.featureFolderRoot}/Happy Path`,
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
        name: `Update ${title}`,
        postResponseScript: this.buildSupportOutputScript(`${args.targetResource}Id`, ['id', 'data.id']),
        requiredSupportRoles: ['auth', 'resolve'],
        tags: [...baseTags, 'happy-path', 'update'],
        url: `{{baseUrl}}${args.basePath}/{{${args.targetResource}Id}}`,
      },
      {
        action: 'delete',
        authStrategy: 'explicit-support-var',
        category: 'happy-path',
        description: 'Delete the resource as a core controller contract check.',
        expectedStatus: 204,
        folder: `${args.featureFolderRoot}/Happy Path`,
        method: 'DELETE',
        name: `Delete ${title}`,
        requiredSupportRoles: ['auth', 'resolve'],
        tags: [...baseTags, 'happy-path', 'delete'],
        url: `{{baseUrl}}${args.basePath}/{{${args.targetResource}Id}}`,
      },
      {
        action: 'create',
        authStrategy: 'explicit-support-var',
        body: {
          content: JSON.stringify(this.getBasePayload(args.targetResource), null, 2),
          type: 'json',
        },
        category: 'negative',
        description: 'Explicit negative single-case request without hidden setup fallbacks.',
        expectedStatus: 400,
        folder: `${args.featureFolderRoot}/Negative`,
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        name: `Create ${title} Missing Required Field`,
        requiredSupportRoles: ['auth'],
        tags: [...baseTags, 'negative', 'validation'],
        url: `{{baseUrl}}${args.basePath}`,
      },
      {
        action: 'create',
        authStrategy: 'none',
        body: {
          content: JSON.stringify(this.getBasePayload(args.targetResource), null, 2),
          type: 'json',
        },
        category: 'security',
        description: 'Explicit security single-case request without weakening expectations.',
        expectedStatus: 401,
        folder: `${args.featureFolderRoot}/Security`,
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        name: `Create ${title} Unauthorized`,
        tags: [...baseTags, 'security', 'unauthorized'],
        url: `{{baseUrl}}${args.basePath}`,
      },
    ];
  }

  private buildDefaultMatrixes(args: {
    basePath: string;
    collectionPath: string;
    featureFolderRoot: string;
    sliceId: string;
    strictMode: boolean;
    targetResource: string;
  }): MatrixSpec[] {
    const basePayload = this.getBasePayload(args.targetResource);
    const title = titleCase(args.targetResource);
    return [
      {
        allowedDeltaPaths: ['name', 'email', 'description'],
        basePayload,
        basePayloadRef: `${args.sliceId}.validation.basePayload`,
        category: 'negative',
        expectedOutcomeField: 'expectedOutcome',
        expectedStatusField: 'expectedStatus',
        metadataFilePath: this.getMatrixMetadataPath(
          args.collectionPath,
          args.sliceId,
          `create-${slugify(title)}-validation-matrix`,
        ),
        requestFolder: `${args.featureFolderRoot}/Matrix`,
        requestName: `Create ${title} Validation Matrix`,
        requestUrl: `{{baseUrl}}${args.basePath}`,
        requiredIterationFields: ['caseId', 'expectedStatus', 'expectedOutcome'],
        scenarioFilePath: this.getScenarioFilePath(
          args.collectionPath,
          args.sliceId,
          `create-${slugify(title)}-validation-matrix`,
        ),
        scenarioKeys: ['caseId', 'scenarioId', 'field', 'value', 'delta', 'expectedStatus', 'expectedOutcome', 'notes', 'tags'],
        scenarios: [
          {
            caseId: 'missing-name',
            delta: { removePaths: ['name'] },
            expectedOutcome: 'validation_error',
            expectedStatus: 400,
            scenarioId: 'missing-name',
            tags: ['negative', 'required-field'],
          },
          {
            caseId: 'invalid-email',
            expectedOutcome: 'validation_error',
            expectedStatus: 400,
            field: 'email',
            scenarioId: 'invalid-email',
            tags: ['negative', 'invalid-format'],
            value: 'invalid-email',
          },
        ],
        strategy: 'base-valid-payload-plus-deltas',
        strict: true,
      },
      {
        allowedDeltaPaths: ['name', 'email', 'description'],
        basePayload,
        basePayloadRef: `${args.sliceId}.security.basePayload`,
        category: 'security',
        expectedOutcomeField: 'expectedOutcome',
        expectedStatusField: 'expectedStatus',
        metadataFilePath: this.getMatrixMetadataPath(
          args.collectionPath,
          args.sliceId,
          `create-${slugify(title)}-security-matrix`,
        ),
        requestFolder: `${args.featureFolderRoot}/Matrix`,
        requestName: `Create ${title} Security Matrix`,
        requestUrl: `{{baseUrl}}${args.basePath}`,
        requiredIterationFields: ['caseId', 'expectedStatus', 'expectedOutcome'],
        scenarioFilePath: this.getScenarioFilePath(
          args.collectionPath,
          args.sliceId,
          `create-${slugify(title)}-security-matrix`,
        ),
        scenarioKeys: ['caseId', 'scenarioId', 'field', 'value', 'delta', 'expectedStatus', 'expectedOutcome', 'notes', 'tags'],
        scenarios: [
          {
            caseId: 'xss-name',
            expectedOutcome: 'security_rejection',
            expectedStatus: 400,
            field: 'name',
            scenarioId: 'xss-name',
            tags: ['security', 'xss'],
            value: "<script>alert('xss')</script>",
          },
          {
            caseId: 'sql-fragment',
            expectedOutcome: 'security_rejection',
            expectedStatus: 400,
            field: 'description',
            scenarioId: 'sql-fragment',
            tags: ['security', 'sql-injection'],
            value: "' OR 1=1 --",
          },
        ],
        strategy: 'base-valid-payload-plus-deltas',
        strict: true,
      },
    ];
  }

  private buildCleanupPolicy(featureFolderRoot: string, targetResource: string): CleanupTruth {
    return {
      notes: 'If the product does not expose hard delete, keep cleanup status truthful and avoid fake passing cleanup requests.',
      reason: 'Cleanup depends on delete support and correct fixture ownership.',
      requestPath: `${featureFolderRoot.replace(/^Features\//, 'Support/Cleanup/')}/cleanup-${slugify(targetResource)}.bru`,
      requiredCondition: 'A resource id must be resolved and the product must support deletion for the created fixture.',
      status: 'conditional',
    };
  }

  private buildStatusTest(expectedStatus: number): string {
    return `test('status is ${expectedStatus}', function () {\n  expect(res.status).to.equal(${expectedStatus});\n});`;
  }

  private buildSupportRequestTests(support: SupportRequestSpec): string {
    const lines = [this.buildStatusTest(support.expectedStatus)];
    for (const output of support.outputs) {
      lines.push(
        `test('captures ${output}', function () {\n  expect(bru.getVar('${output}')).to.exist;\n});`,
      );
    }
    return lines.join('\n');
  }

  private buildSupportRequestBody(
    support: SupportRequestSpec,
    dynamicData: DynamicDataBundle,
  ): { content?: string; type: BodyType } | undefined {
    if (support.method === 'GET' || support.method === 'DELETE') {
      return undefined;
    }

    if (support.role === 'auth') {
      return {
        content: JSON.stringify(
          {
            password: '{{password}}',
            username: '{{username}}',
          },
          null,
          2,
        ),
        type: 'json',
      };
    }

    return {
      content: JSON.stringify(
        {
          description: `Seed fixture ${dynamicData.suffix}`,
          email: dynamicData.uniqueEmail,
          name: `${dynamicData.uniqueName} support fixture`,
        },
        null,
        2,
      ),
      type: 'json',
    };
  }

  private describeSupportRequest(support: SupportRequestSpec, cleanup: CleanupTruth): string {
    const lines = [
      support.description,
      '',
      `Visibility: ${support.visibility}`,
      `Expected status: ${support.expectedStatus}`,
      `Outputs: ${support.outputs.length > 0 ? support.outputs.join(', ') : 'none'}`,
      'Required inputs:',
      ...support.requiredInputs.map((value) => `- ${value}`),
    ];
    if (support.role === 'cleanup') {
      lines.push('', `Cleanup truth: ${cleanup.status}`, `Reason: ${cleanup.reason}`);
      if (cleanup.requiredCondition) {
        lines.push(`Condition: ${cleanup.requiredCondition}`);
      }
    }
    return lines.join('\n');
  }

  private describeCoreRequest(request: CoreRequestSpec, plan: FeatureSlicePlan): string {
    return [
      request.description,
      '',
      `Slice: ${plan.sliceId}`,
      `Feature type: ${plan.featureType}`,
      `Expected status: ${request.expectedStatus}`,
      `Auth strategy: ${request.authStrategy}`,
      request.requiredSupportRoles && request.requiredSupportRoles.length > 0
        ? `Support dependencies: ${request.requiredSupportRoles.join(', ')}`
        : 'Support dependencies: none',
      `Source of truth: ${plan.sourceOfTruth || 'not specified'}`,
      `Cleanup truth: ${plan.cleanupPolicy.status} - ${plan.cleanupPolicy.reason}`,
      plan.overlayDetails ? `Overlay: ${plan.overlayDetails.id} - ${plan.overlayDetails.description}` : '',
      plan.overlay ? `Overlay: ${plan.overlay}` : '',
    ]
      .filter((line) => line.length > 0)
      .join('\n');
  }

  private getCoreRequestPatch(
    request: CoreRequestSpec,
    plan: FeatureSlicePlan,
    dynamicData: DynamicDataBundle,
  ): RequestUpdatePatch {
    const patch: RequestUpdatePatch = {
      assertions: [{ name: 'res.status', value: `eq ${request.expectedStatus}` }],
      docs: this.describeCoreRequest(request, plan),
      postResponseScript: request.postResponseScript,
      settings: {
        featureSlice: plan.sliceId,
        strictMode: plan.strictMode,
      },
      tags: request.tags,
      tests: this.buildStatusTest(request.expectedStatus),
    };

    if (request.body?.type === 'json') {
      patch.preRequestScript = this.buildDynamicDataPreRequestScript(plan.targetResource, dynamicData);
    }

    if (request.authStrategy === 'explicit-support-var') {
      patch.headers = {
        Authorization: 'Bearer {{authToken}}',
      };
    }

    if (request.category === 'negative') {
      patch.preRequestScript = [
        this.buildDynamicDataPreRequestScript(plan.targetResource, dynamicData),
        'const payload = {',
        `  name: bru.getVar('${plan.targetResource}Name'),`,
        `  email: bru.getVar('${plan.targetResource}Email'),`,
        `  description: 'negative case',`,
        '};',
        "delete payload.name;",
        "req.setHeader('Content-Type', 'application/json');",
        'req.setBody(payload);',
      ].join('\n');
      patch.tags = [...request.tags, 'single-case'];
    }

    if (request.category === 'security') {
      patch.tags = [...request.tags, 'single-case'];
      patch.preRequestScript = [
        this.buildDynamicDataPreRequestScript(plan.targetResource, dynamicData),
        'const payload = {',
        `  name: bru.getVar('${plan.targetResource}Name'),`,
        `  email: bru.getVar('${plan.targetResource}Email'),`,
        `  description: 'security case',`,
        '};',
        "req.setHeader('Content-Type', 'application/json');",
        'req.setBody(payload);',
      ].join('\n');
      patch.headers = { 'Content-Type': 'application/json' };
    }

    return patch;
  }

  private buildDynamicDataPreRequestScript(
    targetResource: string,
    dynamicData: DynamicDataBundle,
  ): string {
    const title = titleCase(targetResource).replace(/\s+/g, '');
    return [
      `const defaultSuffix = bru.getVar('${targetResource}Suffix') || '${dynamicData.suffix}';`,
      `bru.setVar('${targetResource}Suffix', defaultSuffix);`,
      `bru.setVar('${targetResource}Name', bru.getVar('${targetResource}Name') || '${dynamicData.uniqueName}');`,
      `bru.setVar('${targetResource}Email', bru.getVar('${targetResource}Email') || '${dynamicData.uniqueEmail}');`,
      `bru.setVar('${targetResource}LookupKey', bru.getVar('${targetResource}LookupKey') || '${title.toLowerCase()}-' + defaultSuffix);`,
    ].join('\n');
  }

  private buildMatrixPreRequestScript(basePayload: Record<string, string | number | boolean | null>): string {
    return [
      `const basePayload = ${JSON.stringify(basePayload, null, 2)};`,
      'const splitPath = (path) => String(path).split(\'.\').filter(Boolean);',
      'const setAtPath = (target, path, value) => {',
      '  const segments = splitPath(path);',
      '  let current = target;',
      '  for (let index = 0; index < segments.length - 1; index += 1) {',
      '    const segment = segments[index];',
      '    if (current[segment] === undefined || current[segment] === null || typeof current[segment] !== "object") {',
      '      current[segment] = {};',
      '    }',
      '    current = current[segment];',
      '  }',
      '  current[segments[segments.length - 1]] = value;',
      '};',
      'const deleteAtPath = (target, path) => {',
      '  const segments = splitPath(path);',
      '  let current = target;',
      '  for (let index = 0; index < segments.length - 1; index += 1) {',
      '    current = current?.[segments[index]];',
      '    if (current === undefined || current === null) {',
      '      return;',
      '    }',
      '  }',
      '  if (current && typeof current === "object") {',
      '    delete current[segments[segments.length - 1]];',
      '  }',
      '};',
      'const row = bru.runner.iterationData.get() || {};',
      "const caseId = row.caseId || row.scenarioId;",
      "if (!caseId) { throw new Error('Strict matrix row is missing caseId/scenarioId'); }",
      "if (row.expectedStatus === undefined) { throw new Error('Strict matrix row is missing expectedStatus'); }",
      "if (!row.expectedOutcome) { throw new Error('Strict matrix row is missing expectedOutcome'); }",
      'const payload = JSON.parse(JSON.stringify(basePayload));',
      'const delta = row.delta || {};',
      "if (typeof row.field === 'string') { delta.set = { ...(delta.set || {}), [row.field]: row.value }; }",
      'for (const path of delta.removePaths || []) { deleteAtPath(payload, path); }',
      'for (const [path, value] of Object.entries(delta.set || {})) { setAtPath(payload, path, value); }',
      "req.setHeader('Content-Type', 'application/json');",
      'req.setBody(payload);',
      "bru.setVar('caseId', String(caseId));",
      "bru.setVar('expectedStatus', String(row.expectedStatus));",
      "bru.setVar('expectedOutcome', String(row.expectedOutcome));",
      "bru.setVar('matrixBasePayload', JSON.stringify(basePayload));",
      "bru.setVar('matrixMode', 'strict');",
      "// Scenario deltas are managed by the MCP and should not silently fall back inside this request.",
    ].join('\n');
  }

  private buildSupportOutputScript(variableName: string, paths: string[]): string {
    const expression = this.buildBodyAccessExpression(paths);
    return [
      `const value = ${expression};`,
      'if (value !== undefined && value !== null && value !== "") {',
      `  bru.setVar('${variableName}', String(value));`,
      '}',
    ].join('\n');
  }

  private buildBodyAccessExpression(paths: string[]): string {
    const expressions = paths.map((path) =>
      path
        .split('.')
        .filter((segment) => segment.length > 0)
        .reduce((accumulator, segment) => {
          if (/^\d+$/.test(segment)) {
            return `${accumulator}?.[${segment}]`;
          }
          return `${accumulator}?.${segment}`;
        }, 'res.getBody()'),
    );
    return expressions.join(' ?? ');
  }

  private validateMatrixScenarios(
    requiredFields: string[],
    allowedDeltaPaths: string[],
    scenarios: MatrixScenarioDelta[],
  ): void {
    if (scenarios.length === 0) {
      throw new BrunoError('Strict matrix mode requires at least one scenario row', 'VALIDATION_ERROR');
    }

    for (const scenario of scenarios) {
      for (const field of requiredFields) {
        if (!this.hasRequiredScenarioField(scenario, field)) {
          throw new BrunoError(
            `Strict matrix row ${scenario.scenarioId || 'unknown'} is missing required field ${field}`,
            'VALIDATION_ERROR',
          );
        }
      }

      if (!scenario.delta && typeof scenario.field !== 'string') {
        throw new BrunoError(
          `Strict matrix row ${scenario.scenarioId} must provide either delta or field/value`,
          'VALIDATION_ERROR',
        );
      }

      if (typeof scenario.field === 'string' && scenario.value === undefined && !scenario.delta) {
        throw new BrunoError(
          `Strict matrix row ${scenario.scenarioId} must provide value when field is set`,
          'VALIDATION_ERROR',
        );
      }

      for (const path of Object.keys(scenario.delta?.set || {})) {
        if (!allowedDeltaPaths.includes(path)) {
          throw new BrunoError(
            `Strict matrix row ${scenario.scenarioId} contains unsupported delta path ${path}`,
            'VALIDATION_ERROR',
          );
        }
      }

      for (const path of scenario.delta?.removePaths || []) {
        if (!allowedDeltaPaths.includes(path)) {
          throw new BrunoError(
            `Strict matrix row ${scenario.scenarioId} contains unsupported remove path ${path}`,
            'VALIDATION_ERROR',
          );
        }
      }

      if (typeof scenario.field === 'string' && !allowedDeltaPaths.includes(scenario.field)) {
        throw new BrunoError(
          `Strict matrix row ${scenario.scenarioId} contains unsupported field ${scenario.field}`,
          'VALIDATION_ERROR',
        );
      }
    }
  }

  private hasRequiredScenarioField(scenario: MatrixScenarioDelta, field: string): boolean {
    switch (field) {
      case 'scenarioId':
        return scenario.scenarioId.length > 0;
      case 'caseId':
        return typeof scenario.caseId === 'string' && scenario.caseId.length > 0;
      case 'delta':
        return scenario.delta !== undefined;
      case 'expectedStatus':
        return Number.isInteger(scenario.expectedStatus);
      case 'expectedOutcome':
        return scenario.expectedOutcome.length > 0;
      case 'field':
        return typeof scenario.field === 'string' && scenario.field.length > 0;
      case 'value':
        return scenario.value !== undefined;
      case 'notes':
        return scenario.notes !== undefined;
      case 'tags':
        return scenario.tags !== undefined;
      default:
        return false;
    }
  }

  private normalizeBasePath(value: string): string {
    return value.startsWith('/') ? value : `/${value}`;
  }

  private getBasePayload(resource: string): Record<string, string | number | boolean | null> {
    const prefix = slugify(resource);
    return {
      description: `${titleCase(resource)} created by bruno-mcp`,
      email: `{{${prefix}Email}}`,
      name: `{{${prefix}Name}}`,
    };
  }

  private generateDynamicData(policy: DynamicDataPolicy = {}): DynamicDataBundle {
    const mode = policy.mode || 'builtin';
    const scope = policy.scope || 'mcp';
    const suffix = this.generateSuffix();

    if (mode === 'faker') {
      const profile = policy.fakerProfile || 'simple';
      const uniqueEmail = faker.internet.email({ provider: 'example.test' }).replace('@', `+${suffix}@`);
      const uniqueName =
        profile === 'commerce'
          ? `${faker.commerce.productName()} ${suffix}`
          : profile === 'person'
            ? `${faker.person.firstName()} ${faker.person.lastName()} ${suffix}`
            : `${faker.word.words({ count: 2 })} ${suffix}`;
      return {
        generatedAt: new Date().toISOString(),
        generatedVars: {
          generatedEmail: uniqueEmail,
          generatedName: uniqueName,
          generatedSuffix: suffix,
        },
        mode,
        scope,
        suffix,
        uniqueEmail,
        uniqueName,
      };
    }

    return {
      generatedAt: new Date().toISOString(),
      generatedVars: {
        generatedEmail: `slice-${suffix}@example.test`,
        generatedName: `Slice ${suffix}`,
        generatedSuffix: suffix,
      },
      mode,
      scope,
      suffix,
      uniqueEmail: `slice-${suffix}@example.test`,
      uniqueName: `Slice ${suffix}`,
    };
  }

  private generateSuffix(): string {
    return new Date().toISOString().replace(/[^0-9]/g, '').slice(-12);
  }

  private async applySliceFolderDefaults(plan: FeatureSlicePlan): Promise<void> {
    for (const folder of plan.structure.featureFolders) {
      await this.nativeManager.updateFolderDefaults(plan.collectionPath, folder, {
        docs: this.describeFeatureFolder(folder, plan),
      });
    }

    for (const folder of plan.structure.supportFolders) {
      await this.nativeManager.updateFolderDefaults(plan.collectionPath, folder, {
        docs: this.describeSupportFolder(folder, plan),
      });
    }
  }

  private async applyGeneratedVarsToSliceFolders(
    plan: FeatureSlicePlan,
    generatedVars: Record<string, string>,
  ): Promise<void> {
    for (const folder of plan.structure.featureFolders) {
      await this.nativeManager.updateFolderDefaults(plan.collectionPath, folder, {
        preRequestVars: generatedVars,
      });
    }
  }

  private describeFeatureFolder(folder: string, plan: FeatureSlicePlan): string {
    return [
      `Feature slice folder for ${plan.featureName}.`,
      `Category: ${folder.split('/').pop() || folder}`,
      `Strict mode: ${plan.strictMode}`,
      `Cleanup truth: ${plan.cleanupPolicy.status} - ${plan.cleanupPolicy.reason}`,
      plan.overlayDetails ? `Overlay: ${plan.overlayDetails.id} - ${plan.overlayDetails.description}` : '',
    ]
      .filter((line) => line.length > 0)
      .join('\n');
  }

  private describeSupportFolder(folder: string, plan: FeatureSlicePlan): string {
    return [
      `Support folder for ${plan.featureName}.`,
      `Role: ${folder.split('/').pop() || folder}`,
      'Support behavior stays explicit and is never hidden inside core requests.',
      `Cleanup truth: ${plan.cleanupPolicy.status} - ${plan.cleanupPolicy.reason}`,
    ].join('\n');
  }

  private resolveOverlay(overlay: string | undefined, targetResource: string): OverlayDefinition {
    switch (overlay) {
      case 'raw-dto-overlay':
        return {
          cleanupPolicyStatus: 'conditional',
          description:
            'Treat raw payload and DTO behavior as separate layers. Generic Bruno requests should document raw input expectations without pretending DTO overlays are generic behavior.',
          docsNotes: [
            'raw/DTO handling is project overlay logic, not generic Bruno logic.',
            'Document raw payload expectations and DTO/output mapping separately.',
          ],
          id: overlay,
          requiredInputs: [`${targetResource}RawPayloadMode`],
          requestTags: ['overlay-raw-dto-overlay'],
        };
      default:
        return {
          description: 'No project overlay is active.',
          docsNotes: [],
          id: overlay || 'none',
          requiredInputs: [],
          requestTags: [],
        };
    }
  }

  private async writeRequest(
    collectionPath: string,
    input: {
      assertions?: Array<{ name: string; value: string }>;
      body?: { content?: string; type: BodyType };
      docs: string;
      folder: string;
      headers?: Record<string, string>;
      method: HttpMethod;
      name: string;
      tags: string[];
      tests: string;
      url: string;
    },
    patch?: RequestUpdatePatch,
  ): Promise<string> {
    const result = await this.requestBuilder.createRequest({
      body: input.body,
      collectionPath,
      folder: input.folder,
      headers: input.headers,
      method: input.method,
      name: input.name,
      url: input.url,
    });

    if (!result.success || !result.path) {
      throw new BrunoError(result.error || `Failed to create request ${input.name}`, 'FILE_ERROR');
    }

    const update = await this.nativeManager.updateRequest(result.path, {
      assertions: input.assertions,
      docs: input.docs,
      tags: input.tags,
      tests: input.tests,
      ...patch,
    });

    if (!update.success || !update.path) {
      throw new BrunoError(update.error || `Failed to update request ${input.name}`, 'FILE_ERROR');
    }

    return update.path;
  }

  private getMetadataRoot(collectionPath: string, sliceId: string): string {
    return join(collectionPath, '.bruno-mcp', 'feature-slices', sliceId);
  }

  private getManifestPath(collectionPath: string, sliceId: string): string {
    return join(this.getMetadataRoot(collectionPath, sliceId), 'slice.json');
  }

  private getGeneratedDataPath(collectionPath: string, sliceId: string): string {
    return join(this.getMetadataRoot(collectionPath, sliceId), 'generated-data.json');
  }

  private getMatrixMetadataPath(
    collectionPath: string,
    sliceId: string,
    requestName: string,
  ): string {
    return join(this.getMetadataRoot(collectionPath, sliceId), 'matrices', `${slugify(requestName)}.json`);
  }

  private getFindingsPath(collectionPath: string, sliceId: string): string {
    return join(this.getMetadataRoot(collectionPath, sliceId), 'FINDINGS.md');
  }

  private getScenarioFilePath(collectionPath: string, sliceId: string, requestName: string): string {
    return join(
      this.getMetadataRoot(collectionPath, sliceId),
      'scenarios',
      `${slugify(requestName)}.json`,
    );
  }

  private async writeScenarioFile(
    collectionPath: string,
    sliceId: string,
    requestName: string,
    payload: MatrixScenarioDelta[],
  ): Promise<string> {
    const scenarioFilePath = this.getScenarioFilePath(collectionPath, sliceId, requestName);
    await fs.mkdir(dirname(scenarioFilePath), { recursive: true });
    await fs.writeFile(scenarioFilePath, `${JSON.stringify(payload, null, 2)}\n`);
    return scenarioFilePath;
  }

  private async writeMatrixMetadataFile(
    collectionPath: string,
    sliceId: string,
    requestName: string,
    payload: Record<string, unknown>,
  ): Promise<string> {
    const metadataFilePath = this.getMatrixMetadataPath(collectionPath, sliceId, requestName);
    await fs.mkdir(dirname(metadataFilePath), { recursive: true });
    await fs.writeFile(metadataFilePath, `${JSON.stringify(payload, null, 2)}\n`);
    return metadataFilePath;
  }

  private async persistManifest(
    plan: FeatureSlicePlan,
    dynamicData: DynamicDataBundle,
    runManifest: FeatureRunManifest,
  ): Promise<string> {
    const now = new Date().toISOString();
    const runManifestPath = await this.writeRunManifest(plan.collectionPath, plan.sliceId, runManifest);
    const manifest: SliceManifest = {
      cleanupPolicy: plan.cleanupPolicy,
      collectionPath: plan.collectionPath,
      createdAt: now,
      dynamicData,
      featureName: plan.featureName,
      featureType: plan.featureType,
      findings: plan.findings,
      matrixes: plan.matrixes,
      overlay: plan.overlay,
      overlayDetails: plan.overlayDetails,
      plan,
      runManifest,
      runManifestPath,
      sliceId: plan.sliceId,
      sourceOfTruth: plan.sourceOfTruth,
      strictMode: plan.strictMode,
      updatedAt: now,
    };
    const manifestPath = await this.writeManifest(plan.collectionPath, plan.sliceId, manifest);
    await this.writeGeneratedDataFile(plan.collectionPath, plan.sliceId, dynamicData);
    return manifestPath;
  }

  private getRunManifestPath(collectionPath: string, sliceId: string): string {
    return join(this.getMetadataRoot(collectionPath, sliceId), 'run-manifest.json');
  }

  private async writeRunManifest(
    collectionPath: string,
    sliceId: string,
    manifest: FeatureRunManifest,
  ): Promise<string> {
    const runManifestPath = this.getRunManifestPath(collectionPath, sliceId);
    await fs.mkdir(dirname(runManifestPath), { recursive: true });
    await fs.writeFile(runManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return runManifestPath;
  }

  private async writeGeneratedDataFile(
    collectionPath: string,
    sliceId: string,
    bundle: DynamicDataBundle,
  ): Promise<void> {
    const generatedDataPath = this.getGeneratedDataPath(collectionPath, sliceId);
    await fs.mkdir(dirname(generatedDataPath), { recursive: true });
    await fs.writeFile(generatedDataPath, `${JSON.stringify(bundle, null, 2)}\n`);
  }

  private async readManifest(collectionPath: string, sliceId: string): Promise<SliceManifest | null> {
    try {
      const content = await fs.readFile(this.getManifestPath(collectionPath, sliceId), 'utf8');
      return JSON.parse(content) as SliceManifest;
    } catch {
      return null;
    }
  }

  private async requireManifest(collectionPath: string, sliceId: string): Promise<SliceManifest> {
    const manifest = await this.readManifest(collectionPath, sliceId);
    if (!manifest) {
      throw new BrunoError(`Feature slice ${sliceId} manifest does not exist`, 'VALIDATION_ERROR');
    }
    return manifest;
  }

  private async writeManifest(
    collectionPath: string,
    sliceId: string,
    manifest: SliceManifest,
  ): Promise<string> {
    const manifestPath = this.getManifestPath(collectionPath, sliceId);
    await fs.mkdir(dirname(manifestPath), { recursive: true });
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return manifestPath;
  }

  private async writeFindingsDocument(
    collectionPath: string,
    sliceId: string,
    findings: SliceFinding[],
  ): Promise<string> {
    const findingsPath = this.getFindingsPath(collectionPath, sliceId);
    await fs.mkdir(dirname(findingsPath), { recursive: true });
    const body = [
      `# Findings for ${sliceId}`,
      '',
      ...(findings.length === 0
        ? ['No findings recorded.']
        : findings.flatMap((finding) => [
            `## ${finding.title}`,
            `- Kind: ${finding.kind}`,
            `- Severity: ${finding.severity}`,
            finding.requestPath ? `- Request: ${relative(collectionPath, finding.requestPath)}` : '',
            finding.expectedBehavior ? `- Expected: ${finding.expectedBehavior}` : '',
            finding.observedBehavior ? `- Observed: ${finding.observedBehavior}` : '',
            finding.recommendedAction ? `- Action: ${finding.recommendedAction}` : '',
            '',
          ])),
    ]
      .filter((line) => line.length > 0)
      .join('\n');
    await fs.writeFile(findingsPath, `${body}\n`);
    return findingsPath;
  }

  private findMissingRequestCategories(
    plan: FeatureSlicePlan,
    requests: Array<Record<string, unknown>>,
  ): string[] {
    const missing: string[] = [];
    const categoryTags = new Set(
      requests.flatMap((request) =>
        Array.isArray(request.tags) ? request.tags.map((tag) => String(tag)) : [],
      ),
    );

    for (const request of plan.coreRequests) {
      if (!categoryTags.has(request.category)) {
        missing.push(request.category);
      }
    }

    return dedupe(missing);
  }

  private buildRunManifest(
    plan: FeatureSlicePlan,
    supportRequestPaths: Map<string, string>,
    coreRequestPaths: Map<string, string>,
    matrixRequestPaths: Map<string, { dataFilePath: string; requestPath: string }>,
  ): FeatureRunManifest {
    const steps: FeatureRunStep[] = [];
    let order = 1;
    const hasCoreDelete = plan.coreRequests.some((request) => request.action === 'delete');

    const pushSupportStep = (role: SupportRequestRole) => {
      for (const support of plan.supportRequests.filter((request) => request.role === role)) {
        if (support.role === 'cleanup' && hasCoreDelete) {
          continue;
        }
        const requestPath = supportRequestPaths.get(support.name);
        if (!requestPath) {
          continue;
        }
        const phase: FeatureRunPhase = support.role === 'auth' ? 'auth' : support.role === 'cleanup' ? 'cleanup' : 'support';
        steps.push({
          cleanupPolicyStatus: support.role === 'cleanup' ? plan.cleanupPolicy.status : undefined,
          continueOnFailure: support.role === 'cleanup' || support.visibility === 'convenience',
          id: `${order++}`,
          name: support.name,
          phase,
          profileMembership:
            support.role === 'cleanup'
              ? ['full', 'smoke']
              : support.role === 'auth'
                ? ['full', 'smoke', 'negative_only', 'security_only', 'support_only']
                : support.role === 'lookup'
                  ? ['full', 'support_only']
                  : ['full', 'smoke', 'support_only'],
          requestPath,
          stopOnFailure: support.role !== 'cleanup' && support.visibility !== 'convenience',
        });
      }
    };

    const pushCoreAction = (action: CoreRequestSpec['action']) => {
      for (const core of plan.coreRequests.filter((request) => request.action === action)) {
        const requestPath = coreRequestPaths.get(core.name);
        if (!requestPath) {
          continue;
        }
        const phase = this.toRunPhase(core.category);
        steps.push({
          continueOnFailure: phase === 'negative' || phase === 'security' || phase === 'cleanup',
          id: `${order++}`,
          name: core.name,
          phase,
          profileMembership:
            core.action === 'delete'
              ? ['full']
              : phase === 'negative'
                ? ['full', 'negative_only']
                : phase === 'security'
                  ? ['full', 'security_only']
                  : ['full', 'smoke'],
          requestPath,
          stopOnFailure: phase === 'happy_path' || phase === 'read',
        });
      }
    };

    pushSupportStep('auth');
    if (!plan.coreRequests.some((request) => request.action === 'create')) {
      pushSupportStep('seed');
    }
    pushCoreAction('create');
    pushSupportStep('resolve');
    pushSupportStep('lookup');
    pushCoreAction('update');
    pushCoreAction('list');
    pushCoreAction('get');
    pushCoreAction('delete');

    for (const matrix of plan.matrixes) {
      const entry = matrixRequestPaths.get(matrix.requestName);
      if (!entry) {
        continue;
      }
      const phase = matrix.category === 'security' ? 'security' : 'negative';
      steps.push({
        continueOnFailure: true,
        dataFilePath: entry.dataFilePath,
        id: `${order++}`,
        name: matrix.requestName,
        phase,
        profileMembership: phase === 'security' ? ['full', 'security_only'] : ['full', 'negative_only'],
        requestPath: entry.requestPath,
        stopOnFailure: false,
      });
    }

    pushSupportStep('cleanup');

    return {
      cleanupPolicy: plan.cleanupPolicy,
      collectionPath: plan.collectionPath,
      generatedAt: new Date().toISOString(),
      profiles: ['smoke', 'full', 'negative_only', 'security_only', 'support_only'],
      sliceId: plan.sliceId,
      steps: steps,
    };
  }

  private sortRunSteps(steps: FeatureRunStep[]): FeatureRunStep[] {
    return steps.toSorted((left, right) => Number(left.id) - Number(right.id));
  }

  private normalizeRequestName(value: string): string {
    return value.replace(/^['"]+|['"]+$/g, '');
  }

  private toRunPhase(category: CoreRequestSpec['category']): FeatureRunPhase {
    switch (category) {
      case 'happy-path':
        return 'happy_path';
      case 'read':
        return 'read';
      case 'negative':
        return 'negative';
      case 'security':
        return 'security';
      case 'support':
      default:
        return 'support';
    }
  }

  private async executeRunStep(
    step: FeatureRunStep,
    input: RunFeatureSliceInput,
  ): Promise<FeatureRunStepResult> {
    try {
      await fs.access(step.requestPath);
      if (step.dataFilePath) {
        await fs.access(step.dataFilePath);
      }
    } catch (error) {
      return {
        classification: 'collection-defect',
        dataFilePath: step.dataFilePath,
        durationMs: 0,
        error: error instanceof Error ? error.message : 'Missing request or data file',
        exitCode: 1,
        name: step.name,
        passed: false,
        phase: step.phase,
        requestPath: step.requestPath,
        stderr: '',
        stdout: '',
      };
    }

    const reportFilePath = join(tmpdir(), `bruno-slice-${slugify(step.name)}-${Date.now()}.json`);
    const bruCommand = join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'bru.cmd' : 'bru');
    const args = ['run', step.requestPath, '--env', step.env || input.env, '--output', reportFilePath, '--format', 'json'];
    if (step.dataFilePath) {
      args.push('--json-file-path', step.dataFilePath);
    }
    if (input.workspacePath) {
      args.push('--workspace-path', input.workspacePath);
    }
    if (input.globalEnv) {
      args.push('--global-env', input.globalEnv);
    }

    const startedAt = Date.now();
    const spawned = await new Promise<{ exitCode: number; stderr: string; stdout: string }>((resolve, reject) => {
      const child = spawn(bruCommand, args, {
        cwd: input.collectionPath,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (exitCode) => {
        resolve({ exitCode: exitCode ?? 1, stderr, stdout });
      });
    });

    const durationMs = Date.now() - startedAt;
    const parsed = await this.readBruJsonReport(reportFilePath);
    const passed = this.isBruReportPassing(parsed, spawned.exitCode);
    return {
      classification: this.classifyRunStep(step, spawned, parsed),
      dataFilePath: step.dataFilePath,
      durationMs,
      error: this.extractReportError(parsed) || undefined,
      exitCode: spawned.exitCode,
      name: step.name,
      passed,
      phase: step.phase,
      requestPath: step.requestPath,
      stderr: spawned.stderr,
      stdout: spawned.stdout,
    };
  }

  private async readBruJsonReport(reportFilePath: string): Promise<unknown[]> {
    try {
      const content = await fs.readFile(reportFilePath, 'utf8');
      return JSON.parse(content) as unknown[];
    } catch {
      return [];
    }
  }

  private isBruReportPassing(report: unknown[], exitCode: number): boolean {
    if (exitCode !== 0) {
      return false;
    }
    const first = Array.isArray(report) && report.length > 0 ? (report[0] as { summary?: Record<string, number> }) : undefined;
    const summary = first?.summary || {};
    return (
      Number(summary.failedRequests || 0) === 0 &&
      Number(summary.errorRequests || 0) === 0 &&
      Number(summary.failedAssertions || 0) === 0 &&
      Number(summary.failedTests || 0) === 0
    );
  }

  private extractReportError(report: unknown[]): string | null {
    if (!Array.isArray(report) || report.length === 0) {
      return null;
    }
    const entry = report[0] as { results?: Array<{ error?: string }> };
    return entry.results?.find((result) => typeof result.error === 'string')?.error || null;
  }

  private classifyRunStep(
    step: FeatureRunStep,
    spawned: { exitCode: number; stderr: string; stdout: string },
    report: unknown[],
  ): FeatureRunStepResult['classification'] {
    if (step.phase === 'cleanup') {
      return 'cleanup';
    }
    const combined = `${spawned.stderr}\n${spawned.stdout}\n${this.extractReportError(report) || ''}`.toLowerCase();
    if (combined.includes('enoent') || combined.includes('cannot find') || combined.includes('syntaxerror') || combined.includes('referenceerror')) {
      return 'collection-defect';
    }
    if (step.phase === 'auth' || step.phase === 'support') {
      return 'setup-failure';
    }
    return 'product-defect';
  }
}

export function createFeatureSliceManager(
  nativeManager: BrunoNativeManager,
  requestBuilder: RequestBuilder,
  workspaceManager: WorkspaceManager,
): FeatureSliceManager {
  return new FeatureSliceManager(nativeManager, requestBuilder, workspaceManager);
}
