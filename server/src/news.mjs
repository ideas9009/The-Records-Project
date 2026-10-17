import { randomUUID } from "node:crypto";
import { ApiError, approved, validPhoto, hasRole } from "./security.mjs";
const base = "nations/byzantium/news",
  feed = "nations/byzantium/news_feed";
export function newsPublisher(profile) {
  if (!profile) throw new ApiError(403, "Publishing access is unavailable.");
  approved(profile);
  if (!hasRole(profile,["operator", "admin", "leader", "prime_minister", "minister", "deputy"]))
    throw new ApiError(
      403,
      "Your roles do not allow publishing news.",
    );
}
const identifier = (id) => {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(id))
    throw new ApiError(400, "Invalid article identifier.");
  return id;
};
function fields(body, time) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const subtitle =
    typeof body.subtitle === "string" ? body.subtitle.trim() : "";
  if (
    !title ||
    title.length > 160 ||
    subtitle.length > 300 ||
    typeof body.body !== "string" ||
    !body.body.trim() ||
    body.body.length > 50000
  )
    throw new ApiError(
      400,
      "Enter a title and article text within the displayed limits.",
    );
  if (
    !["markdown", "discord"].includes(body.format) ||
    !["draft", "published", "scheduled"].includes(body.status)
  )
    throw new ApiError(400, "Choose a valid format and publication option.");
  const thumbnail = body.thumbnail || "";
  if (
    typeof thumbnail !== "string" ||
    (thumbnail && (!validPhoto(thumbnail) || thumbnail.length > 160000))
  )
    throw new ApiError(400, "Choose a valid thumbnail image.");
  const kind = body.kind || "article";
  if (!["article", "meeting"].includes(kind))
    throw new ApiError(400, "Choose a valid news type.");
  let meetingUrl = "";
  if (kind === "meeting") {
    try {
      const url = new URL(body.meetingUrl);
      if (
        url.origin !== "https://meet.google.com" ||
        url.username ||
        url.password ||
        !/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(url.pathname)
      )
        throw Error();
      meetingUrl = url.href;
    } catch {
      throw new ApiError(
        400,
        "Enter a valid Google Meet link, such as https://meet.google.com/aeb-wzei-sjd.",
      );
    }
  }
  let publishAt = null;
  if (body.status === "published") publishAt = time;
  if (body.status === "scheduled") {
    publishAt = Date.parse(body.publishAt);
    if (
      typeof body.publishAt !== "string" ||
      !/(Z|[+-]\d{2}:\d{2})$/.test(body.publishAt) ||
      !Number.isFinite(publishAt) ||
      publishAt <= time
    )
      throw new ApiError(400, "Choose a publication time in the future.");
  }
  return {
    kind,
    meetingUrl,
    title,
    subtitle,
    body: body.body,
    format: body.format,
    thumbnail,
    status: body.status,
    publishAt,
  };
}
const summary = (article) => {
  const { body, ...card } = article;
  return card;
};
export function createNews(store, { now = Date.now } = {}) {
  const visibleArticle = (article) =>
    article.status === "scheduled" && article.publishAt <= now()
      ? { ...article, status: "published" }
      : article;
  async function list(profile, manage = false) {
    approved(profile);
    if (manage) {
      newsPublisher(profile);
      return (await store.newsList(base, null, 200)).map((article) =>
        summary(visibleArticle(article)),
      );
    }
    return (await store.newsList(feed, now(), 200)).map(visibleArticle);
  }
  async function get(profile, id) {
    approved(profile);
    identifier(id);
    const article = await store.get(base + "/" + id);
    if (!article) throw new ApiError(404, "Article not found.");
    const visible =
      ["published", "scheduled"].includes(article.status) &&
      article.publishAt <= now();
    if (!visible) newsPublisher(profile);
    return visibleArticle(article);
  }
  async function save(profile, body, id = null) {
    newsPublisher(profile);
    const time = now(),
      data = fields(body, time);
    if (id) identifier(id);
    const key = id || randomUUID();
    let result;
    await store.transaction(async (tx) => {
      const actor = await tx.get("users/" + profile.uid),
        old = await tx.get(base + "/" + key);
      newsPublisher(actor);
      if (id && !old) throw new ApiError(404, "Article not found.");
      if (old && body.version !== old.version)
        throw new ApiError(
          409,
          "This article has changed. Reopen it before saving.",
        );
      result = {
        ...data,
        id: key,
        author: old?.author || actor.username,
        authorUid: old?.authorUid || actor.uid,
        createdAt: old?.createdAt || new Date(time).toISOString(),
        updatedAt: new Date(time).toISOString(),
        updatedBy: actor.uid,
        version: (old?.version || 0) + 1,
        undoUntil:
          data.status === "published" &&
          !(
            old &&
            ["published", "scheduled"].includes(old.status) &&
            old.publishAt <= time
          )
            ? time + 10000
            : 0,
        publishedBy: data.status === "published" ? actor.uid : "",
      };
      if (
        old &&
        data.status === "published" &&
        ["published", "scheduled"].includes(old.status) &&
        old.publishAt <= time
      )
        result.publishAt = old.publishAt;
      tx.set(base + "/" + key, result);
      if (["published", "scheduled"].includes(result.status))
        tx.set(feed + "/" + key, summary(result));
      else tx.remove(feed + "/" + key);
    });
    return {
      ...result,
      undoRemainingMs: Math.max(0, (result.undoUntil || 0) - now()),
    };
  }
  async function undo(profile, id, body) {
    newsPublisher(profile);
    identifier(id);
    let result;
    await store.transaction(async (tx) => {
      const actor = await tx.get("users/" + profile.uid),
        old = await tx.get(base + "/" + id);
      newsPublisher(actor);
      if (!old) throw new ApiError(404, "Article not found.");
      if (old.publishedBy !== actor.uid)
        throw new ApiError(
          403,
          "Only the publisher can undo this publication.",
        );
      if (old.version !== body.version)
        throw new ApiError(
          409,
          "This article has changed. Reopen it before making changes.",
        );
      if (
        old.status !== "published" ||
        !old.undoUntil ||
        now() >= old.undoUntil
      )
        throw new ApiError(
          409,
          "The 10-second undo period has ended. You can still edit or archive this article.",
        );
      result = {
        ...old,
        status: "draft",
        publishAt: null,
        undoUntil: 0,
        updatedAt: new Date(now()).toISOString(),
        updatedBy: actor.uid,
        version: old.version + 1,
      };
      tx.set(base + "/" + id, result);
      tx.remove(feed + "/" + id);
    });
    return result;
  }
  async function archive(profile, id, body) {
    newsPublisher(profile);
    identifier(id);
    let result;
    await store.transaction(async (tx) => {
      const actor = await tx.get("users/" + profile.uid),
        old = await tx.get(base + "/" + id);
      newsPublisher(actor);
      if (!old) throw new ApiError(404, "Article not found.");
      if (body.version !== old.version)
        throw new ApiError(
          409,
          "This article has changed. Reopen it before archiving.",
        );
      result = {
        ...old,
        status: "archived",
        updatedAt: new Date(now()).toISOString(),
        updatedBy: actor.uid,
        version: old.version + 1,
      };
      tx.set(base + "/" + id, result);
      tx.remove(feed + "/" + id);
    });
    return result;
  }
  return {
    newsList: list,
    newsGet: get,
    newsSave: save,
    newsUndo: undo,
    newsArchive: archive,
  };
}
