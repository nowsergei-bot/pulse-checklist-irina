/** Минимальные типы для Web Speech API (Chrome / Safari / Edge). */

import { isIos, isStandalone } from './pwaInstall';
import { requestMicrophoneInUserGesture } from './pwaMic';

export type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

export interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((ev: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((ev: SpeechRecognitionError) => void) | null;
  onend: (() => void) | null;
  onstart?: (() => void) | null;
}

export interface SpeechRecognitionResultEvent {
  resultIndex: number;
  results: {
    length: number;
    [i: number]: {
      isFinal: boolean;
      0: { transcript: string };
    };
  };
}

export interface SpeechRecognitionError {
  error: string;
  message?: string;
}

export function isIosDevice(): boolean {
  return isIos();
}

export function getSpeechRecognitionConstructor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSecureContext(): boolean {
  if (typeof window === 'undefined') return false;
  return window.isSecureContext === true;
}

/** Причина недоступности диктовки; null — API доступен. */
export function getSpeechDictationUnsupportedReason(): string | null {
  if (typeof window === 'undefined') {
    return 'Диктовка недоступна в этом окружении.';
  }
  if (!isSpeechRecognitionSecureContext()) {
    return 'Диктовка работает только по защищённому соединению (HTTPS).';
  }
  if (effectiveDictationUsesServerStt()) {
    if (!navigator?.mediaDevices?.getUserMedia) {
      return 'Запись с микрофона недоступна в этом браузере.';
    }
    if (typeof MediaRecorder === 'undefined') {
      return 'Запись аудио недоступна. Обновите iOS или откройте форму в Safari.';
    }
    return null;
  }
  if (!getSpeechRecognitionConstructor()) {
    return 'Ваш браузер не поддерживает голосовой ввод. Откройте форму в Chrome, Safari или Edge.';
  }
  return null;
}

export function isSpeechDictationSupported(): boolean {
  return getSpeechDictationUnsupportedReason() == null;
}

/** На iPhone Web Speech ненадёжен (PWA и Safari) — запись + Yandex STT на сервере. */
export function prefersServerDictationFallback(): boolean {
  return isIosDevice();
}

export function configureSpeechRecognition(recognition: SpeechRecognitionInstance, lang: string): void {
  recognition.lang = lang;
  recognition.interimResults = true;
  // Desktop/Android: push-to-talk. iOS не использует Web Speech в проде (см. prefersServerDictationFallback).
  recognition.continuous = !isIosDevice();
}

/** Для тестов/отладки: принудительно Web Speech на iOS (нестабильно). */
export function forceWebSpeechOnIosForDebug(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem('pulse_dictation_force_webspeech') === '1';
  } catch {
    return false;
  }
}

export function effectiveDictationUsesServerStt(): boolean {
  return prefersServerDictationFallback() && !forceWebSpeechOnIosForDebug();
}

export function humanizeSpeechRecognitionError(error: string): string {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      if (isStandalone() && isIos()) {
        return (
          'Микрофон заблокирован для приложения «Пульс» с главного экрана. ' +
          'Настройки iPhone → «Пульс» → Микрофон → включить. ' +
          'Либо откройте форму в Safari и разрешите микрофон.'
        );
      }
      if (isStandalone()) {
        return (
          'Микрофон заблокирован для приложения с главного экрана. ' +
          'Разрешите доступ в настройках системы или откройте форму в обычном браузере.'
        );
      }
      return 'Разрешите доступ к микрофону в настройках браузера и нажмите кнопку микрофона снова.';
    case 'audio-capture':
      return 'Не удалось получить звук с микрофона. Проверьте, что микрофон не занят другим приложением.';
    case 'network':
      return 'Для распознавания речи нужен интернет. Проверьте подключение и попробуйте снова.';
    case 'language-not-supported':
      return 'Распознавание русского языка недоступно в этом браузере.';
    default:
      return 'Не удалось распознать речь. Попробуйте ещё раз.';
  }
}

/**
 * Запуск getUserMedia в том же синхронном обработчике клика (до await).
 * На iOS PWA иначе SpeechRecognition получает not-allowed / audio-capture.
 */
export function primeMicrophoneInUserGesture(): Promise<MediaStream> {
  return requestMicrophoneInUserGesture();
}

let sharedRecognition: SpeechRecognitionInstance | null = null;

/** Сбросить singleton (iOS: новый экземпляр на каждую сессию — иначе start() падает). */
export function disposeSharedSpeechRecognition(): void {
  if (!sharedRecognition) return;
  try {
    sharedRecognition.abort();
  } catch {
    /* ignore */
  }
  sharedRecognition.onresult = null;
  sharedRecognition.onerror = null;
  sharedRecognition.onend = null;
  sharedRecognition.onstart = null;
  sharedRecognition = null;
}

/**
 * Подготовить SpeechRecognition к новой сессии диктовки.
 * Вызывать синхронно в onClick до recognition.start().
 */
export function beginDictationSession(lang: string): SpeechRecognitionInstance | null {
  const Ctor = getSpeechRecognitionConstructor();
  if (!Ctor) return null;

  if (sharedRecognition) {
    try {
      sharedRecognition.abort();
    } catch {
      /* ignore */
    }
    if (isIosDevice()) {
      sharedRecognition.onresult = null;
      sharedRecognition.onerror = null;
      sharedRecognition.onend = null;
      sharedRecognition.onstart = null;
      sharedRecognition = null;
    }
  }

  if (!sharedRecognition) {
    sharedRecognition = new Ctor();
  }
  configureSpeechRecognition(sharedRecognition, lang);
  return sharedRecognition;
}

/** Запуск с повтором после abort — singleton часто «залипает» в started на iOS. */
export function startSpeechRecognition(recognition: SpeechRecognitionInstance): void {
  try {
    recognition.start();
    return;
  } catch {
    try {
      recognition.abort();
    } catch {
      /* ignore */
    }
  }
  recognition.start();
}

export function getOrCreateSharedSpeechRecognition(lang: string): SpeechRecognitionInstance | null {
  return beginDictationSession(lang);
}

/** Пауза между финальными сегментами распознавания → уровень пунктуации. */
export type DictationPauseLevel = 'none' | 'comma' | 'sentence' | 'paragraph';

/** Пороги (мс) между финальными фразами Web Speech API (wall-clock между onresult). */
export const DICTATION_PAUSE_COMMA_MS = 550;
export const DICTATION_PAUSE_SENTENCE_MS = 1300;
export const DICTATION_PAUSE_PARAGRAPH_MS = 2600;

export function pauseLevelFromGapMs(gapMs: number | null | undefined): DictationPauseLevel {
  if (gapMs == null || !Number.isFinite(gapMs) || gapMs < DICTATION_PAUSE_COMMA_MS) return 'none';
  if (gapMs < DICTATION_PAUSE_SENTENCE_MS) return 'comma';
  if (gapMs < DICTATION_PAUSE_PARAGRAPH_MS) return 'sentence';
  return 'paragraph';
}

export type DictationAppendState = {
  lastFinalAt: number | null;
};

export function createDictationAppendState(): DictationAppendState {
  return { lastFinalAt: null };
}

export function resetDictationAppendState(state: DictationAppendState): void {
  state.lastFinalAt = null;
}

function capitalizeFirstCharRu(text: string): string {
  const m = text.match(/^(\s*)(\S)/);
  if (!m) return text;
  const [, lead, ch] = m;
  const upper = ch.toLocaleUpperCase('ru-RU');
  if (upper === ch) return text;
  return lead + upper + text.slice(lead.length + 1);
}

function endsWithSentencePunct(s: string): boolean {
  return /[.!?…]["»”')\]]*$/.test(s.trimEnd());
}

function endsWithClausePunct(s: string): boolean {
  return /[,;:]["»”')\]]*$/.test(s.trimEnd());
}

/** Разделитель перед новым фрагментом с учётом паузы. */
export function dictationSeparator(
  current: string,
  pause: DictationPauseLevel,
  multiline: boolean,
): string {
  const cur = String(current);
  const trimmed = cur.trimEnd();
  if (!trimmed) return '';

  switch (pause) {
    case 'none':
      return /\s$/.test(cur) ? '' : ' ';
    case 'comma':
      if (endsWithSentencePunct(trimmed) || endsWithClausePunct(trimmed)) return ' ';
      return ', ';
    case 'sentence':
      if (endsWithSentencePunct(trimmed)) return ' ';
      if (endsWithClausePunct(trimmed)) return ' ';
      return '. ';
    case 'paragraph':
      if (multiline) {
        if (/\n\s*$/.test(cur)) return '';
        return '\n\n';
      }
      if (endsWithSentencePunct(trimmed)) return ' ';
      return '. ';
    default:
      return ' ';
  }
}

/**
 * Добавляет финальный фрагмент диктовки с пунктуацией по паузе между сегментами.
 */
export function appendDictationTranscript(
  current: string,
  chunk: string,
  pause: DictationPauseLevel,
  options?: { multiline?: boolean },
): string {
  const t = chunk.trim();
  if (!t) return String(current);

  const multiline = options?.multiline !== false;
  const cur = String(current);
  if (!cur.trim()) return capitalizeFirstCharRu(t);

  const sep = dictationSeparator(cur, pause, multiline);
  const needsCap = pause === 'sentence' || pause === 'paragraph';
  const piece = needsCap ? capitalizeFirstCharRu(t) : t;
  return cur + sep + piece;
}

/** Зафиксировать время финального сегмента; вернуть уровень паузы от предыдущего. */
export function dictationPauseBeforeFinal(
  state: DictationAppendState,
  now: number = Date.now(),
): DictationPauseLevel {
  const gap = state.lastFinalAt == null ? null : now - state.lastFinalAt;
  state.lastFinalAt = now;
  return pauseLevelFromGapMs(gap);
}

const RU_WORD = '[\\wа-яёА-ЯЁ]+';

/** Вводные слова и обороты — запятая после фразы в начале предложения. */
const RU_INTRO_PHRASES = [
  'тем не менее',
  'кроме того',
  'на самом деле',
  'с одной стороны',
  'с другой стороны',
  'без сомнения',
  'в первую очередь',
  'кстати говоря',
  'таким образом',
  'в частности',
  'прежде всего',
  'в то время как',
  'в общем',
  'в целом',
  'в итоге',
  'в результате',
  'по сути',
  'по факту',
  'во-первых',
  'во-вторых',
  'следовательно',
  'безусловно',
  'например',
  'конечно',
  'возможно',
  'вероятно',
  'однако',
  'впрочем',
  'кстати',
  'итак',
  'значит',
].sort((a, b) => b.length - a.length);

/** Союзы и обороты — запятая перед ними между частями сложного предложения. */
const RU_COMMA_BEFORE = [
  'тем не менее',
  'к тому же',
  'кроме того',
  'причём',
  'причем',
  'однако',
  'впрочем',
  'зато',
  'но',
].sort((a, b) => b.length - a.length);

const RU_LIST_PREPOSITIONS = new Set([
  'в',
  'во',
  'на',
  'с',
  'со',
  'к',
  'ко',
  'по',
  'за',
  'из',
  'от',
  'до',
  'для',
  'при',
  'о',
  'об',
  'обо',
  'у',
  'без',
  'над',
  'под',
  'между',
  'через',
  'про',
  'при',
]);

const RU_THOUGHT_VERBS =
  'думаю|считаю|полагаю|знаю|понимаю|надеюсь|боюсь|уверен|уверена|сказал|сказала|сказали|ответил|ответила|заметил|заметила|написал|написала|слышу|вижу|чувствую|помню|забыл|забыла|понял|поняла|услышал|услышала';

const RU_PURPOSE_VERBS = 'хочу|хотел|хотела|хотят|нужно|надо|стоит|стараюсь|старался|старалась';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function dedupeCommas(text: string): string {
  return text
    .replace(/,\s*,+/g, ', ')
    .replace(/\s+,/g, ',')
    .replace(/,\s{2,}/g, ', ');
}

/** Запятые по типовым правилам русской пунктуации для диктовки без LLM. */
function insertRussianDictationCommas(text: string): string {
  let s = text;

  const introAlt = RU_INTRO_PHRASES.map(escapeRegExp).join('|');
  s = s.replace(
    new RegExp(`(^|[.!?…]["»”']?\\s+)(${introAlt})(\\s+)(?![,;:])`, 'giu'),
    '$1$2,$3',
  );

  const beforeAlt = RU_COMMA_BEFORE.map(escapeRegExp).join('|');
  s = s.replace(new RegExp(`(?<![,;:])(\\s+)(${beforeAlt})(\\s+)`, 'giu'), ', $2$3');

  s = s.replace(
    new RegExp(`(?<![,;:])(\\b(?:${RU_THOUGHT_VERBS}))\\s+что\\s+`, 'giu'),
    '$1, что ',
  );
  s = s.replace(
    new RegExp(`(?<![,;:])(\\b(?:${RU_PURPOSE_VERBS}))\\s+чтобы\\s+`, 'giu'),
    '$1, чтобы ',
  );

  s = s.replace(
    new RegExp(`\\b(${RU_WORD}(?:\\s+${RU_WORD})+)\\s+(и|или)\\s+(${RU_WORD})\\b`, 'giu'),
    (full, before: string, conj: string, last: string) => {
      const parts = before.split(/\s+/);
      if (parts.length < 2) return full;
      if (parts.some((p) => RU_LIST_PREPOSITIONS.has(p.toLowerCase()))) return full;
      if (parts.some((p) => p.length <= 1)) return full;
      return `${parts.join(', ')} ${conj} ${last}`;
    },
  );

  return dedupeCommas(s);
}

/** Обрывы диктовки: незавершённые союзы и предлоги в конце фразы. */
const RU_DANGLING_TAIL = [
  ' потому что',
  ' так как',
  ' тем не менее',
  ' с одной стороны',
  ' с другой стороны',
  ' в то время как',
  ' который',
  ' которая',
  ' которое',
  ' которые',
  ' чтобы',
  ' когда',
  ' если',
  ' хотя',
  ' пока',
  ' после',
  ' перед',
  ' между',
  ' через',
  ' потому',
  ' поэтому',
  ' однако',
  ' например',
  ' значит',
  ' что',
  ' как',
  ' и',
  ' но',
  ' а',
  ' или',
  ' в',
  ' на',
  ' с',
  ' к',
  ' у',
  ' о',
].sort((a, b) => b.length - a.length);

/** Повторы слов и коротких фраз — типичный артефакт диктовки. */
function dedupeDictationRepeats(text: string): string {
  let s = text;
  s = s.replace(/\b([\wа-яёА-ЯЁ]{2,})(?:\s+\1\b)+/giu, '$1');
  s = s.replace(
    /\b((?:[\wа-яёА-ЯЁ]+\s+){1,3}[\wа-яёА-ЯЁ]+)(?:\s+\1\b)+/giu,
    '$1',
  );
  return s;
}

/** Убрать обрыв в конце и явно неполное слово (1–2 символа). */
function trimDictationTailArtifacts(text: string): string {
  let s = text.trimEnd();
  if (!s) return s;

  if (/\s+\S{1,2}$/u.test(s) && !/\s+(я|в|к|у|о|и|а|он|она)$/iu.test(s)) {
    s = s.replace(/\s+\S{1,2}$/u, '');
  }

  const lower = s.toLocaleLowerCase('ru-RU');
  for (const tail of RU_DANGLING_TAIL) {
    if (lower.endsWith(tail)) {
      s = s.slice(0, s.length - tail.length).trimEnd();
      break;
    }
  }

  return s;
}

/** Заглавная буква после конца предложения или перевода строки. */
function capitalizeAfterSentenceBoundaries(text: string): string {
  return text
    .replace(/([.!?…]["»”')\]]*)(\s+)(\S)/g, (_full, punct: string, ws: string, ch: string) => {
      const up = ch.toLocaleUpperCase('ru-RU');
      return punct + ws + (up === ch ? ch : up);
    })
    .replace(/(\n+)(\S)/g, (_full, breaks: string, ch: string) => {
      const up = ch.toLocaleUpperCase('ru-RU');
      return breaks + (up === ch ? ch : up);
    });
}

/** Убрать заикания диктовки: повтор одного и того же слова подряд. */
function dedupeConsecutiveWords(text: string): string {
  const parts = text.split(/(\s+)/);
  const out: string[] = [];
  let prevWord = '';
  for (const part of parts) {
    if (/^\s+$/.test(part)) {
      out.push(part);
      continue;
    }
    const word = part.toLowerCase();
    if (word && word === prevWord) continue;
    out.push(part);
    prevWord = word;
  }
  return out.join('');
}

/** Обрезать «висящие» союзы/частицы в конце незаконченной фразы. */
function trimDanglingTailWords(text: string): string {
  const dangling = new Set([
    'и',
    'а',
    'но',
    'что',
    'чтобы',
    'когда',
    'если',
    'как',
    'то',
    'это',
    'в',
    'на',
    'с',
    'к',
    'у',
    'по',
    'для',
    'от',
    'до',
    'из',
    'при',
    'или',
    'ли',
    'же',
    'бы',
  ]);
  let s = text.trimEnd();
  for (let i = 0; i < 4; i++) {
    const m = s.match(/^(.*?)(?:,\s*)?(\S+)\s*$/u);
    if (!m) break;
    const [, head, tail] = m;
    if (!dangling.has(tail.toLowerCase())) break;
    s = head.trimEnd().replace(/,\s*$/, '');
    if (!s) break;
  }
  return s;
}

/** Закрыть незакрытые кавычки «…» и скобки из артефактов диктовки. */
function balanceDictationDelimiters(text: string): string {
  let s = text;
  const openGuillemets = (s.match(/«/g) || []).length;
  const closeGuillemets = (s.match(/»/g) || []).length;
  if (openGuillemets > closeGuillemets) {
    s += '»'.repeat(openGuillemets - closeGuillemets);
  }
  const openParen = (s.match(/\(/g) || []).length;
  const closeParen = (s.match(/\)/g) || []).length;
  if (openParen > closeParen) {
    s += ')'.repeat(openParen - closeParen);
  }
  return s;
}

/**
 * Лёгкая логическая достройка диктовки без сети: убрать повторы, обрезать хвост-союзы,
 * закрыть кавычки/скобки.
 */
export function completeDictationLogic(text: string): string {
  let s = String(text).trim();
  if (!s) return '';
  s = dedupeDictationRepeats(s);
  s = dedupeConsecutiveWords(s);
  s = trimDictationTailArtifacts(s);
  s = trimDanglingTailWords(s);
  s = balanceDictationDelimiters(s);
  return s.trim();
}

/**
 * Локальная правка диктовки: пробелы, запятые (вводные, союзы, перечисления),
 * пунктуация, заглавные после предложений, лёгкая логическая достройка. Не вызывает сеть.
 */
export function polishDictatedRussian(text: string, options?: { multiline?: boolean }): string {
  const multiline = options?.multiline !== false;
  let s = String(text).replace(/\r\n/g, '\n').trim();
  if (!s) return '';

  if (!multiline) {
    s = s.replace(/\s*\n+\s*/g, ' ');
  } else {
    s = s.replace(/\n{3,}/g, '\n\n');
  }

  s = s.replace(/[^\S\n]+/g, ' ');
  s = completeDictationLogic(s);
  s = s.replace(/\s+([,.!?…;:])/g, '$1');
  s = s.replace(/([,.!?…;:])(?=[^\s\n])/g, '$1 ');
  s = s.replace(/([,.!?…])\s*([,.!?…])+/g, '$1');
  s = s.replace(/,\s*\./g, '.');
  s = insertRussianDictationCommas(s);
  s = capitalizeAfterSentenceBoundaries(s);
  s = capitalizeFirstCharRu(s);

  const end = s.trimEnd();
  if (end && !/[.!?…]["»”')\]]*$/.test(end)) {
    s = end + '.';
  }

  if (!multiline) {
    s = s.replace(/\s{2,}/g, ' ');
  }

  return s.trim();
}
