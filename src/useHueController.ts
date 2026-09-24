import type { KinematicCharacterController, World } from "@dimforge/rapier3d-compat";
import { useRapier, type RapierCollider as Collider, type RapierRigidBody as RigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Animator } from "./animator";
import { playSfx } from "./audio/sfx";
import { sampleCurve, type RootCurve } from "./clips";
import { bookBodies } from "./Books";
import { BOOKS, CLIMB, CLIP_TIMES, FLAGS, HUE, LANDING, MOVE } from "./config";
import type { InputSample } from "./input";
import { beanbag, colliderMeta, roomColliders, type BoxCollider } from "./Room";
import { runtime } from "./store";

type Rapier = ReturnType<typeof useRapier>["rapier"];
type Mode = "ground" | "air" | "land" | "climb" | "ladder";
type Landing = { kind: "hop" | "roll" | "soft"; t: number; lock: number; rollPrev: number };
type Climb = { phase: "up" | "over"; top: number; startY: number; dirX: number; dirZ: number; t: number; over: number };
type LadderMove = { kind: "enterTop" | "exitTop" | "exitBottom"; from: THREE.Vector3; to: THREE.Vector3; t: number; time: number };

const R = HUE.capsuleRadius;
const CAPSULE_CENTER = HUE.capsuleHalfHeight + R; // feet → capsule centre
const HEIGHT = 2 * CAPSULE_CENTER;

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const approach = (v: number, target: number, rate: number) => v + (target - v) * Math.min(1, rate);
/** Yaw that turns Hue's local +X (his forward) toward a world XZ direction. */
const yawFor = (x: number, z: number) => Math.atan2(-z, x);

/** COL_Ladder, in three.js terms. */
type Ladder = {
  meta: BoxCollider;
  bottomY: number;
  topY: number;
  facing: THREE.Vector3; // direction Hue faces while on it
  exit: THREE.Vector3; // direction he steps off at the top
  line: THREE.Vector3; // capsule centre XZ while climbing
};

function readLadder(): Ladder | null {
  const meta = roomColliders.find((c) => c.userData.ladder);
  if (!meta) return null;
  const u = meta.userData as {
    bottom_z_blender: number;
    top_z_blender: number;
    approach_from_blender_xy: [number, number];
    exit_dir_blender_xy: [number, number];
  };
  const [ax, ay] = u.approach_from_blender_xy;
  const [ex, ey] = u.exit_dir_blender_xy;
  const approachFrom = new THREE.Vector3(ax, 0, -ay).normalize();
  const facing = approachFrom.clone().negate();
  // Depth of the ladder box along its facing.
  const depth = Math.abs(meta.halfExtents.x * facing.x) + Math.abs(meta.halfExtents.z * facing.z);
  const line = meta.center.clone().addScaledVector(approachFrom, depth + R + 0.01).setY(0);
  return {
    meta,
    bottomY: u.bottom_z_blender,
    topY: u.top_z_blender,
    facing,
    exit: new THREE.Vector3(ex, 0, -ey).normalize(),
    line,
  };
}

/**
 * Kinematic character controller for Hue (prompt 2.5 / 2.6): camera-relative movement,
 * walk/run, jump (coyote time, buffer, short hop), ledge climbs, the ladder, the beanbag
 * trampoline, walking off ledges and the landings that follow.
 */
class HueMover {
  readonly feet = new THREE.Vector3();
  yaw = 0;
  mode: Mode = "ground";
  /** Last climb probe, for the ?debug view. */
  readonly debugProbe = { active: false, from: new THREE.Vector3(), to: new THREE.Vector3(), hit: false };

  private vel = new THREE.Vector3();
  private grounded = true;
  private now = 0;
  private lastGroundedAt = 0;
  private jumpPressedAt = -Infinity;
  private prevJump = false;
  private jumped = false; // this air time started with a jump or bounce
  private shortHopCut = false;
  private doubleUsed = false;
  private airTime = 0;
  private peakY = 0;
  private landing: Landing | null = null;
  private climb: Climb | null = null;
  private pushTimer = 0;
  private ladderMove: LadderMove | null = null;
  private speedSmoothed = 0;
  private lastKick = new Map<number, number>();
  /** Whether autostep currently ignores dynamic bodies (true while running). */
  private autostepDynamic = false;
  private ladder: Ladder | null;
  private ray: InstanceType<Rapier["Ray"]>;

  constructor(
    private world: World,
    rapier: Rapier,
    private cc: KinematicCharacterController,
    private body: RigidBody,
    private collider: Collider,
    private anim: Animator,
    private rollCurve: RootCurve,
    private climbRiseSpeed: number,
  ) {
    this.ladder = readLadder();
    this.ray = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  }

  /** Places the capsule at `feet` (used when control starts and on reset). */
  place(feet: THREE.Vector3, yaw: number) {
    this.feet.copy(feet);
    this.yaw = yaw;
    this.vel.set(0, 0, 0);
    this.mode = "ground";
    this.grounded = true;
    this.landing = this.climb = this.ladderMove = null;
    this.jumpPressedAt = -Infinity;
    // Air-time state too: a restart mid-jump used to leave `jumped` set, which blocks jumping.
    this.jumped = false;
    this.shortHopCut = false;
    this.doubleUsed = false;
    this.airTime = 0;
    this.pushTimer = 0;
    this.lastGroundedAt = this.now;
    const c = { x: feet.x, y: feet.y + CAPSULE_CENTER, z: feet.z };
    this.body.setTranslation(c, true);
    this.body.setNextKinematicTranslation(c);
    this.publish();
  }

  // ---------------------------------------------------------------- queries

  private isLadder = (c: Collider) => !!this.ladder && colliderMeta.get(c.handle) === this.ladder.meta;

  /** Solid, non-sensor colliders other than Hue (and optionally the ladder). */
  private solid = (ignoreLadder: boolean) => (c: Collider) =>
    c !== this.collider && !c.isSensor() && !(ignoreLadder && this.isLadder(c));

  private cast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number, filter: (c: Collider) => boolean) {
    this.ray.origin = { x: ox, y: oy, z: oz };
    this.ray.dir = { x: dx, y: dy, z: dz };
    return this.world.castRayAndGetNormal(this.ray, max, true, undefined, undefined, undefined, undefined, filter);
  }

  /** Collider directly under the feet, if any. */
  private groundCollider() {
    const hit = this.cast(this.feet.x, this.feet.y + 0.02, this.feet.z, 0, -1, 0, 0.08, this.solid(false));
    return hit ? hit.collider : null;
  }

  /**
   * Climb probe (prompt 2.6): a ledge ahead whose top is 0.10–0.55 m above the feet, with
   * its face within reach and head-room above it. A downward ray just past the face finds
   * the top (a forward knee ray would pass under thin slabs like the stool top).
   */
  private probeLedge(dirX: number, dirZ: number): { top: number; faceDist: number } | null {
    const f = this.feet;
    const reach = R + CLIMB.probeAhead;
    const px = f.x + dirX * (reach + 0.02);
    const pz = f.z + dirZ * (reach + 0.02);
    const top0 = f.y + CLIMB.maxRise + 0.03;
    const climbable = (c: Collider) => {
      if (c === this.collider || c.isSensor() || !c.parent()?.isFixed()) return false;
      const meta = colliderMeta.get(c.handle);
      return !(meta && (meta.userData.standable === false || meta.userData.bounce_pad || meta.userData.ladder));
    };
    this.debugProbe.active = true;
    this.debugProbe.from.set(px, top0, pz);
    this.debugProbe.to.set(px, f.y + CLIMB.minRise - 0.01, pz);
    this.debugProbe.hit = false;

    const down = this.cast(px, top0, pz, 0, -1, 0, top0 - (f.y + CLIMB.minRise - 0.01), climbable);
    if (!down || down.timeOfImpact <= 0 || down.normal.y < 0.7) return null;
    const top = top0 - down.timeOfImpact;
    const rise = top - f.y;
    if (rise < CLIMB.minRise || rise > CLIMB.maxRise) return null;

    // Face within reach, just below the top.
    const face = this.cast(f.x, top - 0.02, f.z, dirX, 0, dirZ, reach + 0.02, climbable);
    if (!face) return null;
    // Head-room on top, and a clear path straight up for the capsule. Only fixed geometry
    // counts: loose books on a table top get shoved aside, they aren't a ceiling.
    const fixedSolid = (c: Collider) => this.solid(true)(c) && !!c.parent()?.isFixed();
    if (this.cast(px, top + 0.005, pz, 0, 1, 0, CLIMB.headroom, fixedSolid)) return null;
    if (this.cast(f.x, f.y + HEIGHT + 0.005, f.z, 0, 1, 0, rise + 0.02, fixedSolid)) return null;
    this.debugProbe.hit = true;
    return { top, faceDist: face.timeOfImpact };
  }

  // ---------------------------------------------------------------- update

  update(dt: number, input: InputSample) {
    this.now += dt;
    this.debugProbe.active = false;

    // Camera-relative input on the ground plane (yaw only, so looking down still walks forward).
    const cy = runtime.debug.input ? 0 : runtime.cameraYaw;
    let dirX = -Math.sin(cy) * input.moveZ + Math.cos(cy) * input.moveX;
    let dirZ = -Math.cos(cy) * input.moveZ - Math.sin(cy) * input.moveX;
    const mag = Math.min(1, Math.hypot(dirX, dirZ));
    if (mag > 1e-3) {
      const l = Math.hypot(dirX, dirZ);
      dirX /= l;
      dirZ /= l;
    }
    const jumpPressed = input.jump && !this.prevJump;
    this.prevJump = input.jump;
    if (jumpPressed) this.jumpPressedAt = this.now;

    if (this.mode === "climb") return this.updateClimb(dt, dirX, dirZ, mag);
    if (this.mode === "ladder") return this.updateLadder(dt, dirX, dirZ, mag, jumpPressed);

    const locked = this.landing !== null && this.landing.t < this.landing.lock;
    const inputMag = locked ? 0 : mag;

    // Jump: coyote time + buffer, not while a landing has control locked.
    const canJump = !locked && !this.jumped && this.now - this.lastGroundedAt <= MOVE.coyoteTime;
    if (canJump && this.now - this.jumpPressedAt <= MOVE.jumpBuffer) {
      this.takeOff(MOVE.jumpSpeed);
    } else if (FLAGS.DOUBLE_JUMP && jumpPressed && this.mode === "air" && this.jumped && !this.doubleUsed) {
      this.doubleUsed = true;
      this.vel.y = MOVE.jumpSpeed * CLIMB.doubleJumpScale;
      this.anim.play("jump", { from: CLIP_TIMES.jumpTakeoff, timeScale: 1.2, holdAt: CLIP_TIMES.jumpAirHold, restart: true, fade: 0.08 });
    }
    // Short hop: releasing Space early cuts the upward speed.
    if (this.jumped && !this.shortHopCut && !input.jump && this.vel.y > 0) {
      this.vel.y *= 1 - MOVE.shortHopCut;
      this.shortHopCut = true;
    }

    // Horizontal velocity.
    if (this.mode === "air") {
      const rate = (dt / MOVE.accelTime) * 3 * MOVE.airControl;
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
      const target = yawFor(dirX, dirZ);
      this.yaw = wrapAngle(this.yaw + wrapAngle(target - this.yaw) * Math.min(1, MOVE.turnRate * dt));
    }

    // Ledge climb / ladder: grounded, pushing forward.
    if (this.mode === "ground" && !locked && inputMag > 0.5) {
      if (this.tryLadder(dirX, dirZ)) return this.publish();
      const facingDot = Math.cos(this.yaw) * dirX - Math.sin(this.yaw) * dirZ;
      const ledge = facingDot > 0.7 ? this.probeLedge(dirX, dirZ) : null;
      this.pushTimer = ledge ? this.pushTimer + dt : 0;
      if (ledge && this.pushTimer >= CLIMB.pushTime) {
        this.startClimb(ledge.top, ledge.faceDist, dirX, dirZ);
        return this.publish();
      }
    } else {
      this.pushTimer = 0;
    }

    // Gravity.
    this.vel.y = Math.max(this.vel.y - MOVE.gravity * dt, -MOVE.maxFallSpeed);
    const vyBefore = this.vel.y;

    const desired = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };

    // Roll root motion: follow the forward travel stripped from fall_roll.
    if (this.landing?.kind === "roll") {
      const f = sampleCurve(this.rollCurve, this.anim.time);
      const df = Math.max(0, f - this.landing.rollPrev);
      this.landing.rollPrev = f;
      desired.x += Math.cos(this.yaw) * df;
      desired.z += -Math.sin(this.yaw) * df;
    }

    // Walking steps up onto books (you can stand on them); running treats them as obstacles
    // so he kicks them instead of riding over them.
    const running = Math.hypot(this.vel.x, this.vel.z) > (MOVE.walkSpeed + MOVE.runSpeed) / 2;
    if (running !== this.autostepDynamic) {
      this.autostepDynamic = running;
      this.cc.enableAutostep(MOVE.autostepMax, MOVE.autostepMinWidth, !running);
    }
    const m = this.move(desired, false);
    this.pushBooks();
    const wasGrounded = this.grounded;
    this.grounded = this.cc.computedGrounded() && this.vel.y <= 0;
    if (this.grounded) {
      this.lastGroundedAt = this.now;
      if (this.vel.y < 0) this.vel.y = 0;
    }
    if (!this.grounded && this.vel.y > 0 && m.y < desired.y - 1e-4) this.vel.y = 0; // head bump

    const actualSpeed = Math.hypot(m.x, m.z) / Math.max(dt, 1e-4);
    this.speedSmoothed = approach(this.speedSmoothed, actualSpeed, dt * 12);

    this.updateMode(dt, wasGrounded, mag, input.run, vyBefore);
    this.publish();
  }

  /** Moves the capsule through the character controller and returns the applied delta. */
  private move(desired: { x: number; y: number; z: number }, ignoreLadder: boolean) {
    this.cc.computeColliderMovement(this.collider, desired, undefined, undefined, this.solid(ignoreLadder));
    const m = this.cc.computedMovement();
    this.feet.x += m.x;
    this.feet.y += m.y;
    this.feet.z += m.z;
    return m;
  }

  /**
   * The controller is kinematic, so books don't get pushed by it: on each contact, shove the
   * book along Hue's horizontal velocity (gentle walking, a kick with a little lift running).
   */
  private pushBooks() {
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (speed < 0.05) return;
    const running = speed > (MOVE.walkSpeed + MOVE.runSpeed) / 2;
    const impulse = running ? BOOKS.runImpulse : BOOKS.walkImpulse;
    for (let i = 0; i < this.cc.numComputedCollisions(); i++) {
      const body = this.cc.computedCollision(i)?.collider?.parent();
      if (!body || !bookBodies.has(body)) continue;
      const last = this.lastKick.get(body.handle) ?? -Infinity;
      if (this.now - last < BOOKS.cooldown) continue;
      this.lastKick.set(body.handle, this.now);
      const k = impulse / speed;
      body.applyImpulse({ x: this.vel.x * k, y: running ? impulse * BOOKS.runLift : 0, z: this.vel.z * k }, true);
      const v = body.linvel();
      const s = Math.hypot(v.x, v.y, v.z);
      if (s > BOOKS.maxSpeed) body.setLinvel({ x: (v.x / s) * BOOKS.maxSpeed, y: (v.y / s) * BOOKS.maxSpeed, z: (v.z / s) * BOOKS.maxSpeed }, true);
    }
  }

  private publish() {
    this.body.setNextKinematicTranslation({ x: this.feet.x, y: this.feet.y + CAPSULE_CENTER, z: this.feet.z });
    runtime.feet.copy(this.feet);
    runtime.grounded = this.grounded || this.mode === "climb" || this.mode === "ladder";
  }

  private takeOff(speed: number) {
    this.vel.y = speed;
    this.jumped = true;
    this.shortHopCut = false;
    this.doubleUsed = false;
    this.jumpPressedAt = -Infinity;
    this.grounded = false;
    this.mode = "air";
    this.landing = null;
    this.airTime = MOVE.airPoseDelay; // already in the air pose
    this.peakY = this.feet.y;
    this.anim.play("jump", { from: CLIP_TIMES.jumpTakeoff, timeScale: 1.2, holdAt: CLIP_TIMES.jumpAirHold, restart: true, fade: 0.08 });
  }

  private updateMode(dt: number, wasGrounded: boolean, inputMag: number, run: boolean, vyBefore: number) {
    const a = this.anim;

    if (!this.grounded) {
      if (wasGrounded && this.mode !== "air") {
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
      const jumped = this.jumped;
      this.jumped = false;
      this.mode = "ground";

      // Trampoline: landing on the beanbag's top while moving down.
      const under = this.groundCollider();
      const meta = under ? colliderMeta.get(under.handle) : undefined;
      if (meta?.userData.bounce_pad && vyBefore < 0) {
        const apex = (meta.userData.bounce_apex_m as number | undefined) ?? 0.9;
        this.takeOff(Math.sqrt(2 * MOVE.gravity * apex));
        this.shortHopCut = true; // holding Space adds nothing, releasing takes nothing
        beanbag.bounceAt = beanbag.clock();
        playSfx("boing");
        return;
      }

      if (drop > LANDING.rollMin) {
        this.landing = { kind: "roll", t: 0, lock: LANDING.rollLock, rollPrev: sampleCurve(this.rollCurve, CLIP_TIMES.fallRollStart) };
        a.play("fall_roll", { from: CLIP_TIMES.fallRollStart, fade: 0.08, timeScale: 1.25 });
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
      if (jumped) {
        this.landing = { kind: "soft", t: 0, lock: 0, rollPrev: 0 };
        a.play("jump", { from: CLIP_TIMES.jumpLand, fade: 0.06, timeScale: 1.3 });
        this.mode = "land";
        return;
      }
    }

    if (this.mode === "land" && this.landing) {
      this.landing.t += dt;
      const kind = this.landing.kind;
      const clipDone =
        kind === "hop"
          ? a.time >= CLIP_TIMES.jumpDownEnd
          : kind === "soft"
            ? a.time >= CLIP_TIMES.jumpAirHold + 0.8
            : a.time >= a.action.getClip().duration - 0.05;
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

  // ---------------------------------------------------------------- climb

  private startClimb(top: number, faceDist: number, dirX: number, dirZ: number) {
    this.mode = "climb";
    // Step far enough to put the capsule centre a few cm past the lip, however far away the
    // face was when the climb started (the probe reaches 0.1 m beyond the capsule).
    const over = Math.max(CLIMB.overDistance, faceDist + CLIMB.overPastLip);
    this.climb = { phase: "up", top, startY: this.feet.y, dirX, dirZ, t: 0, over };
    this.vel.set(0, 0, 0);
    this.yaw = yawFor(dirX, dirZ);
    this.pushTimer = 0;
    this.anim.play("climb_ladder", { timeScale: CLIMB.riseSpeed / this.climbRiseSpeed, fade: 0.1 });
  }

  private updateClimb(dt: number, dirX: number, dirZ: number, mag: number) {
    const c = this.climb!;
    if (c.phase === "up") {
      // Pressing back in the first half lets go.
      const back = mag > 0.5 && dirX * c.dirX + dirZ * c.dirZ < -0.5;
      if (back && this.feet.y - c.startY < (c.top - c.startY) / 2) {
        this.climb = null;
        this.mode = "air";
        this.airTime = MOVE.airPoseDelay;
        this.peakY = this.feet.y;
        this.grounded = false;
        this.anim.play("jump", { from: CLIP_TIMES.jumpAirHold - 0.1, holdAt: CLIP_TIMES.jumpAirHold, fade: 0.1 });
        return this.publish();
      }
      this.feet.y = Math.min(this.feet.y + CLIMB.riseSpeed * dt, c.top + 0.01);
      if (this.feet.y >= c.top + 0.01) {
        c.phase = "over";
        c.t = 0;
      }
      return this.publish();
    }
    // Over the lip onto the top. The probe already checked this spot is clear, and going
    // through the controller here snags on the ledge's edge a few mm under the feet.
    const step = Math.max(0, Math.min(dt, CLIMB.overTime - c.t));
    c.t += dt;
    const d = (c.over / CLIMB.overTime) * step;
    this.feet.x += c.dirX * d;
    this.feet.z += c.dirZ * d;
    if (c.t >= CLIMB.overTime) {
      this.climb = null;
      this.mode = "ground";
      this.grounded = true;
      this.lastGroundedAt = this.now;
      this.anim.play(mag > 0.05 ? "walk" : "idle");
    }
    this.publish();
  }

  // ---------------------------------------------------------------- ladder

  private tryLadder(dirX: number, dirZ: number) {
    const L = this.ladder;
    if (!L) return false;
    const f = this.feet;
    const toward = dirX * L.facing.x + dirZ * L.facing.z;
    const lateral = (f.x - L.line.x) * L.facing.z - (f.z - L.line.z) * L.facing.x; // signed distance across
    const along = (f.x - L.line.x) * L.facing.x + (f.z - L.line.z) * L.facing.z; // + = toward the ladder

    // Bottom: on the right-wall shelf, at the ladder, pushing toward it.
    if (Math.abs(f.y - L.bottomY) < 0.05 && Math.abs(lateral) < 0.12 && along > -0.15 && toward > 0.5) {
      this.enterLadder();
      this.feet.set(L.line.x, L.bottomY + 0.005, L.line.z);
      return true;
    }
    // Top: on the door shelf near the ladder, walking back toward it.
    const alongExit = (f.x - L.line.x) * L.exit.x + (f.z - L.line.z) * L.exit.z;
    const backToward = -(dirX * L.exit.x + dirZ * L.exit.z);
    if (Math.abs(f.y - L.topY) < 0.05 && Math.abs(lateral) < 0.12 && alongExit < 0.45 && backToward > 0.5) {
      this.enterLadder();
      this.ladderMove = {
        kind: "enterTop",
        from: f.clone(),
        to: new THREE.Vector3(L.line.x, L.topY + 0.01, L.line.z),
        t: 0,
        time: CLIMB.ladderExitTime,
      };
      return true;
    }
    return false;
  }

  private enterLadder() {
    const L = this.ladder!;
    this.mode = "ladder";
    this.vel.set(0, 0, 0);
    this.landing = null;
    this.yaw = yawFor(L.facing.x, L.facing.z);
    this.anim.play("climb_ladder", { timeScale: 0, fade: 0.12 });
  }

  /** Distance along the exit direction from the ladder line to solid door-shelf footing. */
  private ladderExitDistance(L: Ladder) {
    const notLadder = (c: Collider) => this.solid(true)(c) && !!c.parent()?.isFixed();
    for (let s = 0; s <= 0.8; s += 0.02) {
      const x = L.line.x + L.exit.x * s;
      const z = L.line.z + L.exit.z * s;
      const hit = this.cast(x, L.topY + 0.05, z, 0, -1, 0, 0.1, notLadder);
      if (hit && Math.abs(L.topY + 0.05 - hit.timeOfImpact - L.topY) < 0.03) return s + CLIMB.ladderExitMargin;
    }
    return 0.14; // prompt default
  }

  private updateLadder(dt: number, dirX: number, dirZ: number, mag: number, jumpPressed: boolean) {
    const L = this.ladder!;
    const mv = this.ladderMove;
    if (mv) {
      mv.t += dt;
      const k = Math.min(1, mv.t / mv.time);
      const e = k * k * (3 - 2 * k);
      this.feet.lerpVectors(mv.from, mv.to, e);
      if (k >= 1) {
        this.ladderMove = null;
        if (mv.kind !== "enterTop") {
          this.mode = "ground";
          this.grounded = true;
          this.lastGroundedAt = this.now;
          this.anim.play("idle");
        }
      }
      return this.publish();
    }

    if (jumpPressed) {
      // Let go: drop off backwards.
      this.mode = "air";
      this.vel.set(-L.facing.x * 0.4, 0, -L.facing.z * 0.4);
      this.grounded = false;
      this.airTime = MOVE.airPoseDelay;
      this.peakY = this.feet.y;
      this.jumpPressedAt = -Infinity;
      this.anim.play("jump", { from: CLIP_TIMES.jumpAirHold - 0.1, holdAt: CLIP_TIMES.jumpAirHold, fade: 0.1 });
      return this.publish();
    }

    // Toward the ladder climbs up, away climbs down.
    const u = mag > 0.3 ? dirX * L.facing.x + dirZ * L.facing.z : 0;
    const sign = u > 0.3 ? 1 : u < -0.3 ? -1 : 0;
    this.feet.y += sign * CLIMB.ladderSpeed * dt;
    this.anim.setTimeScale((sign * CLIMB.ladderSpeed) / this.climbRiseSpeed);

    if (sign > 0 && this.feet.y >= L.topY + 0.01) {
      this.feet.y = L.topY + 0.01;
      const s = this.ladderExitDistance(L);
      this.ladderMove = {
        kind: "exitTop",
        from: this.feet.clone(),
        to: new THREE.Vector3(L.line.x + L.exit.x * s, L.topY + 0.005, L.line.z + L.exit.z * s),
        t: 0,
        time: CLIMB.ladderExitTime,
      };
      this.yaw = yawFor(L.exit.x, L.exit.z);
    } else if (sign < 0 && this.feet.y <= L.bottomY + 0.005) {
      this.feet.y = L.bottomY + 0.005;
      this.ladderMove = {
        kind: "exitBottom",
        from: this.feet.clone(),
        to: this.feet.clone().addScaledVector(L.facing, -CLIMB.ladderBottomStep),
        t: 0,
        time: 0.2,
      };
    }
    this.publish();
  }
}

export type { HueMover };

export function useHueController(
  body: React.RefObject<RigidBody | null>,
  collider: React.RefObject<Collider | null>,
  anim: Animator,
  rollCurve: RootCurve,
  climbRiseSpeed: number,
) {
  const { world, rapier } = useRapier();
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

  // Stable identity: callers list this in effect dependencies (a fresh object per render
  // re-ran the restart effect on every re-render and snapped Hue back onto the chair).
  return useMemo(
    () => ({
      /** Lazily binds once the controller and the body/collider refs exist. */
      get() {
        if (!mover.current && cc.current && body.current && collider.current) {
          mover.current = new HueMover(world, rapier, cc.current, body.current, collider.current, anim, rollCurve, climbRiseSpeed);
        }
        return mover.current;
      },
    }),
    [world, rapier, body, collider, anim, rollCurve, climbRiseSpeed],
  );
}
