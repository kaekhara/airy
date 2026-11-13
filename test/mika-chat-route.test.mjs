import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './load-ts.mjs';

function loadRoute({ fetchImpl, services = null, geminiKey = 'test-gemini-key' }) {
  const engine = loadTsModule('../lib/rpg-engine.ts');
  const skills = loadTsModule('../lib/rpg-skills.ts', { '@/lib/rpg-engine': engine });
  const persona = loadTsModule('../lib/mika-persona.ts');
  return loadTsModule('../app/api/mika-chat/route.ts', {
    '@/lib/mika-persona': persona,
    '@/lib/mika-fallback': loadTsModule('../lib/mika-fallback.ts', { '@/lib/mika-persona': persona }),
    '@/lib/mika-response': loadTsModule('../lib/mika-response.ts', {
      '@/lib/mika-persona': persona,
    }),
    '@/lib/firebase-admin': { getFirebaseAdmin: () => services },
    '@/lib/server-rate-limit': { consumeServerRateLimit: async () => ({ allowed: true, retryAfter: 0 }) },
    '@/lib/verified-email': { hasVerifiedEmail: (claims) => claims.email_verified === true },
    '@/lib/mika-context': loadTsModule('../lib/mika-context.ts', {
      '@/lib/rpg-engine': engine,
      '@/lib/rpg-skills': skills,
    }),
  }, {
    fetch: fetchImpl,
    process: { env: { NODE_ENV: 'test', GEMINI_API_KEY: geminiKey } },
  });
}

function makeRequest({ history, language = 'ru', shareProgressWithMika = false, authorization } = {}) {
  return new Request('https://airy.test/api/mika-chat', {
    method: 'POST',
    headers: {
      origin: 'https://airy.test',
      'content-type': 'application/json',
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify({
      history: history || [{ role: 'user', text: 'Я закончил задачу и очень рад.' }],
      language,
      shareProgressWithMika,
      context: { diaryEntries: 4, totalXp: 700, focusSkill: 'Python', localTime: '19:30' },
    }),
  });
}

test('Mika route forwards bounded conversation history and selected language to Gemini', async () => {
  let modelRequest;
  const route = loadRoute({
    fetchImpl: async (_url, options) => {
      modelRequest = JSON.parse(options.body);
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        reply: 'Здорово, ты довёл задачу до конца — можешь собой гордиться.',
        expression: 'happy',
        theme: 'NONE',
      }) }] } }] });
    },
  });

  const response = await route.POST(makeRequest({
    history: [
      { role: 'user', text: 'Помоги с планом.' },
      { role: 'model', text: 'Разобьём его на шаги.', expression: 'think' },
      { role: 'user', text: 'Я закончил задачу и очень рад.' },
    ],
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    reply: 'Здорово, ты довёл задачу до конца — можешь собой гордиться.',
    expression: 'happy',
    theme: 'NONE',
  });
  assert.equal(modelRequest.contents.length, 3);
  assert.equal(modelRequest.contents[1].role, 'model');
  assert.match(modelRequest.system_instruction.parts[0].text, /Пользователь выбрал русский язык/);
  assert.match(modelRequest.system_instruction.parts[0].text, /Последние выражения: think/);
});

test('Gemini fallback models share one upstream deadline', async () => {
  const signals = [];
  let calls = 0;
  const route = loadRoute({
    fetchImpl: async (_url, options) => {
      calls += 1;
      signals.push(options.signal);
      if (calls === 1) return new Response('temporarily unavailable', { status: 503 });
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        reply: 'Ладно, запасная модель всё-таки справилась.', expression: 'cool', theme: 'NONE',
      }) }] } }] });
    },
  });

  const response = await route.POST(makeRequest());
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  assert.equal(signals[0], signals[1]);
});

test('signed users do not share progress when the server profile preference is disabled', async () => {
  let modelRequest;
  const profile = { name: 'Бейбарыс', preferences: { shareProgressWithMika: false } };
  const snapshot = (data) => ({ exists: data !== undefined, data: () => data, get: (key) => key.split('.').reduce((value, part) => value?.[part], data) });
  const services = {
    auth: { verifyIdToken: async () => ({ uid: 'user-1', email_verified: true }) },
    db: {
      doc: (path) => ({
        get: async () => snapshot(path === 'data/users/user-1/profile' ? profile : undefined),
        collection: () => ({ doc: () => ({ get: async () => snapshot({ total: 900, count: 12 }) }) }),
      }),
    },
  };
  const route = loadRoute({
    services,
    fetchImpl: async (_url, options) => {
      modelRequest = JSON.parse(options.body);
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        reply: 'Хм, давай спокойно разберём следующий шаг.', expression: 'think', theme: 'NONE',
      }) }] } }] });
    },
  });

  const response = await route.POST(makeRequest({ shareProgressWithMika: true, authorization: 'Bearer signed-token' }));
  assert.equal(response.status, 200);
  const instruction = modelRequest.system_instruction.parts[0].text;
  assert.doesNotMatch(instruction, /totalXp|diaryEntries|focusSkill|practices/);
  assert.doesNotMatch(instruction, /localTime|19:30/);
});

test('Mika route rejects cross-origin calls before reaching the model provider', async () => {
  let called = false;
  const route = loadRoute({ fetchImpl: async () => { called = true; return Response.json({}); } });
  const request = makeRequest();
  const crossOrigin = new Request(request, { headers: { origin: 'https://attacker.test' } });
  const response = await route.POST(crossOrigin);
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'CROSS_ORIGIN_REQUEST' });
  assert.equal(called, false);
});

test('Mika route uses the localized fallback when no server API key is configured', async () => {
  let called = false;
  const route = loadRoute({ geminiKey: '', fetchImpl: async () => { called = true; return Response.json({}); } });
  const response = await route.POST(makeRequest({ language: 'kk' }));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(typeof result.reply, 'string');
  assert.ok(result.reply.length > 0);
  assert.ok(['idle', 'happy', 'proud', 'surprised', 'think', 'sleepy', 'cool', 'crazy', 'excited', 'mischievous', 'tease', 'angry', 'sad', 'worried', 'shy', 'embarrassed', 'tender'].includes(result.expression));
  assert.equal(result.theme, 'NONE');
  assert.deepEqual(Object.keys(result).sort(), ['expression', 'reply', 'theme']);
  assert.equal(called, false);
});

test('Mika route falls back safely when the provider returns malformed structured output', async () => {
  const route = loadRoute({
    fetchImpl: async () => Response.json({ candidates: [{ content: { parts: [{ text: '{bad json' }] } }] }),
  });
  const response = await route.POST(makeRequest());
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(typeof result.reply, 'string');
  assert.ok(result.reply.length > 0);
  assert.equal(result.theme, 'NONE');
  assert.deepEqual(Object.keys(result).sort(), ['expression', 'reply', 'theme']);
});
