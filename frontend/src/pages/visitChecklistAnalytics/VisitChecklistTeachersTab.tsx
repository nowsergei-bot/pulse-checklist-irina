import { memo, useCallback, useDeferredValue, useState } from 'react';
import VisitChecklistTeachersSection from '../../components/VisitChecklistTeachersSection';
import { useVisitChecklistAnalytics } from './VisitChecklistAnalyticsContext';
import { useVisitChecklistTeacherCardRenderer } from './VisitChecklistTeacherCardRow';
import VisitChecklistTeachersToolbar from './VisitChecklistTeachersToolbar';

function VisitChecklistTeachersSkeleton() {
  return (
    <div className="card glass-surface" style={{ marginTop: '0.5rem', padding: '1rem', opacity: 0.78 }}>
      <p className="muted" style={{ margin: 0 }}>
        Подготовка карточек педагогов…
      </p>
    </div>
  );
}

function VisitChecklistTeachersTab() {
  const ws = useVisitChecklistAnalytics();
  const renderTeacherCard = useVisitChecklistTeacherCardRenderer(ws);
  const deferredTeachers = useDeferredValue(ws.sortedTeacherBlocks);
  const teachersPending = deferredTeachers !== ws.sortedTeacherBlocks;
  const [scrollToBlockId, setScrollToBlockId] = useState<string | null>(null);
  const handleScrollToBlockHandled = useCallback(() => setScrollToBlockId(null), []);

  if (!ws.teacherFilterKey || (ws.rawRows.length === 0 && ws.analyticRows.length === 0)) {
    return (
      <p className="muted card glass-surface" style={{ padding: '1rem' }}>
        Нет данных для карточек. Обновите аналитику из ответов или проверьте настройки колонок во вкладке «Настройки».
      </p>
    );
  }

  if (!ws.visitChecklistTeacherBlocks.ready) {
    if (ws.visitChecklistTeacherBlocks.teacherLabels.length > 0) {
      return <VisitChecklistTeachersSkeleton />;
    }
    return (
      <p className="muted card glass-surface" style={{ padding: '1rem' }}>
        Нет педагогов в данных чек-листа. Добавьте ответы и обновите аналитику.
      </p>
    );
  }

  return (
    <VisitChecklistTeachersSection
      totalCount={ws.activeTeacherBlocks.length}
      visibleCount={ws.visibleTeacherBlocks.length}
      displayCount={ws.displayTeacherBlocks.length}
      surnameFilter={ws.teacherSurnameFilter}
      onSurnameFilterChange={ws.onTeacherSurnameFilterChange}
      teacherDirectory={ws.displayTeacherBlocks}
      onJumpToTeacher={(blockId) => setScrollToBlockId(blockId)}
      scrollToBlockId={scrollToBlockId}
      onScrollToBlockHandled={handleScrollToBlockHandled}
      teachersPending={teachersPending}
      toolbar={<VisitChecklistTeachersToolbar />}
      statusLine={ws.aiBackgroundStatusLine}
      emptyVisibleMessage="По выбранным фильтрам нет педагогов с данными. Сбросьте или расширьте срез во вкладке «Настройки»."
      emptyDisplayMessage="Нет педагогов с такой фамилией. Очистите поле «Фамилия» или измените запрос."
      teachers={deferredTeachers}
      renderTeacherCard={renderTeacherCard}
      sectionDescription="По 8 карточек на странице; в развёрнутой карточке баллы, выводы, рекомендации и ИИ видны сразу. Тяжёлое тело подгружается при прокрутке или по кнопке «Показать полностью». Фильтры среза — во вкладке «Настройки»."
    />
  );
}

export default memo(VisitChecklistTeachersTab);
