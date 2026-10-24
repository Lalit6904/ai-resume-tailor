import axios from 'axios';

const baseURL = `${(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')}/api`;

export const api = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 90000,
  headers: { Accept: 'application/json' },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      !error.config?.url?.includes('/auth/')
    ) {
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    return Promise.reject(error);
  },
);

export function getApiError(error, fallback = 'Something went wrong. Please try again.') {
  if (error?.response?.data?.error) {
    return {
      code: error.response.data.error.code || 'ERROR',
      message: error.response.data.error.message || fallback,
      details: error.response.data.error.details,
      status: error.response.status,
      requestId: error.response.data.error.requestId,
    };
  }
  if (error?.code === 'ECONNABORTED') {
    return { code: 'TIMEOUT', message: 'The request timed out. Please try again.' };
  }
  if (!error?.response) {
    return {
      code: 'NETWORK',
      message: 'Cannot reach the server. Check your connection and try again.',
    };
  }
  return { code: 'ERROR', message: fallback };
}

export async function downloadBlob(path, fallbackFilename) {
  const response = await api.get(path, { responseType: 'blob' });
  const disposition = response.headers['content-disposition'] || '';
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const asciiMatch = disposition.match(/filename="([^"]+)"/i);
  let filename = fallbackFilename || 'resume.docx';
  if (utf8Match) {
    try {
      filename = decodeURIComponent(utf8Match[1]);
    } catch {
      filename = asciiMatch?.[1] || filename;
    }
  } else if (asciiMatch) {
    filename = asciiMatch[1];
  }
  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return filename;
}

export async function fetchBlobUrl(path) {
  const response = await api.get(path, { responseType: 'blob' });
  return URL.createObjectURL(
    new Blob([response.data], { type: response.headers['content-type'] || 'application/octet-stream' }),
  );
}
