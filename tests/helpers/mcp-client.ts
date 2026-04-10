import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  ElicitRequestSchema,
  ListRootsRequestSchema,
  LoggingMessageNotificationSchema,
  ProgressNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';

type McpTestClientOptions = {
  elicitationResponse?: {
    action: 'accept' | 'cancel' | 'decline';
    content?: Record<string, boolean | number | string | string[]>;
  };
  roots?: string[];
};

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export async function createMcpTestClient(options: McpTestClientOptions = {}) {
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

  const logs: Array<{ data: unknown; level: string }> = [];
  const progress: Array<{ message?: string; progress: number }> = [];

  if (options.roots && options.roots.length > 0) {
    client.registerCapabilities({
      roots: {
        listChanged: true,
      },
    });

    client.setRequestHandler(ListRootsRequestSchema, async () => ({
      roots: options.roots!.map((root) => ({
        name: root.split('/').pop(),
        uri: pathToFileURL(root).toString(),
      })),
    }));
  }

  if (options.elicitationResponse) {
    client.registerCapabilities({
      elicitation: {
        form: {
          applyDefaults: true,
        },
      },
    });

    client.setRequestHandler(ElicitRequestSchema, async () => ({
      action: options.elicitationResponse!.action,
      content: options.elicitationResponse!.content,
    }));
  }

  client.setNotificationHandler(LoggingMessageNotificationSchema, async (notification) => {
    logs.push({
      data: notification.params.data,
      level: notification.params.level,
    });
  });

  client.setNotificationHandler(ProgressNotificationSchema, async (notification) => {
    progress.push({
      message: notification.params.message,
      progress: notification.params.progress,
    });
  });

  await client.connect(transport);

  return {
    client,
    close: async () => {
      await client.close();
    },
    logs,
    progress,
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
