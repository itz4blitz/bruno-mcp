import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const ENGINE_HTTP_SCHEMA_VERSION = 1;

const dynamicDataPolicySchema = z
  .object({
    fakerProfile: z.enum(['commerce', 'person', 'simple']).optional(),
    mode: z.enum(['builtin', 'faker']).optional(),
    persistAsVars: z.boolean().optional(),
    scope: z.enum(['bruno-runtime', 'mcp']).optional(),
  })
  .strict();

const correlationSchema = z
  .object({
    jobId: z.string().optional(),
    projectId: z.string().optional(),
    requestId: z.string().optional(),
    runId: z.string().optional(),
  })
  .strict();

export const engineInspectContractRequestSchema = z
  .object({
    contractPath: z.string().min(1),
  })
  .strict();

export const enginePlanRequestSchema = z
  .object({
    basePath: z.string().optional(),
    collectionPath: z.string().min(1),
    controllerContractPath: z.string().optional(),
    convenienceMode: z.boolean().optional(),
    featureName: z.string().min(1),
    featureType: z.enum(['resource-crud', 'workflow', 'auth', 'search-filtering', 'upload', 'admin-resource']),
    overlay: z.string().optional(),
    sourceOfTruth: z.string().optional(),
    strictMode: z.boolean().optional(),
    targetResource: z.string().optional(),
  })
  .strict();

export const engineScaffoldRequestSchema = enginePlanRequestSchema.extend({
  dataPolicy: dynamicDataPolicySchema.optional(),
  includeMatrices: z.boolean().optional(),
  includeSupportRequests: z.boolean().optional(),
}).strict();

export const engineValidateRequestSchema = z
  .object({
    collectionPath: z.string().min(1),
    sliceId: z.string().min(1),
  })
  .strict();

export const engineInspectSliceRequestSchema = engineValidateRequestSchema;

export const engineRunRequestSchema = z
  .object({
    collectionPath: z.string().min(1),
    correlation: correlationSchema.optional(),
    env: z.string().min(1),
    globalEnv: z.string().optional(),
    mode: z.enum(['async', 'sync']).optional(),
    profile: z.enum(['smoke', 'full', 'negative_only', 'security_only', 'support_only']).optional(),
    sliceId: z.string().min(1),
    workspacePath: z.string().optional(),
  })
  .strict();

export const engineRunStatusRequestSchema = z
  .object({
    jobId: z.string().min(1),
  })
  .strict();

export const engineErrorSchema = z.object({
  error: z.string().min(1),
});

export const engineCompatibilitySchema = z
  .object({
    engineVersion: z.string().min(1),
    schemaVersion: z.number().int(),
    supportedSchemaVersions: z.array(z.number().int()).min(1),
  })
  .strict();

const artifactBundleSchema = z
  .object({
    artifactsManifestPath: z.string().min(1),
    coveragePath: z.string().min(1),
    findingsPath: z.string().min(1),
    generatedDataPath: z.string().min(1),
    manifestPath: z.string().min(1),
    runManifestPath: z.string().min(1),
    runReportPath: z.string().min(1),
    runSummaryMarkdownPath: z.string().min(1),
    supportGraphPath: z.string().min(1),
    validationSummaryMarkdownPath: z.string().min(1),
  })
  .strict();

const featureRunFailureReasonSchema = z
  .object({
    actualStatusCode: z.number().optional(),
    brunoStatus: z.string().optional(),
    code: z.string().min(1),
    expectedStatusCodes: z.array(z.number().int()).optional(),
    message: z.string().min(1),
    requestName: z.string().optional(),
    requestPath: z.string().optional(),
    source: z.string().min(1),
  })
  .strict();

const featureRunStepResultSchema = z
  .object({
    classification: z.enum(['cleanup', 'collection-defect', 'product-defect', 'setup-failure']),
    dataFilePath: z.string().optional(),
    durationMs: z.number(),
    error: z.string().optional(),
    exitCode: z.number(),
    failureReason: featureRunFailureReasonSchema.optional(),
    name: z.string().min(1),
    passed: z.boolean(),
    phase: z.string().min(1),
    requestPath: z.string().min(1),
    stderr: z.string(),
    stdout: z.string(),
  })
  .strict();

const featureRunIssueSchema = z
  .object({
    classification: z.string().min(1),
    evidence: z.string(),
    failureReason: featureRunFailureReasonSchema,
    phase: z.string().min(1),
    requestPath: z.string().min(1),
    title: z.string().min(1),
  })
  .strict();

const featureRunReportSchema = z
  .object({
    cleanupOutcomes: z.array(z.object({
      failureReason: featureRunFailureReasonSchema.optional(),
      name: z.string().min(1),
      outcome: z.string().min(1),
      requestPath: z.string().min(1),
    }).strict()),
    collectionDefects: z.array(featureRunIssueSchema),
    correlation: correlationSchema.optional(),
    env: z.string().min(1),
    exitStatus: z.enum(['failed', 'passed']),
    passCount: z.number().int(),
    productDefects: z.array(featureRunIssueSchema),
    profile: z.string().min(1),
    setupFailures: z.array(featureRunIssueSchema),
    sliceId: z.string().min(1),
    stepResults: z.array(featureRunStepResultSchema),
    totalSteps: z.number().int(),
  })
  .strict();

const featureRunManifestValidationSchema = z.object({ errors: z.array(z.string()), valid: z.boolean(), warnings: z.array(z.string()) }).strict();
const featureSliceSupportGraphSchema = z.object({ edges: z.array(z.unknown()), nodes: z.array(z.unknown()), sliceId: z.string().min(1) }).strict();
const featureSlicePlanSchema = z.object({ basePath: z.string().min(1), collectionPath: z.string().min(1), coreRequests: z.array(z.unknown()), featureName: z.string().min(1), featureType: z.string().min(1), matrixes: z.array(z.unknown()), requiredInputs: z.array(z.string()), sliceId: z.string().min(1), supportRequests: z.array(z.unknown()) }).passthrough();
const controllerContractSchema = z.object({ authRequired: z.boolean(), basePath: z.string().min(1), controllerName: z.string().min(1), operations: z.array(z.unknown()), source: z.record(z.string(), z.unknown()) }).passthrough();
const featureSliceValidationResultSchema = z.object({ artifacts: artifactBundleSchema, audit: z.record(z.string(), z.unknown()), manifestValidation: featureRunManifestValidationSchema, valid: z.boolean() }).strict();
const sliceScaffoldResultSchema = z.object({ createdFolders: z.array(z.string()), createdRequests: z.array(z.string()), dynamicData: z.record(z.string(), z.unknown()), manifestPath: z.string().min(1), runManifestPath: z.string().min(1), scenarioFiles: z.array(z.string()) }).strict();
const runAsyncAcceptedSchema = z.object({ artifacts: artifactBundleSchema, correlation: correlationSchema.optional(), jobId: z.string().min(1), pollUrl: z.string().min(1), state: z.literal('queued') }).strict();
const runSyncResponseDataSchema = z.object({ artifacts: artifactBundleSchema, report: featureRunReportSchema }).strict();
const runStatusResponseDataSchema = z.object({ artifacts: artifactBundleSchema, correlation: correlationSchema.optional(), error: z.string().optional(), finishedAt: z.string().optional(), jobId: z.string().min(1), report: featureRunReportSchema.optional(), startedAt: z.string().optional(), state: z.enum(['failed', 'queued', 'running', 'succeeded']) }).strict();

export function engineEnvelopeSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: dataSchema,
    engineVersion: z.string().min(1),
    runtime: z.literal('bruno'),
    schemaVersion: z.literal(ENGINE_HTTP_SCHEMA_VERSION),
  });
}

const passthroughObject = z.record(z.string(), z.unknown());

export const ENGINE_HTTP_SCHEMA_REGISTRY = {
  health: {
    authRequired: false,
    method: 'GET',
    path: '/engine/health',
    responseData: z.object({ status: z.literal('ok') }),
  },
  inspectContract: {
    authRequired: true,
    method: 'POST',
    path: '/engine/inspect-contract',
    request: engineInspectContractRequestSchema,
    responseData: z.object({ contractPath: z.string().min(1), controllers: z.array(controllerContractSchema) }).strict(),
  },
  inspectRunManifest: {
    authRequired: true,
    method: 'POST',
    path: '/engine/inspect-run-manifest',
    request: engineInspectSliceRequestSchema,
    responseData: z.object({ artifacts: artifactBundleSchema, manifest: z.record(z.string(), z.unknown()) }).strict(),
  },
  inspectSupportGraph: {
    authRequired: true,
    method: 'POST',
    path: '/engine/inspect-support-graph',
    request: engineInspectSliceRequestSchema,
    responseData: z.object({ artifacts: artifactBundleSchema, supportGraph: featureSliceSupportGraphSchema }).strict(),
  },
  plan: {
    authRequired: true,
    method: 'POST',
    path: '/engine/plan',
    request: enginePlanRequestSchema,
    responseData: z.object({ artifacts: artifactBundleSchema, plan: featureSlicePlanSchema }).strict(),
  },
  run: {
    authRequired: true,
    method: 'POST',
    path: '/engine/run',
    request: engineRunRequestSchema,
    responseData: z.union([runSyncResponseDataSchema, runAsyncAcceptedSchema]),
  },
  runStatus: {
    authRequired: true,
    method: 'GET',
    path: '/engine/run-status',
    request: engineRunStatusRequestSchema,
    responseData: runStatusResponseDataSchema,
  },
  scaffold: {
    authRequired: true,
    method: 'POST',
    path: '/engine/scaffold',
    request: engineScaffoldRequestSchema,
    responseData: z.object({ artifacts: artifactBundleSchema, scaffold: sliceScaffoldResultSchema }).strict(),
  },
  validate: {
    authRequired: true,
    method: 'POST',
    path: '/engine/validate',
    request: engineValidateRequestSchema,
    responseData: featureSliceValidationResultSchema,
  },
  validateRunManifest: {
    authRequired: true,
    method: 'POST',
    path: '/engine/validate-run-manifest',
    request: engineInspectSliceRequestSchema,
    responseData: z.object({ artifacts: artifactBundleSchema, validation: featureRunManifestValidationSchema }).strict(),
  },
  version: {
    authRequired: false,
    method: 'GET',
    path: '/engine/version',
    responseData: engineCompatibilitySchema,
  },
} as const;

export function getEngineHttpSchemas() {
  return ENGINE_HTTP_SCHEMA_REGISTRY;
}

export function getEngineHttpJsonSchemas() {
  return Object.fromEntries(
    Object.entries(ENGINE_HTTP_SCHEMA_REGISTRY).map(([name, config]) => {
      const route = config as {
        authRequired?: boolean;
        method?: string;
        path?: string;
        request?: z.ZodTypeAny;
        responseData: z.ZodTypeAny;
      };
      return [
        name,
        {
          authRequired: route.authRequired ?? false,
          error: zodToJsonSchema(engineErrorSchema, `${name}Error`),
          method: route.method,
          path: route.path,
          request: route.request ? zodToJsonSchema(route.request, `${name}Request`) : null,
          responseData: zodToJsonSchema(route.responseData, `${name}ResponseData`),
          successEnvelope: zodToJsonSchema(engineEnvelopeSchema(route.responseData), `${name}SuccessEnvelope`),
        },
      ];
    }),
  );
}
