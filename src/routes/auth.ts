import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../middleware/authenticate';
import { loginRateLimiter, refreshRateLimiter } from '../middleware/rateLimiters';
import {
  login,
  loginVerify,
  loginResend,
  verifyCredentials,
  refresh,
  logout,
  me,
  updateMySignature,
  deleteMySignature,
} from '../controllers/authController';
import { isValidFederationRequest } from '../lib/federationSignature';

const router = Router();

// Solo llamadas firmadas por Dental-Demo (ver lib/federationSignature.ts).
function onlyFederation(req: Request, res: Response, next: NextFunction) {
  if (isValidFederationRequest(req as unknown as Parameters<typeof isValidFederationRequest>[0])) return next();
  return res.status(401).json({ ok: false });
}

router.post('/login', loginRateLimiter, login);
// Doble verificación del personal (ver lib/staffMfa.ts).
router.post('/login/verify', loginRateLimiter, loginVerify);
router.post('/login/resend', loginRateLimiter, loginResend);
router.post('/verify-credentials', loginRateLimiter, onlyFederation, verifyCredentials);
router.post('/refresh', refreshRateLimiter, refresh);
router.post('/logout', logout);
router.get('/me', authenticate, me);
router.patch('/me/signature', authenticate, updateMySignature);
router.delete('/me/signature', authenticate, deleteMySignature);

export default router;
