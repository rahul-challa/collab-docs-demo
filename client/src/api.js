const TOKEN_KEY = 'collabdocs.token';

export class ApiError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

async function request(method, url, body) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`/api${url}`, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, 'Network error. Check your connection and try again.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      setToken(null);
      window.dispatchEvent(new Event('collabdocs:logout'));
    }
    throw new ApiError(res.status, data.error || `Request failed (${res.status})`, data);
  }
  return data;
}

const upload = (url, file) => {
  const form = new FormData();
  form.append('file', file);
  return request('POST', url, form);
};

export const api = {
  accounts: () => request('GET', '/auth/accounts'),
  login: (email) => request('POST', '/auth/login', { email }),
  logout: () => request('POST', '/auth/logout'),
  me: () => request('GET', '/me'),
  users: () => request('GET', '/users'),
  listDocs: () => request('GET', '/documents'),
  createDoc: (data = {}) => request('POST', '/documents', data),
  getDoc: (id) => request('GET', `/documents/${id}`),
  updateDoc: (id, data) => request('PATCH', `/documents/${id}`, data),
  deleteDoc: (id) => request('DELETE', `/documents/${id}`),
  importDoc: (file) => upload('/documents/import', file),
  convertFile: (file) => upload('/convert', file),
  share: (id, email, role) => request('PUT', `/documents/${id}/shares`, { email, role }),
  unshare: (id, userId) => request('DELETE', `/documents/${id}/shares/${userId}`),
};

export const SUPPORTED_UPLOADS = '.txt,.md,.markdown,.docx';
export const SUPPORTED_UPLOADS_LABEL = '.txt, .md or .docx, up to 5 MB';
