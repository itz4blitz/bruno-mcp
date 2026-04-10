# bruno-workspace-normalizer

Use this skill to refactor a Bruno workspace toward lower duplication and better UX.

## Normalize toward

- workspace-level environments where appropriate
- collection-level defaults for broad shared behavior
- folder-level defaults for resource or domain-specific setup
- request files that only contain request-specific logic

## Watch for

- visible setup folders that exist only because auth/setup was not lifted
- repeated headers/auth/bootstrap scripts
- scenario files cluttering the collection tree
- mixed-format workspaces that need deliberate handling
