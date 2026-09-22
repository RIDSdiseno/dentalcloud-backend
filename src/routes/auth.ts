import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { loginRateLimiter, refreshRateLimiter } from '../middleware/rateLimiters';
import { login, refresh, logout, me } from '../controllers/authController';

const router = Router();

router.post('/login', loginRateLimiter, login);
router.post('/refresh', refreshRateLimiter, refresh);
router.post('/logout', logout);
router.get('/me', authenticate, me);

export default router;
