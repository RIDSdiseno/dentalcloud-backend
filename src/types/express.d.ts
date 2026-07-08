import type { AccessTokenPayload } from '../utils/tokens';

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export {};
