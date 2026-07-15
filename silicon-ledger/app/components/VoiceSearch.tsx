import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Search, Loader2 } from "lucide-react";

interface VoiceSearchProps {
  onResult: (query: string) => void;
  placeholder?: string;
}

export function VoiceSearch({ onResult, placeholder = "Search transactions or say 'show me expenses over $500 last month'..." }: VoiceSearchProps) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const current = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join("");
      setTranscript(current);
    };

    recognition.onend = () => {
      setListening(false);
      if (transcript) {
        setInputValue(transcript);
        onResult(transcript);
      }
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
  }, [onResult, transcript]);

  const toggleListening = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
    } else {
      setTranscript("");
      try {
        recognitionRef.current?.start();
        setListening(true);
      } catch {
        setListening(false);
      }
    }
  }, [listening]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onResult(inputValue.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative flex items-center gap-2">
      <div className="relative flex-1">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={placeholder}
          className="w-full h-10 pl-9 pr-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-expense font-mono"
        />
        {listening && transcript && (
          <div className="absolute -bottom-6 left-0 right-0 text-[10px] text-zinc-500 font-mono truncate px-1">
            {transcript}
          </div>
        )}
      </div>

      {supported && (
        <button
          type="button"
          onClick={toggleListening}
          disabled={!supported}
          className={`p-2.5 rounded-lg border border-hairline transition-colors ${
            listening
              ? "bg-expense text-white border-expense animate-pulse"
              : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          }`}
          title={listening ? "Tap to stop" : "Tap to search by voice"}
        >
          {listening ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />}
        </button>
      )}

      <button
        type="submit"
        className="px-3 py-2 text-xs font-medium rounded-lg border border-hairline text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
      >
        Search
      </button>
    </form>
  );
}
