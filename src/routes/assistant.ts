import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { chat, execute, usage } from '../controllers/assistantController';

const router = Router();

// authenticate asegura que el asistente actúe en la sesión del usuario (su
// clínica y sus permisos). Cuando sume acceso a datos, se filtrará por req.user.
router.use(authenticate);
router.post('/chat', chat);
router.post('/execute', execute);
router.get('/usage', usage);

export default router;
