# Bruno MCP

[![CI](https://github.com/itz4blitz/bruno-mcp/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/itz4blitz/bruno-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node >=20](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-workspace--native-7c3aed)](https://modelcontextprotocol.io/)
[![Bruno](https://img.shields.io/badge/Bruno-classic%20%2B%20workspace-ff6b35)](https://www.usebruno.com/)

`bruno-mcp` is a workspace-native MCP server for creating, inspecting, and managing Bruno collections on disk.

It does not try to remote-control the Bruno desktop app. Instead, it works with the same files that Bruno desktop and Bruno CLI already read:

- classic Bruno collections
- OpenCollection workspaces
- requests
- folder defaults
- collection defaults
- collection environments
- workspace/global environments

If you want a Bruno-aware MCP server that behaves like a real file-native automation layer instead of a one-shot request generator, this is that.

## Why This Exists

Bruno is file-based. That is a feature.

When an MCP server respects Bruno’s native model, you get:

- collections that open correctly in Bruno desktop
- collections that run correctly through `bru run`
- workspace-level management without brittle desktop automation
- reusable defaults at collection and folder scope instead of copy/pasted request logic
- a safer path to AI-generated API coverage because the model writes to real Bruno structures

This fork is built around that philosophy.

## What It Does

### Generate Bruno assets

- REST request generation
- GraphQL-over-HTTP request generation
- binary file upload request generation
- dependency-aware suite generation using runtime vars
- CRUD request scaffolding

### Manage Bruno workspaces and collections

- workspace registration via `workspace.yml`
- workspace environment CRUD
- collection defaults CRUD
- folder defaults CRUD
- request CRUD and movement
- collection environment CRUD
- collection discovery and stats

### Expose richer MCP features

- tools for deterministic mutation
- feature-slice planning, scaffolding, auditing, and findings capture
- OpenAPI/controller contract inspection for controller-aware slice planning
- strict matrix scaffolding with request-owned base payloads and scenario-delta files
- explicit support request scaffolding with visible auth/seed/resolve/lookup/cleanup helpers
- project overlay support for product-specific raw/DTO overlay behavior
- resources for read-only Bruno state inspection
- prompts for common workflows
- argument completion for paths and styles
- roots-aware path enforcement when the client provides roots
- logging notifications
- progress notifications
- safe elicitation for destructive/ambiguous operations

## Status

| Area                                                                      | Status                         |
| ------------------------------------------------------------------------- | ------------------------------ |
| Classic `.bru` collections                                                | Implemented                    |
| Workspace / OpenCollection YAML                                           | Implemented                    |
| Request metadata parity (assertions, tags, settings, docs, vars, scripts) | Implemented                    |
| Workspace / collection / folder / request / env CRUD                      | Implemented                    |
| MCP tools                                                                 | Implemented                    |
| MCP resources                                                             | Implemented                    |
| MCP prompts                                                               | Implemented                    |
| MCP completions                                                           | Implemented                    |
| Tasks                                                                     | Implemented                    |
| Roots enforcement                                                         | Implemented                    |
| Logging / progress                                                        | Implemented                    |
| Elicitation                                                               | Implemented                    |
| Sampling                                                                  | Not implemented                |
| gRPC generation                                                           | Not implemented                |
| WebSocket generation                                                      | Not implemented                |
| Desktop active-environment persistence                                    | Not implemented / not verified |

## Supported Bruno Storage Models

### Classic Bruno

- `bruno.json`
- `collection.bru`
- `folder.bru`
- request `*.bru`
- environment `*.bru`

### Workspace / OpenCollection

- `workspace.yml`
- `opencollection.yml`
- `folder.yml`
- request `*.yml`
- environment `*.yml`

`bruno-mcp` preserves the format already present on disk instead of silently converting collections behind your back.

## Core Capabilities

### Mutation tools

- `create_collection`
- `create_environment`
- `create_request`
- `add_test_script`
- `create_test_suite`
- `create_crud_requests`
- `audit_collection_quality`
- `inspect_feature_slice_context`
- `inspect_controller_contract`
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
- `get_workspace`
- `add_collection_to_workspace`
- `remove_collection_from_workspace`
- `validate_workspace`
- `list_workspace_environments`
- `get_workspace_environment`
- `create_workspace_environment`
- `update_workspace_environment`
- `delete_workspace_environment`
- `get_collection_defaults`
- `update_collection_defaults`
- `list_folders`
- `get_folder`
- `create_folder`
- `update_folder_defaults`
- `delete_folder`
- `list_requests`
- `get_request`
- `update_request`
- `move_request`
- `delete_request`
- `list_environments`
- `get_environment`
- `update_environment_vars`
- `delete_environment`

### Read-only MCP resources

- `bruno://capabilities`
- `bruno://workspace/{workspacePath}`
- `bruno://collection/{collectionPath}`
- `bruno://collection-audit/{collectionPath}`
- `bruno://request/{requestPath}`
- `bruno://environment/{collectionPath}/{environmentName}`
- `bruno://slice/{collectionPath}/{sliceId}`
- `bruno://slice-run-manifest/{collectionPath}/{sliceId}`
- `bruno://slice-support-graph/{collectionPath}/{sliceId}`

These are intended for inspection and model context, not mutation.

### MCP prompts

- `generate_rest_feature`
- `build_feature_slice`
- `audit_bruno_collection`
- `normalize_bruno_collection`

These prompts support argument completion for common filesystem and workflow values.

## Feature Slice Notes

- strict matrix scenario files contain scenario deltas only
- stable valid payloads remain owned by the Bruno request plus matrix metadata
- support requests stay explicit rather than hiding branching in core requests
- cleanup truth is documented as possible, conditional, or impossible without faking a passing cleanup path
- project-specific semantics belong in overlays instead of generic Bruno logic

See `docs/FEATURE_SLICE_AUTOMATION.md` for the automation-ready slice workflow and Branch example.
See `docs/ENGINE_HTTP_API.md` for the Premier-facing HTTP engine mode.

## What This Does Not Do

- remote-control the Bruno desktop process
- promise every possible Bruno UI-only state is modeled on disk
- support gRPC or WebSocket generation today
- silently migrate collection formats
- weaken assertions to match buggy APIs

## Install

```bash
npm install
```

Requirements:

- Node.js `>=20`
- npm `10`

## Quick Start

### Local development

```bash
npm run dev
```

### Build and run

```bash
npm run build
npm start
```

### Verify the repo

```bash
npm run verify
```

### Local bin

```bash
./node_modules/.bin/bruno-mcp
```

## Client Setup

### OpenCode

Recommended setup is to point OpenCode at the source tree through `tsx`, so new MCP surface changes are picked up without rebuilding.

```json
{
  "bruno-mcp": {
    "type": "local",
    "command": [
      "/absolute/path/to/bruno-mcp/node_modules/.bin/tsx",
      "/absolute/path/to/bruno-mcp/src/index.ts"
    ],
    "enabled": true
  }
}
```

### Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "bruno-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/bruno-mcp/dist/index.js"],
      "env": {}
    }
  }
}
```

After changing the server’s tool/resource/prompt surface, restart the client session.

More setup details live in `docs/CLIENT_SETUP.md`.

## Examples

### Register an existing collection into a workspace

```json
{
  "workspacePath": "/workspace",
  "collectionPath": "/workspace/collections/branch",
  "name": "Branch"
}
```

### Set collection defaults

```json
{
  "collectionPath": "/workspace/collections/branch",
  "headers": {
    "Accept": "application/json"
  },
  "preRequestVars": {
    "tenantId": 85
  },
  "preRequestScript": "await bru.runRequest('Auth/login')"
}
```

### Create a request with tags, settings, assertions, docs, and tests

```json
{
  "collectionPath": "/workspace/collections/branch",
  "folder": "users",
  "name": "List Users",
  "method": "GET",
  "url": "{{baseUrl}}/users",
  "tags": ["users", "list"],
  "settings": {
    "encodeUrl": true
  },
  "assertions": [
    {
      "name": "res.status",
      "value": "eq 200"
    }
  ],
  "docs": "Lists users.",
  "tests": "test('status is 200', function () { expect(res.status).to.equal(200); });"
}
```

### Read workspace state as an MCP resource

```text
bruno://workspace//absolute/path/to/workspace
```

## Architecture

### Runtime layers

- `src/bruno/store.ts`
  - format-aware parse/stringify helpers
  - path resolution helpers
  - workspace file loading
- `src/bruno/workspace.ts`
  - `workspace.yml` and workspace environment management
- `src/bruno/native.ts`
  - collection/folder/request/environment management through Bruno-native files
- `src/server.ts`
  - MCP tool registrations
  - resources
  - prompts
  - completions
  - roots/logging/progress/elicitation behavior
- legacy generator modules
  - still useful for request generation helpers and acceptance coverage

### Companion skills scaffold

The repo also contains a generic skills package scaffold:

- `packages/skills`

This is for reusable, project-agnostic Bruno generation and audit guidance.

Project-specific semantics belong in project-local overlays, not in this generic repo.

## Testing Philosophy

This project is intentionally opinionated about API testing.

- Passing should mean the product meets the intended contract.
- Failing should reveal either a real product bug or a real collection bug.
- The server should help reduce duplication, not hide defects.

That means:

- no fake passing
- no weakening assertions to match known bugs
- no normalizing bad product behavior into “expected” behavior
- prefer collection/folder defaults over repeated request-level setup

## Quality Gates

The repo is verified with:

1. unit tests
2. MCP integration tests
3. Bruno CLI acceptance tests
4. typecheck
5. lint
6. format check
7. build

Run everything locally with:

```bash
npm run verify
```

## Documentation

- `docs/WORKSPACE_MODEL.md`
- `docs/MCP_TOOL_REFERENCE.md`
- `docs/DEVELOPMENT.md`
- `docs/CLIENT_SETUP.md`
- `packages/skills/README.md`

## Roadmap

High-value next steps that are not blockers for current use:

- deeper resources and prompt workflows
- task-backed long-running operations
- optional sampling-based planning/auditing
- gRPC generation
- WebSocket generation
- verified desktop active-environment persistence if Bruno’s on-disk model is proven

## License

MIT
