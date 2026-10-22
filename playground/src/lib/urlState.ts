/**
 * Shareable playground state, encoded in the URL hash.
 *
 * Nothing is persisted server-side. The hash carries the pattern, the loaded case, and the
 * two outputs, so a link reproduces exactly what the sender was looking at.
 */

import type { PatternId } from "../worker/protocol";

export interface PlaygroundState {
  patternId: PatternId;
  caseId: string | null;
  leader: string;
  validator: string;
}

const MAX_HASH_CHARS = 8000;

/** Encode state as a compact, URL-safe string. */
export function encodeState(state: PlaygroundState): string {
  const payload = {
    p: state.patternId,
    c: state.caseId ?? "",
    l: state.leader,
    v: state.validator,
  };
  const json = JSON.stringify(payload);
  return encodeURIComponent(json);
}

/** Decode a hash segment back into state. Returns null when it cannot be read. */
export function decodeState(encoded: string): PlaygroundState | null {
  if (!encoded) return null;
  try {
    const payload = JSON.parse(decodeURIComponent(encoded)) as {
      p?: string;
      c?: string;
      l?: string;
      v?: string;
    };
    if (!payload.p || typeof payload.l !== "string" || typeof payload.v !== "string") {
      return null;
    }
    return {
      patternId: payload.p as PatternId,
      caseId: payload.c ? payload.c : null,
      leader: payload.l,
      validator: payload.v,
    };
  } catch {
    return null;
  }
}

/**
 * Build a share link. The hash is length-capped: an oversized state is not shareable, and
 * silently truncating it would produce a link that shows something else.
 */
export function buildShareLink(state: PlaygroundState): string | null {
  const encoded = encodeState(state);
  if (encoded.length > MAX_HASH_CHARS) {
    return null;
  }
  const base =
    typeof window === "undefined" ? "" : `${window.location.origin}${window.location.pathname}`;
  return `${base}#/playground?state=${encoded}`;
}
