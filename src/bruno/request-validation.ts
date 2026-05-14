import { BrunoError, RequestAuthConfig, RequestAuthMode } from './types.js';

export interface BrunoAssertionInput {
  enabled?: boolean;
  name: string;
  value: string;
}

export interface BrunoAssertion extends BrunoAssertionInput {
  enabled: boolean;
}

export interface BrunoRequestSettings {
  encodeUrl?: boolean;
  followRedirects?: boolean;
  maxRedirects?: number;
  timeout?: number;
}

export interface BrunoAuthInput {
  config?: RequestAuthConfig;
  type: RequestAuthMode | 'aws-sig-v4';
}

export interface NormalizedBrunoAuth {
  config?: RequestAuthConfig;
  type: RequestAuthMode;
}

const OPERATOR_ALIASES: Record<string, string> = {
  equals: 'eq',
  notEquals: 'neq',
};

const UNARY_OPERATORS = new Set([
  'isEmpty',
  'isNotEmpty',
  'isNull',
  'isUndefined',
  'isDefined',
  'isTruthy',
  'isFalsy',
  'isJson',
  'isNumber',
  'isString',
  'isBoolean',
  'isArray',
]);

const VALUE_OPERATORS = new Set([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'notIn',
  'contains',
  'notContains',
  'length',
  'matches',
  'notMatches',
  'startsWith',
  'endsWith',
  'between',
]);

const AUTH_MODE_ALIASES: Record<string, RequestAuthMode> = {
  'api-key': 'apikey',
  'aws-sig-v4': 'awsv4',
};

export function normalizeAssertions(assertions: BrunoAssertionInput[]): BrunoAssertion[] {
  return assertions.map((assertion) => normalizeAssertion(assertion));
}

export function normalizeAssertion(assertion: BrunoAssertionInput): BrunoAssertion {
  const name = assertion.name.trim();
  if (!name) {
    throw new BrunoError('Assertion target is required', 'VALIDATION_ERROR');
  }

  const rawValue = assertion.value.trim();
  if (!rawValue) {
    throw new BrunoError(`Assertion "${name}" requires an operator`, 'VALIDATION_ERROR');
  }

  const [rawOperator = '', ...rest] = rawValue.split(/\s+/);
  const operator = OPERATOR_ALIASES[rawOperator] || rawOperator;
  const expectedValue = rest.join(' ').trim();

  if (!UNARY_OPERATORS.has(operator) && !VALUE_OPERATORS.has(operator)) {
    throw new BrunoError(
      `Unsupported Bruno assertion operator "${rawOperator}" for "${name}"`,
      'VALIDATION_ERROR',
    );
  }

  if (VALUE_OPERATORS.has(operator) && expectedValue.length === 0) {
    throw new BrunoError(
      `Assertion "${name}" operator "${operator}" requires an expected value`,
      'VALIDATION_ERROR',
    );
  }

  if (UNARY_OPERATORS.has(operator) && expectedValue.length > 0) {
    throw new BrunoError(
      `Assertion "${name}" operator "${operator}" does not take an expected value`,
      'VALIDATION_ERROR',
    );
  }

  return {
    enabled: assertion.enabled !== false,
    name,
    value: expectedValue ? `${operator} ${expectedValue}` : operator,
  };
}

export function normalizeRequestSettings(settings: Record<string, unknown>): BrunoRequestSettings {
  const normalized: BrunoRequestSettings = {};

  for (const [key, value] of Object.entries(settings)) {
    switch (key) {
      case 'encodeUrl':
      case 'followRedirects':
        if (typeof value !== 'boolean') {
          throw new BrunoError(`${key} must be a boolean`, 'VALIDATION_ERROR');
        }
        normalized[key] = value;
        break;
      case 'maxRedirects':
        normalized.maxRedirects = normalizeIntegerRange(key, value, 1, 50);
        break;
      case 'timeout':
        normalized.timeout = value === 0 ? 0 : normalizeIntegerRange(key, value, 1000, 300000);
        break;
      default:
        throw new BrunoError(`Unsupported Bruno request setting "${key}"`, 'VALIDATION_ERROR');
    }
  }

  return normalized;
}

export function normalizeRequestAuth(auth: BrunoAuthInput): NormalizedBrunoAuth {
  const type = AUTH_MODE_ALIASES[auth.type] || auth.type;
  const config = auth.config || {};

  switch (type) {
    case 'none':
    case 'inherit':
      return { type };
    case 'bearer':
      requireConfig(config, type, ['token']);
      break;
    case 'basic':
    case 'digest':
    case 'wsse':
      requireConfig(config, type, ['username', 'password']);
      break;
    case 'ntlm':
      requireConfig(config, type, ['username', 'password']);
      break;
    case 'apikey':
      requireConfig(config, type, ['key', 'value']);
      break;
    case 'oauth2':
      requireConfig(config, type, ['grantType'], ['grant_type']);
      break;
    case 'awsv4':
      if (!hasConfigValue(config, 'profileName')) {
        requireConfig(config, type, ['accessKeyId', 'secretAccessKey']);
      }
      requireConfig(config, type, ['service', 'region']);
      break;
    default:
      throw new BrunoError(`Unsupported Bruno auth mode "${auth.type}"`, 'VALIDATION_ERROR');
  }

  return { config, type };
}

function normalizeIntegerRange(key: string, value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new BrunoError(`${key} must be an integer`, 'VALIDATION_ERROR');
  }

  if (value < min || value > max) {
    throw new BrunoError(`${key} must be between ${min} and ${max}`, 'VALIDATION_ERROR');
  }

  return value;
}

function requireConfig(
  config: RequestAuthConfig,
  authType: string,
  requiredKeys: string[],
  alternativeKeys: string[] = [],
): void {
  for (const key of requiredKeys) {
    if (
      !hasConfigValue(config, key) &&
      !alternativeKeys.some((alias) => hasConfigValue(config, alias))
    ) {
      throw new BrunoError(`${key} is required for ${authType} auth`, 'VALIDATION_ERROR');
    }
  }
}

function hasConfigValue(config: RequestAuthConfig, key: string): boolean {
  const value = config[key];
  return value !== undefined && value !== null && String(value).trim().length > 0;
}
