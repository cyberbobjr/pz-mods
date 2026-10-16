import { useSourceI18n } from './source-context';
import { Tooltip } from './ui/Tooltip';

export function DependencyBadge({
  count,
  activeCount,
  onClick,
}: {
  count: number;
  activeCount: number;
  onClick: () => void;
}) {
  const { t } = useSourceI18n();
  if (!count) return null;
  return (
    <Tooltip
      content={t(
        'Déclaré comme prérequis par {{count}} mod(s), dont {{active}} actif(s) dans cette sauvegarde.',
        { count, active: activeCount },
      )}
    >
      <button
        className={'dependency-badge' + (activeCount ? ' required-active' : '')}
        onClick={onClick}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M6 5H4a3 3 0 0 0 0 6h2m4-6h2a3 3 0 0 1 0 6h-2M5 8h6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        {t('PRÉREQUIS')} · {count}
      </button>
    </Tooltip>
  );
}
