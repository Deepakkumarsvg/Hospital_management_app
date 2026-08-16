import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/settingService.js';
import { audit } from '../utils/audit.js';
import { resolvePath } from '../config/storage.js';
import { ApiError } from '../utils/ApiError.js';

export const get = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Settings', data: await service.getSettings() }));

export const getPublic = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Public settings', data: await service.getPublicSettings() }));

export const update = asyncHandler(async (req, res) => {
  const doc = await service.updateSettings(req.body, req.user?._id);
  audit(req, { action: 'UPDATE', module: 'Setting', recordId: 'hospital', description: 'Hospital settings updated' });
  sendSuccess(res, { message: 'Settings updated', data: doc });
});

export const uploadLogo = asyncHandler(async (req, res) => {
  const doc = await service.setLogo(req.file, req.user?._id);
  audit(req, { action: 'UPDATE', module: 'Setting', recordId: 'hospital', description: 'Hospital logo updated' });
  sendSuccess(res, { message: 'Logo uploaded', data: doc });
});

export const getLogo = asyncHandler(async (_req, res) => {
  const settings = await service.getSettings();
  if (!settings.logo?.storageKey) throw ApiError.notFound('No logo set', 'LOGO_NOT_SET');
  res.setHeader('Content-Type', settings.logo.mimeType);
  res.sendFile(resolvePath(settings.logo.storageKey));
});

export const removeLogo = asyncHandler(async (req, res) => {
  const doc = await service.removeLogo(req.user?._id);
  audit(req, { action: 'UPDATE', module: 'Setting', recordId: 'hospital', description: 'Hospital logo removed' });
  sendSuccess(res, { message: 'Logo removed', data: doc });
});
