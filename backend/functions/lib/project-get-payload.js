/**
 * Ответы GET проектов: не дублировать state_json в поле project (черновик уже в draft).
 * При необходимости уменьшить тело до лимита шлюза — облегчить importedGrid.
 */
const GATEWAY_SAFE_UTF16 = Math.floor(3.2 * 1024 * 1024);

function omitStateJson(row) {
  if (!row || typeof row !== 'object') return row;
  const { state_json: _s, ...rest } = row;
  return rest;
}

function draftWithEmptyImportedRows(draft) {
  if (!draft || typeof draft !== 'object') return draft;
  const ig = draft.importedGrid;
  if (!ig || typeof ig !== 'object') return draft;
  return { ...draft, importedGrid: { ...ig, rows: [] } };
}

function draftWithoutImportedGrid(draft) {
  if (!draft || typeof draft !== 'object') return draft;
  return { ...draft, importedGrid: null };
}

function payloadUtf16Len(project, draft) {
  return JSON.stringify({ project, draft }).length;
}

/**
 * @param {Record<string, unknown>} row - строка из SELECT (может содержать state_json)
 * @param {Record<string, unknown>} draft - черновик для клиента
 * @returns {{ project: Record<string, unknown>, draft: Record<string, unknown> }}
 */
function buildProjectGetPayload(row, draft) {
  const project = omitStateJson(row);
  if (payloadUtf16Len(project, draft) <= GATEWAY_SAFE_UTF16) {
    return { project, draft };
  }
  const d2 = draftWithEmptyImportedRows(draft);
  if (payloadUtf16Len(project, d2) <= GATEWAY_SAFE_UTF16) {
    return { project, draft: d2 };
  }
  const d3 = draftWithoutImportedGrid(draft);
  return { project, draft: d3 };
}

module.exports = { buildProjectGetPayload, omitStateJson };
