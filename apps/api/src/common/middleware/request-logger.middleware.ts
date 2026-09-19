import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

// Phase 19 (Monitoring): before this, apps/api produced zero log output for
// ordinary request traffic — AllExceptionsFilter only ever logs on an
// unhandled 500, so Railway's log viewer had nothing to show for a normal
// register/login/API session. This also stamps a request ID onto `req` and
// echoes it back as `X-Request-Id`, so a client-visible error's `requestId`
// (see AllExceptionsFilter) can be grepped straight to its matching access
// log line — before this, the filter minted its own ID independent of the
// request, so the two could never actually be correlated.
declare module 'express' {
  interface Request {
    requestId?: string;
  }
}

const logger = new Logger('HTTP');

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const startedAt = Date.now();
  res.on('finish', () => {
    logger.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms requestId=${requestId}`);
  });

  next();
}
