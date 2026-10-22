import { formatInteger } from "../lib/format";

/**
 * The tolerance track: the site's one bold element.
 *
 * Every variant draws a leader mark, a validator mark, and a shaded tolerance region.
 * Agreement is where the marks sit relative to that region. Each variant also produces a
 * plain-language summary, because the drawing must never be the only signal.
 */

export type TrackSpec =
  | { kind: "enum"; levels: string[]; leader: string; validator: string }
  | {
      kind: "ordinal";
      levels: string[];
      leader: string;
      validator: string;
      maxSteps: number;
    }
  | {
      kind: "number";
      leader: number;
      validator: number;
      min: number;
      max: number;
      delta?: number;
      toleranceBps?: number;
    }
  | { kind: "bucket"; edges: number[]; leader: number; validator: number }
  | {
      kind: "set";
      leader: string[];
      validator: string[];
      universe: string[];
    }
  | {
      kind: "ranking";
      leader: string[];
      validator: string[];
      k: number;
      universe: string[];
    }
  | {
      kind: "boolean";
      leader: boolean | "UNAVAILABLE";
      validator: boolean | "UNAVAILABLE";
    };

export interface TrackResult {
  /** Whether the two values agree under the rule that produced this track. */
  accepted: boolean;
  /** True when the pair sits exactly on a tolerance edge. */
  onEdge: boolean;
  /** The accessible description. */
  summary: string;
}

export function ToleranceTrack({
  spec,
  result,
}: {
  spec: TrackSpec;
  result: TrackResult;
}) {
  return (
    <figure className="tolerance-track" data-variant={spec.kind}>
      <div className="track-graphic">{renderGraphic(spec)}</div>
      <figcaption className="track-summary">{result.summary}</figcaption>
    </figure>
  );
}

function renderGraphic(spec: TrackSpec) {  switch (spec.kind) {
    case "enum":
      return <EnumTrack spec={spec} />;
    case "ordinal":
      return <OrdinalTrack spec={spec} />;
    case "number":
      return <NumberTrack spec={spec} />;
    case "bucket":
      return <BucketTrack spec={spec} />;
    case "set":
      return <SetTrack spec={spec} />;
    case "ranking":
      return <RankingTrack spec={spec} />;
    case "boolean":
      return <BooleanTrack spec={spec} />;
  }
}

function EnumTrack({ spec }: { spec: Extract<TrackSpec, { kind: "enum" }> }) {
  return (
    <div className="track-track-enum">
      {spec.levels.map((level) => {
        const isLeader = level === spec.leader;
        const isValidator = level === spec.validator;
        return (
          <div
            key={level}
            className="track-position"
            data-leader={isLeader ? "true" : "false"}
            data-validator={isValidator ? "true" : "false"}
          >
            <span className="track-position-label">{level}</span>
            <span className="track-position-dots" aria-hidden="true">
              {isLeader ? <span className="dot dot-leader" /> : null}
              {isValidator ? <span className="dot dot-validator" /> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function OrdinalTrack({ spec }: { spec: Extract<TrackSpec, { kind: "ordinal" }> }) {
  const leaderIndex = spec.levels.indexOf(spec.leader);
  const validatorIndex = spec.levels.indexOf(spec.validator);
  const distance = Math.abs(leaderIndex - validatorIndex);
  const low = Math.min(leaderIndex, validatorIndex);
  const high = Math.max(leaderIndex, validatorIndex);
  const regionStart = Math.max(0, low - (spec.maxSteps - distance));
  const regionEnd = Math.min(spec.levels.length - 1, high + (spec.maxSteps - distance));

  return (
    <div className="track-track-ordinal">
      <div className="track-scale">
        {spec.levels.map((level, index) => (
          <div
            key={level}
            className="track-slot"
            data-region={index >= regionStart && index <= regionEnd ? "true" : "false"}
          >
            <span className="track-tick" aria-hidden="true" />
            <span className="track-slot-label">{level}</span>
            <span className="track-slot-marks" aria-hidden="true">
              {index === leaderIndex ? <span className="dot dot-leader" /> : null}
              {index === validatorIndex ? <span className="dot dot-validator" /> : null}
            </span>
          </div>
        ))}
      </div>
      <p className="track-legend">Allowed distance {spec.maxSteps} step{spec.maxSteps === 1 ? "" : "s"}</p>
    </div>
  );
}

function NumberTrack({ spec }: { spec: Extract<TrackSpec, { kind: "number" }> }) {
  const span = Math.max(1, spec.max - spec.min);
  const position = (value: number) =>
    Math.min(100, Math.max(0, ((value - spec.min) / span) * 100));

  const band = bandFor(spec);

  return (
    <div className="track-track-number">
      <div className="track-axis">
        {band ? (
          <div
            className="track-band"
            style={{ left: `${position(band.low)}%`, width: `${position(band.high) - position(band.low)}%` }}
            data-on-edge={band.onEdge ? "true" : "false"}
            aria-hidden="true"
          />
        ) : null}
        <div
          className="track-marker track-marker-leader"
          style={{ left: `${position(spec.leader)}%` }}
          aria-hidden="true"
        />
        <div
          className="track-marker track-marker-validator"
          style={{ left: `${position(spec.validator)}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="track-axis-labels" aria-hidden="true">
        <span>{formatInteger(spec.min)}</span>
        {band ? (
          <span className="track-band-label">
            {formatInteger(band.low)} – {formatInteger(band.high)}
          </span>
        ) : null}
        <span>{formatInteger(spec.max)}</span>
      </div>
      <div className="track-value-row" aria-hidden="true">
        <span className="track-value track-value-leader">
          leader {formatInteger(spec.leader)}
        </span>
        <span className="track-value track-value-validator">
          validator {formatInteger(spec.validator)}
        </span>
      </div>
    </div>
  );
}

function bandFor(
  spec: Extract<TrackSpec, { kind: "number" }>,
): { low: number; high: number; onEdge: boolean } | null {
  if (spec.delta !== undefined) {
    return {
      low: spec.leader - spec.delta,
      high: spec.leader + spec.delta,
      onEdge: Math.abs(spec.validator - spec.leader) === spec.delta,
    };
  }
  if (spec.toleranceBps !== undefined) {
    const scale = Math.max(Math.abs(spec.leader), Math.abs(spec.validator), 1);
    const allowance = (spec.toleranceBps * scale) / 10000;
    return {
      low: spec.leader - allowance,
      high: spec.leader + allowance,
      onEdge: Math.abs(spec.validator - spec.leader) >= allowance,
    };
  }
  return null;
}

function BucketTrack({ spec }: { spec: Extract<TrackSpec, { kind: "bucket" }> }) {
  const segments = spec.edges.length + 1;
  const leaderSegment = Math.min(spec.leader, segments - 1);
  const validatorSegment = Math.min(spec.validator, segments - 1);
  const adjacent = Math.abs(leaderSegment - validatorSegment) <= 1;

  return (
    <div className="track-track-bucket">
      <div className="track-segments">
        {Array.from({ length: segments }, (_, index) => {
          const inRegion = adjacent && index >= Math.min(leaderSegment, validatorSegment) &&
            index <= Math.max(leaderSegment, validatorSegment);
          return (
            <div key={index} className="track-segment" data-region={inRegion ? "true" : "false"}>
              {index === leaderSegment ? <span className="dot dot-leader" /> : null}
              {index === validatorSegment ? <span className="dot dot-validator" /> : null}
            </div>
          );
        })}
      </div>
      <div className="track-axis-labels" aria-hidden="true">
        <span>0</span>
        {spec.edges.map((edge) => (
          <span key={edge}>{formatInteger(edge)}</span>
        ))}
        <span>above</span>
      </div>
    </div>
  );
}

function SetTrack({ spec }: { spec: Extract<TrackSpec, { kind: "set" }> }) {
  const universe = new Set(spec.universe);
  const renderRow = (ids: string[], role: string) => (
    <div className="track-set-row" data-role={role}>
      {ids.length === 0 ? <span className="small muted">none</span> : null}
      {ids.map((id) => (
        <span
          key={id}
          className="set-chip"
          data-outside={universe.size > 0 && !universe.has(id) ? "true" : "false"}
        >
          {id}
          {universe.size > 0 && !universe.has(id) ? (
            <span className="set-chip-note">not provided</span>
          ) : null}
        </span>
      ))}
    </div>
  );

  return (
    <div className="track-track-set">
      <div className="track-set-labels">
        <span>Leader</span>
        <span>Validator</span>
      </div>
      {renderRow(spec.leader, "leader")}
      {renderRow(spec.validator, "validator")}
    </div>
  );
}

function RankingTrack({ spec }: { spec: Extract<TrackSpec, { kind: "ranking" }> }) {
  const universe = new Set(spec.universe);
  const row = (ids: string[], role: string) => (
    <div className="track-rank-row" data-role={role}>
      {ids.map((id, index) => (
        <span
          key={id}
          className="rank-chip"
          data-cutoff={index >= spec.k ? "true" : "false"}
          data-outside={universe.size > 0 && !universe.has(id) ? "true" : "false"}
        >
          {index + 1}. {id}
          {universe.size > 0 && !universe.has(id) ? (
            <span className="set-chip-note">not provided</span>
          ) : null}
        </span>
      ))}
    </div>
  );

  return (
    <div className="track-track-ranking">
      <p className="small muted">Top {spec.k} decides</p>
      {row(spec.leader, "leader")}
      {row(spec.validator, "validator")}
    </div>
  );
}

function BooleanTrack({ spec }: { spec: Extract<TrackSpec, { kind: "boolean" }> }) {
  const positions: Array<boolean | "UNAVAILABLE"> = [true, false, "UNAVAILABLE"];
  const label = (value: boolean | "UNAVAILABLE") =>
    value === "UNAVAILABLE" ? "Source unavailable" : value ? "Yes" : "No";

  return (
    <div className="track-track-boolean">
      {positions.map((position) => (
        <div
          key={String(position)}
          className="track-position"
          data-leader={spec.leader === position ? "true" : "false"}
          data-validator={spec.validator === position ? "true" : "false"}
        >
          <span className="track-position-label">{label(position)}</span>
          <span className="track-position-dots" aria-hidden="true">
            {spec.leader === position ? <span className="dot dot-leader" /> : null}
            {spec.validator === position ? <span className="dot dot-validator" /> : null}
          </span>
        </div>
      ))}
    </div>
  );
}
