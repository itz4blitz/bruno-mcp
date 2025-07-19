# Bruno MCP Server Usage Examples

This document provides practical examples of using the Bruno MCP Server with AI clients.

## Real-World Scenarios

### Example 1: E-commerce API Testing

**User Request to AI:**
> "I need to create API tests for an e-commerce platform. Set up a Bruno collection with user authentication, product management, and order processing workflows."

**AI Response using Bruno MCP:**
```
I'll create a comprehensive e-commerce API testing collection for you.

First, let me create the main collection:
```

**Generated Collection Structure:**
```
ecommerce-api-tests/
├── bruno.json
├── environments/
│   ├── development.bru
│   ├── staging.bru
│   └── production.bru
├── auth/
│   ├── user-login.bru
│   ├── refresh-token.bru
│   └── logout.bru
├── products/
│   ├── get-all-products.bru
│   ├── get-product-by-id.bru
│   ├── create-product.bru
│   ├── update-product.bru
│   └── delete-product.bru
└── orders/
    ├── create-order.bru
    ├── get-order-status.bru
    └── cancel-order.bru
```

### Example 2: Microservices Testing

**User Request:**
> "Create Bruno tests for a microservices architecture with user service, payment service, and notification service. Include health checks and inter-service communication tests."

**Generated Output:**
- Separate collections for each microservice
- Health check endpoints for all services
- Authentication flow tests
- Cross-service dependency tests

### Example 3: API Documentation Testing

**User Request:**
> "Generate Bruno tests based on an OpenAPI specification. Include all endpoints with proper request/response validation."

**AI Workflow:**
1. Parse OpenAPI spec
2. Create collection structure
3. Generate requests for each endpoint
4. Add response validation scripts
5. Create environment variables for different servers

## Interactive Examples

### Claude Desktop Conversation

**User:** "Set up API tests for JSONPlaceholder"

**Claude:** "I'll create a Bruno collection for testing the JSONPlaceholder API, which is perfect for learning and prototyping."

*[Uses create_collection tool]*

**Claude:** "✅ Created collection 'jsonplaceholder-tests' at ./collections/jsonplaceholder-tests"

**User:** "Add CRUD operations for posts and users"

**Claude:** "I'll add complete CRUD operations for both posts and users endpoints."

*[Uses create_crud_requests tool twice]*

**Claude:** "✅ Generated CRUD operations:
- Posts: 5 requests (Get All, Get by ID, Create, Update, Delete)
- Users: 5 requests (Get All, Get by ID, Create, Update, Delete)"

### Claude Code (VS Code) Integration

**Scenario:** Developer working on API integration

1. **User types in chat:** "Generate Bruno tests for the current project's API"

2. **Claude Code:** 
   - Analyzes project structure
   - Identifies API endpoints from code
   - Creates appropriate Bruno collection
   - Generates environment variables from .env files

3. **Result:** Complete test suite ready for execution

## Advanced Usage Patterns

### Test-Driven API Development

```
User: "I'm building a REST API for a blog platform. Create Bruno tests for the endpoints I need to implement."

Claude: "I'll create a comprehensive test suite for your blog API that you can use for test-driven development."
```

**Generated Tests Include:**
- Authentication and authorization
- CRUD operations for posts, comments, users
- Search and filtering endpoints
- File upload for media
- Rate limiting tests
- Error handling scenarios

### API Migration Testing

```
User: "Help me migrate from v1 to v2 of our API. Create tests to ensure compatibility."

Claude: "I'll create parallel test suites for both API versions to help validate your migration."
```

**Generated Structure:**
```
api-migration-tests/
├── v1-api/
│   └── [legacy endpoints]
├── v2-api/
│   └── [new endpoints]
└── compatibility/
    └── [migration validation tests]
```

### Performance Testing Setup

```
User: "Create load testing scenarios for our high-traffic endpoints."

Claude: "I'll set up Bruno collections optimized for performance testing with various load patterns."
```

**Features:**
- Concurrent request tests
- Rate limiting validation
- Response time assertions
- Error rate monitoring

## Client-Specific Examples

### With Continue (VS Code)

```typescript
// User selects code and asks:
// "Generate API tests for this controller"

@Controller('users')
export class UsersController {
  @Get()
  findAll() { ... }
  
  @Post()
  create(@Body() user: CreateUserDto) { ... }
}

// Continue uses Bruno MCP to generate corresponding .bru files
```

### With LM Studio

**Local AI Setup:**
- User runs local LLM in LM Studio
- Bruno MCP Server configured as tool
- Completely private API test generation
- No external API calls required

### With Custom Applications

```python
# Python application using MCP SDK
from mcp_client import MCPClient

client = MCPClient()
client.connect_to_server("bruno-mcp")

# Generate tests programmatically
result = client.call_tool("create_collection", {
    "name": "automated-tests",
    "outputPath": "./tests",
    "baseUrl": os.getenv("API_URL")
})
```

## Workflow Integration

### CI/CD Pipeline Integration

1. **Development:** Developer uses AI to generate Bruno tests
2. **Code Review:** Tests included in pull requests
3. **CI Pipeline:** Bruno CLI runs generated tests
4. **Deployment:** Tests validate API before release

### Team Collaboration

```bash
# Developer A creates tests
AI: "Create Bruno collection for user management API"

# Developer B extends tests  
AI: "Add error handling tests to the existing collection"

# QA Engineer adds validation
AI: "Generate comprehensive test scenarios for edge cases"
```

## Best Practices

### 1. Environment Management
- Always create separate environments for dev/staging/prod
- Use environment variables for sensitive data
- Include timeout and retry configurations

### 2. Test Organization
- Group related requests in folders
- Use consistent naming conventions
- Add descriptive comments to complex requests

### 3. Authentication Patterns
- Set up token refresh workflows
- Include unauthorized access tests
- Test different user roles and permissions

### 4. Response Validation
- Add assertions for response status codes
- Validate response schema
- Check response times and performance

## Tips for Effective Usage

### 1. Be Specific in Requests
❌ **Vague:** "Create some API tests"
✅ **Specific:** "Create Bruno tests for a REST API with JWT authentication, CRUD operations for products, and error handling for 400/500 responses"

### 2. Leverage Context
- Share API documentation with the AI
- Provide example responses
- Include authentication requirements

### 3. Iterative Development
- Start with basic CRUD operations
- Add authentication and authorization
- Include edge cases and error scenarios
- Add performance and load testing

### 4. Integration with Existing Tools
- Use with Bruno CLI for automated testing
- Integrate with CI/CD pipelines
- Combine with API documentation tools

---

**🚀 Ready to try it yourself?** Check the [INTEGRATION.md](../INTEGRATION.md) guide to set up Bruno MCP Server with your preferred AI client!