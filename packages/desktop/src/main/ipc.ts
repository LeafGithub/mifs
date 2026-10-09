import { ipcMain } from 'electron';
import log from 'electron-log/main';
import type { ZodType } from 'zod';

/** Error with a stable code that survives the IPC boundary (the renderer turns it into a PlatformError). */
export class AppError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };

/**
 * Registers an IPC handler. Input is validated with zod (the renderer is not trusted), and failures come back as a
 * `Result` instead of a rejected invoke, whose message Electron prefixes with noise.
 */
export function handle<I, O>(channel: string, schema: ZodType<I> | null, fn: (input: I) => Promise<O> | O): void {
  ipcMain.handle(channel, async (_event, raw: unknown): Promise<Result<O>> => {
    try {
      const input = schema ? schema.parse(raw) : (undefined as I);
      return { ok: true, value: await fn(input) };
    } catch (e) {
      if (e instanceof AppError) return { ok: false, error: { code: e.code, message: e.message } };
      log.error(`[${channel}]`, e);
      const name = e instanceof Error ? e.name : '';
      return {
        ok: false,
        error: name === 'ZodError' ? { code: 'BAD_REQUEST', message: 'Invalid request' } : { code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) },
      };
    }
  });
}
