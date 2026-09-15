import type { MouseEvent } from 'react';
import { Loader2, Search } from 'lucide-react';

interface GenerationRecoveryButtonProps {
  busy: boolean;
  onCheck: (event: MouseEvent<HTMLButtonElement>) => void;
  label: string;
  checkingLabel: string;
  className?: string;
}

/** Shared, query-only action for interrupted image/video/audio/text requests. */
export function GenerationRecoveryButton({
  busy,
  onCheck,
  label,
  checkingLabel,
  className = '',
}: GenerationRecoveryButtonProps) {
  return (
    <button
      type="button"
      onClick={onCheck}
      disabled={busy}
      className={`nodrag nopan flex shrink-0 items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-white/70 transition-colors hover:bg-white/[0.1] hover:text-white disabled:opacity-50 ${className}`}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
      {busy ? checkingLabel : label}
    </button>
  );
}
