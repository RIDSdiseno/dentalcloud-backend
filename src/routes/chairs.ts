import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRolePermission } from '../middleware/requireRolePermission';
import { list, create, update, remove } from '../controllers/chairsController';

const router = Router();

router.use(authenticate);
router.get('/', list);
// Crear, editar y borrar sillones pide el mismo permiso "agenda" que la
// pantalla donde se hace (09-11-2026); antes cualquier cuenta podía hacerlo
// llamando directo al servidor. Verlos sigue igual.
router.post('/', requireRolePermission('agenda'), create);
router.patch('/:id', requireRolePermission('agenda'), update);
router.delete('/:id', requireRolePermission('agenda'), remove);

export default router;
