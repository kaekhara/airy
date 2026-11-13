export const EXPRESSIONS = ['idle', 'happy', 'proud', 'surprised', 'think', 'sleepy', 'cool', 'crazy', 'excited', 'mischievous', 'tease', 'angry', 'sad', 'worried', 'shy', 'embarrassed', 'tender'] as const;

export type MikaExpression = typeof EXPRESSIONS[number];

export function inferMikaExpression(text: string): MikaExpression | null {
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
  if (/(?:не могу усидеть|вперёд!|вперед!|урааа|азарт|так захватывающе|хочу скорее начать)/.test(value)) return 'excited';
  if (/(?:ура|поздравля|молодец|круто|отлично|здорово|рада за тебя|получилось)/.test(value)) return 'happy';
  // Reserve the exaggerated sprite for explicit hyperbole. Punctuation and
  // ordinary praise (for example, "гениально!") should stay happy instead.
  if (/(?:абсолютно безум|это (?:просто )?безумие|с ума сойти|я сейчас взорвусь|мозг взрывается)/.test(value)) return 'crazy';
  if (/(?:хм|думаю|кажется|возможно|не уверен|давай разбер|интересно,)/.test(value)) return 'think';
  if (/(?:ладно|спокойно|ну что ж|пожалуй)/.test(value)) return 'cool';
  return null;
}
