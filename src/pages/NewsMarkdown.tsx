import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import discordMarkdown from "../lib/discord-markdown";
import { external } from "../lib/native";
function Spoiler({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  return (
    <button
      type="button"
      className={"news-spoiler" + (shown ? " revealed" : "")}
      aria-expanded={shown}
      aria-label={shown ? "Hide spoiler" : "Reveal spoiler"}
      onClick={() => setShown((value) => !value)}
    >
      <span aria-hidden={!shown}>{children}</span>
    </button>
  );
}
export default function NewsMarkdown({
  text,
  format,
}: {
  text: string;
  format: "markdown" | "discord";
}) {
  return (
    <div className="news-markdown">
      <ReactMarkdown
        skipHtml
        remarkPlugins={
          format === "discord"
            ? [remarkGfm, remarkBreaks, discordMarkdown]
            : [remarkGfm]
        }
        components={{
          a: ({ href, children }) =>
            href?.startsWith("https://") ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => {
                  event.preventDefault();
                  void external(href);
                }}
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ src, alt }) =>
            src?.startsWith("https://") ? (
              <img
                src={src}
                alt={alt || ""}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : null,
          span: ({ node, children, ...props }) =>
            node?.properties?.["dataSpoiler"] ||
            node?.properties?.["data-spoiler"] ? (
              <Spoiler>{children}</Spoiler>
            ) : (
              <span {...props}>{children}</span>
            ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
