type Props = {
  elapsedSec: number;
  etaSec?: number | null;
  className?: string;
};

/** Прогресс открытия тяжёлой карточки — без блокировки страницы. */
export default function CardOpenTimingBanner({ elapsedSec, etaSec, className }: Props) {
  return (
    <p
      className={`muted card-open-timing${className ? ` ${className}` : ''}`}
      role="status"
      aria-live="polite"
      style={{ fontSize: '0.85rem', margin: '0.65rem 0' }}
    >
      Открываем карточку… {elapsedSec} с
      {etaSec != null ? ` · ориентир ~${etaSec} с` : ''}
    </p>
  );
}
