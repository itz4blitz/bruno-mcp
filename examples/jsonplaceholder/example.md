# JSONPlaceholder Example

This example demonstrates using the Bruno MCP server to create a collection for the JSONPlaceholder API.

## Create Collection

```json
{
  "name": "jsonplaceholder-tests",
  "description": "API tests for JSONPlaceholder fake REST API",
  "baseUrl": "https://jsonplaceholder.typicode.com",
  "outputPath": "./examples/jsonplaceholder"
}
```

## Create Environment

```json
{
  "collectionPath": "./examples/jsonplaceholder/jsonplaceholder-tests",
  "name": "production",
  "variables": {
    "baseUrl": "https://jsonplaceholder.typicode.com",
    "timeout": 5000,
    "userId": 1
  }
}
```

## Create CRUD Requests

Use the environment variable instead of hardcoding the host again:

```json
{
  "collectionPath": "./examples/jsonplaceholder/jsonplaceholder-tests",
  "entityName": "Post",
  "baseUrl": "{{baseUrl}}",
  "folder": "posts"
}
```

This generates:

- `Get All Post`
- `Get Post by ID`
- `Create Post`
- `Update Post`
- `Delete Post`

The current CRUD helper is intentionally simple and uses the provided entity name directly for request names.
