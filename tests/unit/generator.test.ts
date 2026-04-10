import assert from 'node:assert/strict';
import test from 'node:test';

import { generateBruFile } from '../../src/bruno/generator.js';
import type { BruFile } from '../../src/bruno/types.js';

test('generateBruFile emits Bruno-compatible REST requests', () => {
  const bruFile: BruFile = {
    meta: {
      name: 'Get Users',
      type: 'http',
      seq: 1,
    },
    http: {
      method: 'GET',
      url: '{{baseUrl}}/users',
      body: 'json',
      auth: 'bearer',
    },
    auth: {
      type: 'bearer',
      bearer: {
        token: '{{token}}',
      },
    },
    headers: {
      Accept: 'application/json',
    },
    query: {
      limit: 10,
      includeInactive: false,
    },
    body: {
      type: 'json',
      content: '{\n  "enabled": true\n}',
    },
  };

  const generated = generateBruFile(bruFile);

  assert.equal(
    generated,
    `meta {
  name: 'Get Users'
  type: http
  seq: 1
}

get {
  url: {{baseUrl}}/users
  body: json
  auth: bearer
}

auth:bearer {
  token: '{{token}}'
}

headers {
  Accept: 'application/json'
}

query {
  limit: 10
  includeInactive: false
}

body:json {
  {
    "enabled": true
  }
}
`,
  );
});

test('generateBruFile emits Bruno-compatible GraphQL requests', () => {
  const bruFile: BruFile = {
    meta: {
      name: 'List Users',
      type: 'http',
      seq: 2,
    },
    http: {
      method: 'POST',
      url: '{{baseUrl}}/graphql',
      body: 'graphql',
      auth: 'bearer',
    },
    auth: {
      type: 'bearer',
      bearer: {
        token: '{{token}}',
      },
    },
    headers: {
      'content-type': 'application/json',
    },
    body: {
      type: 'graphql',
      content: `query ListUsers($limit: Int!) {
  users(limit: $limit) {
    id
    name
  }
}`,
      variables: '{\n  "limit": 5\n}',
    },
  };

  const generated = generateBruFile(bruFile);

  assert.equal(
    generated,
    `meta {
  name: 'List Users'
  type: http
  seq: 2
}

post {
  url: {{baseUrl}}/graphql
  body: graphql
  auth: bearer
}

auth:bearer {
  token: '{{token}}'
}

headers {
  content-type: 'application/json'
}

body:graphql {
  query ListUsers($limit: Int!) {
    users(limit: $limit) {
      id
      name
    }
  }
}

body:graphql:vars {
  {
    "limit": 5
  }
}
`,
  );
});
