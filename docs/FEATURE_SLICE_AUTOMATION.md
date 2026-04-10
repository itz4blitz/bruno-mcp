# Feature Slice Automation

`bruno-mcp` now supports feature slices as automation-ready artifacts, not just request trees.

## Recommended Flow

1. Inspect the current slice context with `inspect_feature_slice_context`
2. Inspect the controller contract with `inspect_controller_contract` when an OpenAPI spec exists
3. Plan the slice with `plan_feature_slice`
4. Scaffold support, core, matrix, docs, defaults, and metadata with `scaffold_feature_slice`
5. Generate or refresh ordered execution metadata with `generate_feature_run_manifest`
6. Run the slice with `run_feature_slice`
7. Persist findings with `record_slice_findings`

## Branch Example

Feature: `Branch`

Suggested structure:

- `Support/Auth`
- `Support/Seed`
- `Support/Resolve`
- `Support/Cleanup`
- `Features/Branch/Happy Path`
- `Features/Branch/Read`
- `Features/Branch/Negative`
- `Features/Branch/Security`
- `Features/Branch/Matrix`
- `Features/Branch/Docs`

Automation expectations:

- core controller coverage should include create, list, get, update, and delete
- if an OpenAPI contract exists, use it as the controller source of truth for action and payload inference
- support requests should remain explicit and support-only
- matrix requests should use request-owned base payloads plus scenario delta rows
- cleanup must be documented as possible, conditional, best-effort, impossible, or none
- run manifests should express ordered phases and profile membership

## Truthfulness Rules

- do not weaken assertions to match bugs
- do not fake cleanup success
- do not hide core failures with skips
- classify failures as collection defects, setup failures, product defects, or cleanup outcomes when possible
