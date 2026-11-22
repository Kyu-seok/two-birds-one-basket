import { followCamera, type Point } from "./camera.ts";
import {
  BIRDS,
  OPENING,
  OPENING_HINTS,
  PHYSICS,
  loudnessToDb,
  runCourse,
  type Bird,
  type BirdState,
  type Course,
  type PerBird,
  type Span,
  type RunState,
  type WorldState,
} from "@tbob/shared";

const PX_PER_M = 48;
/** A Bird's body sits this far above its feet. */
const BODY_Y = 0.38;
/** How deep the gap is drawn before it fades out. */
const GAP_DEPTH = 12;
/** How high a slack Rope lying on the ground is drawn, so it sits on the surface. */
const ROPE_REST_Y = 0.04;

/** Each Bird's colour, shared with anything else that marks a Bird (the chat). */
export const BIRD_COLORS: PerBird<string> = { pink: "#f4a6a6", blue: "#8ec5f2" };

const COLORS = {
  skyTop: "#a6d8f4",
  skyBottom: "#fdf6ec",
  ground: "#b8e0b0",
  groundEdge: "#8cc485",
  gap: "#3d3a4bcc",
  ceiling: "#9a8f9e",
  ceilingEdge: "#7a6f80",
  grid: "#3d3a4b22",
  rope: "#8a5a32",
  bird: BIRD_COLORS,
  ink: "#3d3a4b",
  meterBg: "#ffffff99",
  sign: "#fffaf0ee",
};

const NAME: PerBird<string> = { pink: "Pink", blue: "Blue" };

export interface Frame {
  world: WorldState;
  /** The Run, for its countdown and Distance. */
  run: RunState;
  /** What each Bird is doing this frame: own Bird from the local mic, partner's from the server. */
  thrust: PerBird<number>;
  present: PerBird<boolean>;
  myBird: Bird;
  myLoudness: number;
  pings: PerBird<number | null>;
  roomCode: string;
  dt: number;
}

export function createRenderer(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const flapPhase: PerBird<number> = { pink: 0, blue: 0 };
  let cam: Point | null = null;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  return function draw(f: Frame) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const { pink, blue } = f.world.birds;
    for (const bird of BIRDS) flapPhase[bird] += f.dt * (3 + 18 * f.thrust[bird]);

    // One shared camera, following the point between the two Birds: the same view on both screens.
    const target = { x: (pink.x + blue.x) / 2, y: (pink.y + blue.y) / 2 };
    cam = cam ? followCamera(cam, target, f.dt) : target;
    const { x: camX, y: camY } = cam;
    const course = runCourse(f.run);
    const sx = (x: number) => w / 2 + (x - camX) * PX_PER_M;
    const sy = (y: number) => h * 0.6 - (y - camY) * PX_PER_M;

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, COLORS.skyTop);
    sky.addColorStop(1, COLORS.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Distance markers every 5 m so walking is visible on flat ground.
    ctx.strokeStyle = COLORS.grid;
    ctx.fillStyle = COLORS.grid;
    ctx.font = "12px system-ui";
    ctx.textAlign = "left";
    const left = camX - w / 2 / PX_PER_M;
    const right = camX + w / 2 / PX_PER_M;
    for (let m = Math.ceil(left / 5) * 5; m < right; m += 5) {
      ctx.beginPath();
      ctx.moveTo(sx(m), 0);
      ctx.lineTo(sx(m), sy(0));
      ctx.stroke();
      ctx.fillText(`${m} m`, sx(m) + 4, sy(0) - 6);
    }

    const near = spansBetween(course, left, right);
    drawCourse(ctx, sx, sy, near, left, right, h);
    drawHints(ctx, sx, sy, course, left, right);
    drawRope(ctx, sx, sy, pink, blue, f.world.ropeLength, near.ground);
    for (const bird of BIRDS) {
      const b = f.world.birds[bird];
      ctx.save();
      ctx.translate(sx(b.x), sy(b.y + BODY_Y));
      ctx.scale(PX_PER_M, PX_PER_M);
      drawBird(ctx, COLORS.bird[bird], flapPhase[bird], f.thrust[bird], f.present[bird]);
      ctx.restore();
    }

    drawHud(ctx, f, w, h);
  };
}

/** The ground and ceilings of the Pieces in view, in Course coordinates. */
function spansBetween(course: Course, left: number, right: number) {
  const ground: Span[] = [];
  const ceilings: Span[] = [];
  for (const { x, piece } of course.piecesBetween(left, right)) {
    const place = (s: Span) => ({ from: x + s.from, to: x + s.to, height: s.height });
    ground.push(...piece.ground.map(place));
    ceilings.push(...piece.ceilings.map(place));
  }
  return { ground, ceilings };
}

/** The Course from the same Piece data the server collides with: ground, gaps and low ceilings. */
function drawCourse(
  ctx: CanvasRenderingContext2D,
  sx: (x: number) => number,
  sy: (y: number) => number,
  near: { ground: Span[]; ceilings: Span[] },
  left: number,
  right: number,
  h: number,
) {
  // Behind everything, below ground level, the gaps: open sky fading to dark.
  const top = sy(0);
  if (top < h) {
    const fade = ctx.createLinearGradient(0, top, 0, sy(-GAP_DEPTH));
    fade.addColorStop(0, "#3d3a4b00");
    fade.addColorStop(1, COLORS.gap);
    ctx.fillStyle = fade;
    ctx.fillRect(sx(left), top, sx(right) - sx(left), h - top);
  }
  for (const g of near.ground) {
    const y = sy(g.height);
    if (y >= h) continue;
    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(sx(g.from), y, sx(g.to) - sx(g.from), h - y);
    ctx.fillStyle = COLORS.groundEdge;
    ctx.fillRect(sx(g.from), y, sx(g.to) - sx(g.from), 4);
  }
  for (const c of near.ceilings) {
    const y = sy(c.height);
    if (y <= 0) continue;
    ctx.fillStyle = COLORS.ceiling;
    ctx.fillRect(sx(c.from), 0, sx(c.to) - sx(c.from), y);
    ctx.fillStyle = COLORS.ceilingEdge;
    ctx.fillRect(sx(c.from), y - 4, sx(c.to) - sx(c.from), 4);
  }
}

/** The Opening's hints, each a little sign standing on the ground by its teaching step. */
function drawHints(
  ctx: CanvasRenderingContext2D,
  sx: (x: number) => number,
  sy: (y: number) => number,
  course: Course,
  left: number,
  right: number,
) {
  ctx.font = "bold 15px system-ui";
  ctx.textAlign = "center";
  for (const { x, piece } of course.piecesBetween(left - 10, right + 10)) {
    if (piece !== OPENING) continue;
    OPENING_HINTS.forEach((hint, i) => {
      // Neighbouring signs stand at alternate heights so their text doesn't overlap.
      const cx = sx(x + hint.at);
      const cy = sy(i % 2 ? 3.4 : 2.5);
      const width = ctx.measureText(hint.text).width + 20;
      ctx.strokeStyle = COLORS.groundEdge;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, sy(0));
      ctx.stroke();
      ctx.fillStyle = COLORS.sign;
      ctx.fillRect(cx - width / 2, cy - 16, width, 28);
      ctx.strokeRect(cx - width / 2, cy - 16, width, 28);
      ctx.fillStyle = COLORS.ink;
      ctx.fillText(hint.text, cx, cy + 3);
    });
  }
}

/** The Rope between the two Birds' bodies, sagging when it has slack. */
function drawRope(
  ctx: CanvasRenderingContext2D,
  sx: (x: number) => number,
  sy: (y: number) => number,
  a: BirdState,
  b: BirdState,
  length: number,
  ground: Span[],
) {
  const ax = a.x;
  const ay = a.y + BODY_Y;
  const bx = b.x;
  const by = b.y + BODY_Y;
  const dist = Math.hypot(bx - ax, by - ay);
  // Rough sag: how far the middle drops for a Rope of this length hung across this distance.
  const sag = dist < length ? Math.sqrt(length * length - dist * dist) / 2 : 0;
  // A quadratic curve's middle sits halfway between its control point and its ends' midpoint,
  // so the control point drops twice the sag.
  let controlY = (ay + by) / 2 - sag * 2;
  // Slack Rope over ground rests on the ground instead of passing through it.
  const midX = (ax + bx) / 2;
  const under = ground.filter((g) => midX >= g.from && midX <= g.to).map((g) => g.height);
  if (under.length) controlY = Math.max(controlY, 2 * (Math.max(...under) + ROPE_REST_Y) - (ay + by) / 2);
  ctx.strokeStyle = COLORS.rope;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(sx(ax), sy(ay));
  ctx.quadraticCurveTo(sx(midX), sy(controlY), sx(bx), sy(by));
  ctx.stroke();
}

function drawBird(ctx: CanvasRenderingContext2D, color: string, phase: number, thrust: number, present: boolean) {
  ctx.globalAlpha = present ? 1 : 0.35;
  ctx.fillStyle = color;
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 0.04;
  // Legs
  ctx.beginPath();
  ctx.moveTo(-0.1, 0.25);
  ctx.lineTo(-0.12, BODY_Y);
  ctx.moveTo(0.1, 0.25);
  ctx.lineTo(0.12, BODY_Y);
  ctx.stroke();
  // Body
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.4, 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Eye and beak face forward, the way the Course goes.
  ctx.fillStyle = COLORS.ink;
  ctx.beginPath();
  ctx.arc(0.2, -0.08, 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f4d06f";
  ctx.beginPath();
  ctx.moveTo(0.38, -0.05);
  ctx.lineTo(0.58, 0.02);
  ctx.lineTo(0.38, 0.08);
  ctx.fill();
  // Wing: flaps faster and wider with more Thrust.
  const lift = Math.sin(phase) * (0.2 + 0.9 * thrust);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0.05, -0.05);
  ctx.lineTo(-0.55, -0.05 - lift * 0.5);
  ctx.lineTo(0, 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawHud(ctx: CanvasRenderingContext2D, f: Frame, w: number, h: number) {
  ctx.fillStyle = COLORS.ink;
  ctx.font = "14px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(`Room ${f.roomCode} · you are ${NAME[f.myBird]}`, 16, 24);
  if ("distance" in f.run) ctx.fillText(`Distance ${f.run.distance.toFixed(1)} m`, 16, 44);
  ctx.fillText("Hold Space for full Thrust (test)", 16, 64);

  const pingText = (bird: Bird) => {
    const you = bird === f.myBird ? " (you)" : "";
    if (!f.present[bird]) return `${NAME[bird]}${you}: waiting…`;
    const ms = f.pings[bird];
    return `${NAME[bird]}${you}: ${ms === null ? "–" : `${ms} ms`}`;
  };
  ctx.textAlign = "right";
  BIRDS.forEach((bird, i) => {
    ctx.fillStyle = COLORS.bird[bird];
    ctx.fillRect(w - 16 - ctx.measureText(pingText(bird)).width - 16, 14 + i * 20, 10, 10);
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(pingText(bird), w - 16, 24 + i * 20);
  });

  if (f.run.phase === "countdown") {
    // 3, 2, 1, each shrinking and fading through its second.
    const n = Math.ceil(f.run.secondsLeft - 1e-6);
    const through = n - f.run.secondsLeft;
    ctx.textAlign = "center";
    ctx.font = `bold ${Math.round(96 - 32 * through)}px system-ui`;
    ctx.globalAlpha = 1 - 0.6 * through;
    ctx.fillText(String(n), w / 2, h * 0.32);
    ctx.globalAlpha = 1;
  }

  // Own meter, in your Bird's colour: filled to the Thrust it gives, with the jump threshold marked.
  const mine = f.myBird;
  const mx = 16;
  const mh = Math.min(200, h * 0.4);
  const my = h - 24 - mh;
  ctx.fillStyle = COLORS.meterBg;
  ctx.fillRect(mx, my, 20, mh);
  ctx.fillStyle = COLORS.bird[mine];
  const fill = f.thrust[mine];
  ctx.fillRect(mx, my + mh * (1 - fill), 20, mh * fill);
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 1;
  ctx.strokeRect(mx, my, 20, mh);
  const jumpY = my + mh * (1 - PHYSICS.jumpThreshold);
  ctx.beginPath();
  ctx.moveTo(mx - 4, jumpY);
  ctx.lineTo(mx + 24, jumpY);
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.fillStyle = COLORS.ink;
  ctx.font = "12px system-ui";
  ctx.fillText("jump", mx + 28, jumpY + 4);
  ctx.fillText(`Loudness ${loudnessToDb(f.myLoudness).toFixed(0)} dB · Thrust ${fill.toFixed(2)}`, 16, h - 8);
}
