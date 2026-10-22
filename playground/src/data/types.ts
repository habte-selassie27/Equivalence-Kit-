/**
 * Shapes of the generated site data.
 *
 * These mirror `tools/export_site_data.py`. The data is generated from the repo, never
 * hand-edited, so the site and the tests always agree.
 */

import type { PatternId } from "../worker/protocol";

export interface FieldSpec {
  name: string;
  normalizer: string;
  comparator: string;
  compared: boolean;
  explanation: string;
}

export interface PatternSpec {
  id: PatternId;
  name: string;
  useWhen: string;
  fields: FieldSpec[];
  invariants: string[];
  toleranceRationale: string;
  failureBehavior: string;
  knownLimits: string[];
  whyNotStrictEq: string;
  params: Record<string, unknown>;
  /** Context keys the acceptance matrix exercises with more than one value. */
  paramVariants?: Record<string, unknown[]>;
  /** The context of the canonical example: the default parameters in force. */
  canonicalContext?: unknown;
}

export interface PatternsFile {
  packageVersion: string;
  patterns: PatternSpec[];
}

export type CaseCategory = "MUST_ACCEPT" | "MUST_REJECT" | "BOUNDARY";

export interface MatrixCase {
  id: string;
  category: CaseCategory;
  title: string;
  leader: unknown;
  validator: unknown;
  context: unknown;
  expected: "ACCEPT" | "REJECT";
  reasonCode: string;
}

export interface MatrixFile {
  pattern: PatternId;
  description: string;
  cases: MatrixCase[];
}

export interface PatternReport {
  patternId: PatternId;
  cases: number;
  counts: { MUST_ACCEPT: number; MUST_REJECT: number; BOUNDARY: number };
  harmlessAccepted: number;
  harmlessTotal: number;
  harmfulRejected: number;
  harmfulTotal: number;
  matrixMatches: number;
  params: Record<string, unknown>;
  paramVariants?: Record<string, unknown[]>;
  canonicalContext?: unknown;
}

export interface ReportFile {
  packageVersion: string;
  patterns: PatternReport[];
}

export interface CanonicalFile {
  packageVersion: string;
  patterns: Record<
    PatternId,
    { output: unknown; context: unknown }
  >;
}
