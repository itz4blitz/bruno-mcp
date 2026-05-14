# Bruno Docs Gap Audit

Source checked: `https://docs.usebruno.com/llms.txt` and `https://docs.usebruno.com/llms-full.txt`.

This audit is scoped to gaps between current Bruno documentation and this MCP server's generation/audit surface. The goal is enterprise-grade Bruno generation that opens cleanly in Bruno Desktop, runs cleanly in `bru run`, and does not hide setup, seed, cleanup, or product defects.

## Current Status Snapshot

Implemented:

- file-native collection, workspace, request, folder-default, collection-default, and environment CRUD
- Desktop-ready environment file generation and live OData seed-variable hydration
- OpenAPI inspection, OData-over-OpenAPI modeling, and coverage-denominator manifests
- REST/OData contract-suite scaffolding with persisted environments, positive/negative requests, query matrices, file routes, and coverage mappings
- Bruno variable source graph auditing for Desktop and CLI readiness
- Bruno CLI run command generation/execution
- feature-slice planning, scaffolding, support graphs, run manifests, run classification, and findings capture
- collection quality/readiness scoring for assertion depth, docs depth, semantic risk, parity risk, product defects, seed gaps, test-infra gaps, and external stubs
- CSV/JSON runner data-file authoring with manifest validation
- strict Bruno assertion/operator validation and request-settings validation
- Bruno auth support for none, inherit, bearer, basic, OAuth2, API key, digest, AWS SigV4, NTLM, and WSSE
- dotenv and `vars:secret` scaffolding that avoids writing real secret values
- OpenAPI/WSDL import wrappers and Postman/Insomnia/OpenAPI/WSDL converter wrappers, including Bruno export conversion

In progress / next:

- ingesting JSON/JUnit/HTML `bru run` artifacts back into coverage manifests and findings
- helper-script and report-artifact parity

Planned:

- GraphQL schema/introspection coverage
- gRPC generation
- WebSocket generation
- SOAP/WSDL generation
- optional sampling-based planning/auditing

## Fixed During This Pass

- `create_request` now emits current classic BRU query syntax as `params:query { ... }`.
- Request parsing remains backwards-compatible with older `query { ... }` blocks.
- Added MCP source support for Desktop-ready environment configuration:
  - `configure_desktop_environment`
  - `hydrate_odata_seed_environment`
- `hydrate_odata_seed_environment` resolves real entity IDs from a live OData/OpenAPI API and reports missing seeded data instead of inventing IDs.
- Added generic OpenAPI contract inspection:
  - `inspect_api_contract`
- Added a generic contract coverage denominator manifest:
  - `generate_contract_coverage_manifest`
  - `validate_contract_coverage_manifest`
- Added generic REST/OData contract suite scaffolding:
  - `scaffold_api_contract_suite`
- Added a Bruno variable source graph audit:
  - `audit_variable_sources`
- Added a generic Bruno CLI wrapper:
  - `run_collection`

The running global MCP process must be restarted before newly added tools appear to clients.

## High-Priority Coverage Notes

These are the current blockers and recently closed parity items for "100% true coverage" generation across arbitrary APIs.

1. Contract-driven suite generation exists for REST/OData, but still needs report reconciliation.
   The MCP can inspect OpenAPI, model OData-over-OpenAPI denominators, scaffold REST/OData positive and negative request suites, write persisted environments, audit variables, and map generated requests to a coverage manifest. It still needs `bru run` report ingestion to update coverage from actual pass/fail execution.

2. OData modeling now generates request coverage, but live behavior still decides truth.
   The MCP now has a reusable OData contract model for service roots, `$metadata`, entity sets, key endpoints, query options, navigation properties, matrix requests for `$select`, `$filter`, `$orderby`, `$top`, `$skip`, `$count`, `$expand`, key identity checks, malformed-query checks, and bad-entity-set checks. Generated assertions should be treated as contract-derived minimums and strengthened from observed API behavior when needed.

3. Coverage needs run-report reconciliation.
   The MCP now generates a coverage denominator manifest for endpoints, methods, query options, payload fields, response fields, scenario classes, seeded variables, and file routes. Audits still need to compare Bruno collection state and `bru run` reports against that manifest and mark covered, uncovered, documented skip, and failing items.

4. Seed handling needs a stronger source-of-truth integration.
   The MCP can resolve seed records through a public OData/OpenAPI API and hydrate environment/runtime variables. It still needs generic seed-manifest ingestion and validation so generated suites can prove which variables came from deterministic fixtures. It should never require DB reads for API test data.

5. Desktop variable readiness needs generation enforcement.
   Bruno Desktop direct-request usage needs persisted environment, collection, folder, or request variables. Runtime `bru.setVar()` only exists during a collection run. The MCP now audits every `{{var}}` reference and classifies environment, collection, folder, request, process env, secret manager, prompt, OAuth2, runtime-only, and missing sources. Generators still need to fail or create support artifacts when unresolved Desktop variables remain.

6. Data-driven test generation has a generic data-file layer; report reconciliation is still missing.
   Bruno supports CSV/JSON runner data files and `bru.runner.iterationData`. The MCP can now author CSV/JSON data files, validate required fields, write run manifests, and emit the exact `bru run --json-file-path` or `--csv-file-path` command. It still needs report ingestion to connect iteration pass/fail back to coverage manifests.

7. Assertion modeling has docs-backed operator validation; schema-aware assertion generation is still next.
   The MCP now validates Bruno assertion operators and normalizes documented aliases before writing requests. It still needs richer generated schema-aware assertions that prove every response field type/nullability/enum/length rule from a contract.

8. Request settings are validated.
   The MCP now accepts only Bruno-backed request settings: `encodeUrl`, `timeout`, `followRedirects`, and `maxRedirects`, including documented defaults/ranges used by Bruno file storage.

9. Auth parity is implemented for file-backed HTTP auth modes supported by the local Bruno packages.
   Current auth support covers none/inherit/bearer/basic/oauth2/api-key/digest/AWS SigV4/NTLM/WSSE plus OAuth2 PKCE, callback/refresh URLs, token placement, credential placement/id, token source, auto-fetch, and auto-refresh fields. OAuth 1.0 is not emitted because the installed Bruno file-store/schema packages do not expose a stable OAuth1 auth block.

10. Secret scaffolding is implemented; external secret-manager audits are still missing.
    The MCP can write `.env.sample`, `.gitignore`, process-env references, and `vars:secret` entries without committing real secret values. It still needs first-class `secrets.json` external secret-manager mapping audits and report-masking verification.

11. Shared script support is missing.
    Bruno supports CommonJS helper files, `additionalContextRoots`, and safe vs developer sandbox behavior. The MCP should scaffold shared JS helpers, configure context roots, and warn when a collection requires `--sandbox=developer`.

12. CLI execution exists, but report ingestion is missing.
    The MCP now has `run_collection` for `bru run` with `--env`, `--env-file`, `--global-env`, `--workspace-path`, `--env-var`, tags, reporters, sandbox, data files, bail, and parallel options. It still needs first-class parsing of JSON/JUnit/HTML report artifacts into coverage and findings.

13. Import/export/converter wrappers are implemented.
    The MCP wraps Bruno CLI import for OpenAPI/WSDL and official Bruno converters for Postman, Insomnia, OpenAPI, WSDL, and Bruno export conversion paths.

14. Protocol generation is incomplete.
    Bruno supports REST, GraphQL, gRPC, WebSocket, and SOAP/WSDL. The MCP currently covers REST/OpenAPI, OData-over-OpenAPI modeling, and GraphQL-over-HTTP requests. It does not yet parse GraphQL schemas/introspection results or generate gRPC, WebSocket, or SOAP/WSDL suites.

15. Path params and custom methods need parity.
    Bruno supports `params:path`, TRACE, CONNECT, and custom methods. The MCP currently models query params but not path params as first-class request input, and method enums omit TRACE/CONNECT/custom methods.

## P1 Gaps

These are quality gaps that will create drift or weak tests over time.

1. `create_crud_requests` is convenience-only and shallow.
   It should be deprecated for enterprise coverage or rewritten to require a contract, schema, seed policy, and assertions.

2. `audit_collection_quality` is heuristic, not contract-aware.
   It catches shallow tests, placeholders, duplicates, and auth-none risk, but it cannot prove endpoint or schema coverage without a manifest.

3. Feature-slice scaffolding is still generic.
   Default support URLs and payloads are useful for examples, but product-grade generation needs contract- and overlay-backed exact endpoints, DTO fields, min/max payloads, and seeded fixtures.

4. Generated dynamic data can conflict with seed-source truth.
   For APIs where seeded automation data is the authority, MCP-side faker data should be opt-in and clearly separated from seed-backed scenarios.

5. Environment writers should support metadata.
   Environment and workspace variable entries should preserve documented `enabled`, `secret`, `type`, and color metadata where Bruno stores it.

6. Response examples and API docs are not modeled.
   Bruno can save response examples and generate API docs. The MCP does not create or audit those assets.

7. Cookies and cookie-jar behavior are not modeled.
   Bruno exposes cookie helpers and CLI cookie toggles. The MCP does not generate cookie-aware flows or report when cookies are required.

8. Collection-level script safety checks are missing.
   Bruno warns against `bru.runRequest()` in collection-level scripts because it can recurse. The MCP should lint for that.

9. Reports need first-class artifact handling.
   The MCP should generate JSON/JUnit/HTML report paths, mask sensitive data intentionally, and ingest reports to update coverage manifests.

10. Desktop environment file generation is implemented; Desktop dropdown selection should not be faked.
    The MCP generates the environment files and variables that Bruno Desktop can load. Unless Bruno documents a stable on-disk setting for the active environment dropdown, the MCP should keep treating that selection as app UI state and provide clear instructions instead of pretending it can select it.

## First Consumer Guidance

For the first consuming API project, use `scaffold_api_contract_suite` as the generic OpenAPI/OData suite generator instead of repo-local collection generation. The generator should:

- read the live OpenAPI document,
- derive every entity set and file route,
- hydrate Desktop/CLI variables from caller-provided seed manifests or explicit variables,
- create positive, negative, OData matrix, file dependency, and write-disabled findings,
- generate a coverage manifest with endpoint/query/payload/schema denominators,
- audit the generated collection against that manifest,
- then run with `run_collection` and reconcile the run report once report ingestion is implemented.
