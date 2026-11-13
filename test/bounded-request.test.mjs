import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './load-ts.mjs';

const { readBoundedRequestText } = loadTsModule('../lib/bounded-request.ts');

test('bounded request accepts a body within the byte limit', async () => {
  const request = new Request('https://example.test', { method: 'POST', body: '{"ok":true}' });
  assert.equal(await readBoundedRequestText(request, 32), '{"ok":true}');
});

test('bounded request rejects oversized streamed bodies without Content-Length', async () => {
  const payload = new TextEncoder().encode('x'.repeat(20));
  const stream = new ReadableStream({ start(controller) { controller.enqueue(payload); controller.close(); } });
  const request = new Request('https://example.test', { method: 'POST', body: stream, duplex: 'half' });
  assert.equal(request.headers.has('content-length'), false);
  assert.equal(await readBoundedRequestText(request, 8), null);
});

test('bounded request rejects an oversized declared length before reading', async () => {
  const request = new Request('https://example.test', {
    method: 'POST',
    headers: { 'content-length': '100' },
    body: 'x',
  });
  assert.equal(await readBoundedRequestText(request, 8), null);
});

test('bounded request handles empty bodies and rejects invalid limits', async () => {
  const request = new Request('https://example.test', { method: 'POST' });
  assert.equal(await readBoundedRequestText(request, 0), '');
  await assert.rejects(readBoundedRequestText(request, -1), { message: 'INVALID_BODY_LIMIT' });
});
