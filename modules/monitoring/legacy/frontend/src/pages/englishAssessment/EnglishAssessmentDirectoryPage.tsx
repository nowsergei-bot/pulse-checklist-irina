import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { eaAddGroupStudent, eaRemoveGroupStudent } from '../../api/englishAssessment';
import { collectClassOptions, groupMatchesClass } from '../../lib/englishAssessment/analyticsUi';
import { asDirectoryStudents, emitEaLive, useEaLive } from '../../lib/englishAssessment/liveRefresh';
import { loadEaMe, peekCachedEaMe } from '../../lib/englishAssessment/sharedMe';
import {
  loadEaDirectory,
  loadEaGroupCard,
  peekCachedEaDirectory,
  peekCachedEaGroupCard,
} from '../../lib/englishAssessment/sharedResources';
import { useEaPaths } from '../../lib/englishAssessment/paths';
import { maskFullName } from '../../lib/englishAssessment/parseWorkbook';
import type {
  EaAcademicYear,
  EaCapabilities,
  EaDirectoryClass,
  EaDirectoryGroup,
  EaDirectoryStudent,
  EaTeacherListItem,
} from '../../lib/englishAssessment/types';
import YearClassGroupBar from './YearClassGroupBar';

type Tab = 'students' | 'groups' | 'teachers' | 'classes';

export default function EnglishAssessmentDirectoryPage() {
  const { href, cabinet } = useEaPaths();
  const cachedDir = peekCachedEaDirectory();
  const [classes, setClasses] = useState<EaDirectoryClass[]>(cachedDir?.classes || []);
  const [students, setStudents] = useState<EaDirectoryStudent[]>(cachedDir?.students || []);
  const [groups, setGroups] = useState<EaDirectoryGroup[]>(cachedDir?.groups || []);
  const [teachers, setTeachers] = useState<EaTeacherListItem[]>(cachedDir?.teachers || []);
  const [year, setYear] = useState(cachedDir?.year?.label || '');
  const [mask, setMask] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('groups');
  const [caps, setCaps] = useState<EaCapabilities | null>(() => peekCachedEaMe()?.capabilities || null);
  const [classKey, setClassKey] = useState('all');
  const [groupId, setGroupId] = useState('');
  const [newName, setNewName] = useState('');
  const [newClass, setNewClass] = useState('');
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [addNote, setAddNote] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<EaDirectoryStudent[]>([]);
  const loadSeq = useRef(0);
  const membersSeq = useRef(0);
  const [dirReady, setDirReady] = useState(Boolean(cachedDir));

  useEffect(() => {
    const seq = ++loadSeq.current;
    const cached = peekCachedEaDirectory();
    if (cached) {
      setYear(cached.year?.label || '');
      setClasses(cached.classes || []);
      setStudents(cached.students || []);
      setGroups(cached.groups || []);
      setTeachers(cached.teachers || []);
    }
    void Promise.all([loadEaDirectory(), loadEaMe().catch(() => null)])
      .then(([data, me]) => {
        if (seq !== loadSeq.current) return;
        setYear(data.year?.label || '');
        setClasses(data.classes || []);
        setStudents(data.students || []);
        setGroups(data.groups || []);
        setTeachers(data.teachers || []);
        if (me) setCaps(me.capabilities || null);
        setDirReady(true);
      })
      .catch((e) => {
        if (seq !== loadSeq.current) return;
        setDirReady(true);
        setError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  const needle = q.trim().toLocaleLowerCase('ru-RU');
  const filteredStudents = useMemo(
    () =>
      needle
        ? students.filter((s) => `${s.full_name} ${s.class_label || ''}`.toLocaleLowerCase('ru-RU').includes(needle))
        : students,
    [needle, students],
  );
  const classOptions = useMemo(() => collectClassOptions(groups), [groups]);
  const scopedGroups = useMemo(() => groups.filter((g) => groupMatchesClass(g, classKey)), [groups, classKey]);
  const filteredGroups = useMemo(() => {
    const base = groupId ? scopedGroups.filter((g) => String(g.id) === groupId) : scopedGroups;
    return needle
      ? base.filter((g) =>
          `${g.title} ${g.code || ''} ${g.teachers.map((t) => t.full_name).join(' ')}`
            .toLocaleLowerCase('ru-RU')
            .includes(needle),
        )
      : base;
  }, [needle, scopedGroups, groupId]);
  const canEditRoster = Boolean(caps?.roster);
  const filteredTeachers = useMemo(
    () =>
      needle
        ? teachers.filter((t) => `${t.full_name} ${t.native_name || ''}`.toLocaleLowerCase('ru-RU').includes(needle))
        : teachers,
    [needle, teachers],
  );

  const years: EaAcademicYear[] = year ? [{ id: 0, label: year, is_current: true }] : [];

  function applyGroupRoster(targetGroupId: number, nextStudents: EaDirectoryStudent[]) {
    const members = asDirectoryStudents(nextStudents);
    setGroups((prev) =>
      prev.map((g) => (g.id === targetGroupId ? { ...g, student_count: members.length } : g)),
    );
    setStudents((prev) => {
      const have = new Set(prev.map((s) => s.id));
      const extra = members.filter((s) => !have.has(s.id));
      return extra.length ? [...prev, ...extra] : prev;
    });
    if (String(groupId) === String(targetGroupId)) setGroupMembers(members);
  }

  useEffect(() => {
    if (!canEditRoster || !groupId) {
      setGroupMembers([]);
      return;
    }
    const id = Number(groupId);
    if (!Number.isFinite(id)) return;
    const seq = ++membersSeq.current;
    const peeked = peekCachedEaGroupCard(id);
    if (peeked) setGroupMembers(asDirectoryStudents(peeked.students));
    void loadEaGroupCard(id)
      .then((data) => {
        if (seq !== membersSeq.current) return;
        setGroupMembers(asDirectoryStudents(data.students));
      })
      .catch(() => {
        if (seq !== membersSeq.current) return;
        setGroupMembers([]);
      });
  }, [canEditRoster, groupId]);

  useEaLive((detail) => {
    if (detail.kind === 'roster') applyGroupRoster(detail.groupId, detail.students);
  });

  async function addStudent() {
    if (!canEditRoster || !groupId || !newName.trim()) return;
    setAdding(true);
    setAddNote(null);
    setError(null);
    try {
      const id = Number(groupId);
      const data = await eaAddGroupStudent(id, {
        full_name: newName.trim(),
        class_label: newClass.trim() || undefined,
      });
      const members = asDirectoryStudents(data.students);
      applyGroupRoster(id, members);
      emitEaLive({ kind: 'roster', groupId: id, students: members });
      setNewName('');
      setAddNote('Учащийся добавлен в группу.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }

  async function removeStudent(student: EaDirectoryStudent) {
    if (!canEditRoster || !groupId) return;
    if (!window.confirm(`Убрать «${student.full_name}» из группы?`)) return;
    setRemovingId(student.id);
    setAddNote(null);
    setError(null);
    try {
      const id = Number(groupId);
      const data = await eaRemoveGroupStudent(id, student.id);
      const members = asDirectoryStudents(data.students);
      applyGroupRoster(id, members);
      emitEaLive({ kind: 'roster', groupId: id, students: members });
      setAddNote('Учащийся убран из группы.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemovingId(null);
    }
  }

  if (error && !groups.length) return <p className="ea-err">{error}</p>;

  return (
    <div>
      <p className="ea-freshness">
        {dirReady
          ? `${year || 'Учебный год'} · ${classes.length} классов · ${scopedGroups.length} групп · ${students.length} учащихся`
          : `${year || 'Учебный год'} · список ещё загружается`}
      </p>
      {cabinet ? <h2 className="ea-card-title">Контингент</h2> : null}
      <YearClassGroupBar
        years={years}
        yearId={years[0] ? '0' : ''}
        onYear={() => undefined}
        classOptions={classOptions}
        classKey={classKey}
        onClass={(key) => {
          setClassKey(key);
          setGroupId('');
        }}
        groups={scopedGroups}
        groupId={groupId}
        onGroup={setGroupId}
        onReset={() => {
          setClassKey('all');
          setGroupId('');
        }}
      />
      {canEditRoster ? (
        <div className="ea-add-student">
          <p className="ea-kicker">Состав группы</p>
          <div className="ea-add-student__row">
            <label>
              ФИО
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Фамилия Имя Отчество" autoComplete="off" />
            </label>
            <label>
              Класс
              <input value={newClass} onChange={(e) => setNewClass(e.target.value)} placeholder="напр. 6Б" autoComplete="off" />
            </label>
            <button type="button" className="btn" disabled={adding || !newName.trim() || !groupId} onClick={() => void addStudent()}>
              {adding ? 'Добавление…' : 'Добавить ученика'}
            </button>
          </div>
          {!groupId ? <p className="ea-note">Сначала выберите группу.</p> : null}
          {groupId && groupMembers.length ? (
            <ul className="ea-roster-list">
              {groupMembers.map((student) => (
                <li key={student.id}>
                  <span>{mask ? maskFullName(student.full_name) : student.full_name}</span>
                  <button
                    type="button"
                    className="btn"
                    disabled={removingId === student.id}
                    onClick={() => void removeStudent(student)}
                  >
                    {removingId === student.id ? 'Удаление…' : 'Убрать'}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {addNote ? <p className="ea-note">{addNote}</p> : null}
        </div>
      ) : null}
      {error ? <p className="ea-err">{error}</p> : null}
      {!dirReady ? (
        <div aria-busy="true">
          <div className="ea-skel ea-skel--bar" />
          <div className="ea-skel ea-skel--chart" />
        </div>
      ) : null}
      <div className="ea-actions">
        {(['groups', 'teachers', 'students', 'classes'] as Tab[])
          .filter((id) => !cabinet || id !== 'teachers')
          .map((id) => (
          <button key={id} type="button" className={`btn${tab === id ? ' primary' : ''}`} onClick={() => setTab(id)}>
            {id === 'groups' ? 'Группы' : id === 'teachers' ? 'Преподаватели' : id === 'students' ? 'Учащиеся' : 'Классы'}
          </button>
        ))}
        <input
          className="staff-login-input"
          placeholder="Поиск"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label>
          <input type="checkbox" checked={mask} onChange={(e) => setMask(e.target.checked)} /> Скрыть ФИО на экране
        </label>
      </div>

      {tab === 'classes' && dirReady ? (
        <div className="ea-grid">
          {classes.map((c) => (
            <div className="ea-stat" key={c.id}>
              <span className="ea-kicker">{c.parallel ? `${c.parallel} параллель` : 'класс'}</span>
              <strong>{c.code_display}</strong>
              <span className="ea-note">{c.student_count} уч.</span>
            </div>
          ))}
        </div>
      ) : null}

      {tab === 'groups' && dirReady ? (
        <table className="ea-table">
          <thead>
            <tr>
              <th>Группа</th>
              <th>Параллель</th>
              <th>Кампус</th>
              <th>Преподаватели</th>
              <th>Уч.</th>
            </tr>
          </thead>
          <tbody>
            {filteredGroups.map((g) => (
              <tr key={g.id}>
                <td>
                  <Link to={href(`/groups/${g.id}`)}>{g.title}</Link>
                </td>
                <td>{g.parallel || '—'}</td>
                <td>{g.campus === 'digital' ? 'ЦГ' : 'Основной'}</td>
                <td>
                  {g.teachers.map((t) => (
                    <Link key={t.id} to={href(`/teachers/${t.id}`)} className="ea-chip">
                      {mask ? maskFullName(t.full_name) : t.full_name}
                    </Link>
                  ))}
                </td>
                <td>{g.student_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {tab === 'teachers' && dirReady ? (
        <table className="ea-table">
          <thead>
            <tr>
              <th>Преподаватель</th>
              <th>Группы</th>
              <th>Учащиеся</th>
            </tr>
          </thead>
          <tbody>
            {filteredTeachers.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link to={href(`/teachers/${t.id}`)}>
                    {mask ? maskFullName(t.full_name) : t.full_name}
                  </Link>
                  {t.native_name ? <span className="ea-note"> · носитель</span> : null}
                </td>
                <td>{t.group_count}</td>
                <td>{t.student_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {tab === 'students' && dirReady ? (
        <>
          <table className="ea-table">
            <thead>
              <tr>
                <th>Класс</th>
                <th>ФИО</th>
                <th>Дата р.</th>
                <th>ID</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.slice(0, 400).map((s) => (
                <tr key={s.id}>
                  <td>{s.class_label || '—'}</td>
                  <td>
                    <Link to={href(`/students/${s.public_id || s.id}`)}>
                      {mask ? maskFullName(s.full_name) : s.full_name}
                    </Link>
                  </td>
                  <td>{s.birth_date || '—'}</td>
                  <td className="ea-mono">{s.public_id ? String(s.public_id).slice(0, 8) : s.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredStudents.length > 400 ? (
            <p className="ea-note">Показаны первые 400 строк из {filteredStudents.length}.</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
