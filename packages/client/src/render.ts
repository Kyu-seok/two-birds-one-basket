import { SIDES, type BasketState, type PerSide, type Side } from "@tbob/shared";

const PX_PER_M = 40;
const BASKET_W = 2;
const BASKET_H = 1;
const BIRD_OFFSET_X = 1.3;
const BIRD_OFFSET_Y = 1.6;

const COLORS = {
  skyTop: "#a6d8f4",
  skyBottom: "#fdf6ec",
  ground: "#b8e0b0",
  grid: "#3d3a4b22",
  basket: "#d9a066",
  basketEdge: "#8a5a32",
  rope: "#8a5a32",
  bird: { left: "#f4a6a6", right: "#b8a6f4" } as PerSide<string>,
  ink: "#3d3a4b",
  meterBg: "#ffffff99",
  meter: "#f4a6a6",
};

export interface Frame {
  basket: BasketState;
  /** Highest point the Basket has reached so far. */
  height: number;
  /** What each Bird is doing this frame: own Side from the local mic, partner's from the server. */
  thrust: PerSide<number>;
  present: PerSide<boolean>;
  mySide: Side;
  myLoudness: number;
  pings: PerSide<number | null>;
  roomCode: string;
  dt: number;
}

export function createRenderer(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const flapPhase: PerSide<number> = { left: 0, right: 0 };

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
    for (const side of SIDES) flapPhase[side] += f.dt * (3 + 18 * f.thrust[side]);

    // Camera follows the Basket.
    const camX = f.basket.x;
    const camY = f.basket.y;
    const toScreenX = (x: number) => w / 2 + (x - camX) * PX_PER_M;
    const toScreenY = (y: number) => h * 0.6 - (y - camY) * PX_PER_M;

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, COLORS.skyTop);
    sky.addColorStop(1, COLORS.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Height markers every 5 m so motion is visible in the empty Course.
    ctx.strokeStyle = COLORS.grid;
    ctx.fillStyle = COLORS.grid;
    ctx.font = "12px system-ui";
    const top = camY + (h * 0.6) / PX_PER_M;
    for (let m = Math.ceil((camY - h / PX_PER_M) / 5) * 5; m < top; m += 5) {
      if (m <= 0) continue;
      const y = toScreenY(m);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.fillText(`${m} m`, 8, y - 4);
    }

    const groundY = toScreenY(0);
    if (groundY < h) {
      ctx.fillStyle = COLORS.ground;
      ctx.fillRect(0, groundY, w, h - groundY);
    }

    // Basket and Birds, in the Basket's tilted frame.
    ctx.save();
    ctx.translate(toScreenX(f.basket.x), toScreenY(f.basket.y));
    ctx.rotate(f.basket.angle);
    ctx.scale(PX_PER_M, PX_PER_M);
    ctx.lineWidth = 0.06;
    ctx.fillStyle = COLORS.basket;
    ctx.strokeStyle = COLORS.basketEdge;
    ctx.beginPath();
    ctx.roundRect(-BASKET_W / 2, -BASKET_H, BASKET_W, BASKET_H, 0.2);
    ctx.fill();
    ctx.stroke();
    for (const side of SIDES) {
      const dir = side === "left" ? -1 : 1;
      const bx = dir * BIRD_OFFSET_X;
      const by = -BASKET_H - BIRD_OFFSET_Y;
      ctx.strokeStyle = COLORS.rope;
      ctx.lineWidth = 0.04;
      ctx.beginPath();
      ctx.moveTo(dir * (BASKET_W / 2 - 0.1), -BASKET_H);
      ctx.lineTo(bx, by + 0.3);
      ctx.stroke();
      drawBird(ctx, bx, by, dir, COLORS.bird[side], flapPhase[side], f.thrust[side], f.present[side]);
    }
    ctx.restore();

    drawHud(ctx, f, w, h);
  };
}

function drawBird(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: number,
  color: string,
  phase: number,
  thrust: number,
  present: boolean,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = present ? 1 : 0.35;
  ctx.fillStyle = color;
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 0.04;
  // Body
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.45, 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Eye and beak face outward.
  ctx.fillStyle = COLORS.ink;
  ctx.beginPath();
  ctx.arc(dir * 0.22, -0.08, 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f4d06f";
  ctx.beginPath();
  ctx.moveTo(dir * 0.42, -0.05);
  ctx.lineTo(dir * 0.62, 0.02);
  ctx.lineTo(dir * 0.42, 0.08);
  ctx.fill();
  // Wing: flaps faster and wider with more Thrust.
  const lift = Math.sin(phase) * (0.2 + 0.9 * thrust);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-dir * 0.1, -0.05);
  ctx.lineTo(-dir * 0.7, -0.05 - lift * 0.6);
  ctx.lineTo(-dir * 0.05, 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawHud(ctx: CanvasRenderingContext2D, f: Frame, w: number, h: number) {
  ctx.fillStyle = COLORS.ink;
  ctx.font = "14px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(`Room ${f.roomCode} · you are ${f.mySide === "left" ? "Left" : "Right"}`, 16, 24);
  ctx.fillText(`Height ${f.height.toFixed(1)} m`, 16, 44);
  ctx.fillText("Hold Space for full Thrust (test)", 16, 64);

  const pingText = (side: Side) => {
    const label = side === "left" ? "Left" : "Right";
    const you = side === f.mySide ? " (you)" : "";
    if (!f.present[side]) return `${label}${you}: waiting…`;
    const ms = f.pings[side];
    return `${label}${you}: ${ms === null ? "–" : `${ms} ms`}`;
  };
  ctx.textAlign = "right";
  ctx.fillText(pingText("left"), w - 16, 24);
  ctx.fillText(pingText("right"), w - 16, 44);

  // Own Loudness meter: filled to the Thrust it gives, with the raw Loudness printed below.
  const mx = f.mySide === "left" ? 16 : w - 36;
  const mh = Math.min(200, h * 0.4);
  const my = h - 24 - mh;
  ctx.fillStyle = COLORS.meterBg;
  ctx.fillRect(mx, my, 20, mh);
  ctx.fillStyle = COLORS.meter;
  const fill = f.thrust[f.mySide];
  ctx.fillRect(mx, my + mh * (1 - fill), 20, mh * fill);
  ctx.strokeStyle = COLORS.ink;
  ctx.strokeRect(mx, my, 20, mh);
  ctx.textAlign = f.mySide === "left" ? "left" : "right";
  ctx.fillStyle = COLORS.ink;
  ctx.font = "12px system-ui";
  ctx.fillText(`Loudness ${f.myLoudness.toFixed(3)}`, f.mySide === "left" ? 16 : w - 16, h - 8);
}
