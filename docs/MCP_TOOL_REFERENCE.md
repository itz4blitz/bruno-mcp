# MCP Tool Reference

This is the current logical tool grouping for `bruno-mcp`.

## Collection Generation

- `create_collection`
- `create_environment`
- `create_request`
- `add_test_script`
- `create_test_suite`
- `create_crud_requests`
- `list_collections`
- `get_collection_stats`

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

## Resources

The server also exposes read-only MCP resources for Bruno-native state.

Current resources include:

- `bruno://capabilities`
- `bruno://workspace/{workspacePath}`
- `bruno://collection/{collectionPath}`
- `bruno://request/{requestPath}`
- `bruno://environment/{collectionPath}/{environmentName}`

These resources are intended for discovery, inspection, and model context, not mutation.

## Prompts

The server also exposes MCP prompts for reusable Bruno workflows.

Current prompts include:

- `generate_rest_feature`
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
