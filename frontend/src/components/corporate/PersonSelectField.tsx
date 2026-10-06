import { createPortal } from 'react-dom';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { SurveyLocale } from '../../lib/surveyI18n';

export type PersonSelectGroup = {
  heading: string;
  choices: string[];
};

type Props = {
  choices: string[];
  groups?: PersonSelectGroup[];
  value: string;
  onChange: (name: string) => void;
  disabledNames?: string[];
  excludeNames?: string[];
  locale: SurveyLocale;
  placeholder?: string;
  ariaLabel?: string;
  allowManualEntry?: boolean;
  notInListLabel?: string;
  manualNamePlaceholder?: string;
};

function isManualValue(value: string, choices: string[]) {
  const v = value.trim();
  return Boolean(v) && !choices.includes(v);
}

function normalizeFio(input: string) {
  return String(input || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function validateFioDraft(raw: string, locale: SurveyLocale): string | null {
  const v = normalizeFio(raw);
  if (!v) return locale === 'en' ? 'Please enter your name' : 'Укажите ФИО';
  if (v.length < 5) return locale === 'en' ? 'Name is too short' : 'Слишком коротко';

  // Allow letters (Cyrillic/Latin) plus common punctuation.
  if (!/^[\p{L}\s'.-]+$/u.test(v)) {
    return locale === 'en' ? 'Only letters are allowed' : 'Можно вводить только буквы';
  }

  const tokens = v.split(' ').filter(Boolean);
  // Russian FIO parts: 2-part (Surname Name) or 3-part (Surname Name Patronymic).
  if (tokens.length < 2) {
    return locale === 'en' ? 'Use 2 parts: surname name' : 'Нужно минимум 2 части';
  }
  if (tokens.length > 3) {
    return locale === 'en' ? 'Use up to 3 parts: surname name patronymic' : 'Слишком много частей (макс. 3)';
  }
  if (tokens.some((t) => !/\p{L}/u.test(t))) {
    return locale === 'en' ? 'Each part must contain letters' : 'В каждой части должны быть буквы';
  }
  return null;
}

export default function PersonSelectField({
  choices,
  groups,
  value,
  onChange,
  disabledNames = [],
  excludeNames = [],
  locale,
  placeholder,
  ariaLabel,
  allowManualEntry = false,
  notInListLabel,
  manualNamePlaceholder,
}: Props) {
  const [query, setQuery] = useState('');
  const [manualMode, setManualMode] = useState(() =>
    allowManualEntry ? isManualValue(value, choices) : false,
  );
  const skipManualAutoDetectRef = useRef(false);
  const disabled = useMemo(() => new Set(disabledNames), [disabledNames]);
  const excluded = useMemo(() => new Set(excludeNames), [excludeNames]);
  const en = locale === 'en';

  const notInList =
    notInListLabel ||
    (locale === 'en' ? 'My name is not on the list' : 'Моей фамилии нет в списке');
  const manualPh =
    manualNamePlaceholder ||
    (locale === 'en' ? 'Last name First name Patronymic' : 'Фамилия Имя Отчество');

  const [notInListModalOpen, setNotInListModalOpen] = useState(false);
  const [fioDraft, setFioDraft] = useState('');
  const [fioDraftErr, setFioDraftErr] = useState<string | null>(null);
  const modalTitleId = useId();

  function openNotInListModal() {
    setNotInListModalOpen(true);
    setFioDraft('');
    setFioDraftErr(null);
  }

  function closeNotInListModal() {
    setNotInListModalOpen(false);
    setFioDraft('');
    setFioDraftErr(null);
  }

  function submitNotInListModal() {
    const err = validateFioDraft(fioDraft, locale);
    if (err) {
      setFioDraftErr(err);
      return;
    }
    const normalized = normalizeFio(fioDraft);
    // Keep manualMode=false after submit so the “selected value” row is shown.
    skipManualAutoDetectRef.current = true;
    setManualMode(false);
    setQuery(normalized);
    onChange(normalized);
    closeNotInListModal();
  }

  useEffect(() => {
    if (!allowManualEntry) {
      setManualMode(false);
      return;
    }
    if (skipManualAutoDetectRef.current) {
      skipManualAutoDetectRef.current = false;
      return;
    }
    setManualMode(isManualValue(value, choices));
  }, [allowManualEntry, value, choices]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = choices.filter((n) => !excluded.has(n));
    if (!q) return list;
    return list.filter((n) => n.toLowerCase().includes(q));
  }, [choices, excluded, query]);

  const filteredGroups = useMemo(() => {
    if (!groups?.length) return null;
    const q = query.trim().toLowerCase();
    return groups
      .map((g) => {
        const items = g.choices.filter((n) => !excluded.has(n));
        if (!q) return { heading: g.heading, choices: items };
        if (g.heading.toLowerCase().includes(q)) return { heading: g.heading, choices: items };
        return {
          heading: g.heading,
          choices: items.filter((n) => n.toLowerCase().includes(q)),
        };
      })
      .filter((g) => g.choices.length > 0);
  }, [groups, excluded, query]);

  const ph =
    placeholder ||
    (locale === 'en' ? 'Start typing your last name…' : 'Начните вводить фамилию…');

  const showList = allowManualEntry ? !manualMode : true;
  const listWithNotInList =
    allowManualEntry && showList
      ? [...filtered, notInList]
      : filtered;

  function selectFromList(name: string) {
    if (name === notInList) {
      setQuery('');
      onChange('');
      openNotInListModal();
      return;
    }
    setManualMode(false);
    onChange(name);
    setQuery(name);
  }

  function clearSelection() {
    setManualMode(false);
    setQuery('');
    onChange('');
  }

  function choiceButton(name: string) {
    const isNotInList = name === notInList;
    const isDisabled = !isNotInList && disabled.has(name);
    const selected = value === name;
    return (
      <button
        type="button"
        className={`public-choice-btn${selected ? ' is-selected' : ''}${isNotInList ? ' is-not-in-list' : ''}`}
        disabled={isDisabled}
        onClick={() => selectFromList(name)}
        role="option"
        aria-selected={selected}
      >
        <span className="public-choice-dot" />
        <span className="public-choice-label">{name}</span>
        {isDisabled ? (
          <span className="muted" style={{ marginLeft: 'auto', fontSize: '0.8rem' }}>
            {locale === 'en' ? 'already submitted' : 'уже ответил(а)'}
          </span>
        ) : null}
      </button>
    );
  }

  const groupedEmpty = Boolean(filteredGroups && filteredGroups.length === 0 && !allowManualEntry);

  return (
    <div className="corporate-person-select">
      {notInListModalOpen
        ? createPortal(
            <div
              className="corporate-person-modal-overlay"
              role="presentation"
              onClick={closeNotInListModal}
            >
              <div
                className="corporate-person-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby={modalTitleId}
                onClick={(e) => e.stopPropagation()}
              >
                <header className="corporate-person-modal-head">
                  <div>
                    <h3 id={modalTitleId} className="corporate-person-modal-title">
                      {en ? 'Your name not listed' : 'ФИО не найдено в списке'}
                    </h3>
                    <p className="corporate-person-modal-subtitle muted">
                      {en ? 'Enter your full name (surname name patronymic).' : 'Введите ФИО целиком.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="corporate-person-modal-close"
                    aria-label={en ? 'Close' : 'Закрыть'}
                    onClick={closeNotInListModal}
                  >
                    ×
                  </button>
                </header>

                <div className="corporate-person-modal-body">
                  <label className="corporate-person-modal-label" htmlFor="corporate-person-modal-input">
                    {en ? 'Full name (surname name patronymic)' : 'Фамилия Имя Отчество'}
                  </label>
                  <input
                    id="corporate-person-modal-input"
                    type="text"
                    className="field"
                    value={fioDraft}
                    placeholder={manualPh}
                    autoFocus
                    onChange={(e) => {
                      setFioDraft(e.target.value);
                      setFioDraftErr(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitNotInListModal();
                      if (e.key === 'Escape') closeNotInListModal();
                    }}
                  />
                  {fioDraftErr ? (
                    <p className="err" style={{ margin: 0 }}>
                      {fioDraftErr}
                    </p>
                  ) : null}
                </div>

                <div className="corporate-person-modal-actions">
                  <button
                    type="button"
                    className="corporate-person-modal-cancel"
                    onClick={closeNotInListModal}
                  >
                    {en ? 'Cancel' : 'Отмена'}
                  </button>
                  <button
                    type="button"
                    className="corporate-person-modal-confirm"
                    onClick={submitNotInListModal}
                  >
                    {en ? 'Save' : 'Сохранить'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {!manualMode ? (
        <input
          type="search"
          className="field"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={ph}
          aria-label={ariaLabel || ph}
          autoComplete="off"
        />
      ) : null}
      {value && !manualMode ? (
        <div className="corporate-person-selected">
          <span>{value}</span>
          <button type="button" className="btn" onClick={clearSelection}>
            {locale === 'en' ? 'Clear' : 'Сбросить'}
          </button>
        </div>
      ) : null}
      {allowManualEntry && manualMode ? (
        <div className="corporate-person-manual">
          <label className="corporate-person-manual-label" htmlFor="corporate-person-manual-input">
            {manualPh}
          </label>
          <input
            id="corporate-person-manual-input"
            type="text"
            className="field"
            value={value}
            onChange={(e) => onChange(normalizeFio(e.target.value))}
            placeholder={manualPh}
            autoComplete="name"
            autoFocus
          />
          <button type="button" className="btn corporate-person-manual-back" onClick={clearSelection}>
            {locale === 'en' ? 'Back to list' : 'Вернуться к списку'}
          </button>
        </div>
      ) : null}
      {allowManualEntry && !manualMode && !value ? (
        <button
          type="button"
          className="btn corporate-person-not-in-list"
          onClick={() => selectFromList(notInList)}
        >
          {notInList}
        </button>
      ) : null}
      {showList && !value ? (
        <ul className="corporate-person-list" role="listbox" aria-label={ariaLabel || ph}>
          {filteredGroups
            ? filteredGroups.map((g) => (
                <li key={g.heading} className="corporate-person-group" role="group" aria-label={g.heading}>
                  <h3 className="corporate-person-group-heading">{g.heading}</h3>
                  {g.choices.map((name) => (
                    <div key={name}>{choiceButton(name)}</div>
                  ))}
                </li>
              ))
            : listWithNotInList.map((name) => (
                <li key={name === notInList ? '__not_in_list__' : name}>{choiceButton(name)}</li>
              ))}
          {filteredGroups && allowManualEntry ? (
            <li key="__not_in_list__">{choiceButton(notInList)}</li>
          ) : null}
          {groupedEmpty || (!filteredGroups && !listWithNotInList.length) ? (
            <li className="muted" style={{ padding: '0.5rem 0' }}>
              {locale === 'en' ? 'No matches' : 'Никого не найдено'}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
