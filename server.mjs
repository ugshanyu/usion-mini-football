import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number.parseInt(process.env.PORT || '3000', 10);
const prefix = '/sdk-v3-football/';
const publicFiles = new Set([
  'THREE-LICENSE.txt',
  'app.js',
  'index.html',
  'server.bundle.js',
  'styles.css',
  'three.core.min.js',
  'three.module.min.js',
]);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function headers(contentType, cacheControl = 'public, max-age=300') {
  return {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': cacheControl,
    'Content-Type': contentType,
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  };
}

function requestedFile(requestUrl) {
  const pathname = new URL(requestUrl || '/', 'http://localhost').pathname;
  if (pathname === '/' || pathname === '/index.html'
    || pathname === '/sdk-v3-football' || pathname === prefix) {
    return 'index.html';
  }
  const candidate = pathname.startsWith(prefix)
    ? pathname.slice(prefix.length)
    : pathname.slice(1);
  return publicFiles.has(candidate) ? candidate : null;
}

const server = createServer(async (request, response) => {
  const startedAt = Date.now();
  response.on('finish', () => {
    console.info(JSON.stringify({
      event: 'http_request',
      method: request.method,
      path: new URL(request.url || '/', 'http://localhost').pathname,
      status: response.statusCode,
      durationMs: Date.now() - startedAt,
    }));
  });
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, headers('text/plain; charset=utf-8', 'no-store'));
    response.end('Method Not Allowed');
    return;
  }
  if (request.url === '/health') {
    response.writeHead(200, headers('application/json; charset=utf-8', 'no-store'));
    response.end(JSON.stringify({ status: 'ok', service: 'sdk-v3-mini-football' }));
    return;
  }
  const file = requestedFile(request.url);
  if (!file) {
    response.writeHead(404, headers('text/plain; charset=utf-8', 'no-store'));
    response.end('Not Found');
    return;
  }
  try {
    const path = join(root, file);
    const metadata = await stat(path);
    const cacheControl = file === 'index.html'
      ? 'no-cache'
      : 'public, max-age=300, stale-while-revalidate=60';
    response.writeHead(200, {
      ...headers(contentTypes[extname(file)] || 'application/octet-stream', cacheControl),
      'Content-Length': metadata.size,
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(path).pipe(response);
  } catch {
    response.writeHead(500, headers('text/plain; charset=utf-8', 'no-store'));
    response.end('Internal Server Error');
  }
});

server.listen(port, '0.0.0.0', () => {
  const address = server.address();
  console.info(JSON.stringify({
    event: 'server_started',
    port: typeof address === 'object' && address ? address.port : port,
  }));
});
