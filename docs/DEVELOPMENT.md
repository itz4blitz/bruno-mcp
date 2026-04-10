# Development

## Requirements

- Node.js `>=20`
- npm `10`

## Common Commands

```bash
npm install
npm run dev
npm run build
npm run lint
npm run format
npm run typecheck
npm test
npm run verify
```

## Testing Layers

### Unit

Validates:

- BRU generation
- request parsing/updating
- collection stats
- workspace manager
- native format-aware manager

### Integration

Validates:

- MCP server startup over stdio
- end-to-end MCP tool invocation
- workspace and native CRUD tools
- resources, prompts, and prompt completion
- roots enforcement
- elicitation-backed destructive flow confirmation
- logging and progress notifications

### Acceptance

Validates:

- generated collections run via `bru run`
- REST
- GraphQL over HTTP
- binary uploads
- dependency-aware suites

## Package Choices

- `@modelcontextprotocol/sdk` for MCP transport and server registration
- `@usebruno/filestore` for Bruno/OpenCollection parse and stringify behavior
- `yaml` for `workspace.yml` management
- `zod` for tool input schemas

## Companion Skills Package

The repo now also contains a companion skills scaffold under:

- `packages/skills`

This is intended to hold:

- generic Bruno generation/audit skills
- truthful testing rules
- coverage matrix guidance
- no project-specific presets in the generic package

## Implementation Direction

The codebase is moving away from custom low-fidelity writers toward official Bruno file APIs wherever possible.

Current architecture layers:

- `store.ts`
  format-aware parse/stringify helpers
- `workspace.ts`
  workspace.yml and workspace environment management
- `native.ts`
  collection/folder/request/environment management through Bruno-native files
- `feature-slice.ts`
  opinionated feature-slice planning, scaffolding, strict matrices, findings, and cleanup truth
- MCP resources/prompts/completions
  exposed directly from `server.ts` on top of the same native managers
- legacy generator modules
  still used for request generation flows and BRU-specific helpers

## Maintenance Rules

- preserve the file format already on disk
- prefer collection/folder defaults over repeated per-request setup
- keep assertions truthful to the intended contract
- if the product is wrong, let tests fail and document the bug separately
