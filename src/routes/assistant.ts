import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate';
import { chat, execute, usage, transcribe } from '../controllers/assistantController';
import { assistantChatRateLimiter, assistantExecuteRateLimiter } from '../middleware/rateLimiters';
import { assistantAudit, assistantIdempotency } from '../middleware/assistantIdempotency';

// El audio dictado se recibe en memoria (no se guarda en disco). 25 MB es el
// tope que acepta Whisper; un dictado normal pesa pocos cientos de KB.
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const router = Router();

// authenticate asegura que el asistente actúe en la sesión del usuario (su
// clínica y sus permisos). Cuando sume acceso a datos, se filtrará por req.user.
router.use(authenticate);
router.post('/chat', assistantChatRateLimiter, chat);
router.post('/execute', assistantExecuteRateLimiter, assistantAudit, assistantIdempotency, execute);
router.get('/usage', usage);
// Voz → texto para iPad/móvil (Whisper). Ver nota en transcribe().
router.post('/transcribe', assistantChatRateLimiter, audioUpload.single('audio'), transcribe);

export default router;
