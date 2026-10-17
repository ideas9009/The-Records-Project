import { ArticleContent, Feed, MeetingActions } from "../src/pages/News";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import NewsMarkdown from "../src/pages/NewsMarkdown";
import {
  canPublishNews,
  canReview,
  canAccessPage,
  type Account,
} from "../src/lib/access";
import { articleStatus, type NewsCard } from "../src/lib/news";
const render = (text: string, format: "markdown" | "discord" = "markdown") =>
  renderToStaticMarkup(<NewsMarkdown text={text} format={format} />);
describe("News Markdown", () => {
  it("renders standard headings, tables, lists, code and strikethrough", () => {
    const html = render(
      "# Heading\n\n**Bold** ~~old~~\n\n- One\n- Two\n\n|A|B|\n|-|-|\n|1|2|\n\n" +
        String.fromCharCode(96) +
        "code" +
        String.fromCharCode(96),
    );
    expect(html).toContain("<h1>Heading</h1>");
    expect(html).toContain("<table>");
    expect(html).toContain("<del>old</del>");
    expect(html).toContain("<code>code</code>");
  });
  it("supports Discord underline, line breaks and spoilers with inline formatting", () => {
    const html = render("__Underline__\nNext ||secret **bold**||", "discord");
    expect(html).toContain("<u>Underline</u>");
    expect(html).toContain("<br/>");
    expect(html).toContain('aria-label="Reveal spoiler"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("<strong>bold</strong>");
  });
  it("keeps code literal and unmatched spoiler markers visible", () => {
    const html = render(
      String.fromCharCode(96) +
        "||literal||" +
        String.fromCharCode(96) +
        " unmatched ||text",
      "discord",
    );
    expect(html).toContain("<code>||literal||</code>");
    expect(html).toContain("||text");
    expect(html).not.toContain("Reveal spoiler");
  });
  it("does not render executable HTML, unsafe links or non-HTTPS images", () => {
    const html = render(
      "<script>alert(1)</script>\n\n[bad](javascript:alert) ![bad](data:image/svg+xml;base64,aaa) [safe](https://earthmc.net)",
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<img");
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
it("publishing access does not give Ministers administrator privileges", () => {
  const minister: Account = {
    username: "Minister",
    role: "minister",
    status: "approved",
    createdAt: "",
  };
  expect(canPublishNews(minister)).toBe(true);
  expect(canReview(minister)).toBe(false);
  expect(canAccessPage(minister, "admin")).toBe(false);
  expect(canAccessPage(minister, "news:new")).toBe(true);
  expect(canAccessPage({ ...minister, role: "member" }, "news:edit:test")).toBe(
    false,
  );
  expect(canPublishNews({ ...minister, status: "pending" })).toBe(false);
  expect(canAccessPage({ ...minister, status: "pending" }, "news")).toBe(false);
});
it("scheduled article labels change at the publication boundary", () => {
  const article = { status: "scheduled", publishAt: 100 } as NewsCard;
  expect(articleStatus(article, 99)).toBe("scheduled");
  expect(articleStatus(article, 100)).toBe("published");
});

it("meeting actions show Join Meeting and an icon-only copy control without exposing the link as text", () => {
  const url = "https://meet.google.com/aeb-wzei-sjd";
  const html = renderToStaticMarkup(<MeetingActions url={url} />);
  expect(html).toContain("Join Meeting");
  expect(html).toContain('aria-label="Copy meeting link"');
  expect(html).toContain("content_copy");
  expect(html).not.toContain(url);
});
it("ordinary readers cannot see publishing controls, drafts or schedules", () => {
  const props = {
    search: "",
    setSearch: () => {},
    tab: "published",
    setTab: () => {},
    go: () => {},
  };
  const reader = renderToStaticMarkup(<Feed {...props} publisher={false} />);
  for (const text of [
    "Publish News",
    "Host a meeting",
    "Drafts",
    "Scheduled",
    "Archived",
  ])
    expect(reader).not.toContain(text);
  const publisher = renderToStaticMarkup(<Feed {...props} publisher={true} />);
  for (const text of ["Publish News", "Host a meeting", "Drafts", "Scheduled"])
    expect(publisher).toContain(text);
  const member: Account = {
    username: "Citizen",
    role: "member",
    status: "approved",
    createdAt: "",
  };
  expect(canAccessPage(member, "news:meeting")).toBe(false);
});

it("whole-article preview includes cover, title, subtitle, author, Markdown and meeting controls", () => {
  const article = {
    id: "preview",
    title: "Meeting preview",
    subtitle: "Preview subtitle",
    body: "**Formatted article**",
    format: "discord" as const,
    thumbnail: "data:image/jpeg;base64,/9j/AA==",
    kind: "meeting" as const,
    meetingUrl: "https://meet.google.com/aeb-wzei-sjd",
    status: "draft" as const,
    publishAt: null,
    author: "Sumeitideas",
    authorUid: "publisher",
    createdAt: "",
    updatedAt: "",
    version: 1,
  };
  const html = renderToStaticMarkup(
    <ArticleContent article={article} preview />,
  );
  for (const text of [
    "news-article-cover",
    "Meeting preview",
    "Preview subtitle",
    "Sumeitideas",
    "<strong>Formatted article</strong>",
    "Join Meeting",
    "Copy meeting link",
  ])
    expect(html).toContain(text);
  expect(html).not.toContain("news-state");
  expect(html).toContain('type="button"');
});
