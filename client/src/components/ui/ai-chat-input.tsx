"use client";

import * as React from "react";
import { useRef, useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

// ----------------------------------------------------------------------
// Transition Physics
// ----------------------------------------------------------------------
const SPRING_TRANSITION =
  "max-width 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), height 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
const SMOOTH_HEIGHT_TRANSITION =
  "max-width 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), height 0.15s ease-out";

// ----------------------------------------------------------------------
// Types & OpenRouter Free Tier Models
// ----------------------------------------------------------------------
interface Attachment {
  id: string;
  file: File;
  url: string;
  name: string;
  width?: number;
  height?: number;
}

export interface ModelOption {
  id: string;
  label: string;
  provider: string;
}

export const OPENROUTER_FREE_MODELS: ModelOption[] = [
  { id: "openai/gpt-oss-20b:free", label: "GPT OSS 20B", provider: "OpenAI" },
  {
    id: "google/gemma-4-31b-it:free",
    label: "Gemma 4 31B",
    provider: "Google",
  },
  {
    id: "google/gemma-4-26b-a4b-it:free",
    label: "Gemma 4 26B",
    provider: "Google",
  },
  {
    id: "nvidia/nemotron-3-nano-30b-a3b:free",
    label: "Nemotron 30B",
    provider: "NVIDIA",
  },
  {
    id: "cohere/north-mini-code:free",
    label: "North Mini Code",
    provider: "Cohere",
  },
  { id: "poolside/laguna-m.1:free", label: "Laguna M.1", provider: "Poolside" },
  { id: "openrouter/free", label: "OpenRouter Auto", provider: "OpenRouter" },
];

// ----------------------------------------------------------------------
// Sub-components
// ----------------------------------------------------------------------
function MorphingText({ text }: { text: string }) {
  const [width, setWidth] = useState<number | "auto">("auto");
  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (spanRef.current) {
      setWidth(spanRef.current.offsetWidth);
    }
  }, [text]);

  return (
    <span
      className="relative inline-flex items-center justify-center overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]"
      style={{ width }}
    >
      <span ref={spanRef} className="invisible whitespace-nowrap px-1">
        {text}
      </span>
      <span
        key={text}
        className="absolute inset-0 flex items-center justify-center whitespace-nowrap animate-in fade-in zoom-in-95 duration-300"
      >
        {text}
      </span>
    </span>
  );
}

function ModelIcon({
  model,
  className,
}: {
  model: string;
  className?: string;
}) {
  const icons: Record<string, string> = {
    OpenAI:
      "https://res.cloudinary.com/drhx7imeb/image/upload/v1781695269/openai-icon_zozuib.svg",
    Google:
      "https://res.cloudinary.com/drhx7imeb/image/upload/v1781695268/google-gemini-icon_l6kk5q.svg",
    NVIDIA:
      "https://res.cloudinary.com/drhx7imeb/image/upload/v1781695268/cursor-ai-code-icon_j4vnux.svg",
    Cohere:
      "https://res.cloudinary.com/drhx7imeb/image/upload/v1781695268/Claude_AI_symbol_yqfzlc.svg",
    Poolside:
      "https://res.cloudinary.com/drhx7imeb/image/upload/v1781695269/z-ai-icon_xi4xvo.svg",
    OpenRouter:
      "https://res.cloudinary.com/drhx7imeb/image/upload/v1781695269/openai-icon_zozuib.svg",
  };

  const modelObj = OPENROUTER_FREE_MODELS.find(
    (m) => m.id === model || m.label === model,
  );
  const provider = modelObj?.provider || "OpenRouter";

  return (
    <img
      src={icons[provider] || icons.OpenRouter}
      alt={provider}
      className={cn("object-contain dark:invert", className)}
    />
  );
}

function ArrowUpIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7 12V2M7 2L2.5 6.5M7 2L11.5 6.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="5"
        y="1"
        width="4"
        height="7"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M2.75 6.5V7a4.25 4.25 0 0 0 8.5 0v-.5M7 11.25V13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" fill="currentColor" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7 2.5V11.5M2.5 7H11.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.5 2.5L11.5 11.5M11.5 2.5L2.5 11.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DynamicBarsIcon({ level }: { level: string }) {
  const isMediumOrHigh = level === "Medium" || level === "Max Effort";
  const isHigh = level === "Max Effort";

  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="1.5"
        y="8"
        width="2.5"
        height="4.5"
        rx="1"
        fill="currentColor"
        opacity={1}
      />
      <rect
        x="5.75"
        y="5"
        width="2.5"
        height="7.5"
        rx="1"
        fill="currentColor"
        opacity={isMediumOrHigh ? 1 : 0.3}
      />
      <rect
        x="10"
        y="2"
        width="2.5"
        height="10.5"
        rx="1"
        fill="currentColor"
        opacity={isHigh ? 1 : 0.3}
      />
    </svg>
  );
}

// ----------------------------------------------------------------------
// Attachment Thumbnail
// ----------------------------------------------------------------------
function AttachmentThumb({
  attachment,
  index,
  onRemove,
  onOpen,
  registerRef,
}: {
  attachment: Attachment;
  index: number;
  onRemove: (id: string) => void;
  onOpen: (attachment: Attachment, rect: DOMRect) => void;
  registerRef: (id: string, el: HTMLButtonElement | null) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <button
      ref={(el) => {
        (btnRef as React.MutableRefObject<HTMLButtonElement | null>).current =
          el;
        registerRef(attachment.id, el);
      }}
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        if (btnRef.current) {
          onOpen(attachment, btnRef.current.getBoundingClientRect());
        }
      }}
      style={{
        animationDelay: `${index * 35}ms`,
        animationFillMode: "backwards",
      }}
      className={cn(
        "group relative size-14 shrink-0 overflow-hidden rounded-xl border border-border bg-muted outline-none",
        "transition-transform duration-200 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] hover:scale-[1.04] active:scale-[0.96]",
        "animate-in fade-in slide-in-from-top-3 zoom-in-90 duration-400",
      )}
      aria-label={`Open preview of ${attachment.name}`}
    >
      <img
        src={attachment.url}
        alt={attachment.name}
        className="size-full object-cover"
        draggable={false}
      />
      <span
        className={cn(
          "absolute inset-0 flex items-start justify-end bg-black/0 transition-colors duration-200",
          isHovered && "bg-black/25",
        )}
      >
        <span
          role="button"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(attachment.id);
          }}
          className={cn(
            "m-1 flex size-4 items-center justify-center rounded-full bg-background/90 text-foreground/70 shadow-sm transition-all duration-200 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] hover:bg-background hover:text-foreground hover:scale-110",
            isHovered
              ? "opacity-100 scale-100"
              : "opacity-0 scale-50 pointer-events-none",
          )}
          aria-label={`Remove ${attachment.name}`}
        >
          <CloseIcon />
        </span>
      </span>
    </button>
  );
}

// ----------------------------------------------------------------------
// Shared-Element Gallery Modal
// ----------------------------------------------------------------------
function AttachmentGalleryModal({
  attachment,
  originRect,
  onClose,
}: {
  attachment: Attachment;
  originRect: DOMRect;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<"opening" | "open" | "closing">("opening");
  const [targetRect, setTargetRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
    radius: number;
  } | null>(null);

  useEffect(() => {
    const maxW = Math.min(window.innerWidth * 0.86, 640);
    const maxH = Math.min(window.innerHeight * 0.78, 720);

    const naturalW = attachment.width || 800;
    const naturalH = attachment.height || 600;
    const scale = Math.min(maxW / naturalW, maxH / naturalH, 1.6);

    const width = naturalW * scale;
    const height = naturalH * scale;

    setTargetRect({
      top: (window.innerHeight - height) / 2,
      left: (window.innerWidth - width) / 2,
      width,
      height,
      radius: 20,
    });

    const raf = requestAnimationFrame(() => setPhase("open"));
    return () => cancelAnimationFrame(raf);
  }, [attachment]);

  const handleClose = useCallback(() => setPhase("closing"), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [handleClose]);

  const isOpen = phase === "open";
  const isClosing = phase === "closing";

  const geometry =
    isOpen && targetRect
      ? targetRect
      : {
          top: originRect.top,
          left: originRect.left,
          width: originRect.width,
          height: originRect.height,
          radius: 12,
        };

  const animEasing = isClosing
    ? "ease-out"
    : "cubic-bezier(0.175, 0.885, 0.32, 1.275)";
  const animDur = isClosing ? "0.3s" : "0.45s";
  const flipTransition = `top ${animDur} ${animEasing}, left ${animDur} ${animEasing}, width ${animDur} ${animEasing}, height ${animDur} ${animEasing}, border-radius ${animDur} ${animEasing}`;

  return (
    <div
      className="fixed inset-0 z-[100]"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-md transition-opacity duration-400"
        style={{ opacity: isOpen ? 1 : 0 }}
      />
      <div
        style={{
          position: "fixed",
          top: geometry.top,
          left: geometry.left,
          width: geometry.width,
          height: geometry.height,
          borderRadius: geometry.radius,
          transition: flipTransition,
          overflow: "hidden",
          boxShadow: isOpen
            ? "0 24px 60px -12px rgb(0 0 0 / 0.35)"
            : "0 0px 0px 0px rgb(0 0 0 / 0)",
        }}
        className="bg-muted"
        onTransitionEnd={() => {
          if (phase === "closing") onClose();
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={attachment.url}
          alt={attachment.name}
          className="size-full object-cover"
          draggable={false}
        />
      </div>

      <button
        type="button"
        onClick={handleClose}
        style={{
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? "scale(1)" : "scale(0.7)",
        }}
        className={cn(
          "fixed right-4 top-4 flex size-9 items-center justify-center rounded-full bg-card/90 text-foreground/70 shadow-md backdrop-blur-sm",
          "transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] hover:bg-card hover:text-foreground",
          !isOpen && "pointer-events-none",
        )}
      >
        <span className="scale-150">
          <CloseIcon />
        </span>
      </button>
    </div>
  );
}

// ----------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------

export interface PromptInputProps {
  onSubmit?: (
    value: string,
    meta: { model: string; effort: string; attachments: File[] },
  ) => void;
  placeholder?: string;
  className?: string;
  efforts?: string[];
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  maxAttachments?: number;
  initialExpanded?: boolean;
}

export const PromptInput = React.forwardRef<HTMLDivElement, PromptInputProps>(
  (
    {
      onSubmit,
      placeholder = "Describe your cloud architecture, e.g. A microservice app with Redis, Postgres, & API Gateway...",
      className,
      efforts = ["Low", "Medium", "Max Effort"],
      defaultValue = "",
      value: controlledValue,
      onChange,
      maxAttachments = 6,
      initialExpanded = true,
    },
    ref,
  ) => {
    const [expanded, setExpanded] = useState(initialExpanded);
    const [isSmoothResize, setIsSmoothResize] = useState(false);
    const [localValue, setLocalValue] = useState(defaultValue);
    const [selectedModel, setSelectedModel] = useState<ModelOption>(
      OPENROUTER_FREE_MODELS[0],
    );
    const [effortIndex, setEffortIndex] = useState(1);
    const [isModelSelectOpen, setIsModelSelectOpen] = useState(false);

    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [activeAttachment, setActiveAttachment] = useState<{
      attachment: Attachment;
      rect: DOMRect;
    } | null>(null);

    // Audio/Voice recording states
    const [isRecording, setIsRecording] = useState(false);
    const [audioData, setAudioData] = useState<number[]>(new Array(5).fill(0));
    const valueRef = useRef(
      controlledValue !== undefined ? controlledValue : localValue,
    );

    // Refs for Web Audio & Speech Recognition cleanup
    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const rafRef = useRef<number | null>(null);
    const recognitionRef = useRef<any>(null);
    const demoIntervalRef = useRef<number | null>(null);
    const demoTextIntervalRef = useRef<number | null>(null);

    const [hoverStyle, setHoverStyle] = useState({
      opacity: 0,
      transform: "translateY(0px) scale(0.95)",
      transition: "none",
    });
    const [containerHeight, setContainerHeight] = useState(160);
    const [textareaHeight, setTextareaHeight] = useState(104);
    const [isScrolling, setIsScrolling] = useState(false);

    const isControlled = controlledValue !== undefined;
    const value = isControlled ? controlledValue : localValue;
    const hasValue = value.trim() !== "" || attachments.length > 0;
    const hasAttachments = attachments.length > 0;

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const internalContainerRef = useRef<HTMLDivElement>(null);
    const topFadeRef = useRef<HTMLDivElement>(null);
    const bottomFadeRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const thumbRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

    useEffect(() => {
      valueRef.current = value;
    }, [value]);

    const updateFades = () => {
      const el = textareaRef.current;
      if (!el) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (topFadeRef.current) {
        topFadeRef.current.style.opacity = Math.min(
          scrollTop / 20,
          1,
        ).toString();
      }
      if (bottomFadeRef.current) {
        const bottomScroll = scrollHeight - clientHeight - scrollTop;
        bottomFadeRef.current.style.opacity = Math.min(
          Math.max(bottomScroll - 16, 0) / 10,
          1,
        ).toString();
      }
    };

    const handleValueChange = useCallback(
      (val: string) => {
        setIsSmoothResize(true);
        if (!isControlled) setLocalValue(val);
        onChange?.(val);
      },
      [isControlled, onChange],
    );

    const expand = () => {
      setIsSmoothResize(false);
      setExpanded(true);
    };

    // --- Voice Recording Logic ---
    const stopRecording = useCallback(() => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      if (demoIntervalRef.current) {
        window.clearInterval(demoIntervalRef.current);
        demoIntervalRef.current = null;
      }
      if (demoTextIntervalRef.current) {
        window.clearInterval(demoTextIntervalRef.current);
        demoTextIntervalRef.current = null;
      }
      setIsRecording(false);
      setAudioData(new Array(5).fill(0));
    }, []);

    const startRecording = useCallback(async () => {
      setIsSmoothResize(false);
      setExpanded(true);

      let stream: MediaStream | null = null;
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
      } catch (err) {
        console.warn(
          "Microphone access denied or unavailable. Falling back to simulated voice mode for demo.",
        );
      }

      setIsRecording(true);

      function simulateText() {
        const fakeText =
          "Design a multi-region Kubernetes cluster with Redis cache, Postgres DB, and an API Gateway";
        const words = fakeText.split(" ");
        let i = 0;
        let currentBase = valueRef.current;
        demoTextIntervalRef.current = window.setInterval(() => {
          if (i < words.length) {
            currentBase = (currentBase ? currentBase + " " : "") + words[i];
            handleValueChange(currentBase);
            i++;
          } else {
            stopRecording();
          }
        }, 300);
      }

      if (stream) {
        streamRef.current = stream;

        const AudioCtx =
          window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateVisualizer = () => {
          analyser.getByteFrequencyData(dataArray);
          const bands = new Array(5).fill(0);
          const step = Math.floor(dataArray.length / 5);
          for (let i = 0; i < 5; i++) {
            let sum = 0;
            for (let j = 0; j < step; j++) {
              sum += dataArray[i * step + j];
            }
            bands[i] = sum / step / 255;
          }
          setAudioData(bands);
          rafRef.current = requestAnimationFrame(updateVisualizer);
        };
        updateVisualizer();

        const SpeechRecognition =
          (window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;

          let baseline = valueRef.current;

          recognition.onresult = (event: any) => {
            let interimTranscript = "";
            let finalTranscript = "";

            for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
              } else {
                interimTranscript += event.results[i][0].transcript;
              }
            }

            if (finalTranscript) {
              baseline += (baseline ? " " : "") + finalTranscript;
            }

            handleValueChange(
              (
                baseline + (interimTranscript ? " " + interimTranscript : "")
              ).trim(),
            );
          };

          recognition.onerror = (e: any) => {
            console.error("Speech recognition error", e);
            stopRecording();
          };

          recognition.onend = () => {
            stopRecording();
          };

          recognitionRef.current = recognition;
          recognition.start();
        } else {
          simulateText();
        }
      } else {
        demoIntervalRef.current = window.setInterval(() => {
          setAudioData(
            Array.from({ length: 5 }, () => Math.random() * 0.8 + 0.1),
          );
        }, 100);
        simulateText();
      }
    }, [handleValueChange, stopRecording]);

    useEffect(() => {
      if (isRecording && textareaRef.current) {
        textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
      }
    }, [value, isRecording]);

    useEffect(() => {
      return () => {
        stopRecording();
        attachments.forEach((a) => URL.revokeObjectURL(a.url));
      };
    }, [stopRecording, attachments]);

    useEffect(() => {
      if ((value.trim() !== "" || hasAttachments) && !expanded) {
        setIsSmoothResize(false);
        setExpanded(true);
      }
    }, [value, expanded, hasAttachments]);

    useEffect(() => {
      if (expanded && !isRecording) {
        const timer = setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            const length = textareaRef.current.value.length;
            textareaRef.current.setSelectionRange(length, length);
          }
        }, 50);
        return () => clearTimeout(timer);
      }
    }, [expanded, isRecording]);

    useEffect(() => {
      if (!textareaRef.current) return;
      const el = textareaRef.current;

      const currentHeight = el.style.height;
      el.style.transition = "none";
      el.style.height = "0px";
      const scrollHeight = el.scrollHeight;
      el.style.height = currentHeight;
      void el.offsetHeight;
      el.style.transition = "";

      const newHeight = Math.max(104, Math.min(scrollHeight, 220));
      el.style.height = `${newHeight}px`;

      setTextareaHeight(newHeight);
      setIsScrolling(scrollHeight > 220);

      setTimeout(updateFades, 0);
    }, [value, expanded]);

    useEffect(() => {
      setContainerHeight(Math.max(156, textareaHeight + 52));
      setTimeout(updateFades, 0);
    }, [textareaHeight]);

    useEffect(() => {
      if (!isModelSelectOpen) return;
      const handleOutsideClick = (e: MouseEvent) => {
        if (
          internalContainerRef.current &&
          !internalContainerRef.current.contains(e.target as Node)
        ) {
          setIsModelSelectOpen(false);
        }
      };
      document.addEventListener("mousedown", handleOutsideClick);
      return () =>
        document.removeEventListener("mousedown", handleOutsideClick);
    }, [isModelSelectOpen]);

    const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
      if (
        internalContainerRef.current &&
        internalContainerRef.current.contains(e.relatedTarget)
      )
        return;
      if (value.trim() === "" && !hasAttachments && !isRecording) {
        setIsModelSelectOpen(false);
      }
    };

    const handleSubmit = () => {
      if (value.trim() === "" && !hasAttachments) return;
      setIsSmoothResize(false);
      onSubmit?.(value, {
        model: selectedModel.id,
        effort: efforts[effortIndex],
        attachments: attachments.map((a) => a.file),
      });
      handleValueChange("");
      attachments.forEach((a) => URL.revokeObjectURL(a.url));
      setAttachments([]);
      setIsModelSelectOpen(false);
    };

    const cycleEffort = (e: React.MouseEvent) => {
      e.stopPropagation();
      setEffortIndex((prev) => (prev + 1) % efforts.length);
    };

    const openFileChooser = (e: React.MouseEvent) => {
      e.stopPropagation();
      fileInputRef.current?.click();
    };

    const handleFilesChosen = async (
      e: React.ChangeEvent<HTMLInputElement>,
    ) => {
      const files = Array.from(e.target.files ?? []).filter((f) =>
        f.type.startsWith("image/"),
      );
      e.target.value = "";

      if (files.length === 0) return;
      const room = Math.max(0, maxAttachments - attachments.length);
      const accepted = files.slice(0, room);

      if (!expanded) {
        setIsSmoothResize(false);
        setExpanded(true);
      } else {
        setIsSmoothResize(true);
      }

      for (const file of accepted) {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () =>
          addAttachment(file, url, img.naturalWidth, img.naturalHeight);
        img.onerror = () => addAttachment(file, url, 800, 600);
        img.src = url;
      }
    };

    const addAttachment = (
      file: File,
      url: string,
      width: number,
      height: number,
    ) => {
      const id = `${file.name}-${file.lastModified}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      setAttachments((prev) => [
        ...prev,
        { id, file, url, name: file.name, width, height },
      ]);
    };

    const removeAttachment = (id: string) => {
      setIsSmoothResize(true);
      setAttachments((prev) => {
        const target = prev.find((a) => a.id === id);
        if (target) URL.revokeObjectURL(target.url);
        return prev.filter((a) => a.id !== id);
      });
      thumbRefs.current.delete(id);
    };

    const showArrow = hasValue && !isRecording;
    const showStop = isRecording;
    const showMic = !hasValue && !isRecording;

    const onActionButtonClick = (e: React.MouseEvent) => {
      e.preventDefault();
      if (isRecording) {
        stopRecording();
      } else if (hasValue) {
        handleSubmit();
      } else {
        startRecording();
      }
    };

    return (
      <>
        <div
          ref={(node) => {
            if (typeof ref === "function") ref(node);
            else if (ref) ref.current = node;
            // @ts-expect-error ref assignment
            internalContainerRef.current = node;
          }}
          onBlur={handleBlur}
          className={cn("relative flex flex-col w-full", className)}
          style={{
            maxWidth: expanded ? 720 : 420,
            transition: isSmoothResize
              ? "max-width 0.15s ease-out"
              : "max-width 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFilesChosen}
            className="hidden"
            tabIndex={-1}
            aria-hidden="true"
          />

          <div
            aria-hidden={!hasAttachments}
            style={{
              height: hasAttachments && expanded ? 74 : 0,
              transition: isSmoothResize
                ? "height 0.15s ease-out"
                : "height 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
            }}
            className="w-full relative z-0 overflow-hidden"
          >
            <div
              style={{
                position: "absolute",
                bottom: -8,
                left: 20,
                right: 20,
                height: 74,
                transform:
                  hasAttachments && expanded
                    ? "translateY(0)"
                    : "translateY(100%)",
                opacity: hasAttachments && expanded ? 1 : 0,
                transition: isSmoothResize
                  ? "transform 0.15s ease-out, opacity 0.15s ease-out"
                  : "transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease-out",
              }}
              className="border border-white/10 border-b-0 bg-[#141416]/90 backdrop-blur-xl rounded-t-2xl px-3 pt-2.5 pb-1 flex items-start gap-2.5 overflow-x-auto prompt-scrollbar"
            >
              {attachments.map((attachment, index) => (
                <AttachmentThumb
                  key={attachment.id}
                  attachment={attachment}
                  index={index}
                  onRemove={removeAttachment}
                  onOpen={(a, rect) =>
                    setActiveAttachment({ attachment: a, rect })
                  }
                  registerRef={(id, el) => thumbRefs.current.set(id, el)}
                />
              ))}
            </div>
          </div>

          <div
            onMouseDown={(e) => {
              const isTextarea = e.target === textareaRef.current;
              if (expanded && !isTextarea && !isRecording) {
                e.preventDefault();
                textareaRef.current?.focus();
              }
            }}
            style={{
              borderRadius: 24,
              height: expanded ? containerHeight : 56,
              transition: isSmoothResize
                ? SMOOTH_HEIGHT_TRANSITION
                : SPRING_TRANSITION,
              overflow: expanded ? "visible" : "hidden",
            }}
            className={cn(
              "relative w-full border border-white/15 bg-[#121214]/90 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 hover:border-white/25 z-10",
              expanded ? "cursor-text" : "cursor-default",
            )}
          >
            <style
              dangerouslySetInnerHTML={{
                __html: `
              .prompt-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; background: transparent; }
              .prompt-scrollbar::-webkit-scrollbar-track { background: transparent; }
              .prompt-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
              .prompt-scrollbar:hover::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.3); }
            `,
              }}
            />

            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => handleValueChange(e.target.value)}
              onScroll={updateFades}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={placeholder}
              aria-label="Prompt"
              disabled={isRecording}
              style={{
                transition: isSmoothResize
                  ? "height 0.15s ease-out"
                  : "opacity 0.3s ease-out, transform 0.3s ease-out, height 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
              }}
              className={cn(
                "prompt-scrollbar absolute top-0 inset-x-0 z-[1] w-full resize-none bg-transparent pl-5 pr-14 py-4 text-base leading-relaxed text-white outline-none placeholder:font-medium placeholder:text-white/35 cursor-text",
                expanded
                  ? "opacity-100 scale-100 translate-y-0"
                  : "opacity-0 scale-95 -translate-y-1 pointer-events-none",
                isScrolling ? "overflow-y-auto" : "overflow-y-hidden",
                isRecording && "pointer-events-none",
              )}
            />

            <div
              ref={topFadeRef}
              className="absolute left-5 right-14 top-0 z-[2] h-8 bg-gradient-to-b from-[#121214] via-[#121214]/90 to-transparent pointer-events-none"
            />
            <div
              ref={bottomFadeRef}
              className="absolute left-5 right-14 z-[2] h-8 bg-gradient-to-t from-[#121214] via-[#121214]/90 to-transparent pointer-events-none"
              style={{
                opacity: 0,
                top: `${textareaHeight - 32}px`,
                transition: isSmoothResize
                  ? "top 0.15s ease-out"
                  : "top 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
              }}
            />

            <button
              type="button"
              onClick={expand}
              style={{
                transition: isSmoothResize
                  ? "none"
                  : "all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
              }}
              className={cn(
                "absolute inset-x-0 top-0 z-[1] cursor-text pl-5 pr-14 py-4 text-left text-base font-medium leading-relaxed text-white/40 outline-none",
                !expanded
                  ? "opacity-100 scale-100 translate-y-0"
                  : "opacity-0 scale-105 translate-y-1 pointer-events-none",
              )}
              aria-label="Open prompt input"
            >
              {placeholder}
            </button>

            <div
              className={cn(
                "absolute bottom-3 left-4 right-14 z-[10] flex items-center gap-1.5 transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]",
                expanded && !isRecording
                  ? "opacity-100 blur-0 translate-y-0 pointer-events-auto"
                  : "opacity-0 blur-sm translate-y-2 pointer-events-none",
              )}
            >
              {/* Model Selector dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsModelSelectOpen((prev) => !prev);
                  }}
                  className={cn(
                    "group flex items-center gap-1.5 rounded-full px-3 py-1.5 text-white/70 transition-all duration-200 outline-none hover:bg-white/10 hover:text-white cursor-pointer bg-white/[0.04] border border-white/10",
                    isModelSelectOpen
                      ? "bg-white/15 text-white border-primary/50"
                      : "",
                  )}
                  aria-label={`Select model. Current: ${selectedModel.label}`}
                >
                  <ModelIcon
                    model={selectedModel.id}
                    className="size-4 opacity-80 group-hover:opacity-100 transition-opacity"
                  />
                  <span className="text-xs font-semibold select-none tracking-tight">
                    <MorphingText text={selectedModel.label} />
                  </span>
                  <span className="text-[9px] bg-primary/20 text-primary border border-primary/30 px-1 py-0.2 rounded font-mono font-bold uppercase ml-0.5">
                    FREE
                  </span>
                </button>

                <div
                  style={{ transformOrigin: "bottom left" }}
                  onMouseLeave={() => {
                    setHoverStyle((prev) => ({
                      ...prev,
                      opacity: 0,
                      transform: prev.transform.replace(
                        "scale(1)",
                        "scale(0.95)",
                      ),
                      transition:
                        "opacity 0.2s ease-in, transform 0.2s ease-out",
                    }));
                  }}
                  className={cn(
                    "absolute bottom-full left-0 mb-3 z-50 w-60 rounded-2xl border border-white/15 bg-[#141416]/95 p-1.5 shadow-2xl backdrop-blur-2xl flex flex-col gap-1 transition-all duration-400 cursor-default",
                    isModelSelectOpen
                      ? "opacity-100 scale-100 translate-y-0 pointer-events-auto ease-[cubic-bezier(0.34,1.56,0.64,1)]"
                      : "opacity-0 scale-95 translate-y-3 pointer-events-none ease-[cubic-bezier(0.175,0.885,0.32,1.275)]",
                  )}
                >
                  <div className="px-2.5 py-1.5 border-b border-white/[0.06] flex items-center justify-between">
                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                      OpenRouter Free Models
                    </span>
                    <span className="text-[9px] text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 rounded font-mono">
                      7 Available
                    </span>
                  </div>
                  <div className="relative flex flex-col gap-0.5 max-h-60 overflow-y-auto prompt-scrollbar">
                    <div
                      style={hoverStyle}
                      className="absolute left-0 right-0 top-0 h-9 -z-10 rounded-xl bg-white/10 pointer-events-none"
                    />
                    {OPENROUTER_FREE_MODELS.map((m, idx) => (
                      <button
                        key={m.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => {
                          setHoverStyle((prev) => ({
                            opacity: 1,
                            transform: `translateY(${idx * 38}px) scale(1)`,
                            transition:
                              prev.opacity === 0
                                ? "opacity 0.15s ease-out"
                                : "transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.15s ease",
                          }));
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedModel(m);
                          setIsModelSelectOpen(false);
                        }}
                        className={cn(
                          "group relative flex h-9 w-full items-center justify-between rounded-xl px-3 py-1.5 text-left text-xs font-medium text-white/80 outline-none active:scale-[0.98] cursor-pointer hover:text-white transition-colors",
                          selectedModel.id === m.id
                            ? "bg-primary/20 text-white font-semibold"
                            : "",
                        )}
                      >
                        <span className="flex items-center gap-2.5 truncate">
                          <ModelIcon
                            model={m.id}
                            className="size-4 opacity-80 group-hover:opacity-100 transition-opacity"
                          />
                          <span className="truncate">{m.label}</span>
                        </span>
                        <span className="text-[9px] text-white/30 font-mono shrink-0 ml-1">
                          {m.provider}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={cycleEffort}
                className="group flex items-center gap-1.5 rounded-full px-3 py-1.5 text-white/60 transition-all duration-200 hover:bg-white/10 hover:text-white outline-none cursor-pointer bg-white/[0.03] border border-white/5"
              >
                <DynamicBarsIcon level={efforts[effortIndex]} />
                <span className="text-xs font-semibold select-none transition-colors">
                  <MorphingText text={efforts[effortIndex]} />
                </span>
              </button>

              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={openFileChooser}
                disabled={attachments.length >= maxAttachments}
                className="ml-auto flex size-8 items-center justify-center rounded-full text-white/50 transition-all duration-200 hover:bg-white/10 hover:text-white outline-none cursor-pointer disabled:opacity-40 disabled:pointer-events-none bg-white/[0.03]"
              >
                <PlusIcon />
              </button>
            </div>

            <div
              className={cn(
                "absolute right-14 bottom-3 z-[10] flex h-9 items-center justify-end gap-[3px] transition-all duration-400 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]",
                isRecording
                  ? "w-16 opacity-100 translate-x-0"
                  : "w-0 opacity-0 translate-x-4 pointer-events-none",
              )}
            >
              {audioData.map((val, i) => (
                <div
                  key={i}
                  className="w-1.5 rounded-full bg-primary transition-[height] duration-75 ease-out"
                  style={{ height: `${Math.max(4, val * 28)}px` }}
                />
              ))}
            </div>

            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={onActionButtonClick}
              aria-label={
                showArrow
                  ? "Send prompt"
                  : showStop
                    ? "Stop recording"
                    : "Use voice input"
              }
              style={{ borderRadius: 9999 }}
              className="absolute right-3 bottom-3 z-[10] flex h-10 w-10 items-center justify-center bg-primary text-white font-bold shadow-md transition-all duration-300 hover:scale-105 hover:brightness-110 active:scale-95 outline-none cursor-pointer"
            >
              <span className="relative flex h-full w-full items-center justify-center">
                <span
                  className={cn(
                    "absolute inset-0 flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]",
                    showArrow
                      ? "opacity-100 scale-100 rotate-0 blur-none"
                      : "opacity-0 scale-50 rotate-45 blur-[1px] pointer-events-none",
                  )}
                >
                  <ArrowUpIcon />
                </span>
                <span
                  className={cn(
                    "absolute inset-0 flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]",
                    showMic
                      ? "opacity-100 scale-100 rotate-0 blur-none"
                      : "opacity-0 scale-50 rotate-45 blur-[1px] pointer-events-none",
                  )}
                >
                  <MicIcon />
                </span>
                <span
                  className={cn(
                    "absolute inset-0 flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]",
                    showStop
                      ? "opacity-100 scale-100 rotate-0 blur-none"
                      : "opacity-0 scale-50 rotate-45 blur-[1px] pointer-events-none",
                  )}
                >
                  <StopIcon />
                </span>
              </span>
            </button>
          </div>
        </div>

        {activeAttachment && (
          <AttachmentGalleryModal
            attachment={activeAttachment.attachment}
            originRect={activeAttachment.rect}
            onClose={() => setActiveAttachment(null)}
          />
        )}
      </>
    );
  },
);

PromptInput.displayName = "PromptInput";
