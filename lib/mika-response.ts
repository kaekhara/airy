import { EXPRESSIONS, inferMikaExpression, type MikaExpression } from '@/lib/mika-persona';

export type MikaChatResponse = { reply: string; expression: MikaExpression; theme: 'DAY' | 'NIGHT' | 'NONE' };

const NEUTRAL_SERVICE_REPLY = /^(?:готово|сделано|записано|сохранено|хорошо|поняла|понятно|принято)[.!…]*$/i;

/** Validate untrusted model output and keep Mika's displayed emotion aligned with her own reply. */
export function normalizeMikaResponse(value: unknown, previousExpressions: MikaExpression[] = []): MikaChatResponse | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as { reply?: unknown; expression?: unknown; theme?: unknown };
  const reply = typeof candidate.reply === 'string' ? candidate.reply.trim() : '';
  if (!reply || reply.length > 800) return null;
  if (typeof candidate.expression !== 'string' || !EXPRESSIONS.includes(candidate.expression as MikaExpression)) return null;
  if (candidate.theme !== 'DAY' && candidate.theme !== 'NIGHT' && candidate.theme !== 'NONE') return null;

  const inferred = inferMikaExpression(reply);
  let expression = inferred || candidate.expression as MikaExpression;
  const idleAlreadyUsed = previousExpressions.filter((item) => item === 'idle').length >= 1;
  if (expression === 'idle' && (!NEUTRAL_SERVICE_REPLY.test(reply) || idleAlreadyUsed)) {
    expression = inferred || 'cool';
  }

  return { reply, expression, theme: candidate.theme };
}
