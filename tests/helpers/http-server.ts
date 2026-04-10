import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

type RecordedRequest = {
  body: string;
  headers: IncomingMessage['headers'];
  method: string;
  url: string;
};

export async function createTestServer() {
  const requests: RecordedRequest[] = [];

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const body = await readBody(req);
    requests.push({
      body,
      headers: req.headers,
      method: req.method || 'GET',
      url: req.url || '/',
    });

    if (req.method === 'GET' && req.url === '/ping') {
      respondJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && req.url === '/api/widgets') {
      respondJson(res, 200, [{ id: 1, name: 'Widget' }]);
      return;
    }

    if (req.method === 'GET' && req.url === '/api/widgets/123') {
      respondJson(res, 200, { id: 123, name: 'Widget 123' });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/widgets') {
      respondJson(res, 201, { id: 123, name: 'Created Widget' });
      return;
    }

    if (req.method === 'POST' && req.url === '/graphql') {
      respondJson(res, 200, {
        data: {
          users: [{ id: '1', name: 'Ada' }],
        },
      });
      return;
    }

    if (req.method === 'PUT' && req.url === '/api/widgets/123') {
      respondJson(res, 200, { id: 123, name: 'Updated Widget' });
      return;
    }

    if (req.method === 'DELETE' && req.url === '/api/widgets/123') {
      respondJson(res, 204, null);
      return;
    }

    respondJson(res, 404, { error: 'Not found' });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to determine test server address');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
    requests,
  };
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

function respondJson(res: ServerResponse, statusCode: number, body: unknown): void {
  if (statusCode === 204) {
    res.writeHead(statusCode);
    res.end();
    return;
  }

  res.writeHead(statusCode, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}
