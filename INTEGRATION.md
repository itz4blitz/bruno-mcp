# Bruno MCP Server Integration Guide

This guide shows how to run `bruno-mcp` with MCP-compatible clients using stdio.

## Prerequisites

- Node.js `>=20`
- npm `10`

Install and build the server:

```bash
git clone <your-repo-url>
cd bruno-mcp
npm install
npm run build
```

Verify the built server starts:

```bash
npm start
```

Expected stderr output:

```text
Bruno MCP Server started successfully!
Ready to generate Bruno API testing files.
```

## Important Runtime Notes

- The server uses MCP over stdio.
- It does not expose an HTTP port.
- No custom server environment variables are currently required.
- The most reliable launch command is `node /absolute/path/to/dist/index.js`.

## Claude Desktop

Config file locations:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

Example config:

```json
{
  "mcpServers": {
    "bruno-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/bruno-mcp/dist/index.js"],
      "env": {}
    }
  }
}
```

Restart Claude Desktop after saving the config.

## Claude Code / VS Code MCP Clients

Example settings JSON:

```json
{
  "claude-code.mcpServers": {
    "bruno-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/bruno-mcp/dist/index.js"],
      "env": {}
    }
  }
}
```

If you prefer a workspace-local setup, point to the built file from the repo root:

```json
{
  "claude-code.mcpServers": {
    "bruno-mcp": {
      "command": "node",
      "args": ["${workspaceFolder}/dist/index.js"],
      "env": {}
    }
  }
}
```

## MCP Inspector

Run the server first:

```bash
npm run build
npm start
```

Then connect with your preferred MCP inspector using stdio and the same launch command:

- command: `node`
- args: `[/absolute/path/to/bruno-mcp/dist/index.js]`

## Custom MCP Clients

TypeScript example:

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['/absolute/path/to/bruno-mcp/dist/index.js'],
});

const client = new Client({
  name: 'example-client',
  version: '1.0.0',
});

await client.connect(transport);

const tools = await client.listTools();
console.log(tools.tools.map((tool) => tool.name));

const result = await client.callTool({
  name: 'create_collection',
  arguments: {
    name: 'sample-api',
    outputPath: './collections',
  },
});

console.log(result);
```

## Supported Tools

- `create_collection`
- `create_environment`
- `create_request`
- `add_test_script`
- `create_test_suite`
- `create_crud_requests`
- `list_collections`
- `get_collection_stats`

## Supported Request Generation

`create_request` currently supports:

- REST requests
- GraphQL over HTTP using `body.type: "graphql"`
- auth: `none`, `bearer`, `basic`, `oauth2`, `api-key`, `digest`
- body types: `none`, `json`, `text`, `xml`, `form-data`, `form-urlencoded`, `graphql`

## Example Prompts

Example collection prompt:

```text
Create a Bruno collection named "shop-api" in ./collections,
add a test environment, and generate CRUD requests for Product using {{baseUrl}}/api.
```

Example GraphQL prompt:

```text
Create a GraphQL Bruno request named "List Users" that posts to {{baseUrl}}/graphql,
uses a bearer token, and includes variables for limit=5.
```

## Troubleshooting

### Server does not start

- Verify Node.js is `>=20`
- Run `npm run build`
- Launch with `node /absolute/path/to/dist/index.js`

### Client cannot connect

- Confirm the MCP client is configured for stdio, not HTTP
- Use absolute paths in client config
- Check stderr output from the spawned process

### Generated files do not run in Bruno CLI

- Run `npm run verify` in this repo first
- Ensure the generated collection root contains `bruno.json`
- Run Bruno from the collection root with `bru run --env <env-name>`

### Docker / container usage

If you containerize the server, treat it as a stdio process. Do not expose an HTTP port unless you add your own wrapper process around it.
