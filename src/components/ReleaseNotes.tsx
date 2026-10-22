import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
export default function ReleaseNotes({ notes }: { notes: string }) {
  return (
    <div className="release-notes-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target={href?.startsWith("#") ? undefined : "_blank"}
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
        }}
      >
        {notes}
      </ReactMarkdown>
    </div>
  );
}
