// Общие подписи экранов модуля.

type Group = { title: string; digital: boolean };

export const STATUS_NAMES: Record<string, string> = { draft: 'Черновик', open: 'Открыта', closed: 'Закрыта' };

// Тип группы рядом с названием: «Основной» или «ЦГ».
export function GroupName({ group }: { group: Group }) {
  return <span className="mon-group-name">{group.title}<span className={`mon-gtype${group.digital ? ' mon-gtype--digital' : ''}`}>{group.digital ? 'ЦГ' : 'Основной'}</span></span>;
}

export function versionLabel(v: { title: string; version: number; max_points: number }) {
  return `${v.title} · версия ${v.version} · итого ${v.max_points}`;
}
