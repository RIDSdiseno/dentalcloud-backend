import { Router } from 'express';
import { publicAppointmentRateLimiter } from '../middleware/rateLimiters';
import { getByConfirmationToken, confirmByToken } from '../controllers/appointmentsController';

const router = Router();

router.use(publicAppointmentRateLimiter);
router.get('/:token', getByConfirmationToken);
router.post('/:token/confirm', confirmByToken);

export default router;
