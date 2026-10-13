import { useState, useRef, useEffect, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Paperclip, ArrowUpIcon } from "lucide-react";

interface AutoResizeProps {
  minHeight: number;
  maxHeight?: number;
}

function useAutoResizeTextarea({ minHeight, maxHeight }: AutoResizeProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }

      textarea.style.height = `${minHeight}px`; // reset first
      const newHeight = Math.max(
        minHeight,
        Math.min(textarea.scrollHeight, maxHeight ?? Infinity),
      );
      textarea.style.height = `${newHeight}px`;
    },
    [minHeight, maxHeight],
  );

  useEffect(() => {
    if (textareaRef.current)
      textareaRef.current.style.height = `${minHeight}px`;
  }, [minHeight]);

  return { textareaRef, adjustHeight };
}

export default function Chatbox() {
  const [message, setMessage] = useState("");
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 48,
    maxHeight: 150,
  });

  const canSend = message.trim().length > 0;

  const send = () => {
    if (!canSend) return;
    setMessage("");
    adjustHeight(true);
  };

  return (
    <div className="relative w-full">
      <div className="relative rounded-2xl border border-white/10 bg-white/[0.06] shadow-2xl shadow-black/60 backdrop-blur-2xl">
        <Textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            adjustHeight();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask about your clusters…"
          aria-label="Ask about your clusters"
          className={cn(
            "w-full resize-none border-none px-4 py-3",
            "bg-transparent text-[13px] text-fg",
            "focus-visible:ring-0 focus-visible:ring-offset-0",
            "placeholder:text-muted min-h-[48px]",
          )}
          style={{ overflow: "hidden" }}
        />

        <div className="flex items-center justify-between p-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Attach a file"
            className="h-8 w-8 text-muted hover:bg-hover hover:text-fg"
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          <Button
            onClick={send}
            disabled={!canSend}
            aria-label="Send"
            className={cn(
              "h-8 w-8 rounded-full p-0 transition-colors",
              canSend
                ? "bg-accent text-on-accent hover:bg-accent-hover"
                : "bg-hover text-disabled",
            )}
          >
            <ArrowUpIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
