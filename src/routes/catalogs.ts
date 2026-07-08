import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/requireAdmin';
import {
  listSucursales,
  createSucursal,
  updateSucursal,
  removeSucursal,
  listPrevisiones,
  createPrevision,
  updatePrevision,
  removePrevision,
  listConvenios,
  createConvenio,
  updateConvenio,
  removeConvenio,
  listPrestaciones,
  createPrestacion,
  updatePrestacion,
  removePrestacion,
  listEvolutionTemplates,
  createEvolutionTemplate,
  updateEvolutionTemplate,
  removeEvolutionTemplate,
} from '../controllers/catalogsController';

const router = Router();

router.use(authenticate);

router.get('/sucursales', listSucursales);
router.post('/sucursales', requireAdmin, createSucursal);
router.patch('/sucursales/:id', requireAdmin, updateSucursal);
router.delete('/sucursales/:id', requireAdmin, removeSucursal);

router.get('/previsiones', listPrevisiones);
router.post('/previsiones', requireAdmin, createPrevision);
router.patch('/previsiones/:id', requireAdmin, updatePrevision);
router.delete('/previsiones/:id', requireAdmin, removePrevision);

router.get('/convenios', listConvenios);
router.post('/convenios', requireAdmin, createConvenio);
router.patch('/convenios/:id', requireAdmin, updateConvenio);
router.delete('/convenios/:id', requireAdmin, removeConvenio);

router.get('/prestaciones', listPrestaciones);
router.post('/prestaciones', requireAdmin, createPrestacion);
router.patch('/prestaciones/:id', requireAdmin, updatePrestacion);
router.delete('/prestaciones/:id', requireAdmin, removePrestacion);

router.get('/evolution-templates', listEvolutionTemplates);
router.post('/evolution-templates', requireAdmin, createEvolutionTemplate);
router.patch('/evolution-templates/:id', requireAdmin, updateEvolutionTemplate);
router.delete('/evolution-templates/:id', requireAdmin, removeEvolutionTemplate);

export default router;
