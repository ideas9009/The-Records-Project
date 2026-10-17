import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth-context";
import { canPublishNews } from "../lib/access";
import { apiRequest, watchResource } from "../lib/api";
import {
  articleStatus,
  loadArticle,
  newsDate,
  prepareNewsThumbnail,
  type NewsArticle,
  type NewsCard,
} from "../lib/news";
import NewsMarkdown from "./NewsMarkdown";
import "./News.css";
import { external } from "../lib/native";
const Icon = ({ name }: { name: string }) => (
  <span className="material-symbol" aria-hidden="true">
    {name}
  </span>
);
const message = (reason: unknown) =>
  reason instanceof Error ? reason.message : "News could not be loaded.";
type Go = (page: string) => void;
export default function News({ page, go }: { page: string; go: Go }) {
  const { account } = useAuth(),
    publisher = canPublishNews(account);
  const [search, setSearch] = useState(""),
    [tab, setTab] = useState("published");
  const [undo, setUndo] = useState<{
      id: string;
      version: number;
      until: number;
    } | null>(null),
    [seconds, setSeconds] = useState(0),
    [undoBusy, setUndoBusy] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (!undo) return;
    const tick = () => {
      const left = Math.max(
        0,
        Math.ceil((undo.until - performance.now()) / 1000),
      );
      setSeconds(left);
      if (!left) setUndo(null);
    };
    tick();
    const timer = window.setInterval(tick, 100);
    return () => clearInterval(timer);
  }, [undo]);
  const published = (article: NewsArticle) => {
    setNotice("");
    setUndo(null);
    if (article.undoRemainingMs) {
      setUndo({
        id: article.id,
        version: article.version,
        until: performance.now() + article.undoRemainingMs,
      });
      setSeconds(Math.ceil(article.undoRemainingMs / 1000));
    }
  };
  async function undoPublish() {
    if (!undo || undoBusy) return;
    setUndoBusy(true);
    try {
      await apiRequest("/api/news/" + undo.id + "/undo", {
        method: "POST",
        body: { version: undo.version },
      });
      setUndo(null);
      setNotice("Publication undone. Saved as draft.");
      go("news:" + undo.id);
      window.dispatchEvent(new Event("records-news-refresh"));
    } catch (reason) {
      setUndo(null);
      setNotice(message(reason));
    } finally {
      setUndoBusy(false);
    }
  }
  const editing =
    page === "news:new" ||
    page === "news:meeting" ||
    page.startsWith("news:edit:");
  const content = editing ? (
    publisher ? (
      <NewsEditor
        key={page}
        id={page.startsWith("news:edit:") ? page.slice(10) : undefined}
        meeting={page === "news:meeting"}
        go={go}
        onPublished={published}
      />
    ) : null
  ) : page.startsWith("news:") ? (
    <Article key={page} id={page.slice(5)} go={go} publisher={publisher} />
  ) : (
    <Feed
      search={search}
      setSearch={setSearch}
      tab={publisher ? tab : "published"}
      setTab={setTab}
      publisher={publisher}
      go={go}
    />
  );
  return (
    <>
      {content}
      {publisher && undo && seconds > 0 && (
        <div className="news-undo" role="status">
          <span>News published</span>
          <button
            aria-label="Undo publication"
            disabled={undoBusy}
            onClick={() => void undoPublish()}
          >
            <Icon name="undo" />
            {undoBusy ? "Undoing…" : "Undo"}
            {!undoBusy && <small>{seconds}s</small>}
          </button>
        </div>
      )}
      {notice && (
        <div className="news-undo" role="status">
          <span>{notice}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
    </>
  );
}
export function MeetingActions({ url }: { url: string }) {
  const [copied, setCopied] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setError("");
    } catch {
      setError("The meeting link could not be copied. Please try again.");
    }
  }
  return (
    <div className="news-meeting">
      <div className="news-meeting-buttons">
        <button
          className="news-primary"
          onClick={() => {
            setError("");
            void external(url).catch((reason) => setError(message(reason)));
          }}
        >
          <Icon name="videocam" />
          Join Meeting
        </button>
        <button
          aria-label="Copy meeting link"
          title={copied ? "Copied" : "Copy meeting link"}
          onClick={() => void copy()}
        >
          <Icon name={copied ? "check" : "content_copy"} />
        </button>
      </div>
      {copied && (
        <span className="news-copy-status" role="status">
          Copied
        </span>
      )}
      {error && (
        <span className="news-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function Feed({
  search,
  setSearch,
  tab,
  setTab,
  publisher,
  go,
}: {
  search: string;
  setSearch: (s: string) => void;
  tab: string;
  setTab: (s: string) => void;
  publisher: boolean;
  go: Go;
}) {
  const [articles, setArticles] = useState<NewsCard[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const managing = publisher && tab !== "published";
  useEffect(() => {
    const refresh = () => setAttempt((v) => v + 1);
    window.addEventListener("records-news-refresh", refresh);
    return () => window.removeEventListener("records-news-refresh", refresh);
  }, []);
  useEffect(() => {
    setLoading(true);
    setError("");
    setArticles([]);
    return watchResource<NewsCard[]>(
      "/api/news" + (managing ? "/manage" : ""),
      (data) => {
        setArticles(data);
        setLoading(false);
        setError("");
      },
      (reason) => {
        setError(message(reason));
        setLoading(false);
      },
    );
  }, [managing, attempt]);
  const filtered = articles.filter(
    (article) =>
      articleStatus(article) === tab &&
      [article.title, article.subtitle, article.author]
        .join(" ")
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  return (
    <div className="news-page">
      <header className="page-header news-header">
        <h1>News</h1>
        {publisher && (
          <div className="news-header-buttons">
            <button onClick={() => go("news:meeting")}>
              <Icon name="video_call" />
              Host a meeting
            </button>
            <button className="news-primary" onClick={() => go("news:new")}>
              <Icon name="add" />
              Publish News
            </button>
          </div>
        )}
      </header>
      <div className="news-toolbar">
        <label className="news-search">
          <Icon name="search" />
          <input
            type="search"
            placeholder="Search news"
            aria-label="Search news"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {publisher && (
          <div className="news-tabs" aria-label="News status">
            {["published", "draft", "scheduled", "archived"].map((value) => (
              <button
                key={value}
                aria-pressed={tab === value}
                onClick={() => setTab(value)}
              >
                {
                  (
                    {
                      published: "Published",
                      draft: "Drafts",
                      scheduled: "Scheduled",
                      archived: "Archived",
                    } as Record<string, string>
                  )[value]
                }
              </button>
            ))}
          </div>
        )}
      </div>
      {error && (
        <div role="alert" className="news-error">
          {error}
          <button onClick={() => setAttempt((v) => v + 1)}>Retry</button>
        </div>
      )}
      {loading ? (
        <p role="status">Loading news…</p>
      ) : (
        <>
          <p className="news-count" role="status">
            {filtered.length} {filtered.length === 1 ? "article" : "articles"}
          </p>
          <div className="news-grid">
            {filtered.map((article) => (
              <article key={article.id} className="card news-tile">
                <button
                  className="news-open"
                  onClick={() => go("news:" + article.id)}
                  aria-label={"Read " + article.title}
                >
                  {article.thumbnail ? (
                    <img
                      className="news-thumbnail"
                      src={article.thumbnail}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <div className="news-thumbnail news-thumbnail-empty">
                      <Icon name="newspaper" />
                    </div>
                  )}
                  <div className="news-tile-content">
                    <div className="news-meta">
                      <span>{article.author}</span>
                      <time>
                        {newsDate(article.publishAt || article.updatedAt)}
                      </time>
                    </div>
                    <h2>{article.title}</h2>
                    {article.subtitle && <p>{article.subtitle}</p>}
                    <span className="news-read">
                      {tab === "published"
                        ? "Read article"
                        : tab === "scheduled"
                          ? "Scheduled"
                          : "View article"}
                      <Icon name="arrow_forward" />
                    </span>
                  </div>
                </button>
                <div className="news-row-actions">
                  {article.kind === "meeting" && article.meetingUrl && (
                    <MeetingActions url={article.meetingUrl} />
                  )}
                  {publisher && (
                    <button onClick={() => go("news:edit:" + article.id)}>
                      <Icon name="edit" />
                      Edit
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          {!filtered.length && !error && (
            <section className="card news-empty">
              <Icon name="newspaper" />
              <h2>
                {search
                  ? "No matching articles"
                  : "No " +
                    (tab === "published"
                      ? "news published"
                      : tab === "draft"
                        ? "drafts"
                        : tab === "scheduled"
                          ? "scheduled news"
                          : "archived news")}
              </h2>
            </section>
          )}
          {articles.length >= 200 && (
            <p className="news-count">
              Showing the latest 200 articles. Search covers titles, subtitles
              and authors in this list.
            </p>
          )}
        </>
      )}
    </div>
  );
}
function Article({
  id,
  go,
  publisher,
}: {
  id: string;
  go: Go;
  publisher: boolean;
}) {
  const [article, setArticle] = useState<NewsArticle | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const refresh = () => setAttempt((v) => v + 1);
    window.addEventListener("records-news-refresh", refresh);
    return () => window.removeEventListener("records-news-refresh", refresh);
  }, []);
  useEffect(() => {
    let active = true;
    setError("");
    void loadArticle(id).then(
      (data) => {
        if (active) setArticle(data);
      },
      (reason) => {
        if (active) setError(message(reason));
      },
    );
    return () => {
      active = false;
    };
  }, [id, attempt]);
  async function archive() {
    if (!article) return;
    setBusy(true);
    setError("");
    try {
      setArticle(
        await apiRequest<NewsArticle>("/api/news/" + id + "/archive", {
          method: "POST",
          body: { version: article.version },
        }),
      );
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="news-page">
      <div className="news-article-actions">
        <button onClick={() => go("news")}>
          <Icon name="arrow_back" />
          News
        </button>
        {publisher && article && (
          <div>
            <button onClick={() => go("news:edit:" + id)}>
              <Icon name="edit" />
              Edit
            </button>
            {article.status !== "archived" && (
              <button disabled={busy} onClick={() => void archive()}>
                <Icon name="archive" />
                {busy ? "Archiving…" : "Archive"}
              </button>
            )}
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="news-error">
          {error}
          <button onClick={() => setAttempt((v) => v + 1)}>
            Reload article
          </button>
        </p>
      )}
      {article ? (
        <article className="card news-article">
          {article.thumbnail && (
            <img
              className="news-article-cover"
              src={article.thumbnail}
              alt=""
            />
          )}
          <div className="news-article-content">
            {articleStatus(article) !== "published" && (
              <span className="news-state">{articleStatus(article)}</span>
            )}
            <h1>{article.title}</h1>
            {article.subtitle && (
              <p className="news-subtitle">{article.subtitle}</p>
            )}
            <div className="news-meta">
              <span>{article.author}</span>
              <time>{newsDate(article.publishAt || article.updatedAt)}</time>
            </div>
            {article.kind === "meeting" && article.meetingUrl && (
              <MeetingActions url={article.meetingUrl} />
            )}
            <NewsMarkdown text={article.body} format={article.format} />
          </div>
        </article>
      ) : (
        !error && <p role="status">Loading article…</p>
      )}
    </div>
  );
}
function localDate(value: number) {
  const date = new Date(value);
  return new Date(value - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function NewsEditor({
  id,
  go,
  meeting = false,
  onPublished,
}: {
  id?: string;
  go: Go;
  meeting?: boolean;
  onPublished: (article: NewsArticle) => void;
}) {
  const [kind, setKind] = useState<"article" | "meeting">(
      meeting ? "meeting" : "article",
    ),
    [meetingUrl, setMeetingUrl] = useState(
      "https://meet.google.com/aeb-wzei-sjd",
    );
  const [article, setArticle] = useState<NewsArticle | null>(null),
    [title, setTitle] = useState(meeting ? "Meeting" : ""),
    [subtitle, setSubtitle] = useState(""),
    [text, setText] = useState(
      meeting ? "Join the meeting using the button below." : "",
    ),
    [thumbnail, setThumbnail] = useState(""),
    [format, setFormat] = useState<"markdown" | "discord">("discord"),
    [publication, setPublication] = useState("now"),
    [schedule, setSchedule] = useState(""),
    [preview, setPreview] = useState(false),
    [loading, setLoading] = useState(!!id),
    [busy, setBusy] = useState(false),
    [processing, setProcessing] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false);
  const picker = useRef<HTMLInputElement>(null),
    unsaved = useRef(false);
  unsaved.current = dirty;
  useEffect(() => {
    const guard = (event: Event) => {
      if (unsaved.current && !window.confirm("Discard unsaved changes?"))
        event.preventDefault();
    };
    window.addEventListener("records-navigate", guard);
    return () => window.removeEventListener("records-navigate", guard);
  }, []);
  useEffect(() => {
    if (!id) return;
    let active = true;
    void loadArticle(id).then(
      (data) => {
        if (!active) return;
        setArticle(data);
        setKind(data.kind || "article");
        setMeetingUrl(
          data.meetingUrl || "https://meet.google.com/aeb-wzei-sjd",
        );
        setTitle(data.title);
        setSubtitle(data.subtitle);
        setText(data.body);
        setThumbnail(data.thumbnail);
        setFormat(data.format);
        if (articleStatus(data) === "scheduled") {
          setPublication("schedule");
          setSchedule(localDate(data.publishAt!));
        }
        setLoading(false);
      },
      (reason) => {
        if (active) {
          setError(message(reason));
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [id]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function save(draft: boolean) {
    if (busy || processing || loading || (id && !article)) return;
    setError("");
    if (!title.trim() || !text.trim()) {
      setError("Enter a title and article text.");
      return;
    }
    let publishAt: string | undefined;
    if (!draft && publication === "schedule") {
      const date = new Date(schedule);
      if (
        !schedule ||
        !Number.isFinite(date.getTime()) ||
        date.getTime() <= Date.now()
      ) {
        setError("Choose a publication time in the future.");
        return;
      }
      publishAt = date.toISOString();
    }
    setBusy(true);
    try {
      const result = await apiRequest<NewsArticle>(
        "/api/news" + (id ? "/" + id : ""),
        {
          method: id ? "PUT" : "POST",
          body: {
            kind,
            meetingUrl,
            title,
            subtitle,
            body: text,
            thumbnail,
            format,
            status: draft
              ? "draft"
              : publication === "schedule"
                ? "scheduled"
                : "published",
            publishAt,
            version: article?.version,
          },
        },
      );
      unsaved.current = false;
      setDirty(false);
      onPublished(result);
      go("news:" + result.id);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }
  async function image(file?: File) {
    if (!file) return;
    setProcessing(true);
    setError("");
    try {
      setThumbnail(await prepareNewsThumbnail(file));
      setDirty(true);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setProcessing(false);
      if (picker.current) picker.current.value = "";
    }
  }
  const change = () => setDirty(true);
  return (
    <div className="news-page">
      <div className="news-article-actions">
        <button onClick={() => go(id ? "news:" + id : "news")}>
          <Icon name="arrow_back" />
          {id ? "Article" : "News"}
        </button>
      </div>
      <header className="page-header">
        <h1>
          {id ? "Edit News" : meeting ? "Host a meeting" : "Publish News"}
        </h1>
      </header>
      {error && (
        <p role="alert" className="news-error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Loading article…</p>
      ) : id && !article ? null : (
        <form
          className="news-editor"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void save(false);
          }}
          onChange={change}
        >
          <section className="card news-compose">
            {kind === "meeting" && (
              <label>
                Google Meet link
                <input
                  type="url"
                  required
                  maxLength={500}
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                />
              </label>
            )}
            <label>
              Title
              <input
                required
                maxLength={160}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Subtitle <span>(optional)</span>
              <input
                maxLength={300}
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
              />
            </label>
            <div className="news-editor-toolbar">
              <label>
                Format
                <select
                  value={format}
                  onChange={(e) =>
                    setFormat(e.target.value as "markdown" | "discord")
                  }
                >
                  <option value="discord">Discord Markdown</option>
                  <option value="markdown">Markdown</option>
                </select>
              </label>
              <button
                type="button"
                aria-pressed={preview}
                onClick={() => setPreview((v) => !v)}
              >
                <Icon name={preview ? "edit" : "visibility"} />
                {preview ? "Write" : "Preview"}
              </button>
            </div>
            {preview ? (
              <div className="news-preview">
                <NewsMarkdown
                  text={text || "*No article text.*"}
                  format={format}
                />
              </div>
            ) : (
              <label>
                Article text
                <textarea
                  required
                  maxLength={50000}
                  rows={18}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Write your article…"
                />
              </label>
            )}
            <div className="news-format-help">
              <span>
                Headings · bold · italics · lists · links · quotes · code ·
                tables
                {format === "discord" ? " · __underline__ · ||spoilers||" : ""}
              </span>
              <span>{text.length.toLocaleString()} / 50,000</span>
            </div>
          </section>
          <aside className="news-editor-options">
            <section className="card">
              <h2>
                Thumbnail <small>(optional)</small>
              </h2>
              {thumbnail && (
                <img
                  className="news-editor-image"
                  src={thumbnail}
                  alt="Thumbnail preview"
                />
              )}
              <input
                hidden
                ref={picker}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Choose news thumbnail"
                onChange={(e) => void image(e.target.files?.[0])}
              />
              <div className="news-option-buttons">
                <button
                  type="button"
                  disabled={processing || busy}
                  onClick={() => picker.current?.click()}
                >
                  <Icon name="add_photo_alternate" />
                  {processing
                    ? "Processing…"
                    : thumbnail
                      ? "Change image"
                      : "Choose image"}
                </button>
                {thumbnail && (
                  <button
                    type="button"
                    disabled={processing || busy}
                    onClick={() => {
                      setThumbnail("");
                      change();
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </section>
            <section className="card">
              <h2>Publication</h2>
              <label>
                Publish
                <select
                  value={publication}
                  onChange={(e) => setPublication(e.target.value)}
                >
                  <option value="now">Immediately</option>
                  <option value="schedule">Schedule</option>
                </select>
              </label>
              {publication === "schedule" && (
                <label>
                  Publication time
                  <input
                    type="datetime-local"
                    value={schedule}
                    onChange={(e) => setSchedule(e.target.value)}
                  />
                  <small>
                    {Intl.DateTimeFormat().resolvedOptions().timeZone}
                  </small>
                </label>
              )}
              <div className="news-publish-buttons">
                <button
                  className="news-primary"
                  type="submit"
                  disabled={busy || processing}
                >
                  {busy
                    ? "Saving…"
                    : publication === "schedule"
                      ? "Schedule News"
                      : "Publish News"}
                </button>
                <button
                  type="button"
                  disabled={busy || processing}
                  onClick={() => void save(true)}
                >
                  Save draft
                </button>
              </div>
            </section>
          </aside>
        </form>
      )}
    </div>
  );
}
