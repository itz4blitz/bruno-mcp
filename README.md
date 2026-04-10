# Bruno MCP Server

`bruno-mcp` is an MCP server for generating Bruno collections, environments, and request files, with proven REST support and minimal GraphQL-over-HTTP support.

It is intentionally scoped to the Bruno features this repo currently proves in CI:

- REST request generation
- GraphQL-over-HTTP request generation
- Bruno-compatible environment files
- request script and test block insertion
- CRUD request scaffolding
- collection discovery and request stats
- MCP stdio integration tests
- Bruno CLI acceptance tests using `bru run`

## Scope

### Supported now

- HTTP methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`
- Request features: headers, query params, folders, sequence numbers
- Auth: `none`, `bearer`, `basic`, `oauth2`, `api-key`, `digest`
- Bodies: `none`, `json`, `text`, `xml`, `form-data`, `form-urlencoded`, `graphql`
- Environment vars via `vars {}` files
- Script blocks: `script:pre-request`, `script:post-response`, `tests`

### Not supported yet

- gRPC
- WebSocket
- binary request bodies
- dependency-aware suite generation

## Requirements

- Node.js `>=20`
- npm `10`

## Install

```bash
npm install
```

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run format
npm run typecheck
npm test
npm run verify
```

Linting and formatting use `oxlint` and `oxfmt`.

## MCP Usage

Start the server locally:

```bash
npm run dev
```

Or run the built server:

```bash
npm run build
npm start
```

The package also exposes a bin entry after install/build:

```bash
./node_modules/.bin/bruno-mcp
```

## Available Tools

- `create_collection`
- `create_environment`
- `create_request`
- `add_test_script`
- `create_test_suite`
- `create_crud_requests`
- `list_collections`
- `get_collection_stats`

## Example

REST request:

```json
{
  "collectionPath": "./collections/sample-api",
  "name": "Get User",
  "method": "GET",
  "url": "{{baseUrl}}/users/{{id}}",
  "headers": {
    "Accept": "application/json"
  },
  "auth": {
    "type": "bearer",
    "config": {
      "token": "{{token}}"
    }
  }
}
```

GraphQL request:

```json
{
  "collectionPath": "./collections/graphql-api",
  "name": "List Users",
  "method": "POST",
  "url": "{{baseUrl}}/graphql",
  "headers": {
    "content-type": "application/json"
  },
  "body": {
    "type": "graphql",
    "content": "query ListUsers($limit: Int!) {\n  users(limit: $limit) {\n    id\n    name\n  }\n}",
    "variables": "{\n  \"limit\": 5\n}"
  }
}
```

## Verification

The repo now verifies behavior at three levels:

1. Unit tests for BRU generation and collection/request helpers.
2. MCP integration tests against the real stdio server.
3. Bruno CLI acceptance tests that generate collections and run them with `bru run` against local REST and GraphQL test endpoints.

Run the full gate locally:

```bash
npm run verify
```

## CI

GitHub Actions runs:

- format check
- lint
- typecheck
- unit tests
- MCP integration tests
- build
- Bruno CLI acceptance tests

## Notes

- This repo is a server and generator, not a full Bruno desktop feature mirror.
- The public scope in this README matches what the code and tests currently support.
