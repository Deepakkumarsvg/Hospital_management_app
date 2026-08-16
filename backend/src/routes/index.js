import { Router } from 'express';
import mongoose from 'mongoose';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import patientRoutes from './patientRoutes.js';
import departmentRoutes from './departmentRoutes.js';
import doctorRoutes from './doctorRoutes.js';
import appointmentRoutes from './appointmentRoutes.js';
import opdRoutes from './opdRoutes.js';
import ipdRoutes from './ipdRoutes.js';
import { wardRoutes, roomRoutes, bedRoutes } from './facilityRoutes.js';
import labRoutes from './labRoutes.js';
import radiologyRoutes from './radiologyRoutes.js';
import reportRoutes from './reportRoutes.js';
import pharmacyRoutes from './pharmacyRoutes.js';
import inventoryRoutes from './inventoryRoutes.js';
import billingRoutes from './billingRoutes.js';
import insuranceRoutes from './insuranceRoutes.js';
import otRoutes from './otRoutes.js';
import bloodBankRoutes from './bloodBankRoutes.js';
import hrRoutes from './hrRoutes.js';
import ambulanceRoutes from './ambulanceRoutes.js';
import notificationRoutes from './notificationRoutes.js';
import auditRoutes from './auditRoutes.js';
import settingRoutes from './settingRoutes.js';
import portalRoutes from './portalRoutes.js';
import opsRoutes from './opsRoutes.js';
import roleRoutes from './roleRoutes.js';

const router = Router();

// Liveness + readiness in one.
//
// Reporting "healthy" purely because the process is running is worse than
// useless: it stays green while every real request fails on a dead database,
// so an orchestrator keeps routing traffic to an instance that cannot serve
// it. This actually pings MongoDB and answers 503 when it can't be reached.
router.get('/health', async (_req, res) => {
  const state = mongoose.connection.readyState; // 1 = connected
  let database = state === 1 ? 'up' : 'down';

  if (database === 'up') {
    // readyState can lag reality — confirm the server actually answers.
    try {
      await mongoose.connection.db.admin().command({ ping: 1 });
    } catch {
      database = 'down';
    }
  }

  const healthy = database === 'up';
  res.status(healthy ? 200 : 503).json({
    success: healthy,
    message: healthy ? 'API is healthy' : 'Database unreachable',
    ...(healthy ? {} : { error: 'DATABASE_UNAVAILABLE' }),
    data: { uptime: process.uptime(), database },
  });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/patients', patientRoutes);
router.use('/departments', departmentRoutes);
router.use('/doctors', doctorRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/opd', opdRoutes);
router.use('/ipd', ipdRoutes);
router.use('/wards', wardRoutes);
router.use('/rooms', roomRoutes);
router.use('/beds', bedRoutes);
router.use('/laboratory', labRoutes);
router.use('/radiology', radiologyRoutes);
router.use('/reports', reportRoutes);
router.use('/pharmacy', pharmacyRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/billing', billingRoutes);
router.use('/insurance', insuranceRoutes);
router.use('/ot', otRoutes);
router.use('/blood-bank', bloodBankRoutes);
router.use('/hr', hrRoutes);
router.use('/ambulance', ambulanceRoutes);
router.use('/notifications', notificationRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/settings', settingRoutes);
router.use('/portal', portalRoutes);
router.use('/ops', opsRoutes);
router.use('/roles', roleRoutes);

// All V1 modules mounted.

export default router;
