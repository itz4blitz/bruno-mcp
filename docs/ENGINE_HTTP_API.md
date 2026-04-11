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

The repo also exports the engine contract registry from `src/engine-http/schema.ts` via:

- `ENGINE_HTTP_SCHEMA_VERSION`
- `ENGINE_HTTP_SCHEMA_REGISTRY`
- `getEngineHttpSchemas()`
- `getEngineHttpJsonSchemas()`

And a typed client via:

- `BrunoEngineClient`
- `createBrunoEngineClient()`
- `BrunoEngineVersionMismatchError`

Preferred import path for Premier:

```ts
import { createBrunoEngineClient, getEngineHttpJsonSchemas } from 'bruno-mcp/engine';
```

Narrower subpaths are also exported:

- `bruno-mcp/engine/client`
- `bruno-mcp/engine/schema`
- `bruno-mcp/engine/job-store`
- `bruno-mcp/engine/server`

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
- `GET /engine/run-status?jobId=...`

## Auth

- `health` and `version` are intentionally unauthenticated
- all other endpoints expect `Authorization: Bearer <ENGINE_HTTP_TOKEN>` when a token is configured

This keeps Premier app auth separate from engine auth. Premier can use any app/session provider it wants, while the engine stays machine-authenticated and provider-agnostic.

The engine also checks the optional `x-bruno-schema-version` request header on authenticated routes. If the caller expects a different schema version, the engine returns `409 schema_version_mismatch` with compatibility details.

## Artifact bundle

Engine responses return predictable artifact refs for:

- `slice.json`
- `run-manifest.json`
- `support-graph.json`
- `generated-data.json`
- `findings.json`
- `coverage.json`
- `run-report.json`
- `artifacts.json`
- `run-summary.md`

These live under `.bruno-mcp/feature-slices/<sliceId>/`.

`artifacts.json` is the stable manifest for the current artifact bundle and last known run metadata.

Async run state is backed by the engine job-store abstraction. The default implementation is file-backed so queued/running/succeeded/failed job metadata survives process-local state better than a raw in-memory map.

## Async runs

`POST /engine/run` supports:

- default synchronous execution
- `mode: "async"` for queued execution

Async mode returns:

- `jobId`
- `state`
- `pollUrl`
- `artifacts`
- `correlation`

Then poll with `GET /engine/run-status?jobId=...`.

## Correlation metadata

Run requests may include optional correlation fields:

- `projectId`
- `jobId`
- `runId`
- `requestId`

These are passed through to run reports and `artifacts.json` so Premier can correlate engine activity with control-plane jobs.

## Premier Integration Notes

- treat this engine as a runtime service, not an app-auth system
- pass project/job metadata in request payloads if Premier needs correlation
- keep target API auth explicit inside support flows and run manifests
- keep product-specific behavior in overlays, not in Premier-specific engine rules
