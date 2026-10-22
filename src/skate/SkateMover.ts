import type { KinematicCharacterController } from "@dimforge/rapier3d-compat";
import type { RapierCollider as Collider, RapierRigidBody as RigidBody } from "@react-three/rapier";
import * as THREE from "three";
import type { Animator } from "../animator";
import { HUE, MOVE, SKATE } from "../config";
import type { InputSample } from "../input";
import type { Mover } from "../mover";
import { colliderMeta } from "../Room";
import { runtime, useGame } from "../store";
import { Lane } from "./lane";
import { catchRail, type Rail } from "./rails";

type Mode = "ground" | "air" | "grind";
type Flip = "kickflip" | "heelflip" | "shuvit";

const CAPSULE_CENTER = HUE.capsuleHalfHeight + HUE.capsuleRadius; // feet → capsule centre
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const yawFor = (x: number, z: number) => Math.atan2(-z, x);
/** His body's turn from the way he rolls, by stance (a yaw of +90 degrees turns +x toward -z, so a left foot forward faces the way he rolls minus a quarter turn). */
const STANCE_TURN = { regular: -Math.PI / 2, goofy: Math.PI / 2, forward: 0 } as const;
const _p = new THREE.Vector3();

/**
 * Hue on a skateboard (levels.ts mode "skate"). The board rolls along a lane (lane.ts): the level's route, or a straight line from his spawn in the direction he faces. He only
 * goes forward and nothing steers him sideways, so the camera rides behind him (SkateCamera.tsx) and the level's obstacles, coins and rails are all in the lane. The left stick
 * pushes (up, the way he is rolling, speeds him up; down brakes), a pop (a flick of the right stick, Space, the pad's A) is an ollie, and a rail his feet come down on carries him
 * along it by itself until its end or until he pops off. Hitting something tall costs him most of his speed and nothing else: there is no failing.
 *
 * It moves a capsule through the same Rapier character controller the walking one uses, so ramps, kerbs and everything solid behave the same way.
 */
export class SkateMover implements Mover {
  readonly feet = new THREE.Vector3();
  /** His drawn yaw: the way the board is going, turned a quarter by his stance (SKATE.stance), so he stands sideways on it. */
  yaw = 0;
  /** The way the board is going, smoothed round the lane's bends. */
  private heading = 0;
  mode: Mode = "ground";
  readonly debugProbe = { active: false, from: new THREE.Vector3(), to: new THREE.Vector3(), hit: false };

  private lane: Lane;
  /** Distance along the lane (m) and its direction there. */
  private s = 0;
  private dir = new THREE.Vector3(1, 0, 0);
  private speed = 0;
  private vy = 0;
  private grounded = true;
  private now = 0;
  private lastGroundedAt = 0;
  private popAt = -Infinity;
  private prevJump = false;
  /** False from the moment he is placed until the jump key has been let go once: the key that began the run must not also be his first pop. */
  private jumpArmed = false;
  private jumped = false; // this air time started with a pop (or a ramp's launch): the slower, floatier gravity
  /** How fast he was last climbing a slope (m/s) and when: a ramp's lip throws him up the way it was rising, though his body has rolled over the edge by the time the ground lets go. */
  private riseVy = 0;
  private riseAt = -Infinity;
  /** A bump counts once per contact: it re-arms when he rolls on freely again. It takes two frames in a row of being held up, because the controller's slide now and then loses a frame's movement on flat ground. */
  private bumpArmed = true;
  private blocked = 0;
  /** A flip trick asked for (and when), and the one in progress. */
  private queued: { kind: Flip; at: number } | null = null;
  private trick: { kind: Flip; t: number; dur: number } | null = null;
  /** The stick is pushing him along (on the ground): the push clip plays; otherwise he rides. */
  private pushing = false;
  private rail: { rail: Rail; sh: number; hLen: number; sign: 1 | -1 } | null = null;
  private skip: Rail | null = null;
  private skipUntil = 0;

  constructor(
    private cc: KinematicCharacterController,
    private body: RigidBody,
    private collider: Collider,
    private anim: Animator,
    private rails: readonly Rail[],
    /** The level's route, or null for a straight lane from wherever he is placed. */
    private route: Lane | null,
  ) {
    this.lane = route ?? Lane.straight(new THREE.Vector3(), 1, 0);
    // A board rolls over a joint between two paving surfaces that a walker would step up.
    this.cc.enableAutostep(SKATE.stepMax, MOVE.autostepMinWidth, false);
  }

  disarmJump() {
    this.jumpArmed = false;
  }

  /** Test hook: roll at this speed at once. */
  setSpeed(v: number) {
    this.speed = v;
  }

  /** Puts him on the lane at `feet`. With no route the lane is the straight line through `feet` facing `yaw`; with one, `yaw` is ignored. */
  place(feet: THREE.Vector3, yaw: number) {
    this.feet.copy(feet);
    this.lane = this.route ?? Lane.straight(feet, Math.cos(yaw), -Math.sin(yaw));
    this.s = this.lane.project(feet.x, feet.z, 0, Infinity);
    this.lane.tangent(this.s, this.dir);
    this.lane.at(this.s, _p);
    this.feet.x = _p.x;
    this.feet.z = _p.z;
    this.speed = 0;
    this.vy = 0;
    this.mode = "ground";
    this.grounded = true;
    this.jumped = false;
    this.rail = null;
    this.skip = null;
    this.popAt = -Infinity;
    this.jumpArmed = false;
    this.blocked = 0;
    this.bumpArmed = true;
    this.trick = this.queued = null;
    this.riseVy = 0;
    this.riseAt = -Infinity;
    this.lastGroundedAt = this.now;
    this.heading = yawFor(this.dir.x, this.dir.z);
    this.yaw = this.heading + STANCE_TURN[SKATE.stance];
    const c = { x: this.feet.x, y: feet.y + CAPSULE_CENTER, z: this.feet.z };
    this.body.setTranslation(c, true);
    this.body.setNextKinematicTranslation(c);
    const S = runtime.skate;
    S.active = true;
    S.lane = this.lane;
    S.s = this.s;
    S.dir.copy(this.dir);
    S.heading = this.heading;
    S.bodyYaw = this.yaw;
    S.speed = 0;
    S.grinding = false;
    S.railName = null;
    S.pitch = 0;
    S.pops = S.grinds = S.bumps = S.tricks = S.tricksCut = 0;
    S.roll = S.spin = S.drop = 0;
    S.trick = null;
    this.publish();
  }

  update(dt: number, input: InputSample) {
    this.now += dt;

    // The left stick, as a direction in the world (the same turn as the walking controller's): its part along the lane pushes (up, with the camera behind him) or brakes (down).
    // Sideways does nothing: he only goes forward.
    const cy = runtime.debug.input ? 0 : runtime.moveYaw;
    const wx = -Math.sin(cy) * input.moveZ + Math.cos(cy) * input.moveX;
    const wz = -Math.cos(cy) * input.moveZ - Math.sin(cy) * input.moveX;
    const push = wx * this.dir.x + wz * this.dir.z;

    if (!input.jump) this.jumpArmed = true;
    const jump = input.jump && this.jumpArmed;
    if ((jump && !this.prevJump) || input.pop) this.popAt = this.now;
    this.prevJump = jump;
    const wantsPop = this.now - this.popAt <= SKATE.popBuffer;
    if (input.trick) this.queued = { kind: input.trick, at: this.now };
    const wantsTrick = !!this.queued && this.now - this.queued.at <= SKATE.popBuffer;

    if (this.mode === "grind") this.updateGrind(dt, wantsPop, wantsTrick);
    else this.updateRoll(dt, push, wantsPop, wantsTrick);

    this.dress(dt);
    this.publish();
  }

  // ---------------------------------------------------------------- rolling and flying

  private updateRoll(dt: number, push: number, wantsPop: boolean, wantsTrick: boolean) {
    this.pushing = this.grounded && push > 0.1 && !this.jumped;
    // Speed: pushing and braking need the wheels on the ground; in the air it carries. Once the run is won he rolls to a stop.
    if (this.grounded) {
      if (useGame.getState().phase === "won") {
        this.speed = Math.max(0, this.speed - SKATE.brake * dt);
      } else if (push > 0.1) {
        if (this.speed < SKATE.maxSpeed) this.speed = Math.min(SKATE.maxSpeed, this.speed + SKATE.pushAccel * push * dt);
      } else if (push < -0.1) {
        this.speed = Math.max(0, this.speed + SKATE.brake * push * dt);
      } else {
        const floor = this.speed >= SKATE.coastFloor ? SKATE.coastFloor : 0;
        this.speed = Math.max(floor, this.speed - SKATE.rollFriction * dt);
      }
    }

    // Pop: a hair after he left the ground, or a hair before he lands, still counts.
    const canPop = this.grounded || this.now - this.lastGroundedAt <= SKATE.coyote;
    if (canPop && !this.jumped && (wantsPop || wantsTrick)) {
      this.pop(SKATE.ollieSpeed);
      if (wantsTrick) this.startTrick();
    } else if (wantsTrick && this.mode === "air" && !this.trick) {
      this.startTrick(); // a flip added to the jump he is already in
    }

    const g = this.jumped ? SKATE.gravity : SKATE.fallGravity;
    const vyStart = this.vy;
    this.vy = Math.max(this.vy - g * dt, -SKATE.maxFall);
    const wanted = this.speed * dt;
    const desired = { x: this.dir.x * wanted, y: 0.5 * (vyStart + this.vy) * dt, z: this.dir.z * wanted };

    const y0 = this.feet.y;
    this.cc.computeColliderMovement(this.collider, desired, undefined, undefined, (c: Collider) => c !== this.collider && !c.isSensor());
    const m = this.cc.computedMovement();
    this.feet.x += m.x;
    this.feet.y += m.y;
    this.feet.z += m.z;
    this.holdLane();

    // Something tall in the way: he loses most of his speed, once per contact.
    const got = m.x * this.dir.x + m.z * this.dir.z;
    if (wanted > 1e-4 && got < wanted * 0.35 && this.speed > 0.3) {
      if (++this.blocked >= 2 && this.bumpArmed) {
        this.bumpArmed = false;
        this.speed *= SKATE.bumpKeep;
        runtime.skate.bumps++;
        // What he hit, for the debug view and the tests.
        const hit = this.cc.numComputedCollisions() ? this.cc.computedCollision(0)?.collider : null;
        runtime.skate.bumpedInto = hit ? (colliderMeta.get(hit.handle)?.name ?? `collider ${hit.handle}`) : null;
      }
    } else {
      this.blocked = 0;
      if (got >= wanted * 0.6) this.bumpArmed = true;
    }

    const wasGrounded = this.grounded;
    this.grounded = this.cc.computedGrounded() && this.vy <= 0;
    if (this.grounded) {
      this.lastGroundedAt = this.now;
      const rise = (this.feet.y - y0) / Math.max(dt, 1e-4);
      if (rise > 0.3) {
        this.riseVy = rise;
        this.riseAt = this.now;
      }
      if (this.vy < 0) this.vy = 0;
      this.jumped = false;
      this.mode = "ground";
    } else {
      if (wasGrounded && !this.jumped) {
        // Rolled off a ramp's lip or an edge: a ramp throws him up the way it was rising.
        this.vy = this.now - this.riseAt < 0.25 ? THREE.MathUtils.clamp(this.riseVy, 0, SKATE.launchMax) : 0;
        if (this.vy > 0.3) this.jumped = true;
      }
      this.mode = "air";
      if (this.vy > 0 && m.y < desired.y - 1e-4) this.vy = 0; // head bump
    }

    // Coming down on a rail: in the air over it, or the frame he lands on the ledge that holds it up (its top is a hair under the grind line, so he is "grounded" there).
    if (!this.grounded || !wasGrounded) {
      const hit = catchRail(this.rails, this.feet, this.vy, this.now < this.skipUntil ? this.skip : null);
      if (hit) this.startGrind(hit.rail, hit.s);
    }
  }

  private pop(speed: number) {
    this.vy = speed;
    this.jumped = true;
    this.grounded = false;
    this.mode = "air";
    this.popAt = -Infinity;
    runtime.skate.pops++;
  }

  private startTrick() {
    const kind = this.queued!.kind;
    this.queued = null;
    this.trick = { kind, t: 0, dur: SKATE.trick[kind] };
    runtime.skate.trick = kind;
  }

  /** Turns the board under him for a flip in progress; it finishes flat, and a landing before it is done just snaps it flat (no failing). */
  private doTrick(dt: number) {
    const S = runtime.skate;
    const t = this.trick;
    if (!t) return;
    if (this.mode !== "air") {
      // Landed (or caught a rail) before it finished.
      S.tricksCut++;
      this.trick = null;
    } else {
      t.t += dt;
      const p = Math.min(1, t.t / t.dur);
      const e = p * p * (3 - 2 * p);
      S.roll = t.kind === "kickflip" ? 2 * Math.PI * e : t.kind === "heelflip" ? -2 * Math.PI * e : 0;
      S.spin = t.kind === "shuvit" ? Math.PI * e : 0;
      S.drop = SKATE.trick.drop * Math.sin(Math.PI * p);
      if (p < 1) return;
      S.tricks++;
      this.trick = null;
    }
    S.roll = S.spin = S.drop = 0;
    S.trick = null;
  }

  /** Nothing steers him off the lane: wherever the controller slid him sideways is taken back, and the lane's direction there becomes his. */
  private holdLane() {
    this.s = this.lane.project(this.feet.x, this.feet.z, this.s, 6);
    this.lane.at(this.s, _p);
    this.feet.x = _p.x;
    this.feet.z = _p.z;
    this.lane.tangent(this.s, this.dir);
  }

  // ---------------------------------------------------------------- rails

  private startGrind(rail: Rail, s: number) {
    const hl = Math.hypot(rail.dir.x, rail.dir.z) || 1;
    const sign = this.dir.x * rail.dir.x + this.dir.z * rail.dir.z >= 0 ? 1 : -1;
    this.rail = { rail, sh: s * hl, hLen: rail.length * hl, sign };
    this.feet.y = THREE.MathUtils.lerp(rail.a.y, rail.b.y, THREE.MathUtils.clamp(s / rail.length, 0, 1));
    this.mode = "grind";
    this.vy = 0;
    this.jumped = false;
    this.grounded = false;
    this.speed = Math.max(this.speed, SKATE.rail.minSpeed);
    const S = runtime.skate;
    S.grinds++;
    S.railName = rail.name;
  }

  /** Carries him along the rail at his speed. He leaves it at its end (with a little hop, and its slope's rise) or when he pops. */
  private updateGrind(dt: number, wantsPop: boolean, wantsTrick: boolean) {
    const r = this.rail!;
    this.speed = Math.max(this.speed, SKATE.rail.minSpeed);
    const step = this.speed * dt;
    r.sh += r.sign * step;
    this.s += step;
    this.lane.at(this.s, _p);
    this.feet.x = _p.x;
    this.feet.z = _p.z;
    const k = THREE.MathUtils.clamp(r.sh / r.hLen, 0, 1);
    this.feet.y = THREE.MathUtils.lerp(r.rail.a.y, r.rail.b.y, k);
    this.lane.tangent(this.s, this.dir);
    this.lastGroundedAt = this.now;

    if (wantsPop || wantsTrick) {
      this.leaveRail(SKATE.ollieSpeed);
      runtime.skate.pops++;
      this.popAt = -Infinity;
      if (wantsTrick) this.startTrick();
    } else if (r.sh >= r.hLen || r.sh <= 0) {
      const slope = (r.rail.b.y - r.rail.a.y) / r.hLen;
      this.leaveRail(SKATE.rail.exitHop + Math.max(0, r.sign * slope * this.speed));
    }
  }

  private leaveRail(vy: number) {
    this.skip = this.rail!.rail;
    this.skipUntil = this.now + SKATE.rail.recatch;
    this.rail = null;
    this.mode = "air";
    this.vy = vy;
    this.jumped = true;
    this.grounded = false;
    runtime.skate.railName = null;
  }

  // ---------------------------------------------------------------- looks

  /** His pose and the board's tilt and wheels, for the drawing. */
  private dress(dt: number) {
    const S = runtime.skate;
    this.heading = wrap(this.heading + wrap(yawFor(this.dir.x, this.dir.z) - this.heading) * (1 - Math.exp(-dt / 0.1)));
    this.yaw = wrap(this.heading + STANCE_TURN[SKATE.stance]);
    S.speed = this.speed;
    S.s = this.s;
    S.dir.copy(this.dir);
    S.heading = this.heading;
    S.bodyYaw = this.yaw;
    this.doTrick(dt);
    S.grinding = this.mode === "grind";
    let pitch = 0;
    if (this.mode === "air") pitch = THREE.MathUtils.clamp(this.vy * 0.28, -0.45, 0.45);
    else if (this.rail) pitch = Math.atan2(this.rail.rail.b.y - this.rail.rail.a.y, this.rail.hLen) * this.rail.sign;
    S.pitch += (pitch - S.pitch) * (1 - Math.exp(-dt / 0.06));
    if (this.mode !== "grind") S.wheel += (this.speed * dt) / SKATE.wheelRadius;
    // Push to push: while the stick pushes he plays the push loop (faster the faster he goes); otherwise, and in the air and on a rail, the riding pose.
    if (this.mode === "ground" && this.pushing) this.anim.play("skate_push", { timeScale: 1 + 0.5 * (this.speed / SKATE.maxSpeed) });
    else if (this.anim.current !== "skate_ride") this.anim.play("skate_ride");
  }

  private publish() {
    this.body.setNextKinematicTranslation({ x: this.feet.x, y: this.feet.y + CAPSULE_CENTER, z: this.feet.z });
    runtime.feet.copy(this.feet);
    runtime.grounded = this.grounded || this.mode === "grind";
    runtime.climbing = false;
  }
}
