# @bruno-mcp/skills

Companion skill pack for `bruno-mcp`.

This package is intended to carry reusable generation and auditing guidance that sits above the raw MCP server capabilities.

## Goals

- encode a truthful API-testing philosophy
- standardize Bruno collection structure for generic REST APIs
- separate generic patterns from project-specific presets
- make AI-driven collection generation reproducible

## Layout

- `skills/`
  generic reusable skill guides
- `presets/`
  project overlays and conventions

## Generic skills

- `bruno-rest-planner.md`
- `bruno-rest-feature-generator.md`
- `bruno-rest-feature-auditor.md`
- `bruno-coverage-matrix.md`
- `bruno-truthful-tests.md`
- `bruno-workspace-normalizer.md`

## Presets

- project-specific overlays belong in the target workspace or repo, not in this generic package

## Philosophy

The server and generic skills package should ship Bruno mechanics.

Project semantics should live in project-local overlays.
