/**
 * Единая модель закрытого контура Пульса (Qwen 2.5 14B Instruct).
 * Переопределение: OPENAI_MODEL в окружении функции (совместимый chat/completions API).
 *
 * Открытый контур («ИИ из роутера»): OpenRouter через AUDIO_PROTOCOL_LLM_* / OPENROUTER_API_KEY,
 * когда OPENAI_BASE_URL занят закрытым ai.primakov.school. Чат YandexGPT выключен.
 */

function defaultChatModel() {
  const m = String(process.env.OPENAI_MODEL || '').trim();
  return m || 'qwen2.5-14b-instruct';
}

/** Префикс системных промптов под инструктивную Qwen в установке Пульса. */
function pulseQwenSystemPrefix() {
  return (
    'Ты работаешь как Qwen 2.5 (14B Instruct) в закрытой установке продукта «Пульс». ' +
    'Следуй формату ответа из инструкции буквально; для JSON выводи только объект без markdown и без текста до или после.\n\n'
  );
}

function augmentPulseSystemPrompt(systemBody) {
  return pulseQwenSystemPrefix() + String(systemBody || '');
}

/** Опции вызова chat/completions для закрытого контура Пульса (единая модель, OpenAI-совместимый endpoint). */
function pulseClosedLoopChatOpts(extra = {}) {
  const base = {
    model: defaultChatModel(),
    providerPreference: 'openai',
  };
  return typeof extra === 'object' && extra ? { ...extra, ...base } : base;
}

function isPulsePrimakovBaseUrlEnv() {
  return String(process.env.OPENAI_BASE_URL || '').toLowerCase().includes('primakov.school');
}

function hasGigaChatCredsEnv() {
  return Boolean(
    String(process.env.GIGACHAT_CREDENTIALS || process.env.GIGACHAT_AUTHORIZATION_KEY || '').trim() ||
      (String(process.env.GIGACHAT_CLIENT_ID || '').trim() &&
        String(process.env.GIGACHAT_CLIENT_SECRET || '').trim()),
  );
}

/** Каталог Cloud.ru: vendor/name, не голое GigaChat-2-Max. */
const CLOUD_RU_FM_DEFAULT_MODEL = 'GigaChat/GigaChat-2-Max';

function isCloudRuFoundationModelsUrl(baseUrl) {
  return String(baseUrl || '')
    .toLowerCase()
    .includes('foundation-models.api.cloud.ru');
}

function hasCloudRuFmCredsEnv(env = process.env) {
  return Boolean(String(env.CLOUD_RU_FM_API_KEY || '').trim());
}

/** Bare GigaChat-2-Max → 404. Каталог и /v1/models: GigaChat/GigaChat-2-Max. */
function normalizeCloudRuFmModel(raw) {
  const s = String(raw || '').trim();
  if (!s) return CLOUD_RU_FM_DEFAULT_MODEL;
  const lower = s.toLowerCase();
  if (lower === 'gigachat-2-max' || lower === 'gigachat/gigachat-2-max') {
    return CLOUD_RU_FM_DEFAULT_MODEL;
  }
  return s;
}

function cloudRuFmCircuitConfig(env = process.env) {
  const apiKey = String(env.CLOUD_RU_FM_API_KEY || '').trim();
  if (!apiKey) return null;
  const baseUrl = String(env.CLOUD_RU_FM_BASE_URL || 'https://foundation-models.api.cloud.ru/v1')
    .trim()
    .replace(/\/$/, '');
  const model = normalizeCloudRuFmModel(env.CLOUD_RU_FM_MODEL);
  return { baseUrl, apiKey, model };
}

function cloudRuFmChatOpts(extra = {}, env = process.env) {
  const cfg = cloudRuFmCircuitConfig(env);
  if (!cfg) return null;
  const extraObj = typeof extra === 'object' && extra ? extra : {};
  return {
    ...extraObj,
    providerPreference: 'openai',
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
    model: cfg.model,
    singleModel: true,
    // OpenAPI Cloud.ru + OpenAI SDK: Authorization Bearer, не Yandex Api-Key.
    authScheme: extraObj.authScheme || 'bearer',
  };
}

/**
 * Дешёвый облачный chat/completions: DeepSeek напрямую, иначе Groq.
 * Не ходит в OpenRouter (тот даёт 502). Ключи: DEEPSEEK_API_KEY / GROQ_API_KEY / CHEAP_LLM_*.
 */
function cheapCloudCircuitConfig() {
  const cheapKey = String(process.env.CHEAP_LLM_API_KEY || '').trim();
  const deepseekKey = String(process.env.DEEPSEEK_API_KEY || '').trim();
  const groqKey = String(process.env.GROQ_API_KEY || '').trim();
  const explicitBase = String(process.env.CHEAP_LLM_BASE_URL || '').trim().replace(/\/$/, '');
  const explicitModel = String(process.env.CHEAP_LLM_MODEL || '').trim();

  if (cheapKey && explicitBase) {
    return {
      baseUrl: explicitBase,
      apiKey: cheapKey,
      model: explicitModel || 'deepseek-chat',
    };
  }
  if (deepseekKey || (cheapKey && (!explicitBase || /deepseek/i.test(explicitBase)))) {
    return {
      baseUrl: explicitBase || 'https://api.deepseek.com',
      apiKey: deepseekKey || cheapKey,
      model: explicitModel || 'deepseek-chat',
    };
  }
  if (groqKey) {
    return {
      baseUrl: explicitBase || 'https://api.groq.com/openai/v1',
      apiKey: groqKey,
      model: explicitModel || 'llama-3.1-8b-instant',
    };
  }
  return null;
}

function gigaChatChatOpts(extra = {}) {
  const cloud = cloudRuFmChatOpts(extra);
  if (cloud) return cloud;
  if (!hasGigaChatCredsEnv()) return null;
  const extraObj = typeof extra === 'object' && extra ? extra : {};
  return {
    ...extraObj,
    providerPreference: 'gigachat',
  };
}

/** PERS = 1 поток. Cloud.ru / CORP/B2B = 8. GIGACHAT_PARALLEL перекрывает (макс. 10). */
function gigaChatParallelLimit(env = process.env) {
  const raw = Number(env.GIGACHAT_PARALLEL);
  if (Number.isFinite(raw) && raw >= 1) return Math.min(10, Math.floor(raw));
  if (hasCloudRuFmCredsEnv(env)) return 8;
  const scope = String(env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS').toUpperCase();
  if (scope.includes('CORP') || scope.includes('B2B')) return 8;
  return 1;
}

function cheapCloudChatOpts(extra = {}) {
  const extraObj = typeof extra === 'object' && extra ? extra : {};
  const cheap = cheapCloudCircuitConfig();
  if (!cheap) return null;
  return {
    ...extraObj,
    providerPreference: 'openai',
    baseUrl: cheap.baseUrl,
    apiKey: cheap.apiKey,
    model: cheap.model,
    singleModel: true,
  };
}

/**
 * Конфиг OpenRouter («роутер») для открытого контура, когда глобальный OPENAI_* = Qwen Пульса.
 * Ключ: AUDIO_PROTOCOL_LLM_API_KEY или OPENROUTER_API_KEY.
 */
function routerOpenCircuitApiKey() {
  const dedicated = String(process.env.AUDIO_PROTOCOL_LLM_API_KEY || process.env.OPENROUTER_API_KEY || '').trim();
  if (dedicated) return dedicated;
  const openai = String(process.env.OPENAI_API_KEY || '').trim();
  if (openai.startsWith('sk-or-')) return openai;
  return '';
}

function routerOpenCircuitConfig() {
  const apiKey = routerOpenCircuitApiKey();
  if (!apiKey) return null;

  const baseRaw =
    String(process.env.AUDIO_PROTOCOL_LLM_BASE_URL || '').trim() || 'https://openrouter.ai/api/v1';
  const model =
    String(process.env.OPEN_LLM_MODEL || '').trim() ||
    String(process.env.AUDIO_PROTOCOL_LLM_MODEL || '').trim() ||
    '@preset/primakov';

  return {
    baseUrl: baseRaw.replace(/\/$/, ''),
    apiKey,
    model,
  };
}

/** Явный провайдер открытого контура по LLM_PROVIDER (OpenRouter / GigaChat). Чат YandexGPT выключен. */
function openLlmProviderPreference() {
  const global = String(process.env.LLM_PROVIDER || 'auto').trim().toLowerCase();
  if (global === 'gigachat' || global === 'sber') return 'gigachat';
  if (global === 'openai' || global === 'openrouter') {
    if (isPulsePrimakovBaseUrlEnv()) {
      // OPENAI_* заняты закрытым Qwen — не слать «открытый» трафик туда.
      if (hasGigaChatCredsEnv()) return 'gigachat';
      return null;
    }
    return 'openai';
  }
  return null;
}

/** Опции для открытого API: OpenRouter (роутер) при закрытом OPENAI_BASE_URL, иначе LLM_PROVIDER. */
function openCircuitChatOpts(extra = {}) {
  const extraObj = typeof extra === 'object' && extra ? extra : {};
  const router = routerOpenCircuitConfig();
  if (router) {
    return {
      ...extraObj,
      providerPreference: 'openai',
      baseUrl: router.baseUrl,
      apiKey: router.apiKey,
      model: router.model,
      singleModel: true,
    };
  }
  if (isPulsePrimakovBaseUrlEnv()) return null;

  const pref = openLlmProviderPreference();
  const base = pref ? { providerPreference: pref } : {};
  return { ...extraObj, ...base };
}

function narrativeUsesOpenLlmProvider(context) {
  return String(context?.llmProvider || '').trim().toLowerCase() === 'open';
}

function resolveNarrativeChatOpts(context, extra = {}) {
  return narrativeUsesOpenLlmProvider(context) ? openCircuitChatOpts(extra) : pulseClosedLoopChatOpts(extra);
}

module.exports = {
  defaultChatModel,
  pulseQwenSystemPrefix,
  augmentPulseSystemPrompt,
  pulseClosedLoopChatOpts,
  openLlmProviderPreference,
  openCircuitChatOpts,
  cheapCloudChatOpts,
  cheapCloudCircuitConfig,
  gigaChatChatOpts,
  gigaChatParallelLimit,
  hasGigaChatCredsEnv,
  hasCloudRuFmCredsEnv,
  isCloudRuFoundationModelsUrl,
  normalizeCloudRuFmModel,
  CLOUD_RU_FM_DEFAULT_MODEL,
  cloudRuFmChatOpts,
  cloudRuFmCircuitConfig,
  routerOpenCircuitConfig,
  routerOpenCircuitApiKey,
  narrativeUsesOpenLlmProvider,
  resolveNarrativeChatOpts,
};
