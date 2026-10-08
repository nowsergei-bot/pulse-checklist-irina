"use strict";
const { json } = require("./lib/http");
const {
  visitChecklistAnalyticsActor,
} = require("./lib/visit-checklist-analytics-access");
const links = require("./lib/pulse-self-analysis-links");
async function handle(pool, user, sessionUser, projectId, method, event) {
  try {
    const actor = visitChecklistAnalyticsActor(user, sessionUser),
      id = Number(projectId);
    if (!Number.isSafeInteger(id) || id <= 0)
      return json(400, { error: "Неверный проект" });
    if (method === "GET")
      return json(200, { links: await links.listLinks(pool, actor, id) });
    if (method !== "POST") return json(405, { error: "Метод недоступен" });
    const body = JSON.parse(
      event.body
        ? event.isBase64Encoded
          ? Buffer.from(event.body, "base64").toString("utf8")
          : event.body
        : "{}",
    );
    if (
      !body ||
      Array.isArray(body) ||
      Object.keys(body).some(
        (k) => !["mode", "self_response_id", "lesson_response_id"].includes(k),
      )
    )
      return json(400, { error: "Неверные параметры связи" });
    return json(200, { links: await links.saveLinks(pool, actor, id, body) });
  } catch (error) {
    if (error.code === "42P01")
      return json(503, {
        error: "Сохранение связей ещё не включено в этом контуре",
      });
    if (error instanceof SyntaxError)
      return json(400, { error: "Неверные параметры связи" });
    if (error.httpStatus)
      return json(error.httpStatus, { error: error.message });
    throw error;
  }
}
module.exports = { handle };
