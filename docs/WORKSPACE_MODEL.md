# Workspace Model

This fork treats Bruno as a file-native workspace system.

## Principle

Do not automate the Bruno desktop process.

Instead, manage the same on-disk files Bruno desktop and Bruno CLI already read.

## Supported Models

### Classic Bruno collections

- `bruno.json`
- `collection.bru`
- `folder.bru`
- request `*.bru`
- environment `*.bru`

### OpenCollection / workspace metadata

- `workspace.yml`
- `opencollection.yml`
- `folder.yml`
- request `*.yml`
- environment `*.yml`

## Format Policy

The server preserves the format already present on disk.

That means:

- if a collection is classic `.bru`, it stays classic `.bru`
- if a collection uses OpenCollection YAML, it stays YAML
- workspace-level metadata remains `workspace.yml`

The server should not silently convert an existing collection from one format to another.

## Reuse Model

The preferred Bruno reuse model is:

- collection-level defaults
- folder-level defaults
- environment files
- runtime vars for request chaining

Preferred files for reusable behavior:

- `collection.bru`
- `folder.bru`
- `opencollection.yml`
- `folder.yml`

Use these for:

- common headers
- auth defaults
- pre-request vars
- post-response vars
- pre/post scripts
- shared tests

Avoid repeating the same bootstrap/auth script in every request unless you have no stronger Bruno-native option yet.

## Workspace Support

Workspace support in this fork currently includes:

- reading and validating `workspace.yml`
- adding/removing collection references
- listing and managing workspace-level environments
- exposing workspace and collection state as MCP resources
- exposing reusable generation/audit workflows as MCP prompts
- honoring client roots when available for safer path-scoped automation

The workspace root remains intentionally small and explicit.

## Current Limitations

- no desktop process automation
- no gRPC generation
- no WebSocket generation
- mixed-format workspaces may still require deliberate refactoring for best UX
- desktop-active environment selection persistence is not yet a documented/verified feature of this server
- server-side tasks and sampling are not first-class product features yet
