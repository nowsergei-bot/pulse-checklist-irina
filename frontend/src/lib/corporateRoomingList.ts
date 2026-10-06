export type CorporateRoomingNumHighlight = 'yellow' | 'gray' | 'blue' | null;

export type CorporateRoomingRoom = {
  n: number;
  category: string;
  code: string;
  checkin?: string | number;
  checkout?: string | number;
  guests: string[];
  key: string;
  separator_before?: boolean;
  num_highlight?: CorporateRoomingNumHighlight;
};

export type CorporateRoomingCategoryGroup = {
  id: string;
  category: string;
  code: string;
  label: string;
  room_keys: string[];
  separator_before: boolean;
  num_highlight: CorporateRoomingNumHighlight;
};

export type CorporateRoomingHotel = {
  id: string;
  label: string;
  rooms: CorporateRoomingRoom[];
  category_groups?: CorporateRoomingCategoryGroup[];
};

export type CorporateRoomingListPayload = {
  hotels: CorporateRoomingHotel[];
  assignments: Record<string, string[]>;
  assigned_names: string[];
  updated_at?: string | null;
};

export type RoomingDisplayRow =
  | { kind: 'separator' }
  | {
      kind: 'guest';
      room: CorporateRoomingRoom;
      slot: 0 | 1;
    };

export function splitFio(full: string): { last: string; first: string } {
  const parts = String(full || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { last: '', first: '' };
  if (parts.length === 1) return { last: parts[0], first: '' };
  return { last: parts[0], first: parts.slice(1).join(' ') };
}

export function buildPairMap(pairs: Array<[string, string]>): Map<string, string> {
  const m = new Map<string, string>();
  for (const [a, b] of pairs) {
    m.set(a, b);
    m.set(b, a);
  }
  return m;
}

export function guestsForSelection(
  name: string,
  pairMap: Map<string, string>,
  max = 2,
): string[] {
  const n = String(name || '').trim();
  if (!n) return [];
  const partner = pairMap.get(n);
  if (partner && max >= 2) return [n, partner];
  return [n];
}

export function formatRoomingDate(raw?: string | number): string {
  if (!raw) return '';
  const s = String(raw);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return s;
}

export function buildRoomingDisplayRows(rooms: CorporateRoomingRoom[]): RoomingDisplayRow[] {
  const rows: RoomingDisplayRow[] = [];
  for (const room of rooms) {
    if (room.separator_before) rows.push({ kind: 'separator' });
    rows.push({ kind: 'guest', room, slot: 0 });
    rows.push({ kind: 'guest', room, slot: 1 });
  }
  return rows;
}

export function assignedFromAssignments(assignments: Record<string, string[]>): Set<string> {
  const s = new Set<string>();
  for (const names of Object.values(assignments)) {
    for (const n of names || []) s.add(n);
  }
  return s;
}

export function isRoomEmpty(assignments: Record<string, string[]>, roomKey: string): boolean {
  const g = assignments[roomKey];
  return !g || !g.some((n) => String(n || '').trim());
}

function detectNumHighlight(
  hotelId: string,
  code: string,
  roomN: number,
  hasSep: boolean,
): CorporateRoomingNumHighlight {
  if (hotelId !== 'Эрбелия') return null;
  if (code === 'SKL' && roomN === 16) return 'yellow';
  if (hasSep && (code === 'STL' || code === 'STR')) return 'gray';
  if (code === 'SKR' && roomN === 1) return 'yellow';
  if (hasSep && code === 'UTB') return 'blue';
  if (hasSep && code === 'SUR') return 'yellow';
  return null;
}

function shouldSeparatorBefore(
  hotelId: string,
  prev: CorporateRoomingRoom | null,
  room: Pick<CorporateRoomingRoom, 'n' | 'category' | 'code'>,
): boolean {
  if (!prev) return false;
  if (room.n !== 1) return false;
  if (prev.category === room.category && prev.code === room.code) return false;
  if (hotelId === 'Рябина') {
    if (prev.code === 'STL' && room.code === 'SQR') return false;
    if (prev.code === 'SQR' && room.code === 'STR') return false;
    return true;
  }
  if (hotelId === 'Эрбелия') {
    if (prev.code === 'SKL' && room.code === 'SKL') return false;
    if (prev.code === 'STL' && room.code === 'SKR') return false;
    if (prev.code === 'SKR' && room.code === 'SKR') return false;
    return true;
  }
  if (hotelId === 'Бревис') {
    if (prev.code === 'TQL' && room.code === 'TQR') return true;
    if (prev.code === 'TQR' && room.code === '1QL') return false;
    if (prev.code === '1QL' && room.code === '1QR') return false;
    return true;
  }
  return room.n === 1;
}

/** Категории номеров для fill-panel — из rooms, если API не прислал groups. */
export function buildCategoryGroups(
  hotelId: string,
  rooms: CorporateRoomingRoom[],
): CorporateRoomingCategoryGroup[] {
  const groups: CorporateRoomingCategoryGroup[] = [];
  let cur: CorporateRoomingCategoryGroup | null = null;
  let prev: CorporateRoomingRoom | null = null;
  for (const room of rooms) {
    const newGroup =
      !prev || (room.n === 1 && (prev.code !== room.code || prev.category !== room.category));
    if (newGroup) {
      const sep = shouldSeparatorBefore(hotelId, prev, room);
      cur = {
        id: `${hotelId}:${groups.length}:${room.code}`,
        category: room.category,
        code: room.code,
        label: `${room.code} · ${room.category}`,
        room_keys: [],
        separator_before: sep,
        num_highlight: detectNumHighlight(hotelId, room.code, room.n, sep),
      };
      groups.push(cur);
    }
    cur!.room_keys.push(room.key);
    prev = room;
  }
  return groups;
}

export type FillPairsResult = {
  assignments: Record<string, string[]>;
  placed: number;
  skippedPairs: number;
  skippedNoRoom: number;
};

/** Разместить confirmed-пары по 2 человека в свободные номера категории. */
export function fillConfirmedPairsInCategory(
  assignments: Record<string, string[]>,
  pairs: Array<[string, string]>,
  roomKeys: string[],
): FillPairsResult {
  const next: Record<string, string[]> = { ...assignments };
  const assigned = assignedFromAssignments(next);
  const freeRooms = roomKeys.filter((k) => isRoomEmpty(next, k));
  let placed = 0;
  let skippedPairs = 0;
  let roomIdx = 0;
  let stoppedEarly = false;

  for (const [a, b] of pairs) {
    const p1 = String(a || '').trim();
    const p2 = String(b || '').trim();
    if (!p1 || !p2) {
      skippedPairs += 1;
      continue;
    }
    if (assigned.has(p1) || assigned.has(p2)) {
      skippedPairs += 1;
      continue;
    }
    while (roomIdx < freeRooms.length && !isRoomEmpty(next, freeRooms[roomIdx])) {
      roomIdx += 1;
    }
    if (roomIdx >= freeRooms.length) {
      stoppedEarly = true;
      break;
    }
    const key = freeRooms[roomIdx];
    next[key] = [p1, p2];
    assigned.add(p1);
    assigned.add(p2);
    placed += 1;
    roomIdx += 1;
  }

  let skippedNoRoom = 0;
  if (stoppedEarly) {
    for (const [a, b] of pairs) {
      const p1 = String(a || '').trim();
      const p2 = String(b || '').trim();
      if (!p1 || !p2) continue;
      if (assigned.has(p1) || assigned.has(p2)) continue;
      skippedNoRoom += 1;
    }
  }

  return { assignments: next, placed, skippedPairs, skippedNoRoom };
}
