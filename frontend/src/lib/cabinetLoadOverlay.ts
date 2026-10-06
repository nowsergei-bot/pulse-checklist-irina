import {
  cabinetWaitLabel,
  resolveCabinetWaitKind,
  type CabinetWaitKind,
} from './cabinetWaitEta.ts';

export type CabinetLoadTicket = {
  id: number;
  kind: CabinetWaitKind;
  label: string;
  error: string | null;
  immediate: boolean;
};

let nextId = 1;
const tickets = new Map<number, CabinetLoadTicket>();
const ticketListeners = new Set<() => void>();
let cachedTickets: CabinetLoadTicket[] = [];
let cachedBusyTickets: CabinetLoadTicket[] = [];
let hostCount = 0;
const hostListeners = new Set<() => void>();

function emitTickets() {
  cachedTickets = [...tickets.values()];
  cachedBusyTickets = cachedTickets.filter((ticket) => !ticket.error);
  for (const listener of ticketListeners) listener();
}

function emitHosts() {
  for (const listener of hostListeners) listener();
}

export function peekCabinetLoadTickets(): CabinetLoadTicket[] {
  return cachedTickets;
}

/** Tickets that should mount the stage spinner (errors must not block clicks). */
export function peekCabinetLoadBusyTickets(): CabinetLoadTicket[] {
  return cachedBusyTickets;
}

export function subscribeCabinetLoadTickets(onStoreChange: () => void): () => void {
  ticketListeners.add(onStoreChange);
  return () => {
    ticketListeners.delete(onStoreChange);
  };
}

export function peekCabinetLoadHostMounted(): boolean {
  return hostCount > 0;
}

export function subscribeCabinetLoadHost(onStoreChange: () => void): () => void {
  hostListeners.add(onStoreChange);
  return () => {
    hostListeners.delete(onStoreChange);
  };
}

export function registerCabinetLoadHost(): () => void {
  hostCount += 1;
  emitHosts();
  return () => {
    hostCount = Math.max(0, hostCount - 1);
    emitHosts();
  };
}

export function beginCabinetLoad(input: {
  kind?: CabinetWaitKind;
  label?: string;
  pathname?: string;
  error?: string | null;
  immediate?: boolean;
}): number {
  const kind = input.kind || resolveCabinetWaitKind(input.pathname || '');
  const id = nextId++;
  tickets.set(id, {
    id,
    kind,
    label: input.label?.trim() || cabinetWaitLabel(kind),
    error: input.error ?? null,
    immediate: Boolean(input.immediate),
  });
  emitTickets();
  return id;
}

export function updateCabinetLoad(
  id: number,
  patch: Partial<Pick<CabinetLoadTicket, 'kind' | 'label' | 'error' | 'immediate'>>,
): void {
  const current = tickets.get(id);
  if (!current) return;
  tickets.set(id, { ...current, ...patch });
  emitTickets();
}

export function endCabinetLoad(id: number): void {
  if (tickets.delete(id)) emitTickets();
}

/** Drop leftover tickets when leaving /cabinet (SPA nav does not always end hooks in time). */
export function clearCabinetLoadTickets(): void {
  if (tickets.size === 0) return;
  tickets.clear();
  emitTickets();
}

export function resetCabinetLoadOverlayForTests(): void {
  tickets.clear();
  cachedTickets = [];
  cachedBusyTickets = [];
  nextId = 1;
  hostCount = 0;
  emitTickets();
  emitHosts();
}
