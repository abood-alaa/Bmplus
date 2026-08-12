/**
 * api.js — Public-facing API call helpers
 *
 * Only one function here: submitRequest.
 * All admin API calls live inside AdminPage.jsx via authFetch (no shared helper needed).
 *
 * The backend receives multipart/form-data because files must be attached.
 * JSON payload is serialized into the 'data' field; files go in 'files[]';
 * their display labels go in 'file_labels[]' (parallel arrays, same order).
 */

// Submits a new service request form to the server.
// payload: { fullName, idNumber, location, countryCode, whatsapp, notes, services, textFields }
// selectedFiles: [{ label, file }] — label is the field name shown to the admin
export async function submitRequest({ payload, selectedFiles }) {
  const formData = new FormData()

  formData.append('data', JSON.stringify({
    fullName:    payload.fullName,
    idNumber:    payload.idNumber,
    location:    payload.location,
    countryCode: payload.countryCode,
    whatsapp:    payload.whatsapp,
    notes:       payload.notes,
    services:    payload.services,
    textFields:  payload.textFields,
  }))

  // Files and their labels are sent as parallel arrays; the server zips them by index.
  selectedFiles.forEach(({ file })  => formData.append('files', file))
  selectedFiles.forEach(({ label }) => formData.append('file_labels', label))

  const res = await fetch('/api/submit', { method: 'POST', body: formData })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'خطأ في إرسال الطلب')
  return data
}
