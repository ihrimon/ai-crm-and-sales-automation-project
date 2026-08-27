import type { AuthenticatedUser } from '../guards/jwt-auth.guard';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
