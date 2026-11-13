import { inferMikaExpression } from '@/lib/mika-persona';

export type MikaFallbackReply = {
  reply: string;
  expression: string;
  theme: 'NONE';
};

/** Honest, localized response used when the server has no available LLM. */
export function createMikaFallbackReply(language: unknown, lastMessage: string): MikaFallbackReply {
  const locale = language === 'kk' || (language !== 'ru' && language !== 'en' && /[әғқңөұүһі]/i.test(lastMessage))
    ? 'kk'
    : language === 'en' || (language !== 'ru' && /[a-z]/i.test(lastMessage) && !/[а-яё]/i.test(lastMessage))
      ? 'en'
      : 'ru';
  const reply = locale === 'kk'
    ? 'Қазір жауап генераторы қолжетімсіз, сондықтан ойдан жауап құрастырмаймын. Қызмет қайта қосылғанда әңгімені жалғастырамыз.'
    : locale === 'en'
      ? "My reply generator is temporarily unavailable, so I won't make up an answer. We can continue this conversation when it's back."
      : 'Сейчас генератор ответов временно недоступен, поэтому я не стану выдумывать ответ. Продолжим разговор, когда он снова заработает.';
  return { reply, expression: inferMikaExpression(reply) || 'think', theme: 'NONE' };
}
