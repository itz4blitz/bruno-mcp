# Bruno MCP Server Specification

## Project Overview

**Name:** bruno-mcp  
**Version:** 1.0.0  
**License:** MIT  
**Description:** MCP server for generating Bruno API testing files programmatically

## Objectives

Build a TypeScript MCP (Model Context Protocol) server that enables the generation of Bruno BRU files for API testing. The server will support creating collections, environments, requests, and testing scripts through standardized MCP tools.

## Project Structure

```
bruno-mcp/
├── .gitignore                 # Node.js, TypeScript, Bruno files ✅
├── README.md                  # Project documentation (pending)
├── LICENSE                    # MIT License ✅
├── SPEC.md                    # This specification file ✅
├── package.json               # Dependencies and scripts ✅
├── tsconfig.json              # TypeScript configuration ✅
├── src/
│   ├── index.ts               # Main entry point (pending)
│   ├── server.ts              # MCP server setup (pending)
│   ├── bruno/
│   │   ├── types.ts           # Bruno file type definitions (pending)
│   │   ├── generator.ts       # BRU file generator (pending)
│   │   ├── collection.ts      # Collection management (pending)
│   │   ├── environment.ts     # Environment management (pending)
│   │   └── request.ts         # Request builder (pending)
│   └── tools/
│       ├── createCollection.ts  # (pending)
│       ├── createEnvironment.ts # (pending)
│       ├── createRequest.ts     # (pending)
│       └── addTest.ts           # (pending)
├── tests/
│   ├── unit/                  # Jest/Vitest unit tests (pending)
│   ├── integration/           # MCP protocol tests (pending)
│   └── fixtures/              # Test data and sample APIs (pending)
├── examples/                  # Sample collections for testing (pending)
│   ├── jsonplaceholder/       # Basic CRUD operations
│   ├── authentication/        # Auth examples
│   └── complex-workflows/     # Multi-step scenarios
└── dist/                      # Compiled TypeScript output
```

## Technical Stack

- **Language:** TypeScript
- **Runtime:** Node.js >=18.0.0
- **MCP SDK:** @modelcontextprotocol/sdk
- **Validation:** Zod
- **Testing:** Jest
- **Build:** TypeScript Compiler
- **Transport:** stdio (for CLI usage)

## MCP Tools Specification

### 1. `create_collection`
**Purpose:** Initialize a new Bruno collection with configuration

**Input Schema:**
```typescript
{
  name: string;                    // Collection name
  description?: string;            // Optional description
  baseUrl?: string;               // Default base URL
  outputPath: string;             // Directory to create collection
}
```

**Output:**
- Creates `bruno.json` configuration file
- Sets up collection directory structure
- Generates initial `.gitignore` for Bruno files

### 2. `create_environment`
**Purpose:** Create environment configuration files

**Input Schema:**
```typescript
{
  collectionPath: string;         // Path to Bruno collection
  name: string;                   // Environment name (dev, staging, prod)
  variables: Record<string, string>; // Environment variables
}
```

**Output:**
- Creates `environments/{name}.bru` file
- Supports variable interpolation with `{{variable}}` syntax

### 3. `create_request`
**Purpose:** Generate .bru request files

**Input Schema:**
```typescript
{
  collectionPath: string;         // Path to Bruno collection
  name: string;                   // Request name
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  url: string;                    // Request URL
  headers?: Record<string, string>; // HTTP headers
  body?: {                        // Request body (for POST/PUT/PATCH)
    type: 'json' | 'text' | 'form-data' | 'form-urlencoded';
    content: string;
  };
  auth?: {                        // Authentication
    type: 'bearer' | 'basic' | 'oauth2' | 'api-key';
    config: Record<string, string>;
  };
  folder?: string;                // Optional folder organization
}
```

**Output:**
- Creates `.bru` file with proper format
- Supports all HTTP methods and authentication types
- Handles headers, body, and folder organization

### 4. `add_test_script`
**Purpose:** Add pre-request and post-request scripts to existing .bru files

**Input Schema:**
```typescript
{
  bruFilePath: string;            // Path to existing .bru file
  scriptType: 'pre-request' | 'post-response';
  script: string;                 // JavaScript test script
}
```

**Output:**
- Adds test scripts to existing .bru files
- Supports assertions and variable extraction
- Uses Bruno's JavaScript scripting syntax

### 5. `create_test_suite`
**Purpose:** Generate comprehensive test collections

**Input Schema:**
```typescript
{
  collectionPath: string;         // Path to Bruno collection
  suiteName: string;              // Test suite name
  requests: Array<{               // Array of related requests
    name: string;
    method: string;
    url: string;
    // ... other request properties
  }>;
  dependencies?: Array<{          // Request dependencies
    from: string;
    to: string;
    variable: string;
  }>;
}
```

**Output:**
- Creates related requests with dependencies
- Sets up data-driven testing scenarios
- Generates comprehensive test workflows

## Bruno BRU File Format

### File Structure
Bruno uses the BRU markup language with three main block types:

1. **Meta Block:** Request metadata
2. **HTTP Block:** Request definition (method, URL, headers, body)
3. **Script Blocks:** Pre-request and post-response scripts

### Example BRU File
```bru
meta {
  name: Get Users
  type: http
  seq: 1
}

get {
  url: {{baseUrl}}/users
  body: none
  auth: none
}

headers {
  Content-Type: application/json
  Authorization: Bearer {{token}}
}

script:pre-request {
  // Pre-request script
  bru.setVar("timestamp", Date.now());
}

script:post-response {
  // Post-response script
  if (res.status === 200) {
    bru.setVar("userId", res.body[0].id);
  }
}

tests {
  test("Status should be 200", function() {
    expect(res.status).to.equal(200);
  });
}
```

## Testing Strategy

### 1. Unit Testing (Jest)
- Test BRU file generation logic
- Validate file format compliance
- Test environment variable interpolation
- Mock file system operations

### 2. MCP Protocol Testing
- Use MCP Inspector for tool validation
- Test request/response schemas
- Validate error handling and edge cases

### 3. Integration Testing
- Generate BRU files via MCP tools
- Import into actual Bruno application
- Execute with `bruno-cli run` command
- Verify API responses and test results

### 4. Test Data & Scenarios
- **Sample APIs:** JSONPlaceholder, httpbin.org, ReqRes
- **Authentication:** Bearer tokens, Basic auth, OAuth 2.0, API keys
- **Request Types:** GET, POST, PUT, DELETE, PATCH
- **Complex Scenarios:** File uploads, large payloads, error handling
- **Edge Cases:** Special characters, encoding, timeout scenarios

## Implementation Progress

### Phase 1: Project Setup ✅
- [x] Initialize git repository and create directory structure
- [x] Create package.json with dependencies
- [x] Configure TypeScript with tsconfig.json
- [x] Create .gitignore and MIT LICENSE files
- [x] Create this specification file

### Phase 2: Core Bruno Implementation ✅
- [x] Define TypeScript interfaces for Bruno BRU file format
- [x] Implement BRU file generator with proper syntax
- [x] Create collection and environment management modules

### Phase 3: MCP Server & Tools ✅
- [x] Set up MCP server with stdio transport
- [x] Implement create_collection MCP tool
- [x] Implement create_environment MCP tool
- [x] Implement create_request MCP tool
- [x] Implement add_test_script MCP tool
- [x] Implement create_crud_requests MCP tool
- [x] Implement create_test_suite MCP tool
- [x] Implement get_collection_stats MCP tool
- [x] Implement list_collections MCP tool

### Phase 4: Documentation & Integration ✅
- [x] Create example collections with test data scenarios
- [x] Create comprehensive README with usage examples and API docs
- [x] Create detailed INTEGRATION.md with client setup instructions
- [x] Test MCP server functionality and build process
- [x] Create initial git commit with complete implementation

### Phase 5: Testing & Validation (Optional)
- [ ] Write unit tests for BRU generation and MCP tools
- [ ] Test with MCP Inspector and Bruno CLI integration
- [ ] Performance testing and optimization

## Client Integration Support

The Bruno MCP Server supports integration with multiple AI clients:

### Fully Supported Clients ✅
- **Claude Desktop App** - Complete MCP tool integration
- **Claude Code (VS Code Extension)** - Full development workflow
- **MCP Inspector** - Development and testing interface
- **Continue (VS Code)** - Code generation and API testing
- **Cline (VS Code)** - Autonomous development workflows
- **LM Studio** - Local LLM integration

### Integration Documentation
- **INTEGRATION.md** - Comprehensive setup guide for all clients
- **Client-specific configurations** - Detailed JSON configurations
- **Troubleshooting guide** - Common issues and solutions
- **Environment variable support** - Custom configuration options

## Key Features

- **File Generation:** Create properly formatted .bru files
- **Environment Management:** Handle multiple environments with variables
- **Authentication Support:** Bearer tokens, Basic auth, OAuth 2.0, API keys
- **Test Scripting:** Pre/post request scripts with assertions
- **Collection Organization:** Folder structure and request grouping
- **Variable Interpolation:** {{variable}} syntax support
- **CLI Integration:** Works with Bruno CLI for test execution

## Dependencies

### Production Dependencies
- `@modelcontextprotocol/sdk`: MCP protocol implementation
- `zod`: Schema validation and type safety

### Development Dependencies
- `typescript`: TypeScript compiler and language support
- `@types/node`: Node.js type definitions
- `jest` + `@types/jest` + `ts-jest`: Testing framework
- `eslint` + `@typescript-eslint/*`: Code linting
- `prettier`: Code formatting
- `ts-node`: TypeScript execution for development

## Usage Example

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Start MCP server
npm start

# Test with MCP Inspector
npx @modelcontextprotocol/inspector

# Run generated tests with Bruno CLI
bruno-cli run examples/api-tests/
```

## Repository Information

- **Type:** Private Git Repository
- **Name:** bruno-mcp
- **Branching:** Standard Git workflow (main branch)
- **CI/CD:** Prepared for future GitHub Actions integration
- **Versioning:** Semantic versioning with git tags

---

*This specification is a living document and will be updated as the project evolves.*