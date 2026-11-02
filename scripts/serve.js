import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pub = path.resolve(__dirname, '..', 'public');
const PORT = 3000;

const MIMES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  let file = parsed.pathname === '/' ? '/index.html' : parsed.pathname;
  let target = path.join(pub, file);

  if (!target.startsWith(pub)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    target = path.join(target, 'index.html');
  }

  if (!fs.existsSync(target)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }

  const ext = path.extname(target).toLowerCase();
  const mime = MIMES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
  fs.createReadStream(target).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Serveur FlowTrax actif sur : http://localhost:${PORT}`);
});

