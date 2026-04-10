import { DynamicDataPolicy, FeatureRunProfile, FeatureSliceType } from '../bruno/feature-slice.js';

export const ENGINE_SCHEMA_VERSION = 1;

export interface EngineEnvelope<T> {
  data: T;
  engineVersion: string;
  runtime: 'bruno';
  schemaVersion: number;
}

export interface EngineInspectContractRequest {
  contractPath: string;
}

export interface EnginePlanRequest {
  basePath?: string;
  collectionPath: string;
  controllerContractPath?: string;
  convenienceMode?: boolean;
  featureName: string;
  featureType: FeatureSliceType;
  overlay?: string;
  sourceOfTruth?: string;
  strictMode?: boolean;
  targetResource?: string;
}

export interface EngineScaffoldRequest extends EnginePlanRequest {
  dataPolicy?: DynamicDataPolicy;
  includeMatrices?: boolean;
  includeSupportRequests?: boolean;
}

export interface EngineValidateRequest {
  collectionPath: string;
  sliceId: string;
}

export interface EngineRunRequest {
  collectionPath: string;
  env: string;
  globalEnv?: string;
  profile?: FeatureRunProfile;
  sliceId: string;
  workspacePath?: string;
}

export interface EngineInspectSliceRequest {
  collectionPath: string;
  sliceId: string;
}
