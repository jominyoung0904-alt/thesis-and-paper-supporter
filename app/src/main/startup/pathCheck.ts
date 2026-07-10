import { tmpdir } from 'node:os';
import { sep } from 'node:path';

/**
 * Inputs required to decide whether the current process was launched from a
 * safe location. Kept pure (no `electron` import) so it is unit-testable
 * outside of an Electron runtime — mirrors the pattern used by
 * src/main/paths.ts.
 */
export interface CheckRunLocationInput {
  /** Mirrors Node's `process.execPath`. */
  execPath: string;
  /**
   * Mirrors `process.env.PORTABLE_EXECUTABLE_DIR`. The electron-builder
   * portable target ALWAYS runs from a self-extracted %TEMP% copy, so
   * `execPath` alone would flag every launch as temp-folder. When this is
   * set, it is the location the user actually launched from and MUST be the
   * path we judge instead of `execPath`.
   */
  portableDir?: string;
  /**
   * Candidate OS temp directories to check `execPath` against. Callers
   * typically pass `[tmpdir()]`, but the list form allows tests (and
   * platform-specific callers) to inject additional known temp roots
   * (e.g. Windows `%TEMP%` vs `%TMP%` when they differ).
   */
  tempDirs: string[];
  /** Mirrors Electron's `app.isPackaged`. Dev mode always passes the check. */
  isPackaged: boolean;
}

/** Reason a run-location check failed, used to pick the right user-facing copy. */
export type RunLocationFailureReason = 'temp-folder' | 'zip-preview';

export interface RunLocationVerdict {
  /** `true` when the process may continue starting up. */
  ok: boolean;
  /** Present only when `ok` is `false`. */
  reason?: RunLocationFailureReason;
  /** Korean, plain-language message ready to show the user. Present only when `ok` is `false`. */
  userMessage?: string;
}

const ZIP_PREVIEW_MESSAGE =
  '압축 파일 안에서 바로 실행하신 것 같아요. 먼저 압축을 풀어주세요.\n\n' +
  "1. 내려받은 zip 파일에 마우스 오른쪽 버튼 → '압축 풀기'\n" +
  "2. 풀린 폴더 안의 '논문서포터'를 실행해 주세요";

const TEMP_FOLDER_MESSAGE =
  '임시 폴더에서 실행되고 있어요. 이 상태로는 작업 내용이 안전하게 저장되지 않을 수 있어요.\n\n' +
  "1. 내려받은 zip 파일에 마우스 오른쪽 버튼 → '압축 풀기'\n" +
  "2. 풀린 폴더를 원하는 위치(예: 문서 폴더)로 옮긴 뒤 그 안의 '논문서포터'를 실행해 주세요";

/** Windows Explorer's zip-preview extraction path segment, e.g. `...\Temp1_paper.zip\...`. */
const ZIP_PREVIEW_PATTERN = /Temp1_[^\\/]*\.zip[\\/]/i;

/**
 * Normalizes a path for prefix comparison: lowercases (Windows paths are
 * case-insensitive) and strips a trailing separator so `C:\Temp` and
 * `C:\Temp\` compare equal as prefixes.
 */
function normalizeForPrefixCheck(path: string): string {
  const lower = path.toLowerCase();
  return lower.endsWith(sep) ? lower.slice(0, -1) : lower;
}

function isUnderTempDir(execPath: string, tempDir: string): boolean {
  const normalizedExecPath = execPath.toLowerCase();
  const normalizedTempDir = normalizeForPrefixCheck(tempDir);
  return normalizedExecPath.startsWith(normalizedTempDir + sep);
}

/**
 * Detects two variants of the "ran without extracting the zip" mistake
 * (NFR-DEP-002): (a) launching the exe straight from an OS temp directory
 * (typical after double-clicking inside a zip preview in Explorer) and
 * (b) the Explorer zip-preview path pattern itself (`Temp1_*.zip\`), which
 * can appear outside a recognized OS temp root on some Windows setups.
 *
 * Dev mode (`isPackaged: false`) always passes — this check only guards
 * the packaged, portable distribution.
 */
export function checkRunLocation(input: CheckRunLocationInput): RunLocationVerdict {
  if (!input.isPackaged) {
    return { ok: true };
  }

  // Portable builds always execute from a self-extracted temp copy, so the
  // user-visible launch location (PORTABLE_EXECUTABLE_DIR) is what we judge.
  // Note: the env var is the exe's *directory*, so append a filename segment
  // to keep the same "path under temp dir" semantics as execPath.
  const effectivePath =
    input.portableDir !== undefined && input.portableDir !== ''
      ? `${input.portableDir}${sep}논문서포터.exe`
      : input.execPath;

  if (ZIP_PREVIEW_PATTERN.test(effectivePath)) {
    return { ok: false, reason: 'zip-preview', userMessage: ZIP_PREVIEW_MESSAGE };
  }

  const tempDirs = input.tempDirs.length > 0 ? input.tempDirs : [tmpdir()];
  const isInTemp = tempDirs.some((tempDir) => isUnderTempDir(effectivePath, tempDir));

  if (isInTemp) {
    return { ok: false, reason: 'temp-folder', userMessage: TEMP_FOLDER_MESSAGE };
  }

  return { ok: true };
}
