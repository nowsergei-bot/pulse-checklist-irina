/** The browser must generate the multipart boundary for file uploads. */
export function requestBodyHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers || {});
  if (typeof FormData !== 'undefined' && init?.body instanceof FormData) {
    headers.delete('Content-Type');
  }
  return headers;
}
