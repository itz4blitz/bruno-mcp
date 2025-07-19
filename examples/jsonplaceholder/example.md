# JSONPlaceholder Example

This example demonstrates using the Bruno MCP server to create a collection for testing the JSONPlaceholder API.

## MCP Tool Usage Examples

### Create Collection
```json
{
  "name": "jsonplaceholder-tests",
  "description": "API tests for JSONPlaceholder fake REST API",
  "baseUrl": "https://jsonplaceholder.typicode.com",
  "outputPath": "./examples/jsonplaceholder"
}
```

### Create Environment
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

### Create CRUD Requests
```json
{
  "collectionPath": "./examples/jsonplaceholder/jsonplaceholder-tests",
  "entityName": "Posts",
  "baseUrl": "https://jsonplaceholder.typicode.com",
  "folder": "posts"
}
```

This will generate:
- Get All Posts
- Get Post by ID  
- Create Post
- Update Post
- Delete Post