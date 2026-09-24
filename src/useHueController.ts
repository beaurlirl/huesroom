import type { KinematicCharacterController } from "@dimforge/rapier3d-compat";
import type { RapierCollider as Collider, RapierRigidBody as RigidBody } from "@react-three/rapier";
import { useRapier } from "@react-three/rapier";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Animator } from "./animator";
import { sampleCurve, type RootCurve } from "./clips";
import { CLIP_TIMES, HUE, LANDING, MOVE } from "./config";
import type { InputSample } from "./input";
import { runtime } from "./store";

type Mode = "ground" | "air" | "land";
type Landing = { kind: "hop" | "roll"; t: number; lock: number; rollPrev: number };

const CAPSULE_CENTER = HUE.capsuleHalfHeight + HUE.capsuleRadius; // feet → capsule centre

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const approach = (v: number, target: number, rate: number) => v + (target - v) * Math.min(1, rate);

/**
 * Kinematic character controller for Hue (prompt 2.5 / 2.6): camera-relative movement,
 * walk/run, gravity, walking off ledges and the landings that follow.
 */
class HueMover {
  readonly feet = new THREE.Vector3();
  yaw = 0;
  private vel = new THREE.Vector3();
  private mode: Mode = "ground";
  private grounded = true;
  private airTime = 0;
  private peakY = 0;
  private landing: Landing | null = null;
  private speedSmoothed = 0;

  constructor(
    private cc: KinematicCharacterController,
    private body: RigidBody,
    private collider: Collider,
    private anim: Animator,
    private rollCurve: RootCurve,
  ) {}

  /** Places the capsule at `feet` (used when control starts and on reset). */
  place(feet: THREE.Vector3, yaw: number) {
    this.feet.copy(feet);
    this.yaw = yaw;
    this.vel.set(0, 0, 0);
    this.mode = "ground";
    this.grounded = true;
    this.landing = null;
    const c = { x: feet.x, y: feet.y + CAPSULE_CENTER, z: feet.z };
    this.body.setTranslation(c, true);
    this.body.setNextKinematicTranslation(c);
  }

  update(dt: number, input: InputSample) {
    // Camera-relative input on the ground plane (yaw only, so looking down still walks forward).
    const cy = runtime.cameraYaw;
    const fwdX = -Math.sin(cy);
    const fwdZ = -Math.cos(cy);
    const rightX = Math.cos(cy);
    const rightZ = -Math.sin(cy);
    let dirX = fwdX * input.moveZ + rightX * input.moveX;
    let dirZ = fwdZ * input.moveZ + rightZ * input.moveX;
    const mag = Math.min(1, Math.hypot(dirX, dirZ));
    if (mag > 1e-3) {
      const l = Math.hypot(dirX, dirZ);
      dirX /= l;
      dirZ /= l;
    }

    const locked = this.landing !== null && this.landing.t < this.landing.lock;
    const inputMag = locked ? 0 : mag;

    // Horizontal velocity.
    if (this.mode === "air") {
      const rate = (dt / MOVE.accelTime) * MOVE.airControl;
      if (inputMag > 0) {
        this.vel.x = approach(this.vel.x, dirX * MOVE.airSpeed * inputMag, rate);
        this.vel.z = approach(this.vel.z, dirZ * MOVE.airSpeed * inputMag, rate);
      }
    } else {
      const speed = input.run ? MOVE.runSpeed : MOVE.walkSpeed;
      const rate = dt / (MOVE.accelTime / 3); // ~95% of the way in accelTime
      this.vel.x = approach(this.vel.x, dirX * speed * inputMag, rate);
      this.vel.z = approach(this.vel.z, dirZ * speed * inputMag, rate);
    }

    // Turn toward the input direction.
    if (inputMag > 0.05) {
      const target = Math.atan2(-dirZ, dirX);
      this.yaw = wrapAngle(this.yaw + wrapAngle(target - this.yaw) * Math.min(1, MOVE.turnRate * dt));
    }

    // Gravity.
    this.vel.y = Math.max(this.vel.y - MOVE.gravity * dt, -MOVE.maxFallSpeed);

    const desired = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };

    // Roll root motion: follow the forward travel stripped from fall_roll.
    if (this.landing?.kind === "roll") {
      const t = this.anim.time;
      const f = sampleCurve(this.rollCurve, t);
      const df = Math.max(0, f - this.landing.rollPrev);
      this.landing.rollPrev = f;
      desired.x += Math.cos(this.yaw) * df;
      desired.z += -Math.sin(this.yaw) * df;
    }

    this.cc.computeColliderMovement(this.collider, desired, undefined, undefined, (c) => c !== this.collider && !c.isSensor());
    const m = this.cc.computedMovement();
    this.feet.x += m.x;
    this.feet.y += m.y;
    this.feet.z += m.z;
    const wasGrounded = this.grounded;
    this.grounded = this.cc.computedGrounded();
    if (this.grounded && this.vel.y < 0) this.vel.y = 0;
    if (!this.grounded && this.vel.y > 0 && m.y < desired.y - 1e-4) this.vel.y = 0; // head bump

    this.body.setNextKinematicTranslation({ x: this.feet.x, y: this.feet.y + CAPSULE_CENTER, z: this.feet.z });

    const actualSpeed = Math.hypot(m.x, m.z) / Math.max(dt, 1e-4);
    this.speedSmoothed = approach(this.speedSmoothed, actualSpeed, dt * 12);

    this.updateMode(dt, wasGrounded, mag, input.run);
    runtime.feet.copy(this.feet);
    runtime.grounded = this.grounded;
  }

  private updateMode(dt: number, wasGrounded: boolean, inputMag: number, run: boolean) {
    const a = this.anim;

    if (!this.grounded) {
      if (wasGrounded || this.mode !== "air") {
        this.peakY = this.feet.y;
        this.airTime = 0;
        this.landing = null;
      }
      this.mode = "air";
      this.airTime += dt;
      this.peakY = Math.max(this.peakY, this.feet.y);
      if (this.airTime > MOVE.airPoseDelay && a.current !== "jump") {
        a.play("jump", { from: CLIP_TIMES.jumpAirHold - 0.1, holdAt: CLIP_TIMES.jumpAirHold, fade: 0.12 });
      }
      return;
    }

    if (this.mode === "air") {
      const drop = this.peakY - this.feet.y;
      this.mode = "ground";
      if (drop > LANDING.rollMin) {
        this.landing = { kind: "roll", t: 0, lock: LANDING.rollLock, rollPrev: 0 };
        a.play("fall_roll", { from: CLIP_TIMES.fallRollStart, fade: 0.08, timeScale: 1.25 });
        this.landing.rollPrev = sampleCurve(this.rollCurve, CLIP_TIMES.fallRollStart);
        this.vel.x = this.vel.z = 0;
        this.mode = "land";
        return;
      }
      if (drop > LANDING.hopMin) {
        this.landing = { kind: "hop", t: 0, lock: LANDING.hopLock, rollPrev: 0 };
        a.play("jump_down", { from: CLIP_TIMES.jumpDownLand, fade: 0.08, timeScale: CLIP_TIMES.jumpDownTimeScale });
        this.vel.x *= 0.2;
        this.vel.z *= 0.2;
        this.mode = "land";
        return;
      }
    }

    if (this.mode === "land" && this.landing) {
      this.landing.t += dt;
      const clipDone =
        this.landing.kind === "hop" ? a.time >= CLIP_TIMES.jumpDownEnd : a.time >= a.action.getClip().duration - 0.05;
      const unlocked = this.landing.t >= this.landing.lock;
      if (clipDone || (unlocked && inputMag > 0.05)) {
        this.landing = null;
        this.mode = "ground";
      } else {
        return;
      }
    }

    // Locomotion by speed.
    const s = this.speedSmoothed;
    if (s < 0.03 && inputMag < 0.05) {
      a.play("idle");
    } else if (!run || s < (MOVE.walkSpeed + MOVE.runSpeed) / 2) {
      a.play("walk");
      a.setTimeScale(THREE.MathUtils.clamp(s / CLIP_TIMES.walkSpeedAtScale1, 0.5, 1.8));
    } else {
      a.play("run");
      a.setTimeScale(CLIP_TIMES.runTimeScale * THREE.MathUtils.clamp(s / MOVE.runSpeed, 0.6, 1.2));
    }
  }
}

export function useHueController(
  body: React.RefObject<RigidBody | null>,
  collider: React.RefObject<Collider | null>,
  anim: Animator,
  rollCurve: RootCurve,
) {
  const { world } = useRapier();
  const cc = useRef<KinematicCharacterController | null>(null);
  const mover = useRef<HueMover | null>(null);

  // Created in the effect (not a memo) so StrictMode's mount/unmount/mount never
  // leaves us holding a freed WASM object.
  useEffect(() => {
    const c = world.createCharacterController(MOVE.offset);
    c.setUp({ x: 0, y: 1, z: 0 });
    c.enableAutostep(MOVE.autostepMax, MOVE.autostepMinWidth, true);
    c.enableSnapToGround(MOVE.snapToGround);
    c.setMaxSlopeClimbAngle(MOVE.maxSlope);
    c.setSlideEnabled(true);
    cc.current = c;
    return () => {
      cc.current = null;
      mover.current = null;
      world.removeCharacterController(c);
    };
  }, [world]);

  return {
    /** Lazily binds once the controller and the body/collider refs exist. */
    get() {
      if (!mover.current && cc.current && body.current && collider.current) {
        mover.current = new HueMover(cc.current, body.current, collider.current, anim, rollCurve);
      }
      return mover.current;
    },
  };
}
