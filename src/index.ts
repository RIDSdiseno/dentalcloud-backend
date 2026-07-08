import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth';
import chairsRoutes from './routes/chairs';
import patientsRoutes from './routes/patients';
import appointmentsRoutes from './routes/appointments';
import usersRoutes from './routes/users';
import workSchedulesRoutes from './routes/workSchedules';
import treatmentPlansRoutes from './routes/treatmentPlans';
import treatmentItemsRoutes from './routes/treatmentItems';
import catalogsRoutes from './routes/catalogs';
import evolutionsRoutes from './routes/evolutions';
import ledgerRoutes from './routes/ledger';
import observationsRoutes from './routes/observations';
import documentsRoutes from './routes/documents';
import rxRoutes from './routes/rx';

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/chairs', chairsRoutes);
app.use('/api/patients', patientsRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/work-schedules', workSchedulesRoutes);
app.use('/api/treatment-plans', treatmentPlansRoutes);
app.use('/api/treatment-items', treatmentItemsRoutes);
app.use('/api/catalogs', catalogsRoutes);
app.use('/api/evolutions', evolutionsRoutes);
app.use('/api/ledger', ledgerRoutes);
app.use('/api/observations', observationsRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/rx', rxRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
