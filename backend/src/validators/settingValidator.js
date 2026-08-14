import { z } from 'zod';

export const updateSettingSchema = z.object({
  hospitalName: z.string().trim().min(2).max(120).optional(),
  tagline: z.string().trim().max(160).optional(),
  addressLine: z.string().trim().max(200).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  pincode: z.string().trim().max(12).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().max(120).optional().or(z.literal('')),
  website: z.string().trim().max(120).optional(),
  registrationNo: z.string().trim().max(60).optional(),
  gstin: z.string().trim().max(30).optional(),
  currency: z.string().trim().max(4).optional(),
  defaultTaxPercent: z.coerce.number().min(0).max(100).optional(),
  invoiceFooter: z.string().trim().max(300).optional(),
});
