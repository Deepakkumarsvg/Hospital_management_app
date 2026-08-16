import api, { getToken } from './api.js';

export async function listPatientDocuments(patientId) {
  const { data } = await api.get(`/patients/${patientId}/documents`);
  return data.data;
}

export async function uploadPatientDocument(patientId, file, category) {
  const form = new FormData();
  form.append('file', file);
  if (category) form.append('category', category);
  const { data } = await api.post(`/patients/${patientId}/documents`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data;
}

export async function deletePatientDocument(patientId, docId) {
  const { data } = await api.delete(`/patients/${patientId}/documents/${docId}`);
  return data;
}

// Open a document (PDF/image) inline in a new tab instead of downloading it.
export async function viewPatientDocument(patientId, doc) {
  const res = await fetch(`/api/patients/${patientId}/documents/${doc.id || doc._id}/download?inline=true`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Could not open document');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) throw new Error('Popup blocked — allow popups to view the document');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Build an authenticated download: fetch as blob (JWT is header-based, so a
// plain <a href> wouldn't carry it) and trigger a save.
export async function downloadPatientDocument(patientId, doc) {
  const res = await fetch(`/api/patients/${patientId}/documents/${doc.id || doc._id}/download`, {
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
