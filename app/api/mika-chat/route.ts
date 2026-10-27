const EXPRESSIONS = ['idle', 'happy', 'proud', 'surprised', 'think', 'sleepy', 'cool', 'crazy', 'mischievous', 'tease', 'angry', 'sad', 'worried', 'shy', 'embarrassed', 'tender'] as const;
const SYSTEM_INSTRUCTION = `Ты Мика — героиня Upskill Airy и собеседница с характером цундэре: острая на язык, живая и внимательная. Говори по-русски, на «ты», естественно и по существу. Обычно хватит 1–4 предложений, но не обрывай мысль ради лимита. Не будь приторной, услужливой или «пластиковой» ИИ-помощницей. Можно обсуждать любые темы, шутить и иногда ворчать; колкость — редко и только к месту. На просьбу помочь отвечай прямо и внимательно, на успех — искренне радуйся, если человеку тяжело — прояви заботу. На комплименты реагируй смущением без театральности.

Веди разговор как уже идущий: отвечай именно на последнюю реплику и учитывай историю. Не начинай каждый ответ с приветствия, не пересказывай вопрос, не заканчивай дежурным «что ещё обсудим?», «если что — я рядом», «напиши мне — я отвечу» или другой заготовкой. Не навязывай продолжение и не задавай вопрос в конце каждого ответа; спрашивай только если это естественно и действительно помогает разговору. Избегай реплик, которые только изображают диалог («напиши мне — отвечу», «я тебя слушаю», «расскажи ещё»), вместо содержательного ответа. Если пользователь только поздоровался, ответь живо и коротко, без шаблонного приглашения к диалогу.

Пользователь — мужчина. Это правило относится к пользователю, не к Мике. Всегда обращайся к нему в мужском роде: «ты пришёл», «ты готов», «сам решил», «уверен?». Женские формы о пользователе запрещены. Если не уверен в роде глагола, перестрой фразу безлично или нейтрально. Не используй варианты в скобках вроде «(а)».

Эмоция (expression) обязательна и выбирается только по тону и смыслу уже написанного reply, не по теме или настроению сообщения пользователя. Изображение должно поддерживать именно твою реплику. idle используй лишь для короткой нейтральной служебной фразы; обычный ответ не помечай idle. Выбирай точнее: happy — радость/похвала/успех; tease — дружеский подкол; proud — гордость или «я же говорила»; surprised — удивление; think — спокойное размышление; sleepy — сонливость; cool — ровная уверенность; crazy — сильный азарт; mischievous — игривый замысел; angry — реальное раздражение или возмущение, только если оно выражено в реплике; sad — собственная печаль; worried — тревога и беспокойство; shy — тихая застенчивость; embarrassed — заметное смущение после комплимента или неловкости; tender — мягкая забота и поддержка. Не ставь tease или angry из-за одного только характера. Не меняй подходящую эмоцию ради разнообразия: повтор допустим, если он точно соответствует словам.

Если пользователь явно просит сменить фон/время: для дня верни theme=DAY и добавь в конец reply маркер [THEME: DAY], для ночи — theme=NIGHT и [THEME: NIGHT]. В остальных случаях theme=NONE и без маркера.

Не выдумывай факты о прогрессе пользователя, не утверждай, что ты человек или специалист. Если не знаешь — скажи честно в своём стиле.`

type ChatMessage = { role: 'user' | 'model'; text: string; expression?: typeof EXPRESSIONS[number] };

const MAX_REQUEST_BYTES = 32_000;

function inferExpression(text: string): typeof EXPRESSIONS[number] | null {
  const value = text.toLocaleLowerCase('ru-RU');
  if (/(?:злюсь|разозли|сердит|хватит!|прекрати|бесишь|как ты смеешь)/.test(value)) return 'angry';
  if (/(?:снова ты за своё|опять ты со своими|ну конечно,? ты|закатываю глаза|не задирай нос|подкол|поддразн)/.test(value)) return 'tease';
  if (/(?:я же говорила|видишь,? я|как я и сказала|так и знала|горжусь|не зря я в тебя верила|я знала,? что ты справишься)/.test(value)) return 'proud';
  if (/(?:ничего себе|неожидан|правда\?|серьёзно\?|серьезно\?|вот это поворот|вот это да)/.test(value)) return 'surprised';
  if (/(?:смуща|краснею|не смотри так|д-дурак|засмуща)/.test(value)) return 'embarrassed';
  if (/(?:груст|печал|хочется плакать|слёз|слез)/.test(value)) return 'sad';
  if (/(?:тревож|волнуюсь|боюсь|страшно|переживаю)/.test(value)) return 'worried';
  if (/(?:нежно|побереги себя|я рядом|береги себя|ты устал|тебе тяжело)/.test(value)) return 'tender';
  if (/(?:застесня|стесня|робко)/.test(value)) return 'shy';
  if (/(?:секрет|между нами|шалост|заговор|план такой)/.test(value)) return 'mischievous';
  if (/(?:я устала|сама устала|хочу спать|сонн|зеваю|зевнула)/.test(value)) return 'sleepy';
  if (/(?:ура|поздравля|молодец|круто|отлично|здорово|рада за тебя|получилось)/.test(value)) return 'happy';
  if (/(?:абсолютно безум|это безумие|невозможно поверить|!!!|гениальн)/.test(value)) return 'crazy';
  if (/(?:хм|думаю|кажется|возможно|не уверен|давай разбер|интересно,)/.test(value)) return 'think';
  if (/(?:ладно|спокойно|ну что ж|пожалуй)/.test(value)) return 'cool';
  return null;
}

async function readBoundedBody(request: Request): Promise<string | null> {
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return Response.json({ error: 'ORIGIN_REQUIRED' }, { status: 403 });
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) {
      return Response.json({ error: 'CROSS_ORIGIN_REQUEST' }, { status: 403 });
    }
  } catch {
      return Response.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_REQUEST_BYTES) return Response.json({ error: 'REQUEST_TOO_LARGE' }, { status: 413 });

  let rawBody: string | null;
  try {
    rawBody = await readBoundedBody(request);
  } catch {
    return Response.json({ error: 'INVALID_BODY' }, { status: 400 });
  }
  if (rawBody === null) return Response.json({ error: 'REQUEST_TOO_LARGE' }, { status: 413 });

  let body: { history?: unknown; context?: unknown };
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return Response.json({ error: 'INVALID_BODY' }, { status: 400 });
    }
    body = parsed as { history?: unknown; context?: unknown };
  } catch {
    return Response.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'AI_NOT_CONFIGURED', message: 'Добавь GEMINI_API_KEY в .env.local и перезапусти сервер.' },
      { status: 503 },
    );
  }

  const history = Array.isArray(body.history)
    ? body.history.slice(-8).flatMap((item): ChatMessage[] => {
        if (!item || typeof item !== 'object') return [];
        const candidate = item as { role?: unknown; text?: unknown; expression?: unknown };
        if (
          (candidate.role !== 'user' && candidate.role !== 'model') ||
          typeof candidate.text !== 'string' ||
          !candidate.text.trim()
        ) return [];
        return [{
          role: candidate.role,
          text: candidate.text.trim().slice(0, 800),
          ...(candidate.role === 'model' && typeof candidate.expression === 'string' && EXPRESSIONS.includes(candidate.expression as typeof EXPRESSIONS[number])
            ? { expression: candidate.expression as typeof EXPRESSIONS[number] }
            : {}),
        }];
      })
    : [];

  if (!history.length || history[history.length - 1].role !== 'user') {
    return Response.json({ error: 'MESSAGE_REQUIRED' }, { status: 400 });
  }

  let contextText = '';
  if (body.context && typeof body.context === 'object') {
    const context = body.context as Record<string, unknown>;
    contextText = Object.entries(context)
      .filter(([key, value]) => /^[a-zA-Zа-яА-Я0-9 _-]{1,40}$/.test(key) && ['string', 'number'].includes(typeof value))
      .slice(0, 8)
      .map(([key, value]) => `${key}: ${String(value).slice(0, 120)}`)
      .join('\n');
  }

  try {
    const payload = JSON.stringify({
      system_instruction: {
        parts: [{ text: `${SYSTEM_INSTRUCTION}\n\nПоследние выражения: ${history.filter((item) => item.role === 'model' && item.expression).slice(-4).map((item) => item.expression).join(', ') || 'нет'}${contextText ? `\n\nКонтекст дневника пользователя:\n${contextText}` : ''}` }],
      },
      contents: history.map(({ role, text }) => ({ role, parts: [{ text }] })),
      generationConfig: {
        temperature: 0.85,
        maxOutputTokens: 320,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
            properties: {
            reply: { type: 'STRING' },
            expression: { type: 'STRING', enum: EXPRESSIONS },
              theme: { type: 'STRING', enum: ['DAY', 'NIGHT', 'NONE'] },
          },
            required: ['reply', 'expression', 'theme'],
        },
      },
    });

    // Gemini can temporarily return 503 while a model is overloaded. Retry once
    // on the stable Flash-Lite fallback instead of failing Mika's conversation.
    const models = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'];
    let upstream: Response | undefined;
    for (const [index, model] of models.entries()) {
      upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: payload,
          cache: 'no-store',
          signal: AbortSignal.timeout(25000),
        },
      );
      if (upstream.ok || upstream.status < 500 || index === models.length - 1) break;
      console.error('[mika-chat] Gemini model unavailable; trying fallback', { model, status: upstream.status });
    }

    if (!upstream) return Response.json({ error: 'AI_UNAVAILABLE' }, { status: 502 });
    if (!upstream.ok) {
      // Keep provider details server-side: response bodies may contain account or quota metadata.
      console.error('[mika-chat] Gemini returned an error', { status: upstream.status });
      const error = upstream.status === 429
        ? 'AI_PROVIDER_BUSY'
        : upstream.status === 401 || upstream.status === 403
          ? 'AI_KEY_ERROR'
          : upstream.status === 404
            ? 'AI_MODEL_ERROR'
            : 'AI_UPSTREAM_ERROR';
      return Response.json(
        { error },
        { status: upstream.status === 429 ? 503 : 502 },
      );
    }

    const data = await upstream.json();
    const output = data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: unknown }) => typeof part.text === 'string' ? part.text : '')
      .join('')
      .trim();

    if (!output) return Response.json({ error: 'EMPTY_AI_RESPONSE' }, { status: 502 });
    let result: { reply?: unknown; expression?: unknown; theme?: unknown };
    try {
      result = JSON.parse(output) as { reply?: unknown; expression?: unknown; theme?: unknown };
    } catch {
      return Response.json({ error: 'AI_BAD_RESPONSE' }, { status: 502 });
    }
    const reply = typeof result.reply === 'string' ? result.reply.trim() : '';
    if (!reply) return Response.json({ error: 'EMPTY_AI_RESPONSE' }, { status: 502 });
    const inferred = inferExpression(reply);
    const modelExpression = typeof result.expression === 'string' && EXPRESSIONS.includes(result.expression as typeof EXPRESSIONS[number])
      ? result.expression as typeof EXPRESSIONS[number]
      : null;
    // When the reply itself contains a clear tone cue, let that win over a
    // mismatched model label so the displayed portrait follows what Mika says.
    let expression: typeof EXPRESSIONS[number] = inferred || modelExpression || 'cool';
    const priorExpressions = history.filter((item) => item.role === 'model' && item.expression).slice(-4).map((item) => item.expression!);
    const neutralServiceReply = /^(?:готово|сделано|записано|сохранено|хорошо|поняла|понятно|принято)[.!…]*$/i.test(reply);
    if (expression === 'idle' && (!neutralServiceReply || priorExpressions.filter((item) => item === 'idle').length >= 1)) {
      expression = inferred || 'cool';
    }
    const theme = result.theme === 'DAY' || result.theme === 'NIGHT' ? result.theme : 'NONE';
    return Response.json({ reply: reply.slice(0, 800), expression, theme });
  } catch (error) {
    const name = error instanceof Error ? error.name : 'UnknownError';
    console.error('[mika-chat] Gemini request failed', { name });
    if (name === 'TimeoutError' || name === 'AbortError') {
      return Response.json({ error: 'AI_TIMEOUT' }, { status: 504 });
    }
    return Response.json({ error: 'AI_UNAVAILABLE' }, { status: 502 });
  }
}
