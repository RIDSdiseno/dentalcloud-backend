import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate';
import { requireModuleEnabled } from '../middleware/requireModuleEnabled';
import { requireRolePermission } from '../middleware/requireRolePermission';
import {
  list,
  create,
  getOne,
  update,
  uploadPhoto,
  uploadMotivoConsultaAudio,
  uploadExamPhoto,
  listExamPhotos,
  uploadExamPhotoMarkup,
  listExamPhotoMarkups,
  deleteExamPhotoMarkup,
  deleteExamPhoto,
  deleteExamPhotoRound,
  uploadExamVideo,
  listExamVideos,
  corroborateData,
  generateAnamnesisSummaryHandler,
} from '../controllers/patientsController';
import { createExamRequest, createManualReceta } from '../controllers/documentsController';

const router = Router();
const uploadMiddleware = multer({ storage: multer.memoryStorage() });

router.use(authenticate);
router.use(requireModuleEnabled('pacientes'));
router.use(requireRolePermission('pacientes'));
router.get('/', list);
router.post('/', create);
router.get('/:id', getOne);
router.patch('/:id', update);
router.patch('/:id/photo', uploadMiddleware.single('photo'), uploadPhoto);
router.patch('/:id/motivo-consulta-audio', uploadMiddleware.single('audio'), uploadMotivoConsultaAudio);
// Todo lo del Examen Estético va detrás de su propio permiso: esconder la
// pestaña en pantalla no basta, porque las fotos y el examen se pedirían igual
// a la API y bastaría con mirar la respuesta para verlos (mismo problema que
// tenían los permisos de campos del paciente).
const requireExamenEstetico = requireRolePermission('fichaExamenEstetico');

router.get('/:id/exam-photos', requireExamenEstetico, listExamPhotos);
router.patch('/:id/exam-photo/:slot', requireExamenEstetico, uploadMiddleware.single('photo'), uploadExamPhoto);
router.get('/:id/exam-photo-markups', requireExamenEstetico, listExamPhotoMarkups);
router.post(
  '/:id/exam-photo/:examPhotoId/markup',
  requireExamenEstetico,
  uploadMiddleware.single('photo'),
  uploadExamPhotoMarkup
);
router.delete('/:id/exam-photo-markups/:markupId', requireExamenEstetico, deleteExamPhotoMarkup);
// La ronda va ANTES de la ruta por id: si no, 'round' entraría como :examPhotoId.
router.delete('/:id/exam-photos/round', requireExamenEstetico, deleteExamPhotoRound);
router.delete('/:id/exam-photos/:examPhotoId', requireExamenEstetico, deleteExamPhoto);
router.get('/:id/exam-videos', requireExamenEstetico, listExamVideos);
router.patch('/:id/exam-video', requireExamenEstetico, uploadMiddleware.single('video'), uploadExamVideo);
router.post('/:id/corroborate-data', corroborateData);
router.post('/:id/anamnesis-summary', generateAnamnesisSummaryHandler);
router.post('/:id/exam-request', createExamRequest);
router.post('/:id/receta-manual', createManualReceta);

export default router;
