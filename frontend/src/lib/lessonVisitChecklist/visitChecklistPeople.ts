import type { PersonSelectGroup } from '../../components/corporate/PersonSelectField';
import { personKey } from './visitChecklistCardAnswers.ts';
import { isUnknownTeacherLabel, looksLikeTeacherCode } from './visitChecklistScheduleMatch.ts';
import type { LessonVisitDepartment, LessonVisitDirectory, LessonVisitGeneralField, LessonVisitTeacher } from './types';

export const VISIT_ADMIN_DEPT_ID = 'dept_admin';
export const VISIT_ACADEMIC_DEPT_ID = 'dept_academic';
export const VISIT_CAMPUS_DEPT_LABEL = 'Кампус';

/** Директор и замы, которые остаются в секции «Администрация» чек-листа. */
const VISIT_ADMIN_KEEP_SURNAMES = ['майсурадзе', 'зенькович', 'басовский', 'хорошилов'] as const;

/**
 * Бывшие «админы» → уже существующие подразделения из штатки / JD.
 * Не выдумываем новые отделы: только имена, которые уже есть в справочнике.
 */
const VISIT_ADMIN_REHOME_BY_SURNAME: Record<string, string> = {
  елисеев: 'Отдел разработки информационных систем',
  прищеп: 'Хозяйственный отдел',
  фадеева: 'Центр Предшкола',
  шинкевич: 'Отдел персонала',
  новожилов: 'Отдел технического сопровождения мероприятий',
};

function sortRu(a: string, b: string): number {
  return a.localeCompare(b, 'ru');
}

function normRu(raw: string): string {
  return String(raw || '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstSurname(name: string): string {
  return normRu(name).split(' ')[0] || '';
}

export function isVisitAdminLeadershipName(name: string): boolean {
  const surname = firstSurname(name);
  return (VISIT_ADMIN_KEEP_SURNAMES as readonly string[]).includes(surname);
}

export function visitAdminRehomeDepartment(name: string): string | null {
  return VISIT_ADMIN_REHOME_BY_SURNAME[firstSurname(name)] || null;
}

export function isVisitCampusDepartment(name: string): boolean {
  return /^кампус(?:\s*[12])?$/.test(normRu(name));
}

export function isVisitUvpDepartment(name: string): boolean {
  const n = normRu(name);
  return /(?:^|[^a-zа-я])(?:увп|uvp)(?:$|[^a-zа-я])/.test(n) || /учебно[- ]?вспомогательн/.test(n);
}

export function displayVisitDepartmentName(name: string): string {
  return isVisitCampusDepartment(name) ? VISIT_CAMPUS_DEPT_LABEL : String(name || '').trim();
}

function deptNameById(directory: LessonVisitDirectory, departmentId: string): string {
  return directory.departments.find((d) => d.id === departmentId)?.name || '';
}

function isAdminDepartment(directory: LessonVisitDirectory, departmentId: string): boolean {
  if (departmentId === VISIT_ADMIN_DEPT_ID) return true;
  return /администрац/.test(normRu(deptNameById(directory, departmentId)));
}

function campusDepartmentIds(directory: LessonVisitDirectory): string[] {
  return directory.departments.filter((d) => isVisitCampusDepartment(d.name)).map((d) => d.id);
}

function expandVisitDepartmentFilter(
  directory: LessonVisitDirectory,
  departmentId: string,
): string[] {
  const id = String(departmentId || '').trim();
  if (!id) return [];
  const name = deptNameById(directory, id);
  if (isVisitCampusDepartment(name)) return campusDepartmentIds(directory);
  return [id];
}

export function isChairDepartmentId(departmentId: string): boolean {
  const id = String(departmentId || '');
  return Boolean(id) && id !== VISIT_ADMIN_DEPT_ID && id !== VISIT_ACADEMIC_DEPT_ID;
}

export function isChairTeacher(teacher: LessonVisitTeacher): boolean {
  return isChairDepartmentId(teacher.departmentId);
}

export function visitChecklistChairDepartments(
  directory: LessonVisitDirectory | null | undefined,
): LessonVisitDepartment[] {
  if (!directory) return [];
  const chairs = directory.departments.filter(
    (d) => isChairDepartmentId(d.id) && !isVisitUvpDepartment(d.name),
  );
  const rest: LessonVisitDepartment[] = [];
  let campus: LessonVisitDepartment | null = null;
  let campusAt = -1;
  for (const d of chairs) {
    if (isVisitCampusDepartment(d.name)) {
      if (campusAt < 0) campusAt = rest.length;
      if (!campus) campus = { id: d.id, name: VISIT_CAMPUS_DEPT_LABEL };
      continue;
    }
    rest.push(d);
  }
  if (campus) rest.splice(Math.max(0, campusAt), 0, campus);
  return rest;
}

export function namesInDepartment(directory: LessonVisitDirectory | null | undefined, departmentId: string): string[] {
  if (!directory) return [];
  return directory.teachers
    .filter((t) => t.departmentId === departmentId)
    .map((t) => t.name)
    .sort(sortRu);
}

/** Педагоги кафедр — кого посещают. */
export function visitChecklistObservedTeachers(
  directory: LessonVisitDirectory | null | undefined,
  departmentId?: string,
): LessonVisitTeacher[] {
  if (!directory) return [];
  const chairs = directory.teachers.filter(
    (t) => isChairTeacher(t) && !isVisitUvpDepartment(deptNameById(directory, t.departmentId)),
  );
  const dept = String(departmentId || '').trim();
  const ids = dept ? new Set(expandVisitDepartmentFilter(directory, dept)) : null;
  const list = ids ? chairs.filter((t) => ids.has(t.departmentId)) : chairs;
  return [...list].sort((a, b) => sortRu(a.name, b.name));
}

function mergePersonGroups(groups: PersonSelectGroup[]): PersonSelectGroup[] {
  const byHeading = new Map<string, string[]>();
  for (const g of groups) {
    const heading = displayVisitDepartmentName(g.heading);
    if (!heading || isVisitUvpDepartment(g.heading) || isVisitUvpDepartment(heading)) continue;
    const prev = byHeading.get(heading) || [];
    for (const name of g.choices) {
      if (!prev.includes(name)) prev.push(name);
    }
    byHeading.set(heading, prev);
  }
  return [...byHeading.entries()]
    .map(([heading, choices]) => ({ heading, choices: [...choices].sort(sortRu) }))
    .filter((g) => g.choices.length > 0);
}

/** Группы педагогов для type-ahead: по кафедрам, без администрации и учебной части. */
export function visitChecklistObservedTeacherGroups(
  directory: LessonVisitDirectory | null | undefined,
  departmentId?: string,
): PersonSelectGroup[] {
  const teachers = visitChecklistObservedTeachers(directory, departmentId);
  const depts = visitChecklistChairDepartments(directory);
  const dept = String(departmentId || '').trim();
  const visible = dept
    ? depts.filter((d) => d.id === dept || expandVisitDepartmentFilter(directory!, dept).includes(d.id))
    : depts;
  const matchIds = dept && directory ? new Set(expandVisitDepartmentFilter(directory, dept)) : null;
  return mergePersonGroups(
    visible.map((d) => {
      const ids =
        isVisitCampusDepartment(d.name) && directory
          ? new Set(campusDepartmentIds(directory))
          : new Set([d.id]);
      return {
        heading: displayVisitDepartmentName(d.name),
        choices: teachers
          .filter((t) => ids.has(t.departmentId) && (!matchIds || matchIds.has(t.departmentId)))
          .map((t) => t.name),
      };
    }),
  );
}

function visitorHeadingFor(
  directory: LessonVisitDirectory,
  teacher: LessonVisitTeacher,
): string | null {
  const deptName = deptNameById(directory, teacher.departmentId);
  if (isAdminDepartment(directory, teacher.departmentId)) {
    if (isVisitAdminLeadershipName(teacher.name)) return 'Администрация';
    return visitAdminRehomeDepartment(teacher.name);
  }
  if (isVisitUvpDepartment(deptName)) return null;
  return displayVisitDepartmentName(deptName) || null;
}

function visitorGroupRank(heading: string): number {
  if (heading === 'Администрация') return 0;
  if (heading === 'Учебная часть') return 1;
  if (heading === VISIT_CAMPUS_DEPT_LABEL) return 2;
  return 3;
}

/** Кто ходит на уроки: по подразделениям, Администрация — только 4 фамилии. */
export function visitChecklistVisitorGroups(directory: LessonVisitDirectory | null | undefined): PersonSelectGroup[] {
  if (!directory) return [];
  const used = new Set<string>();
  const byHeading = new Map<string, string[]>();

  const claim = (heading: string, name: string) => {
    if (!heading || !name || used.has(name) || isVisitUvpDepartment(heading)) return;
    used.add(name);
    const list = byHeading.get(heading) || [];
    list.push(name);
    byHeading.set(heading, list);
  };

  for (const teacher of directory.teachers) {
    if (isAdminDepartment(directory, teacher.departmentId) && isVisitAdminLeadershipName(teacher.name)) {
      claim('Администрация', teacher.name);
    }
  }
  for (const name of namesInDepartment(directory, VISIT_ACADEMIC_DEPT_ID)) {
    claim('Учебная часть', name);
  }
  for (const teacher of directory.teachers) {
    if (isAdminDepartment(directory, teacher.departmentId) && !isVisitAdminLeadershipName(teacher.name)) {
      const heading = visitAdminRehomeDepartment(teacher.name);
      if (heading) claim(heading, teacher.name);
    }
  }
  for (const teacher of directory.teachers) {
    if (isAdminDepartment(directory, teacher.departmentId)) continue;
    if (teacher.departmentId === VISIT_ACADEMIC_DEPT_ID) continue;
    const heading = visitorHeadingFor(directory, teacher);
    if (heading) claim(heading, teacher.name);
  }

  return [...byHeading.entries()]
    .map(([heading, choices]) => ({ heading, choices: [...choices].sort(sortRu) }))
    .filter((g) => g.choices.length > 0)
    .sort((a, b) => {
      const rank = visitorGroupRank(a.heading) - visitorGroupRank(b.heading);
      return rank !== 0 ? rank : sortRu(a.heading, b.heading);
    });
}

export function visitChecklistVisitorNames(directory: LessonVisitDirectory | null | undefined): string[] {
  return visitChecklistVisitorGroups(directory).flatMap((g) => g.choices);
}

export function isVisitChecklistPersonField(
  field: Pick<LessonVisitGeneralField, 'id' | 'type'>,
): 'visitor' | 'teacher' | null {
  if (field.id === 'visitor_name') return 'visitor';
  if (field.type === 'teacher' || field.id === 'teacher_id') return 'teacher';
  return null;
}

export function visitTeacherDisplayName(
  directory: LessonVisitDirectory | null | undefined,
  teacherIdOrName: string,
): string {
  const raw = String(teacherIdOrName || '').trim();
  if (!raw || !directory) return raw;
  return directory.teachers.find((t) => t.id === raw)?.name || raw;
}

export function findTeacherByLooseName(
  teachers: LessonVisitTeacher[] | null | undefined,
  raw: string | null | undefined,
): LessonVisitTeacher | null {
  const key = personKey(raw);
  if (!key || !teachers?.length) return null;
  const exact = teachers.find((row) => personKey(row.name) === key);
  if (exact) return exact;
  const tokens = key.split(' ').filter(Boolean);
  const last = tokens[0];
  if (!last) return null;
  const byLast = teachers.filter((row) => personKey(row.name).split(' ')[0] === last);
  if (byLast.length === 1) return byLast[0];
  if (tokens.length >= 2) {
    const first = tokens[1];
    const byFirst = byLast.filter((row) => {
      const second = personKey(row.name).split(' ')[1] || '';
      return first.length === 1 ? second.startsWith(first) : second === first;
    });
    if (byFirst.length === 1) return byFirst[0];
  }
  return null;
}

/** Код / фамилия / «Фамилия И.» → полное ФИО из справочника. */
export function resolveFullTeacherName(
  raw: string | null | undefined,
  directory?: LessonVisitDirectory | null,
): string {
  const label = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!label) return '';
  if (directory?.teachers?.length) {
    const byId = directory.teachers.find((row) => row.id === label);
    if (byId?.name && !isUnknownTeacherLabel(byId.name)) return byId.name.trim();
    const hit = findTeacherByLooseName(directory.teachers, label);
    if (hit?.name && !isUnknownTeacherLabel(hit.name)) return hit.name.trim();
  }
  if (isUnknownTeacherLabel(label) || looksLikeTeacherCode(label)) return '';
  return label;
}

/** Человеческое имя, а не код каталога / заглушка. */
export function looksLikePersonName(raw: string | null | undefined): boolean {
  const label = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!label || isUnknownTeacherLabel(label)) return false;
  const parts = label.split(/\s+/);
  if (parts.length < 2) return Boolean(label && /[a-zа-яё]/i.test(label) && !looksLikeTeacherCode(label));
  return parts.every((part) => /[a-zа-яё]/i.test(part));
}

/** Педагог годится для покрытия и агрегатов: есть ФИО или код резолвится в справочник. */
export function isKnownVisitTeacher(
  raw: string | null | undefined,
  directory?: LessonVisitDirectory | null,
): boolean {
  const label = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!label) return false;
  const resolved = resolveFullTeacherName(label, directory);
  if (resolved && !isUnknownTeacherLabel(resolved)) return true;
  return looksLikePersonName(label);
}

export function isKnownVisitTeacherResponse(
  row: { general?: Record<string, string> | null } | null | undefined,
  directory?: LessonVisitDirectory | null,
): boolean {
  const g = row?.general || {};
  const tid = String(g.teacher_id || '').trim();
  const named = String(g.teacher_name || g.teacher || '').trim();
  if (!tid && !named) return true;
  if (named && isKnownVisitTeacher(named, directory)) return true;
  if (tid && isKnownVisitTeacher(tid, directory)) return true;
  return false;
}

export function resolveVisitTeacherChoice(
  directory: LessonVisitDirectory | null | undefined,
  name: string,
  departmentId?: string,
): { teacherId: string; departmentId?: string } {
  const raw = String(name || '').trim();
  if (!raw || !directory) return { teacherId: raw };
  const scoped = visitChecklistObservedTeachers(directory, departmentId);
  const hit =
    scoped.find((t) => t.name === raw) || visitChecklistObservedTeachers(directory).find((t) => t.name === raw);
  if (hit) return { teacherId: hit.id, departmentId: hit.departmentId };
  return { teacherId: raw };
}

export function isDirectoryTeacherId(
  directory: LessonVisitDirectory | null | undefined,
  teacherId: string,
): boolean {
  const id = String(teacherId || '').trim();
  return Boolean(id && directory?.teachers.some((t) => t.id === id));
}
