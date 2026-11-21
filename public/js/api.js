let memoryToken = null;

export function setAuthToken(token) {
  memoryToken = token || null;
}

export function getAuthToken() {
  return memoryToken;
}

export async function apiRequest(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...(options.headers || {}),
  };
  if (memoryToken) {
    headers.Authorization = `Bearer ${memoryToken}`;
  }

  const res = await fetch(`/api${path}`, {
    ...options,
    credentials: 'include',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    const err = new Error(data?.error || `İstek başarısız (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}
