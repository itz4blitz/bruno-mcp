# Bruno MCP

`bruno-mcp` is an MCP server for creating and managing Bruno workspaces, collections, folders, requests, environments, and request defaults on disk.

It is designed to work with the same files Bruno desktop and Bruno CLI already read rather than trying to automate the desktop app process directly.

## What This Fork Is

This fork is a workspace-native Bruno automation layer.

It now supports two practical jobs:

1. Generate runnable Bruno collections and requests.
2. Manage existing Bruno workspaces and collections in place.
3. Expose Bruno-native state and workflows through MCP resources and prompts.

That includes:

- classic Bruno collections using `bruno.json`, `collection.bru`, `folder.bru`, `*.bru`, and `environments/*.bru`
- OpenCollection-style Bruno workspace metadata using `workspace.yml`, `opencollection.yml`, `folder.yml`, and `environments/*.yml`

## Current Capability Areas

- REST request generation
- GraphQL-over-HTTP request generation
- binary file upload request generation
- dependency-aware suite generation with runtime vars
- collection discovery and stats
- workspace registration via `workspace.yml`
- workspace environment CRUD
- collection-level default headers, vars, scripts, and tests
- folder-level default headers, vars, scripts, and tests
- request CRUD and movement
- request metadata parity for assertions, tags, settings, vars, docs, and scripts
- collection environment CRUD
- read-only Bruno resources through MCP
- reusable Bruno prompts with argument completion
- roots-aware path enforcement for tools, resources, and completions
- logging and progress signals for long-ish operations
- safe elicitation for destructive or ambiguous flows

## What It Does Not Do

- remote-control the Bruno desktop app process
- guarantee that every Bruno UI-only behavior is modeled yet
- support gRPC or WebSocket generation yet

## Why This Exists

Bruno is file-based.

That is a strength if your automation layer respects Bruno’s native model:

- workspaces
- collections
- folders
- requests
- environments
- collection/folder/request scripts and vars

This fork focuses on operating on those files directly so the result is usable in:

- Bruno desktop
- Bruno CLI
- MCP-capable clients like OpenCode, Claude Desktop, and Claude Code

## Supported File Models

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

The server preserves the format already present on disk instead of silently converting files behind your back.

## Tool Surface

### Existing generation tools

- `create_collection`
- `create_environment`
- `create_request`
- `add_test_script`
- `create_test_suite`
- `create_crud_requests`
- `list_collections`
- `get_collection_stats`

### Workspace-native tools

- `get_workspace`
- `add_collection_to_workspace`
- `remove_collection_from_workspace`
- `validate_workspace`
- `list_workspace_environments`
- `get_workspace_environment`
- `create_workspace_environment`
- `update_workspace_environment`
- `delete_workspace_environment`

### Collection / folder default tools

- `get_collection_defaults`
- `update_collection_defaults`
- `list_folders`
- `get_folder`
- `create_folder`
- `update_folder_defaults`
- `delete_folder`

### Request / environment CRUD tools

- `list_requests`
- `get_request`
- `update_request`
- `move_request`
- `delete_request`
- `list_environments`
- `get_environment`
- `update_environment_vars`
- `delete_environment`

### MCP-native discovery

- resources for workspace, collection, request, environment, and server capabilities
- prompt templates for generating, auditing, and normalizing Bruno collections
- prompt argument completion for common filesystem and feature inputs

### Rich MCP behavior

- roots-aware filesystem scoping when clients provide roots
- best-effort server logging via MCP notifications
- progress notifications for long-ish operations such as request scanning
- elicitation for safe confirmation on destructive folder deletion flows

## Install

```bash
npm install
```

## Development

```bash
npm run dev
npm run build
npm run lint
npm run format
npm run typecheck
npm test
npm run verify
```

Requirements:

- Node.js `>=20`
- npm `10`

Linting and formatting use `oxlint` and `oxfmt`.

## Running The Server

Source mode:

```bash
npm run dev
```

Built mode:

```bash
npm run build
npm start
```

Bin entry after install/build:

```bash
./node_modules/.bin/bruno-mcp
```

## Verification

The repo is verified at three levels:

1. Unit tests for generators and native workspace/default managers.
2. MCP integration tests against the real stdio server.
3. Bruno CLI acceptance tests using generated collections.

Run the full gate locally:

```bash
npm run verify
```

## Documentation

- `docs/WORKSPACE_MODEL.md`
- `docs/MCP_TOOL_REFERENCE.md`
- `docs/DEVELOPMENT.md`
- `docs/CLIENT_SETUP.md`
- `packages/skills/README.md`

## Notes

- This fork now manages both request generation and workspace-native Bruno metadata.
- The intended long-term direction is to reduce per-request duplication by relying more on collection/folder defaults and workspace-level setup conventions.
