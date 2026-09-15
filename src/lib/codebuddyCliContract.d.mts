export const CODEBUDDY_AUTO_MODEL: string;

export function orderCodeBuddyModels(models: unknown): string[];
export function parseCodeBuddyConfiguredModel(value: unknown): string | null;
export function parseCodeBuddySupportedModels(value: unknown): string[];
export function mergeCodeBuddyModels(helpOutput: unknown, configuredModel: unknown): string[];
export function parseCodeBuddyActiveSessions(value: unknown): Array<{
  pid: number;
  kind: string;
  sessionId?: string;
  status?: string;
}>;

export function getCodeBuddyInputModalities(slug: string): Array<'text' | 'image'>;

export function buildCodeBuddyTextArgs(model: unknown): string[];
