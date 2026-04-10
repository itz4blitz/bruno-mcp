import { IncomingMessage } from 'node:http';

export function isAuthorizedRequest(request: IncomingMessage, token: string | undefined): boolean {
  if (!token) {
    return true;
  }
  const header = request.headers.authorization;
  return header === `Bearer ${token}`;
}
