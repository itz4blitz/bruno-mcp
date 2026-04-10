import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export async function createMcpTestClient() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', 'src/index.ts'],
    cwd: REPO_ROOT,
    env: toSpawnEnv(process.env),
    stderr: 'pipe',
  });

  const client = new Client({
    name: 'bruno-mcp-test-client',
    version: '1.0.0',
  });

  await client.connect(transport);

  return {
    client,
    close: async () => {
      await client.close();
    },
  };
}

export async function callToolText(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const result = (await client.callTool({
    name,
    arguments: args,
  })) as {
    content?: Array<{
      type: string;
      text?: string;
    }>;
  };

  if (Array.isArray(result.content)) {
    const textBlock = result.content.find((item) => item.type === 'text');
    if (textBlock?.text) {
      return textBlock.text;
    }
  }

  throw new Error(`Tool ${name} did not return a text result`);
}

function toSpawnEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

export { REPO_ROOT };
