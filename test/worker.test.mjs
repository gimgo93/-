import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

test('only /app and its descendants belong to this project', async () => {
  for (const path of ['/', '/game/', '/api/clan', '/application', '/app-other']) {
    const response = await worker.fetch(new Request('https://ageclan.com' + path), {});
    assert.equal(response.status, 404, path);
  }
});

test('/app canonical redirect preserves query parameters', async () => {
  const response = await worker.fetch(new Request('https://ageclan.com/app?from=link'), {});
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), 'https://ageclan.com/app/?from=link');
});

test('assets use the app namespace and preserve status and content type', async () => {
  let forwarded;
  const response = await worker.fetch(new Request('https://ageclan.com/app/style.css'), {
    ASSETS: { fetch(request) {
      forwarded = request.url;
      return new Response('body{}', { headers: { 'Content-Type': 'text/css' } });
    } },
  });
  assert.equal(forwarded, 'https://ageclan.com/app/style.css');
  assert.equal(await response.text(), 'body{}');
  assert.equal(response.headers.get('content-type'), 'text/css');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});

test('unknown app assets stay 404', async () => {
  const response = await worker.fetch(new Request('https://ageclan.com/app/missing'), {
    ASSETS: { fetch: () => new Response('Not found', { status: 404 }) },
  });
  assert.equal(response.status, 404);
});

test('placeholder accepts read requests only', async () => {
  const response = await worker.fetch(new Request('https://ageclan.com/app/', { method: 'POST' }), {});
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD');
});
