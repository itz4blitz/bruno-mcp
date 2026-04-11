#!/usr/bin/env node

/**
 * Bruno MCP Server Entry Point
 * Main entry point for the Bruno MCP server application
 */

import { createBrunoMcpServer } from './server.js';
import { createEngineHttpServer } from './engine-http/server.js';

async function main() {
  try {
    if (process.argv.includes('--engine-http')) {
      const token = process.env.ENGINE_HTTP_TOKEN;
      const host = process.env.ENGINE_HTTP_HOST || '127.0.0.1';
      const port = Number(process.env.ENGINE_HTTP_PORT || '9000');
      const server = createEngineHttpServer({ host, port, token });
      const address = await server.start();
      console.error(`Bruno engine HTTP server listening on http://${address.host}:${address.port}`);

      process.on('SIGINT', () => {
        void server.stop().finally(() => process.exit(0));
      });

      process.on('SIGTERM', () => {
        void server.stop().finally(() => process.exit(0));
      });
      return;
    }

    const server = createBrunoMcpServer();
    await server.start();

    // Keep the process running
    process.on('SIGINT', () => {
      console.error('\nBruno MCP Server shutting down gracefully...');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.error('\nBruno MCP Server shutting down gracefully...');
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start Bruno MCP Server:', error);
    process.exit(1);
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { createBrunoMcpServer } from './server.js';
export { createEngineHttpServer } from './engine-http/server.js';
export {
  BrunoEngineClient,
  BrunoEngineHttpError,
  BrunoEngineProtocolError,
  BrunoEngineVersionMismatchError,
  createBrunoEngineClient,
} from './engine-http/client.js';
export * from './engine-http/job-store.js';
export * from './bruno/types.js';
export * from './bruno/generator.js';
export * from './bruno/collection.js';
export * from './bruno/environment.js';
export * from './bruno/controller-contract.js';
export * from './bruno/feature-slice.js';
export * from './engine-http/types.js';
export * from './engine-http/schema.js';
export * from './bruno/openapi.js';
export * from './bruno/request.js';
