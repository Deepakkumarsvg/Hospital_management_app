import api from './api.js';
import { setToken } from './api.js';
import { openPdf } from '../utils/download.js';

export const registerPatient = (payload) =>
  api.post('/portal/register', payload).then((r) => {
    if (r.data.data?.token) setToken(r.data.data.token);
    return r.data.data;
  });

export const getPortalSummary = () => api.get('/portal/summary').then((r) => r.data.data);
export const getPortalProfile = () => api.get('/portal/me').then((r) => r.data.data);
export const getPortalDoctors = () => api.get('/portal/doctors').then((r) => r.data.data);

export const getPortalAppointments = () => api.get('/portal/appointments').then((r) => r.data.data);
export const bookAppointment = (payload) => api.post('/portal/appointments', payload).then((r) => r.data.data);
export const cancelAppointment = (id) => api.post(`/portal/appointments/${id}/cancel`).then((r) => r.data.data);
export const rescheduleAppointment = (id, payload) => api.post(`/portal/appointments/${id}/reschedule`, payload).then((r) => r.data.data);

// Jitsi meeting URL for a teleconsult appointment (no credentials required).
export const meetingUrl = (room) => `https://meet.jit.si/${encodeURIComponent(room)}`;

// Online payment. In mock mode the order is verified immediately so the flow is
// demoable end-to-end; with real Razorpay keys the checkout widget would open.
export async function payInvoiceOnline(invoiceId) {
  const order = await api.post(`/portal/invoices/${invoiceId}/pay/order`).then((r) => r.data.data);
  if (order.mode === 'mock') {
    return api.post(`/portal/invoices/${invoiceId}/pay/verify`, {
      orderId: order.orderId, paymentId: `pay_mock_${Date.now()}`,
    }).then((r) => r.data.data);
  }
  // Real Razorpay checkout (loaded via their script when keys are configured).
  return new Promise((resolve, reject) => {
    if (!window.Razorpay) return reject(new Error('Payment widget unavailable'));
    const rzp = new window.Razorpay({
      key: order.keyId, amount: order.amount, currency: order.currency, order_id: order.orderId,
      name: 'Hospital', description: order.invoiceNo,
      handler: (resp) => {
        api.post(`/portal/invoices/${invoiceId}/pay/verify`, {
          orderId: order.orderId, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature,
        }).then((r) => resolve(r.data.data)).catch(reject);
      },
      modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
    });
    rzp.open();
  });
}

export const getPortalPrescriptions = () => api.get('/portal/prescriptions').then((r) => r.data.data);
export const getPortalLabOrders = () => api.get('/portal/lab-orders').then((r) => r.data.data);
export const getPortalRadOrders = () => api.get('/portal/radiology-orders').then((r) => r.data.data);
export const getPortalInvoices = () => api.get('/portal/invoices').then((r) => r.data.data);

export const downloadPortalInvoicePdf = (id, no) => openPdf(`/portal/invoices/${id}/pdf`, `${no || 'invoice'}.pdf`);
export const downloadPortalPrescriptionPdf = (id, no) => openPdf(`/portal/prescriptions/${id}/pdf`, `${no || 'prescription'}.pdf`);
