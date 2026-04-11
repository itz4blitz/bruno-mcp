import { z } from 'zod';

import { ENGINE_HTTP_SCHEMA_VERSION, engineInspectContractRequestSchema, engineInspectSliceRequestSchema, enginePlanRequestSchema, engineRunRequestSchema, engineScaffoldRequestSchema, engineValidateRequestSchema } from './schema.js';

export const ENGINE_SCHEMA_VERSION = ENGINE_HTTP_SCHEMA_VERSION;

export interface EngineEnvelope<T> {
  data: T;
  engineVersion: string;
  runtime: 'bruno';
  schemaVersion: number;
}

export interface EngineCompatibility {
  engineVersion: string;
  schemaVersion: number;
  supportedSchemaVersions: number[];
}

export interface EngineSchemaVersionMismatch extends EngineCompatibility {
  error: 'schema_version_mismatch';
}

export type EngineInspectContractRequest = z.infer<typeof engineInspectContractRequestSchema>;
export type EnginePlanRequest = z.infer<typeof enginePlanRequestSchema>;
export type EngineScaffoldRequest = z.infer<typeof engineScaffoldRequestSchema>;
export type EngineValidateRequest = z.infer<typeof engineValidateRequestSchema>;
export type EngineRunRequest = z.infer<typeof engineRunRequestSchema>;
export type EngineInspectSliceRequest = z.infer<typeof engineInspectSliceRequestSchema>;
