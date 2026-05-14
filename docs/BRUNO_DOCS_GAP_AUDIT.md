# Bruno Docs Gap Audit

Source checked: `https://docs.usebruno.com/llms.txt` and `https://docs.usebruno.com/llms-full.txt`.

This audit is scoped to gaps between current Bruno documentation and this MCP server's generation/audit surface. The goal is enterprise-grade Bruno generation that opens cleanly in Bruno Desktop, runs cleanly in `bru run`, and does not hide setup, seed, cleanup, or product defects.

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

## P0 Gaps

These are blockers for "100% true coverage" generation.

1. Contract-driven suite generation exists for REST/OData, but still needs report reconciliation.
   The MCP can inspect OpenAPI, model OData-over-OpenAPI denominators, scaffold REST/OData positive and negative request suites, write persisted environments, audit variables, and map generated requests to a coverage manifest. It still needs `bru run` report ingestion to update coverage from actual pass/fail execution.

2. OData modeling now generates request coverage, but live behavior still decides truth.
   The MCP now has a reusable OData contract model for service roots, `$metadata`, entity sets, key endpoints, query options, navigation properties, matrix requests for `$select`, `$filter`, `$orderby`, `$top`, `$skip`, `$count`, `$expand`, key identity checks, malformed-query checks, and bad-entity-set checks. Generated assertions should be treated as contract-derived minimums and strengthened from observed API behavior when needed.

3. Coverage needs run-report reconciliation.
   The MCP now generates a coverage denominator manifest for endpoints, methods, query options, payload fields, response fields, scenario classes, seeded variables, and file routes. Audits still need to compare Bruno collection state and `bru run` reports against that manifest and mark covered, uncovered, documented skip, and failing items.

4. Seed handling needs a source-of-truth integration.
   The MCP needs tools to ingest a seed manifest or resolve seed records through the public API, then hydrate environment/runtime variables. It should never require DB reads for API test data.

5. Desktop variable readiness needs generation enforcement.
   Bruno Desktop direct-request usage needs persisted environment, collection, folder, or request variables. Runtime `bru.setVar()` only exists during a collection run. The MCP now audits every `{{var}}` reference and classifies environment, collection, folder, request, process env, secret manager, prompt, OAuth2, runtime-only, and missing sources. Generators still need to fail or create support artifacts when unresolved Desktop variables remain.

6. Data-driven test generation is incomplete.
   Bruno supports CSV/JSON runner data files and `bru.runner.iterationData`. The MCP has strict matrix scaffolding, but it needs a general data-file authoring and run-manifest layer that pairs each request with its data file, validates iteration fields, and emits the exact `bru run --json-file-path` or `--csv-file-path` command.

7. Assertion modeling is too loose.
   The docs define assertion expressions, operators, and values. The MCP accepts generic `{ name, value }` pairs and should validate/map the full operator set, including type, string, numeric, length, membership, and response-header assertions.

8. Request settings are unvalidated.
   The MCP allows arbitrary settings. It should validate docs-backed settings: `encodeUrl`, `timeout`, `followRedirects`, and `maxRedirects` with documented ranges/defaults.

9. Auth parity is incomplete.
   Current auth support covers none/inherit/bearer/basic/oauth2/api-key/digest. Bruno also documents OAuth 1.0, AWS SigV4, NTLM, WSSE in OpenCollection, client certificates, OAuth2 PKCE/system browser, token placement, auto-fetch, auto-refresh, credential IDs, and token reset/access APIs.

10. Secret management is missing.
    The MCP does not generate or audit `.env`, `.env.sample`, `vars:secret`, `secrets.json`, secret manager mappings, secret references, or report-masking risks.

11. Shared script support is missing.
    Bruno supports CommonJS helper files, `additionalContextRoots`, and safe vs developer sandbox behavior. The MCP should scaffold shared JS helpers, configure context roots, and warn when a collection requires `--sandbox=developer`.

12. CLI execution exists, but report ingestion is missing.
    The MCP now has `run_collection` for `bru run` with `--env`, `--env-file`, `--global-env`, `--workspace-path`, `--env-var`, tags, reporters, sandbox, data files, bail, and parallel options. It still needs first-class parsing of JSON/JUnit/HTML report artifacts into coverage and findings.

13. Import/export/converter tools are missing.
    Bruno documents CLI and converter support for OpenAPI, Postman, Insomnia, and WSDL. The MCP should wrap those flows instead of reimplementing every import path by hand.

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

10. Desktop active-environment persistence should not be faked.
    Bruno stores active global environment selection internally per workspace. Unless Bruno documents a stable on-disk setting, MCP should generate files and instructions, not pretend it can select the active Desktop environment.

## First Consumer Consequence

For the first consuming API project, use `scaffold_api_contract_suite` as the generic OpenAPI/OData suite generator instead of repo-local collection generation. The generator should:

- read the live OpenAPI document,
- derive every entity set and file route,
- hydrate Desktop/CLI variables from caller-provided seed manifests or explicit variables,
- create positive, negative, OData matrix, file dependency, and write-disabled findings,
- generate a coverage manifest with endpoint/query/payload/schema denominators,
- audit the generated collection against that manifest,
- then run with `run_collection` and reconcile the run report once report ingestion is implemented.
