"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Timer as TimerIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CollapsibleHomeCard } from "@/components/home/CollapsibleHomeCard";
import { FormInput } from "@/components/ui/form-input";
import { usePersistedJson } from "@/hooks/use-persisted-json";
import { usePersistedOpen } from "@/hooks/use-persisted-open";
import { cn } from "@/lib/utils";

type FocusTimerState = {
  totalSeconds: number;
  remainingSeconds: number;
  endsAt: number | null;
};

type BrowserAudioContextCtor = typeof AudioContext;

const PRESET_MINUTES = [15, 25, 45];

const DEFAULT_STATE: FocusTimerState = {
  totalSeconds: PRESET_MINUTES[1] * 60,
  remainingSeconds: PRESET_MINUTES[1] * 60,
  endsAt: null,
};

function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getAudioContextCtor(): BrowserAudioContextCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: BrowserAudioContextCtor })
      .webkitAudioContext
  );
}

export function DashboardFocusTimer() {
  const [state, setState] = usePersistedJson<FocusTimerState>(
    "dashboard-focus-timer",
    DEFAULT_STATE,
  );
  const { open, toggle } = usePersistedOpen(
    "dashboard-focus-timer-open",
    false,
  );
  const [, forceTick] = useState(0);
  const [customMinutes, setCustomMinutes] = useState("");
  const audioContextRef = useRef<AudioContext | null>(null);

  const running = state.endsAt !== null;
  const remainingSeconds = running
    ? Math.max(0, Math.round((state.endsAt! - Date.now()) / 1000))
    : state.remainingSeconds;

  function playCompletionChime() {
    const Ctor = getAudioContextCtor();
    if (!Ctor) return;
    if (!audioContextRef.current) {
      audioContextRef.current = new Ctor();
    }
    const ctx = audioContextRef.current;
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    const now = ctx.currentTime;
    [0, 0.18, 0.36].forEach((offset, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = index === 2 ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.2, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.16);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.18);
    });
  }

  useEffect(() => {
    if (state.endsAt === null) return;
    const endsAt = state.endsAt;
    const interval = setInterval(() => {
      const left = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      if (left <= 0) {
        setState({ ...state, remainingSeconds: 0, endsAt: null });
        playCompletionChime();
      } else {
        forceTick((tick) => tick + 1);
      }
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.endsAt]);

  useEffect(() => {
    return () => {
      audioContextRef.current?.close();
    };
  }, []);

  function selectPreset(minutes: number) {
    setState({
      totalSeconds: minutes * 60,
      remainingSeconds: minutes * 60,
      endsAt: null,
    });
  }

  function applyCustomMinutes() {
    const parsed = Number.parseInt(customMinutes, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    selectPreset(Math.min(180, parsed));
    setCustomMinutes("");
  }

  function start() {
    if (remainingSeconds <= 0) return;
    // Cria/retoma o AudioContext dentro do gesto de clique — navegadores
    // bloqueiam áudio iniciado fora de uma interação do usuário.
    const Ctor = getAudioContextCtor();
    if (Ctor) {
      if (!audioContextRef.current) {
        audioContextRef.current = new Ctor();
      }
      if (audioContextRef.current.state === "suspended") {
        void audioContextRef.current.resume();
      }
    }
    setState({ ...state, endsAt: Date.now() + remainingSeconds * 1000 });
  }

  function pause() {
    setState({ ...state, remainingSeconds, endsAt: null });
  }

  function reset() {
    setState({ ...state, remainingSeconds: state.totalSeconds, endsAt: null });
  }

  const percentElapsed =
    state.totalSeconds > 0
      ? Math.min(
          100,
          Math.max(
            0,
            ((state.totalSeconds - remainingSeconds) / state.totalSeconds) *
              100,
          ),
        )
      : 0;

  const finished = remainingSeconds <= 0;

  const statusLabel = finished
    ? "Tempo esgotado"
    : running
      ? `${formatClock(remainingSeconds)} contando`
      : remainingSeconds < state.totalSeconds
        ? `${formatClock(remainingSeconds)} em pausa`
        : "Pronto pra começar";

  return (
    <CollapsibleHomeCard
      icon={
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
          <TimerIcon className="size-6" aria-hidden />
        </span>
      }
      title="Quanto tempo você vai focar?"
      status={statusLabel}
      open={open}
      onToggle={toggle}
    >
      <p className="text-xs text-[var(--muted-foreground)]">
        {finished
          ? "Tempo esgotado, toque em reiniciar pra começar de novo."
          : "Só neste computador, e toca um aviso sonoro quando o tempo acabar."}
      </p>

      <p
        className={cn(
          "mt-3 text-center text-3xl font-bold tabular-nums tracking-tight",
          finished ? "text-rose-600" : "text-[var(--foreground)]",
        )}
      >
        {formatClock(remainingSeconds)}
      </p>

      <div className="mt-2 h-2 w-full rounded bg-[var(--muted)]">
        <div
          className="h-2 rounded bg-rose-500 transition-[width] motion-reduce:transition-none"
          style={{ width: `${percentElapsed}%` }}
        />
      </div>

      <div className="mt-3 flex items-center justify-center gap-1.5">
        {PRESET_MINUTES.map((minutes) => (
          <Button
            key={minutes}
            type="button"
            size="sm"
            variant={
              state.totalSeconds === minutes * 60 ? "secondary" : "outline"
            }
            onClick={() => selectPreset(minutes)}
            disabled={running}
          >
            {minutes}min
          </Button>
        ))}
      </div>

      <form
        className="mt-2 flex items-center justify-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          applyCustomMinutes();
        }}
      >
        <FormInput
          type="number"
          min={1}
          max={180}
          inputMode="numeric"
          value={customMinutes}
          onChange={(event) => setCustomMinutes(event.target.value)}
          placeholder="outro (min)"
          aria-label="Minutos personalizados"
          disabled={running}
          className="w-28"
          inputClassName="h-8 px-2 text-center text-sm"
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={running || !customMinutes.trim()}
        >
          Definir
        </Button>
      </form>

      <div className="mt-3 flex items-center justify-center gap-2">
        {running ? (
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            onClick={pause}
            aria-label="Pausar"
          >
            <Pause className="size-4" aria-hidden />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            onClick={start}
            aria-label="Iniciar"
            disabled={remainingSeconds <= 0}
          >
            <Play className="size-4" aria-hidden />
          </Button>
        )}
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={reset}
          aria-label="Reiniciar"
          className={cn("text-[var(--muted-foreground)]")}
        >
          <RotateCcw className="size-4" aria-hidden />
        </Button>
      </div>
    </CollapsibleHomeCard>
  );
}
