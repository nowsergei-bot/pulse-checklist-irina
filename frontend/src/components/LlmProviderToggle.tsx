import { memo } from 'react';
import { type LessonAnalyticsLlmProvider } from '../api/lessonAnalytics';
import './LlmProviderToggle.css';

type Props = {
  value: LessonAnalyticsLlmProvider;
  onToggle: () => void;
};

function LlmProviderToggle({ value, onToggle }: Props) {
  const isOpen = value === 'open';

  return (
    <button
      type="button"
      className={`llm-provider-toggle${isOpen ? ' llm-provider-toggle--open' : ' llm-provider-toggle--closed'}`}
      title={
        isOpen
          ? 'Сейчас открытый API (OpenRouter / GigaChat). Нажмите для закрытого контура Qwen.'
          : 'Сейчас закрытый контур Qwen (ai.primakov.school). Нажмите для открытого API (роутер).'
      }
      aria-pressed={isOpen}
      aria-label={`Режим ИИ: ${isOpen ? 'открытый API' : 'закрытый контур'}. Нажмите для переключения.`}
      onClick={onToggle}
    >
      <span className="llm-provider-toggle__icon" aria-hidden="true">
        {isOpen ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        )}
      </span>
      <span className="llm-provider-toggle__text">
        <span className="llm-provider-toggle__kicker">ИИ-контур</span>
        <span className="llm-provider-toggle__badge">
          {isOpen ? 'Открытый API' : 'Закрытый контур'}
        </span>
      </span>
      <span className="llm-provider-toggle__pill" aria-hidden="true">
        {isOpen ? 'API' : 'Qwen'}
      </span>
    </button>
  );
}

export default memo(LlmProviderToggle);
