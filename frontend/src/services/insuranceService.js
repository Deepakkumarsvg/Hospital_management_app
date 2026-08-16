import api, { getToken } from './api.js';

export async function listClaims(params = {}) {
  const { data } = await api.get('/insurance/claims', { params });
  return { items: data.data, pagination: data.pagination };
}
export const getClaim = (id) => api.get(`/insurance/claims/${id}`).then((r) => r.data.data);
export const createClaim = (p) => api.post('/insurance/claims', p).then((r) => r.data.data);
export const updateClaim = (id, p) => api.put(`/insurance/claims/${id}`, p).then((r) => r.data.data);
export const changeClaimStatus = (id, p) => api.patch(`/insurance/claims/${id}/status`, p).then((r) => r.data.data);
export const getInsuranceStats = () => api.get('/insurance/stats').then((r) => r.data.data);

// Claim documents (pre-auth letters, discharge summaries, bills, policy copies)
export const listClaimDocuments = (claimId) => api.get(`/insurance/claims/${claimId}/documents`).then((r) => r.data.data);

export async function uploadClaimDocument(claimId, file, category) {
  const form = new FormData();
  form.append('file', file);
  if (category) form.append('category', category);
  const { data } = await api.post(`/insurance/claims/${claimId}/documents`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data;
}

export async function deleteClaimDocument(claimId, docId) {
  const { data } = await api.delete(`/insurance/claims/${claimId}/documents/${docId}`);
  return data;
}

export async function viewClaimDocument(claimId, doc) {
  const res = await fetch(`/api/insurance/claims/${claimId}/documents/${doc.id || doc._id}/download?inline=true`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Could not open document');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) throw new Error('Popup blocked — allow popups to view the document');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadClaimDocument(claimId, doc) {
  const res = await fetch(`/api/insurance/claims/${claimId}/documents/${doc.id || doc._id}/download`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Download failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = doc.originalName || 'document';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
