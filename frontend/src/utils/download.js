import api from '../services/api.js';

// Fetch an authenticated PDF (JWT is attached by the axios interceptor) and
// open it in a new browser tab. Falls back to a direct download if the popup
// is blocked.
export async function openPdf(url, filename = 'document.pdf') {
  const res = await api.get(url, { responseType: 'blob' });
  const blob = new Blob([res.data], { type: 'application/pdf' });
  const objectUrl = URL.createObjectURL(blob);
  const win = window.open(objectUrl, '_blank');
  if (!win) {
    const a = document.createElement('a');
    a.href = objectUrl; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  }
  // Revoke a little later so the new tab has time to load it.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

// Fetch an authenticated file (CSV/XLSX/etc.) and trigger a download.
export async function downloadFile(url, filename, params = {}) {
  const res = await api.get(url, { responseType: 'blob', params });
  const blob = new Blob([res.data], { type: res.headers?.['content-type'] || 'application/octet-stream' });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}
