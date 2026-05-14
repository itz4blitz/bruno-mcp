# MCP Tool Reference

This is the current logical tool grouping for `bruno-mcp`.

## Collection Generation

- `create_collection`
- `create_environment`
- `configure_desktop_environment`
- `hydrate_odata_seed_environment`
- `inspect_api_contract`
- `generate_contract_coverage_manifest`
- `validate_contract_coverage_manifest`
- `scaffold_api_contract_suite`
- `audit_variable_sources`
- `run_collection`
- `create_runner_data_file`
- `validate_runner_data_manifest`
- `configure_collection_secrets`
- `import_collection`
- `convert_to_bruno_export`
- `convert_from_bruno_export`
- `create_request`
- `add_test_script`
- `create_test_suite`
- `create_crud_requests`
- `inspect_controller_contract`
- `inspect_feature_slice_context`
- `plan_feature_slice`
- `scaffold_feature_slice`
- `scaffold_matrix_request`
- `scaffold_support_requests`
- `audit_feature_slice`
- `record_slice_findings`
- `refresh_generated_data`
- `generate_feature_run_manifest`
- `inspect_feature_run_manifest`
- `validate_feature_run_manifest`
- `inspect_feature_slice_support_graph`
- `run_feature_slice`
- `list_collections`
- `get_collection_stats`

## Contract Coverage And Runs

- `inspect_api_contract`
- `generate_contract_coverage_manifest`
- `validate_contract_coverage_manifest`
- `scaffold_api_contract_suite`
- `audit_variable_sources`
- `run_collection`

These tools are protocol-adapter foundations for deep API coverage:

- OpenAPI contracts normalize into endpoint, method, parameter, request-body, and response-schema models.
- OData-over-OpenAPI adds service root, `$metadata`, entity set, key lookup, and query-option denominators.
- Seed manifests contribute required variables without hardcoded IDs.
- `scaffold_api_contract_suite` builds REST/OData request folders, positive/negative scenarios, min/max JSON payload requests, OData query matrix requests, unsupported-method checks, persisted environments, and coverage mappings.
- Variable audits classify Desktop-ready, runtime-only, prompt, process, secret, OAuth2, and missing variables.
- `run_collection` wraps `bru run` with env, workspace, tag, data-file, reporter, sandbox, and execution flags.
- `create_runner_data_file` writes CSV/JSON runner data, validates required iteration fields, and optionally writes a run manifest with the exact CLI data-file option.
- `configure_collection_secrets` writes `.env.sample`, `.gitignore` entries, process-env references, and `vars:secret` entries without committing real secret values.
- `import_collection`, `convert_to_bruno_export`, and `convert_from_bruno_export` wrap Bruno CLI/converter paths instead of hand-translating import/export formats.

## Request Validation And Bruno Parity

Request creation and update now validate Bruno assertion expressions and request settings before writing files. Supported assertion operators include `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn`, `contains`, `notContains`, `length`, `matches`, `notMatches`, `startsWith`, `endsWith`, `between`, `isEmpty`, `isNotEmpty`, `isNull`, `isUndefined`, `isDefined`, `isTruthy`, `isFalsy`, `isJson`, `isNumber`, `isString`, `isBoolean`, and `isArray`; `equals` and `notEquals` are normalized to Bruno's stored operators.

Request settings are limited to Bruno-backed settings: `encodeUrl`, `followRedirects`, `maxRedirects`, and `timeout`.

Auth generation covers Bruno's current file-backed HTTP auth modes supported by the local Bruno packages: none, inherit, bearer, basic, OAuth2, API key, digest, AWS SigV4, NTLM, and WSSE. OAuth2 includes PKCE, callback/refresh URLs, token placement, credential placement/id, token source, and auto-fetch/auto-refresh fields.

## Collection Quality And Assertion Depth

- `audit_collection_quality`

`audit_collection_quality` scores whether requests are deeply asserted, not just whether a route was hit. The summary includes `assertionDepthScore`, `assertionDepthCovered`, `assertionDepthTotal`, `assertionPerfectRequests`, `assertionIncompleteRequests`, `docsDepthScore`, `docsMeaningfulRequests`, `docsDecisionGradeRequests`, `semanticRiskScore`, `parityRiskScore`, `productDefectFindings`, `seedDataGapFindings`, `testInfraParityFindings`, `externalStubFindings`, and `enterpriseReadinessScore`. When `includeRequests` is enabled, each request includes its classification, required dimensions, evidence, missing dimensions, semantic risks, parity risks, and documentation quality.

The assertion-depth model classifies requests as reads, query reads, key reads, mutations, negatives, support/setup, contract docs, and event/file scenarios. Required dimensions vary by classification and include status, content type, response shape, schema fields, seed identity, query semantics, business semantics, side effects, no unexpected side effects, negative envelopes, variable capture, and meaningful docs.

The documentation-depth model classifies docs as missing, placeholder, thin, meaningful, or decision-grade. A request does not receive the docs assertion dimension just because a `docs {}` block exists; the docs must describe test intent, coverage decision, dependency/risk, or failure interpretation. Thin and placeholder docs reduce `docsDepthScore` and `enterpriseReadinessScore`.

The audit also reports semantic risks separately from mechanical assertion depth. Broad status ranges, conditional success/failure branches, stale env-var resolver checks, under-proven OData query options, and token requests without claim assertions reduce `semanticRiskScore` and `enterpriseReadinessScore` even when the request has tests. This prevents a generated suite from earning a perfect score through checkbox assertions that do not prove the intended behavior.

Parity risks are tracked separately from semantic weakness. The MCP classifies emulator/test-infra parity, product/infra defects, seed/data gaps, stale route/config gaps, and external dependency stubs as different risk kinds. They reduce `parityRiskScore` and appear as findings, but they do not lower `enterpriseReadinessScore` when the request's local oracle is exact. This lets the MCP distinguish "the test is weak" from "the test is truthfully exposing an environment gap or product/config defect."

Scenario matrices are treated as first-class coverage. Reusing the same method and URL is not automatically duplication when the body, docs, tags, or request classification prove the requests cover different payloads, data rows, or negative cases.

## Feature Slices

These tools sit above raw request CRUD and actively handhold feature-slice buildout.

- inspect workspace and collection state
- inspect controller contracts from OpenAPI
- identify missing Bruno-native coverage
- propose slice structure and support requests
- scaffold happy path, read, negative, security, and support flows
- enforce strict matrix authoring with request-owned base payloads plus scenario deltas only
- emit separate matrix metadata so required fields and allowed delta paths stay explicit
- generate truthful findings and cleanup documentation
- generate, inspect, and validate automation run manifests
- expose support/setup dependency graphs for slice inspection
- run the slice end to end and classify failures more explicitly
- treat project overlays as overlay logic instead of generic Bruno mechanics

## Workspace

- `get_workspace`
- `add_collection_to_workspace`
- `remove_collection_from_workspace`
- `validate_workspace`

## Workspace Environments

- `list_workspace_environments`
- `get_workspace_environment`
- `create_workspace_environment`
- `update_workspace_environment`
- `delete_workspace_environment`

## Collection Defaults

- `get_collection_defaults`
- `update_collection_defaults`

These act on collection-level reusable defaults such as:

- headers
- vars
- scripts
- tests
- docs
- auth

## Folders

- `list_folders`
- `get_folder`
- `create_folder`
- `update_folder_defaults`
- `delete_folder`

Folder defaults are the main path toward reducing repeated auth/bootstrap logic.

## Requests

- `list_requests`
- `get_request`
- `update_request`
- `move_request`
- `delete_request`

These operate on the existing file format already on disk.

## Collection Environments

- `list_environments`
- `get_environment`
- `update_environment_vars`
- `delete_environment`
- `configure_desktop_environment`
- `hydrate_odata_seed_environment`

## Resources

The server also exposes read-only MCP resources for Bruno-native state.

Current resources include:

- `bruno://capabilities`
- `bruno://workspace/{workspacePath}`
- `bruno://collection/{collectionPath}`
- `bruno://collection-audit/{collectionPath}`
- `bruno://request/{requestPath}`
- `bruno://environment/{collectionPath}/{environmentName}`
- `bruno://slice/{collectionPath}/{sliceId}`
- `bruno://slice-run-manifest/{collectionPath}/{sliceId}`
- `bruno://slice-support-graph/{collectionPath}/{sliceId}`

These resources are intended for discovery, inspection, and model context, not mutation.

## Prompts

The server also exposes MCP prompts for reusable Bruno workflows.

Current prompts include:

- `generate_rest_feature`
- `build_feature_slice`
- `audit_bruno_collection`
- `normalize_bruno_collection`

These prompts support argument completion for common inputs like collection paths and workflow styles.

## Completions

Prompt arguments and resource templates now support filesystem-aware completion for:

- workspace paths
- collection paths
- request paths
- environment names
- common workflow/style enums

When client roots are available, completions are constrained to those roots.

## Rich MCP Behavior

- roots-aware path checks for tools and resources
- safe elicitation for recursive folder deletion when supported by the client
- logging notifications for operational visibility
- progress notifications for long-ish operations such as request listing

## Design Notes

- Requests and environments are treated as file-native Bruno assets.
- Workspace metadata is treated separately from collection internals.
- The server favors patching and preserving structure over rewriting entire projects conceptually.
- Mutation remains tool-driven.
- Read-only discovery is moving toward resources and prompts.
