import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/doctorService.js';

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await service.listDoctors(req.query);
  sendSuccess(res, { message: 'Doctors fetched', data: items, meta: pagination });
});

export const active = asyncHandler(async (req, res) => {
  const items = await service.activeDoctors(req.query.department);
  sendSuccess(res, { message: 'Active doctors', data: items });
});

export const stats = asyncHandler(async (_req, res) => {
  sendSuccess(res, { message: 'Doctor stats', data: await service.doctorStats() });
});

// GET /api/doctors/me — the Doctor profile linked to the logged-in user.
export const me = asyncHandler(async (req, res) => {
  const doc = await service.getDoctorByUser(req.user._id);
  sendSuccess(res, { message: 'My doctor profile', data: doc }); // data may be null if unlinked
});

export const get = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Doctor fetched', data: await service.getDoctor(req.params.id) });
});

export const create = asyncHandler(async (req, res) => {
  const doc = await service.createDoctor(req.body);
  sendSuccess(res, { statusCode: 201, message: 'Doctor added successfully', data: doc });
});

export const update = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Doctor updated', data: await service.updateDoctor(req.params.id, req.body) });
});

export const remove = asyncHandler(async (req, res) => {
  await service.deleteDoctor(req.params.id);
  sendSuccess(res, { message: 'Doctor deleted', data: null });
});
