# Bruno MCP Server Usage Examples

This document shows practical examples that match the current implemented and tested tool surface.

## Example 1: REST Collection Setup

User request to an MCP-capable assistant:

```text
Create a Bruno collection for our shop API in ./collections/shop-api,
add development and production environments,
and generate CRUD requests for Product under a products folder using {{baseUrl}}/api.
```

Likely tool flow:

1. `create_collection`
2. `create_environment`
3. `create_environment`
4. `create_crud_requests`

Expected generated structure:

```text
shop-api/
├── bruno.json
├── environments/
│   ├── development.bru
│   └── production.bru
└── product/
    ├── get-all-product.bru
    ├── get-product-by-id.bru
    ├── create-product.bru
    ├── update-product.bru
    └── delete-product.bru
```

## Example 2: Add Request Tests

User request:

```text
Add Bruno tests to the existing request file ./collections/shop-api/get-user.bru
to assert the response status is 200 and the JSON response contains an id.
```

Likely tool flow:

1. `add_test_script`

Example script:

```js
test('status is 200', function () {
  expect(res.status).to.equal(200);
});

test('id is present', function () {
  const data = res.getBody();
  expect(data.id).to.exist;
});
```

## Example 3: GraphQL Over HTTP

User request:

```text
Create a GraphQL Bruno request named "List Users" that posts to {{baseUrl}}/graphql,
uses a bearer token, and sends variables {"limit": 5}.
```

Likely tool flow:

1. `create_request`

Example MCP arguments:

```json
{
  "collectionPath": "./collections/graphql-api",
  "name": "List Users",
  "method": "POST",
  "url": "{{baseUrl}}/graphql",
  "headers": {
    "content-type": "application/json"
  },
  "auth": {
    "type": "bearer",
    "config": {
      "token": "{{token}}"
    }
  },
  "body": {
    "type": "graphql",
    "content": "query ListUsers($limit: Int!) {\n  users(limit: $limit) {\n    id\n    name\n  }\n}",
    "variables": "{\n  \"limit\": 5\n}"
  }
}
```

## Example 4: Inventory Existing Collections

User request:

```text
Scan ./collections, tell me which Bruno collections exist, and show method counts for the billing-api collection.
```

Likely tool flow:

1. `list_collections`
2. `get_collection_stats`

## What The Server Does vs What The AI Might Do

The MCP server itself is responsible for creating and updating Bruno files from explicit tool inputs.

An AI client may additionally:

- read API docs
- inspect source code
- infer likely endpoints
- translate a user brief into tool arguments

Those analysis steps are client-side behavior, not built-in server features.

## Good Requests To Give Your Assistant

Be specific about:

- collection path
- base URL strategy
- auth type
- folder names
- request names
- request body shape
- desired test assertions

Better prompt:

```text
Create a Bruno request named "Create Order" in ./collections/shop-api/orders,
POST to {{baseUrl}}/orders,
use bearer auth,
send a JSON body with customerId and lineItems,
and add a test asserting the response status is 201.
```

## Current Non-Scope

These should not be presented as built-in server features:

- OpenAPI import/parsing
- source-code endpoint discovery
- `.env` ingestion
- load/performance testing generation
- gRPC or WebSocket generation
- binary upload request generation
