export async function onRequest(context) {
  const url = new URL(context.request.url);
  const targetUrl = new URL(url.pathname + url.search, 'https://opengym-api.datomoliveira.workers.dev');

  const headers = new Headers(context.request.headers);
  headers.set('X-Forwarded-Host', url.hostname);
  headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
  if (!headers.get('origin')) {
    headers.set('origin', url.origin);
  }

  const proxyReq = new Request(targetUrl, {
    method: context.request.method,
    headers,
    body: ['GET', 'HEAD'].includes(context.request.method) ? undefined : context.request.body,
    redirect: 'manual'
  });
  return fetch(proxyReq);
}
