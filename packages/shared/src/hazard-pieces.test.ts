import { describe, expect, it } from "vitest";
import { BIRDS, partnerOf, type Bird } from "./bird.ts";
import { PIECES, TIERS, fixedCourse, randomCourse, type Course, type Piece } from "./course.ts";
import { HARD_PIECES, MEDIUM_PIECES } from "./hazard-pieces.ts";
import { isBlowing, motionOffset } from "./hazards.ts";
import { TICK_HZ } from "./messages.ts";
import { initialWorld, stepWorld, type Thrusts, type WorldState } from "./physics.ts";

/**
 * Each Medium and Hard Piece played through by two scripted players, at Full Voice or below
 * (Thrust ≤ 1). Each Piece sits at 0 m, with flat ground before and after it.
 */

const TICK = 1 / TICK_HZ;
const WALK = 0.35;
const SILENT: Thrusts = { pink: 0, blue: 0 };

const piece = (name: string): Piece => [...MEDIUM_PIECES, ...HARD_PIECES].find((p) => p.name === name)!;

function courseWith(p: Piece): Course {
  const flat = (length: number): Piece => ({ name: "flat", tier: "easy", length, ground: [{ from: 0, to: length, height: 0 }], ceilings: [] });
  return fixedCourse([
    { x: -30, piece: flat(30) },
    { x: 0, piece: p },
    { x: p.length, piece: flat(40) },
  ]);
}

/** Both Birds standing on the run-up, Blue in front. */
function atStart(): WorldState {
  const w = initialWorld();
  return { ...w, birds: { pink: { ...w.birds.pink, x: -3 }, blue: { ...w.birds.blue, x: -2 } } };
}

type Player = (w: WorldState) => Thrusts;

interface Played {
  world: WorldState;
  fallen: boolean;
  /** Whether either Bird ever dropped below ground level. */
  dropped: boolean;
  seconds: number;
}

/** Plays until both Birds are past `x` (or `seconds` run out). */
function playPast(p: Piece, x: number, players: Player, seconds = 40, world = atStart()): Played {
  const course = courseWith(p);
  let w = world;
  let dropped = false;
  for (let i = 1; i <= seconds * TICK_HZ; i++) {
    w = stepWorld(w, players(w), TICK, course);
    dropped ||=BIRDS.some((b) => w.birds[b].y < 0);
    if (w.fallen) return { world: w, fallen: true, dropped, seconds: i * TICK };
    if (BIRDS.every((b) => w.birds[b].x > x && w.birds[b].grounded)) return { world: w, fallen: false, dropped, seconds: i * TICK };
  }
  return { world: w, fallen: false, dropped, seconds: Infinity };
}

interface Obstacle {
  /** Where to jump from: Birds walk until they are just short of it, then go quiet. */
  edge: number | ((w: WorldState) => number);
  /** The Thrust they jump with. */
  jump: number;
  /** In step, a spot apart (see `hopping`), rather than together. */
  inStep?: boolean;
  /** Only jump while this holds, e.g. in the calm between gusts. */
  when?: (w: WorldState) => boolean;
}

/** How far short of an edge a scripted Bird stops. */
const STOP = 0.45;

/**
 * Scripted players: each walks to the next obstacle's edge and goes quiet there; then they jump
 * it, together or one at a time, as the obstacle asks.
 */
function hopping(obstacles: readonly Obstacle[]): Player {
  return (w) => {
    const edge = (o: Obstacle) => (typeof o.edge === "number" ? o.edge : o.edge(w));
    const next = (x: number) => obstacles.find((o) => x < edge(o));
    const atEdge = (x: number) => {
      const o = next(x);
      return o !== undefined && x >= edge(o) - STOP;
    };
    const thrust: Thrusts = { pink: 0, blue: 0 };
    for (const bird of BIRDS) {
      const b = w.birds[bird];
      const p = w.birds[partnerOf(bird)];
      if (!b.grounded) continue;
      const o = next(b.x);
      if (!o || !atEdge(b.x)) {
        thrust[bird] = WALK;
        continue;
      }
      if (o.when && !o.when(w)) continue;
      const partnerHere = atEdge(p.x) && p.grounded && next(p.x) === o;
      if (o.inStep) {
        // The Bird in front goes first, once its partner is ready at the same edge or the one
        // behind; its partner follows onto the spot it left as soon as it has jumped.
        const i = obstacles.indexOf(o);
        const pNext = next(p.x);
        const pi = pNext ? obstacles.indexOf(pNext) : obstacles.length;
        const partnerReady = p.grounded && atEdge(p.x) && (pi === i - 1 || (pi === i && b.x >= p.x));
        const partnerGone = pi >= i + 2 || (pi === obstacles.length && p.grounded);
        if (partnerReady || partnerGone) thrust[bird] = o.jump;
      } else if (partnerHere) {
        thrust[bird] = o.jump;
      }
    }
    return thrust;
  };
}

describe("the Medium and Hard Pieces", () => {
  it("are in their Tiers, in the catalog the Course is built from", () => {
    for (const p of MEDIUM_PIECES) expect(p.tier).toBe("medium");
    for (const p of HARD_PIECES) expect(p.tier).toBe("hard");
    for (const p of [...MEDIUM_PIECES, ...HARD_PIECES]) expect(PIECES).toContain(p);
    const names = [...MEDIUM_PIECES, ...HARD_PIECES].map((p) => p.name).sort();
    expect(names).toEqual(
      ["together gap", "crumbling platforms", "ceiling gap", "moving platform", "rope swing", "gusts", "narrow pillars", "ceiling run"].sort(),
    );
  });

  it("all appear in random Courses, further along", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      for (const { piece: p } of randomCourse(seed).piecesBetween(0, 3000)) seen.add(p.name);
    }
    for (const p of [...MEDIUM_PIECES, ...HARD_PIECES]) expect(seen, p.name).toContain(p.name);
  });

  it("start and end on ground at height 0, so any Piece can follow any other", () => {
    for (const p of [...MEDIUM_PIECES, ...HARD_PIECES]) {
      expect(p.ground[0], p.name).toMatchObject({ from: 0, height: 0 });
      expect(p.ground.at(-1), p.name).toMatchObject({ to: p.length, height: 0 });
    }
  });

  it("have only hazards that drop a Bird: no Piece has anything that kills on touch", () => {
    // The Piece format has nothing but ground, ceilings and gusts; gusts only push.
    for (const p of [...MEDIUM_PIECES, ...HARD_PIECES]) {
      expect(Object.keys(p).sort(), p.name).toEqual(expect.arrayContaining(["ceilings", "ground", "length", "name", "tier"]));
      for (const key of Object.keys(p)) expect(["name", "tier", "length", "ground", "ceilings", "gusts"]).toContain(key);
    }
  });
});

/** The Run time is in the calm between `p`'s gusts with at least `seconds` of it left. */
function calmFor(p: Piece, seconds: number) {
  return (w: WorldState) => p.gusts!.every((g) => !isBlowing(g, w.time) && !isBlowing(g, w.time + seconds));
}

describe("Medium: the together gap", () => {
  const p = piece("together gap");

  it("is crossed by both Birds jumping together", () => {
    const played = playPast(p, p.length, hopping([{ edge: 5, jump: 0.9 }]));
    expect(played).toMatchObject({ fallen: false, dropped: false });
  });

  it("holds back a Bird that jumps it alone while its partner hangs back, dropping it into the gap", () => {
    const w = atStart();
    const ready: WorldState = { ...w, birds: { pink: { ...w.birds.pink, x: 2.2 }, blue: { ...w.birds.blue, x: 4.8 } } };
    const played = playPast(p, p.length, (s) => (s.birds.blue.grounded && s.birds.blue.x < 5 ? { pink: 0, blue: 0.9 } : SILENT), 3, ready);
    expect(played.world.birds.blue.y).toBeLessThan(0);
    expect(played.fallen).toBe(false);
  });
});

describe("Medium: crumbling platforms", () => {
  const p = piece("crumbling platforms");

  it("are crossed by hopping from one to the next without lingering", () => {
    const played = playPast(p, p.length, hopping([{ edge: 4, jump: 0.75 }, { edge: 6.8, jump: 0.75 }, { edge: 9.6, jump: 0.75 }]));
    expect(played).toMatchObject({ fallen: false, dropped: false });
  });

  it("drop Birds that linger on one", () => {
    const linger: Player = (w) => (w.birds.pink.x > 5.2 && w.birds.blue.x > 5.2 ? SILENT : hopping([{ edge: 4, jump: 0.75 }])(w));
    expect(playPast(p, p.length, linger, 10).fallen).toBe(true);
  });
});

describe("Medium: the ceiling gap", () => {
  const p = piece("ceiling gap");

  it("is crossed by a soft hop", () => {
    expect(playPast(p, p.length, hopping([{ edge: 5, jump: 0.68 }]))).toMatchObject({ fallen: false, dropped: false });
  });

  it("drops a Bird that jumps it too loud: it bonks and falls into the gap", () => {
    expect(playPast(p, p.length, hopping([{ edge: 5, jump: 1 }]), 6).dropped).toBe(true);
  });
});

describe("Medium: the moving platform", () => {
  const p = piece("moving platform");
  const move = p.ground[1]!.move!;
  const offset = (w: WorldState) => motionOffset(move, w.time);

  it("is crossed by hopping on when it is near, riding it, and hopping off when it is across", () => {
    const players = hopping([
      { edge: 5, jump: 0.7, when: (w) => offset(w) < 0.15 },
      { edge: (w) => 7.6 + offset(w), jump: 0.8, when: (w) => offset(w) > move.dx - 0.15 },
    ]);
    expect(playPast(p, p.length, players)).toMatchObject({ fallen: false, dropped: false });
  });
});

describe("Hard: the rope swing", () => {
  const p = piece("rope swing");
  const lip = 11;

  it("is too wide to jump: a loud jump off the lip bonks on the roof and drops", () => {
    const players = hopping([
      { edge: 3, jump: 0.8 },
      { edge: 5, jump: 0.8 },
      { edge: 7, jump: 0.8 },
      { edge: lip, jump: 1 },
    ]);
    const played = playPast(p, p.length, players, 15);
    expect(played.fallen).toBe(true);
  });

  it("is crossed by the anchor-and-swing: one anchors, the other swings across, then hauls the first over", () => {
    const climb = hopping([
      { edge: 3, jump: 0.8 },
      { edge: 5, jump: 0.8 },
      { edge: 7, jump: 0.8 },
      { edge: lip + 5, jump: 0 },
    ]);
    let phase: "climb" | "drop" | "swing" | "follow" = "climb";
    let still = 0;
    const players: Player = (w) => {
      const { pink, blue } = w.birds;
      if (phase === "climb") {
        // Up the steps and along the ledge, both stopping just short of the lip.
        const t = climb(w);
        for (const bird of BIRDS) if (w.birds[bird].x >= lip - 0.3 && w.birds[bird].y === 2.4) t[bird] = 0;
        if (pink.x >= lip - 0.3 && blue.x >= lip - 0.3 && pink.grounded && blue.grounded) phase = "drop";
        return t;
      }
      if (phase === "drop") {
        // Pink anchors, silent; Blue walks off the lip and hangs until it is still.
        if (blue.grounded && blue.y > 2) return { pink: 0, blue: 0.3 };
        still = Math.abs(blue.vx) + Math.abs(blue.vy) < 0.01 ? still + 1 : 0;
        if (still > 5) phase = "swing";
        return SILENT;
      }
      if (phase === "swing") {
        // Blue swings with a jump-level voice until it catches the far ledge.
        if (blue.grounded && blue.y === 0) phase = "follow";
        return { pink: 0, blue: 0.7 };
      }
      // Pink walks off; Blue hauls by walking on while Pink climbs.
      return { pink: 0.4, blue: pink.grounded && pink.y === 0 ? WALK : 0.4 };
    };
    const played = playPast(p, p.length, players);
    expect(played.fallen).toBe(false);
    expect(played.seconds).toBeLessThan(40);
  });
});

describe("Hard: gusts", () => {
  const p = piece("gusts");

  it("are crossed by jumping in the calm between bursts", () => {
    const players = hopping([{ edge: 5, jump: 0.9, when: calmFor(p, 1) }]);
    expect(playPast(p, p.length, players)).toMatchObject({ fallen: false, dropped: false });
  });

  it("blow a jump made into them short, into the gap", () => {
    // Both at the edge as a burst starts (the Run clock is at 0), jumping straight into it.
    const w = atStart();
    const atEdge: WorldState = { ...w, birds: { pink: { ...w.birds.pink, x: 4.7 }, blue: { ...w.birds.blue, x: 4.8 } } };
    expect(isBlowing(p.gusts![0]!, atEdge.time)).toBe(true);
    const jumpOnce: Player = (s) => (s.time < 0.05 ? { pink: 0.9, blue: 0.9 } : SILENT);
    expect(playPast(p, p.length, jumpOnce, 3, atEdge).dropped).toBe(true);
  });
});

describe("Hard: narrow pillars", () => {
  const p = piece("narrow pillars");

  it("are crossed in step, a pillar apart, with jumps neither too soft nor too loud", () => {
    const players = hopping([
      { edge: 5, jump: 0.8, inStep: true },
      { edge: 7.2, jump: 0.8, inStep: true },
      { edge: 9.4, jump: 0.8, inStep: true },
      { edge: 11.6, jump: 0.8, inStep: true },
    ]);
    expect(playPast(p, p.length, players)).toMatchObject({ fallen: false, dropped: false });
  });

  it("drop a Bird whose jump is too loud: it overshoots the pillar", () => {
    const players = hopping([{ edge: 5, jump: 1, inStep: true }]);
    expect(playPast(p, p.length, players, 6).dropped).toBe(true);
  });
});

describe("Hard: the ceiling run", () => {
  const p = piece("ceiling run");
  const edges = [4, 6.4, 8.8, 11.2];

  it("is crossed by soft, precise hops", () => {
    expect(playPast(p, p.length, hopping(edges.map((edge) => ({ edge, jump: 0.65 }))))).toMatchObject({ fallen: false, dropped: false });
  });

  it("drops a Bird that jumps too loud under the ceiling", () => {
    expect(playPast(p, p.length, hopping(edges.map((edge) => ({ edge, jump: 1 }))), 8).dropped).toBe(true);
  });
});
