import { Router } from 'express';
import * as c from '../controllers/facilityController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../config/roles.js';
import {
  createWardSchema, updateWardSchema,
  createRoomSchema, updateRoomSchema,
  createBedSchema, updateBedSchema,
} from '../validators/facilityValidator.js';

// Wards/Rooms/Beds. Reads are broad (clinical staff need bed availability);
// structural changes are ADMIN only.
const wards = Router();
wards.use(authenticate);
wards.get('/', c.listWards);
wards.post('/', authorize(ROLES.ADMIN), validate(createWardSchema), c.createWard);
wards.put('/:id', authorize(ROLES.ADMIN), validate(updateWardSchema), c.updateWard);
wards.delete('/:id', authorize(ROLES.ADMIN), c.deleteWard);

const rooms = Router();
rooms.use(authenticate);
rooms.get('/', c.listRooms);
rooms.post('/', authorize(ROLES.ADMIN), validate(createRoomSchema), c.createRoom);
rooms.put('/:id', authorize(ROLES.ADMIN), validate(updateRoomSchema), c.updateRoom);
rooms.delete('/:id', authorize(ROLES.ADMIN), c.deleteRoom);

const beds = Router();
beds.use(authenticate);
beds.get('/', c.listBeds);
beds.get('/available', c.availableBeds);
beds.get('/map', c.bedMap);
beds.get('/export', c.exportBeds);
// Nurses may flip a bed to/from MAINTENANCE/RESERVED; ADMIN full control.
beds.post('/', authorize(ROLES.ADMIN), validate(createBedSchema), c.createBed);
beds.put('/:id', authorize(ROLES.ADMIN, ROLES.NURSE), validate(updateBedSchema), c.updateBed);
beds.delete('/:id', authorize(ROLES.ADMIN), c.deleteBed);

export { wards as wardRoutes, rooms as roomRoutes, beds as bedRoutes };
