import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-[8px] border border-[#1E1E24] bg-[#1C1C22] px-3 py-2 text-xs font-sans text-[#FAFAFA] placeholder:text-[#555560] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(240,82,30,0.25)] focus-visible:border-[rgba(240,82,30,0.5)] transition-all disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
