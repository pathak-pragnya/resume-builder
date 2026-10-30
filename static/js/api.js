async function request(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!data || (!response.ok && !('ok' in data))) {
    throw new Error(data?.error || `${method} ${url} failed with ${response.status}`);
  }
  return data;
}

export const api = {
  config: () => request('GET', '/api/config'),
  loadResume: () => request('GET', '/api/resume'),
  saveResume: (resume) => request('PUT', '/api/resume', { resume }),
  generate: (resume) => request('POST', '/api/generate', { resume }),
  compile: (payload) => request('POST', '/api/compile', payload),
};

export const fileUrl = (name, download = false) => `/files/${name}${download ? '?download=1' : ''}`;
