# Client Setup

`bruno-mcp` runs as a stdio MCP server by default.

It also ships an optional HTTP engine mode for programmatic control-plane use.

## Local Development

Run directly from source:

```bash
npm run dev
```

Run built output:

```bash
npm run build
npm start
```

Run HTTP engine mode:

```bash
ENGINE_HTTP_TOKEN=secret npm run engine:http
```

## OpenCode

Recommended local configuration is to point OpenCode at the repo source through `tsx` so changes are picked up without rebuilding.

Example local MCP entry:

```json
{
  "bruno-mcp": {
    "type": "local",
    "command": [
      "/absolute/path/to/bruno-mcp/node_modules/.bin/tsx",
      "/absolute/path/to/bruno-mcp/src/index.ts"
    ],
    "enabled": true
  }
}
```

Restart the client session after changing the tool surface.

## Claude Desktop / Claude Code

Use stdio launch with Node against the built file or source runner.

Built example:

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

## Notes

- If the MCP tool surface changes, restart the client so it reloads tool registration.
- For source-based setups, keep `node_modules` installed in the repo.
