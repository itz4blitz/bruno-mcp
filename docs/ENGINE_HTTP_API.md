# Engine HTTP API

`bruno-mcp` can now run as an HTTP engine for the Premier control plane.

The intent is to let Premier call `bruno-mcp` as a stable execution service for:

- contract inspection
- feature-slice planning
- feature-slice scaffolding
- validation
- manifest and support-graph inspection
- end-to-end slice runs

## Start

```bash
ENGINE_HTTP_TOKEN=secret ENGINE_HTTP_PORT=9000 npm run engine:http
```

Optional env vars:

- `ENGINE_HTTP_HOST`
- `ENGINE_HTTP_PORT`
- `ENGINE_HTTP_TOKEN`

## Response envelope

All successful responses use:

```json
{
  "schemaVersion": 1,
  "engineVersion": "1.0.0",
  "runtime": "bruno",
  "data": {}
}
```

## Endpoints

- `GET /engine/health`
- `GET /engine/version`
- `POST /engine/inspect-contract`
- `POST /engine/plan`
- `POST /engine/scaffold`
- `POST /engine/validate`
- `POST /engine/inspect-run-manifest`
- `POST /engine/validate-run-manifest`
- `POST /engine/inspect-support-graph`
- `POST /engine/run`

## Auth

- `health` and `version` are intentionally unauthenticated
- all other endpoints expect `Authorization: Bearer <ENGINE_HTTP_TOKEN>` when a token is configured

This keeps Premier app auth separate from engine auth. Premier can use any app/session provider it wants, while the engine stays machine-authenticated and provider-agnostic.

## Artifact bundle

Engine responses return predictable artifact refs for:

- `slice.json`
- `run-manifest.json`
- `support-graph.json`
- `generated-data.json`
- `findings.json`
- `coverage.json`
- `run-report.json`

These live under `.bruno-mcp/feature-slices/<sliceId>/`.

## Premier Integration Notes

- treat this engine as a runtime service, not an app-auth system
- pass project/job metadata in request payloads if Premier needs correlation
- keep target API auth explicit inside support flows and run manifests
- keep product-specific behavior in overlays, not in Premier-specific engine rules
