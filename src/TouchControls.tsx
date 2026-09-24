"use client";

import { useState } from "react";
import { Joystick } from "react-joystick-component";
import { useIsTouch } from "./Hud";
import { useTouchInput } from "./input";
import { useGame } from "./store";
import { theme } from "./ui/theme";

const RUN_DISTANCE = 70; // % of the joystick's throw

/** Virtual joystick (bottom-left) and jump button (bottom-right), touch devices only (prompt 1.4). */
export function TouchControls() {
  const touch = useIsTouch();
  const phase = useGame((s) => s.phase);
  const paused = useGame((s) => s.paused);
  const [jumpDown, setJumpDown] = useState(false);

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
        <Joystick
          size={116}
          stickSize={52}
          baseColor="rgba(255,255,255,0.55)"
          stickColor="rgba(17,17,17,0.75)"
          throttle={16}
          move={(e) =>
            useTouchInput.setState({ moveX: e.x ?? 0, moveZ: e.y ?? 0, run: (e.distance ?? 0) > RUN_DISTANCE })
          }
          stop={stop}
        />
      </div>
      <button
        type="button"
        aria-label="Jump"
        className="absolute flex items-center justify-center rounded-full text-xs"
        style={{
          right: "calc(28px + env(safe-area-inset-right))",
          bottom: "calc(44px + env(safe-area-inset-bottom))",
          width: 72,
          height: 72,
          background: jumpDown ? "rgba(17,17,17,0.8)" : theme.pill,
          color: jumpDown ? theme.paper : theme.ink,
          transform: jumpDown ? "scale(0.92)" : "scale(1)",
          transition: "transform 0.08s, background 0.08s",
          pointerEvents: visible ? "auto" : "none",
          fontFamily: theme.font,
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
    </div>
  );
}
