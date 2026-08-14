import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/settingService.js';
import { audit } from '../utils/audit.js';

export const get = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Settings', data: await service.getSettings() }));

export const update = asyncHandler(async (req, res) => {
  const doc = await service.updateSettings(req.body, req.user?._id);
  audit(req, { action: 'UPDATE', module: 'Setting', recordId: 'hospital', description: 'Hospital settings updated' });
  sendSuccess(res, { message: 'Settings updated', data: doc });
});
