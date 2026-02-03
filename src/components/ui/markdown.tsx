import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/components/ui/utils";

interface MarkdownProps {
  content: string;
  className?: string;
}

export function Markdown({ content, className }: MarkdownProps) {
  if (!content) return null;

  return (
    <div className={cn("text-sm leading-relaxed text-gray-700", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ ...props }) => (
            <p className="mb-2 last:mb-0" {...props} />
          ),
          ul: ({ ...props }) => (
            <ul className="list-disc pl-5 space-y-1" {...props} />
          ),
          ol: ({ ...props }) => (
            <ol className="list-decimal pl-5 space-y-1" {...props} />
          ),
          li: ({ ...props }) => (
            <li className="leading-relaxed" {...props} />
          ),
          blockquote: ({ ...props }) => (
            <blockquote className="border-l-2 border-gray-200 pl-3 text-gray-500" {...props} />
          ),
          a: ({ ...props }) => (
            <a className="text-blue-600 hover:underline" {...props} />
          ),
          hr: ({ ...props }) => (
            <hr className="my-3 border-gray-200" {...props} />
          ),
          pre: ({ ...props }) => (
            <pre className="overflow-x-auto rounded-lg bg-gray-900 text-gray-100 p-3 text-[0.85em] leading-relaxed" {...props} />
          ),
          code: ({ inline, className: codeClassName, children, ...props }) => {
            if (inline) {
              return (
                <code
                  className={cn("rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em]", codeClassName)}
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code
                className={cn("font-mono text-[0.85em]", codeClassName)}
                {...props}
              >
                {String(children).replace(/\n$/, "")}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
