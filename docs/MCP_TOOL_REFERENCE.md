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

## Design Notes

- Requests and environments are treated as file-native Bruno assets.
- Workspace metadata is treated separately from collection internals.
- The server favors patching and preserving structure over rewriting entire projects conceptually.
