"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  DocumentDuplicateIcon,
  ArrowPathIcon,
  HandThumbUpIcon,
  HandThumbDownIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";

const WORD_MS = 55;
const HOLD_MS = 99999; // don't loop — hold forever once done

export interface StreamingTextProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
  onComplete?: () => void;
  showActions?: boolean;
  onCopy?: () => void;
  onRetry?: () => void;
  onFeedback?: (type: "up" | "down") => void;
  followUps?: string[];
  onFollowUpClick?: (prompt: string) => void;
}

export default function StreamingText({
  content,
  isStreaming = false,
  className = "",
  onComplete,
  showActions = true,
  onCopy,
  onRetry,
  onFeedback,
  followUps,
  onFollowUpClick,
}: StreamingTextProps) {
  // Split on whitespace, preserving the delimiter so we can re-join
  const tokens = content ? content.split(/(\s+)/) : [];
  const [count, setCount] = useState(() => (isStreaming ? 0 : tokens.length));
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  const done = count >= tokens.length;

  // Reset when content changes (new message)
  useEffect(() => {
    setCount(isStreaming ? 0 : tokens.length);
  }, [content, isStreaming, tokens.length]);

  useEffect(() => {
    if (!isStreaming) {
      setCount(tokens.length);
      return;
    }
    const t = setTimeout(
      () =>
        setCount((c) => {
          const next = c + 1;
          if (next >= tokens.length) {
            onComplete?.();
            return tokens.length;
          }
          return next;
        }),
      done ? HOLD_MS : WORD_MS,
    );
    return () => clearTimeout(t);
  }, [count, done, tokens.length, isStreaming, onComplete]);

  const handleCopy = () => {
    if (!content) return;
    void navigator.clipboard.writeText(content);
    setCopied(true);
    onCopy?.();
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFeedback = (type: "up" | "down") => {
    setFeedback(type);
    onFeedback?.(type);
  };

  return (
    <div className={`w-full ${className}`}>
      {/* Streaming paragraph — words fade in one-by-one */}
      {isStreaming && !done ? (
        <p className="text-[13px] leading-relaxed text-foreground/90 select-text">
          {tokens.slice(0, count).map((token, i) => (
            <span
              key={i}
              className="inline"
              style={{ animation: "fade-in 250ms ease-out both" }}
            >
              {token}
            </span>
          ))}
          {/* blinking cursor */}
          <span
            className="ml-0.5 inline-block h-3 w-0.5 translate-y-0.5 rounded-full bg-foreground/70"
            style={{ animation: "fade-in 150ms ease-out both" }}
          />
        </p>
      ) : (
        /* Done — render full markdown */
        <div className="text-[13px] leading-relaxed text-foreground/90 select-text prose theme-prose prose-sm max-w-none prose-p:my-1.5 prose-p:leading-relaxed prose-headings:text-foreground/95 prose-headings:font-semibold prose-headings:my-2 prose-ul:my-1.5 prose-li:my-0.5 prose-li:text-foreground/80 prose-strong:text-foreground prose-code:text-foreground/90 prose-code:bg-foreground/[0.08] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[12px] prose-code:font-mono">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      )}

      {/* Action icons — appear after streaming done */}
      {showActions && (
        <div
          className="mt-2 flex items-center gap-0.5 transition-opacity duration-400"
          style={{
            opacity: done ? 1 : 0,
            pointerEvents: done ? "auto" : "none",
          }}
        >
          <button
            type="button"
            onClick={handleCopy}
            title={copied ? "Copied" : "Copy"}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground/80 transition-colors"
          >
            {copied ? (
              <CheckIcon className="w-3.5 h-3.5" />
            ) : (
              <DocumentDuplicateIcon className="w-3.5 h-3.5" />
            )}
          </button>

          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              title="Regenerate"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground/80 transition-colors"
            >
              <ArrowPathIcon className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => handleFeedback("up")}
            title="Good response"
            className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
              feedback === "up"
                ? "text-foreground/90 bg-foreground/10"
                : "text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground/80"
            }`}
          >
            <HandThumbUpIcon className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => handleFeedback("down")}
            title="Poor response"
            className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
              feedback === "down"
                ? "text-foreground/90 bg-foreground/10"
                : "text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground/80"
            }`}
          >
            <HandThumbDownIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Follow-up prompts */}
      {followUps && followUps.length > 0 && (
        <div
          className="mt-2.5 transition-opacity duration-400"
          style={{
            opacity: done ? 1 : 0,
            pointerEvents: done ? "auto" : "none",
          }}
        >
          <p className="text-[12px] font-medium text-muted-foreground mb-0.5">
            Follow-ups
          </p>
          <div className="flex flex-col">
            {followUps.map((text, i) => (
              <button
                key={text}
                type="button"
                onClick={() => onFollowUpClick?.(text)}
                className="-mx-1.5 flex items-center gap-2 border-b border-border px-1.5 py-1.5 text-left text-[12.5px] text-foreground/70 transition-colors duration-100 hover:bg-foreground/[0.04] hover:text-foreground/90"
                style={
                  done
                    ? {
                        animation: `fade-up 350ms cubic-bezier(0.23,1,0.32,1) ${i * 90}ms both`,
                      }
                    : { opacity: 0 }
                }
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 text-muted-foreground"
                >
                  <path d="M9 10l-5 5 5 5" />
                  <path d="M20 4v7a4 4 0 0 1-4 4H4" />
                </svg>
                {text}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
