import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { packageVersion } from "../data/load";
import { engine, type EngineStatus } from "../worker/engine";
import { PatternsScreen } from "../screens/Patterns/PatternsScreen";
import { PlaygroundScreen } from "../screens/Playground/PlaygroundScreen";
import { TightnessScreen } from "../screens/Tightness/TightnessScreen";
import { DecisionGuideScreen } from "../screens/DecisionGuide/DecisionGuideScreen";

function EngineStatusLine({ status }: { status: EngineStatus }) {
  const label =
    status === "ready"
      ? `Engine ready — equivalencekit ${packageVersion}`
      : status === "loading"
        ? "Loading the engine"
        : status === "failed"
          ? "The engine couldn't start. Showing stored results only."
          : "Engine idle";

  return (
    <span className="engine-status" data-status={status}>
      <span
        className="engine-dot"
        aria-hidden="true"
        data-status={status}
      />
      {label}
    </span>
  );
}

export function App() {
  const [status, setStatus] = useState<EngineStatus>(engine.getStatus());

  useEffect(() => engine.onStatus(setStatus), []);

  // Warm the engine up as soon as the shell mounts, so the status line shows
  // "Loading the engine" and then "Engine ready" while the first screen is usable.
  useEffect(() => {
    void engine.warmUp();
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-inner">
          <NavLink to="/" className="brand">
            EquivalenceKit
            <small>Optional companion — not part of the contract submission</small>
          </NavLink>
          <nav className="nav" aria-label="Primary">
            <NavLink to="/">Patterns</NavLink>
            <NavLink to="/playground">Playground</NavLink>
            <NavLink to="/tightness">Tightness</NavLink>
            <NavLink to="/guide">Decision guide</NavLink>
          </nav>
          <div style={{ marginLeft: "auto" }}>
            <EngineStatusLine status={status} />
          </div>
        </div>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<PatternsScreen />} />
          <Route path="/playground" element={<PlaygroundScreen />} />
          <Route path="/tightness" element={<TightnessScreen />} />
          <Route path="/guide" element={<DecisionGuideScreen />} />
          <Route
            path="*"
            element={
              <div className="panel">
                <h2>That page doesn&apos;t exist</h2>
                <p>Choose one from the navigation above.</p>
              </div>
            }
          />
        </Routes>
      </main>

      <footer className="app-footer">
        <div className="app-footer-inner">
          <span>
            These rules show how validators agree. They do not check whether content is
            true.
          </span>
          <span className="mono small">equivalencekit {packageVersion}</span>
        </div>
      </footer>
    </div>
  );
}
