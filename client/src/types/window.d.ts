/**
 * Vendor-prefixed browser APIs with no standard lib.dom typing.
 * Declared once here so call sites never need `(window as any)`.
 */
interface Window {
  webkitAudioContext?: typeof AudioContext;
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
}

interface SpeechRecognitionLike {
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{
    0: { transcript: string };
    isFinal: boolean;
    length: number;
  }>;
}
