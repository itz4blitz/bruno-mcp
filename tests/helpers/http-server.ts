import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

type RecordedRequest = {
  body: string;
  bodyBuffer: Buffer;
  headers: IncomingMessage['headers'];
  method: string;
  url: string;
};

export async function createTestServer() {
  const requests: RecordedRequest[] = [];
  let nextUserId = 200;
  const users = new Map<number, { description?: string; email?: string; id: number; name?: string }>();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const bodyBuffer = await readBody(req);
    const body = bodyBuffer.toString('utf8');
    requests.push({
      body,
      bodyBuffer,
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

    if (req.method === 'POST' && req.url === '/binary') {
      respondJson(res, 201, { bytes: bodyBuffer.length });
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

    if (req.method === 'POST' && req.url === '/auth/login') {
      const payload = body ? (JSON.parse(body) as { password?: string; username?: string }) : {};
      if (payload.username === 'demo' && payload.password === 'demo') {
        respondJson(res, 200, { token: 'demo-token' });
        return;
      }
      respondJson(res, 401, { error: 'Unauthorized' });
      return;
    }

    if (req.url?.startsWith('/users')) {
      const authHeader = req.headers.authorization;
      const isAuthorized = authHeader === 'Bearer demo-token';
      const url = new URL(`http://127.0.0.1${req.url}`);

      if (req.method === 'POST' && url.pathname === '/users') {
        const payload = body ? (JSON.parse(body) as Record<string, unknown>) : {};
        if (!isAuthorized) {
          respondJson(res, 401, { error: 'Unauthorized' });
          return;
        }
        if (typeof payload.name !== 'string' || payload.name.trim().length === 0) {
          respondJson(res, 400, { error: 'Name is required' });
          return;
        }
        if (typeof payload.email !== 'string' || !payload.email.includes('@')) {
          respondJson(res, 400, { error: 'Email is invalid' });
          return;
        }
        if (payload.name.includes('<script>') || String(payload.description || '').includes(' OR 1=1')) {
          respondJson(res, 400, { error: 'Security rejection' });
          return;
        }
        const id = nextUserId++;
        const user = {
          description: typeof payload.description === 'string' ? payload.description : undefined,
          email: String(payload.email),
          id,
          name: String(payload.name),
        };
        users.set(id, user);
        respondJson(res, 201, user);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/users') {
        if (!isAuthorized) {
          respondJson(res, 401, { error: 'Unauthorized' });
          return;
        }
        const lookup = url.searchParams.get('lookup');
        const values = [...users.values()];
        if (lookup) {
          const matched = values.find((user) => user.name?.includes(lookup) || user.email?.includes(lookup));
          respondJson(res, 200, matched ? { data: { id: matched.id } } : { items: [] });
          return;
        }
        respondJson(res, 200, values);
        return;
      }

      if (req.method === 'GET' && /^\/users\/\d+$/.test(url.pathname)) {
        if (!isAuthorized) {
          respondJson(res, 401, { error: 'Unauthorized' });
          return;
        }
        const id = Number(url.pathname.split('/').pop());
        const user = users.get(id);
        if (!user) {
          respondJson(res, 404, { error: 'Not found' });
          return;
        }
        respondJson(res, 200, user);
        return;
      }

      if (req.method === 'PUT' && /^\/users\/\d+$/.test(url.pathname)) {
        if (!isAuthorized) {
          respondJson(res, 401, { error: 'Unauthorized' });
          return;
        }
        const id = Number(url.pathname.split('/').pop());
        const existing = users.get(id);
        if (!existing) {
          respondJson(res, 404, { error: 'Not found' });
          return;
        }
        const payload = body ? (JSON.parse(body) as Record<string, unknown>) : {};
        const updated = {
          ...existing,
          description: typeof payload.description === 'string' ? payload.description : existing.description,
          email: typeof payload.email === 'string' ? payload.email : existing.email,
          name: typeof payload.name === 'string' ? payload.name : existing.name,
        };
        users.set(id, updated);
        respondJson(res, 200, updated);
        return;
      }

      if (req.method === 'DELETE' && /^\/users\/\d+$/.test(url.pathname)) {
        if (!isAuthorized) {
          respondJson(res, 401, { error: 'Unauthorized' });
          return;
        }
        const id = Number(url.pathname.split('/').pop());
        if (!users.has(id)) {
          respondJson(res, 404, { error: 'Not found' });
          return;
        }
        users.delete(id);
        respondJson(res, 204, null);
        return;
      }
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

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
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
