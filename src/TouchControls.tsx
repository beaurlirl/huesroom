"use client";

import { useState } from "react";
import { Joystick } from "react-joystick-component";
import { useIsTouch } from "./Hud";
import { useTouchInput } from "./input";
import { useGame } from "./store";
import { useLevel } from "./useLevel";
import { theme } from "./ui/theme";

const RUN_DISTANCE = 70; // % of the joystick's throw

/** Virtual joystick (bottom-left) and jump button (bottom-right), touch devices only (prompt 1.4). */
export function TouchControls() {
  const touch = useIsTouch();
  const phase = useGame((s) => s.phase);
  const paused = useGame((s) => s.paused);
  const [jumpDown, setJumpDown] = useState(false);
  // A skateboard level swaps the jump button for a second stick: flick it back and forth to pop an ollie.
  const skating = useLevel().mode === "skate";

  if (!touch) return null;
  const visible = phase === "playing" && !paused;

  const setJump = (down: boolean) => {
    setJumpDown(down);
    useTouchInput.setState({ jump: down });
  };
  const stop = () => useTouchInput.setState({ moveX: 0, moveZ: 0, run: false });

  return (
    <div
      className="pointer-events-none fixed inset-0 select-none"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 0.3s", touchAction: "none" }}
    >
      <div
        className="absolute"
        style={{
          left: "calc(24px + env(safe-area-inset-left))",
          bottom: "calc(28px + env(safe-area-inset-bottom))",
          pointerEvents: visible ? "auto" : "none",
        }}
      >
        {/* A small blurred circle outline behind the stick (the library draws its own base on top). */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ border: "1px solid rgba(10, 10, 10, 0.4)", background: "rgba(255, 255, 255, 0.18)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
        />
        <Joystick
          size={116}
          stickSize={52}
          baseColor="rgba(0, 0, 0, 0)"
          stickColor="#0a0a0a"
          throttle={16}
          move={(e) =>
            useTouchInput.setState({ moveX: e.x ?? 0, moveZ: e.y ?? 0, run: (e.distance ?? 0) > RUN_DISTANCE })
          }
          stop={stop}
        />
      </div>
      {skating && (
        <div
          className="absolute"
          style={{
            right: "calc(24px + env(safe-area-inset-right))",
            bottom: "calc(28px + env(safe-area-inset-bottom))",
            pointerEvents: visible ? "auto" : "none",
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{ border: "1px solid rgba(10, 10, 10, 0.4)", background: "rgba(255, 255, 255, 0.18)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
          />
          <Joystick
            size={116}
            stickSize={52}
            baseColor="rgba(0, 0, 0, 0)"
            stickColor="#0a0a0a"
            throttle={16}
            move={(e) => useTouchInput.setState({ aimX: e.x ?? 0, aimY: e.y ?? 0 })}
            stop={() => useTouchInput.setState({ aimX: 0, aimY: 0 })}
          />
          <div className="pointer-events-none absolute left-0 right-0 text-center text-xs font-bold" style={{ top: -22, color: theme.ink }}>
            flick to ollie · lean to flip
          </div>
        </div>
      )}
      {!skating && (
      <button
        type="button"
        aria-label="Jump"
        className={`ui absolute flex items-center justify-center text-sm font-bold ${jumpDown ? "" : "glass"}`}
        style={{
          right: "calc(28px + env(safe-area-inset-right))",
          bottom: "calc(44px + env(safe-area-inset-bottom))",
          width: 72,
          height: 72,
          background: jumpDown ? theme.ink : undefined,
          color: jumpDown ? theme.paper : theme.ink,
          transform: jumpDown ? "scale(0.92)" : "scale(1)",
          transition: "transform 0.08s, background 0.08s",
          pointerEvents: visible ? "auto" : "none",
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setJump(true);
        }}
        onPointerUp={() => setJump(false)}
        onPointerCancel={() => setJump(false)}
        onLostPointerCapture={() => setJump(false)}
      >
        jump
      </button>
      )}
    </div>
  );
}
