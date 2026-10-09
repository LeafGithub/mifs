export type InjectErrorCode =
  | 'NO_SC2_SCRIPT' // <script id="script-sugarcube"> missing or not unique: not a SugarCube 2 game HTML
  | 'ANCHOR_HEAD_MISSING' // SugarCube start code changed, patch anchor not found
  | 'ANCHOR_TAIL_MISSING'
  | 'ALREADY_PATCHED' // game HTML already waits for ModLoader
  | 'ALREADY_INJECTED' // game HTML already contains a ModLoader payload
  | 'NO_SCRIPT_TAG'; // nothing to insert before

/** Thrown for input the pipeline cannot handle. `code` is stable and meant for UI messages. */
export class InjectError extends Error {
  readonly code: InjectErrorCode;

  constructor(code: InjectErrorCode, message: string) {
    super(message);
    this.name = 'InjectError';
    this.code = code;
  }
}
