import { Router } from 'express';
import * as c from '../controllers/facilityController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { auditTrail } from '../middleware/auditTrail.js';
import { validate } from '../middleware/validate.js';
import {
  createWardSchema, updateWardSchema,
  createRoomSchema, updateRoomSchema,
  createBedSchema, updateBedSchema,
} from '../validators/facilityValidator.js';

// Wards/Rooms/Beds. Reads are open to clinical staff, who need to see bed
// availability; structural changes are administrative.
//
// Reads used to be open to ANY authenticated account, which left the API more
// permissive than the UI in front of it — a lab technician could enumerate
// every ward and bed. They now need facilities:view like everything else.
const wards = Router();
wards.use(authenticate, auditTrail('Facility'));
wards.get('/', requirePermission('facilities:view'), c.listWards);
wards.post('/', requirePermission('facilities:manage'), validate(createWardSchema), c.createWard);
wards.put('/:id', requirePermission('facilities:manage'), validate(updateWardSchema), c.updateWard);
wards.delete('/:id', requirePermission('facilities:manage'), c.deleteWard);

const rooms = Router();
rooms.use(authenticate, auditTrail('Facility'));
rooms.get('/', requirePermission('facilities:view'), c.listRooms);
rooms.post('/', requirePermission('facilities:manage'), validate(createRoomSchema), c.createRoom);
rooms.put('/:id', requirePermission('facilities:manage'), validate(updateRoomSchema), c.updateRoom);
rooms.delete('/:id', requirePermission('facilities:manage'), c.deleteRoom);

const beds = Router();
beds.use(authenticate, auditTrail('Facility'));
beds.get('/', requirePermission('facilities:view'), c.listBeds);
beds.get('/available', requirePermission('facilities:view'), c.availableBeds);
beds.get('/map', requirePermission('facilities:view'), c.bedMap);
beds.get('/export', requirePermission('facilities:view'), c.exportBeds);
// Nurses may flip a bed to/from MAINTENANCE/RESERVED; ADMIN full control.
beds.post('/', requirePermission('facilities:manage'), validate(createBedSchema), c.createBed);
beds.put('/:id', requirePermission('facilities:bedstatus'), validate(updateBedSchema), c.updateBed);
beds.delete('/:id', requirePermission('facilities:manage'), c.deleteBed);

export { wards as wardRoutes, rooms as roomRoutes, beds as bedRoutes };
