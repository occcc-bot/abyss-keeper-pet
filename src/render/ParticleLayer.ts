import { Container, Graphics, Text, TextStyle } from 'pixi.js';

interface PixelParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  size: number;
  color: number;
  life: number;
  maxLife: number;
  shape: 'square' | 'heart' | 'star';
}

interface SlashVfx {
  x: number;
  y: number;
  dir: 1 | -1;
  color: number;
  life: number;
  maxLife: number;
}

interface ProjectileVfx {
  fromX: number;
  toX: number;
  y: number;
  color: number;
  life: number;
  maxLife: number;
}

interface SpellBoltVfx {
  x: number;
  y: number;
  subId: string;
  color: number;
  life: number;
  maxLife: number;
}

interface ElectricArcVfx {
  x: number;
  y: number;
  life: number;
  maxLife: number;
}

interface SpotlightBeamVfx {
  x: number;
  y: number;
  life: number;
  maxLife: number;
}

interface DamageBucket {
  x: number;
  y: number;
  sum: number;
  color: number;
  timer: number;
}

interface FloatingTextVfx {
  node: Text;
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  isCrit: boolean;
}

/**
 * V2.1 Combat, Eating, 5-Implement Torture, & Relic Celebration VFX Engine (world-space container!).
 * Includes 0.25s floating damage aggregation + upper-track crit gold numbers!
 */
export class ParticleLayer {
  public readonly container = new Container();
  private readonly gfx = new Graphics();
  private readonly textContainer = new Container();

  private particles: PixelParticle[] = [];
  private slashes: SlashVfx[] = [];
  private projectiles: ProjectileVfx[] = [];
  private spellBolts: SpellBoltVfx[] = [];
  private electricArcs: ElectricArcVfx[] = [];
  private spotlights: SpotlightBeamVfx[] = [];
  private floatingTexts: FloatingTextVfx[] = [];
  private damageBuckets = new Map<number, DamageBucket>();

  constructor() {
    this.container.addChild(this.gfx, this.textContainer);
    this.container.eventMode = 'none';
  }

  burst(
    x: number,
    y: number,
    count: number,
    options: {
      colors: number[];
      speedMin?: number;
      speedMax?: number;
      upBias?: number;
      gravity?: number;
      size?: number;
      life?: number;
      shape?: 'square' | 'heart' | 'star';
    },
  ): void {
    const sMin = options.speedMin ?? 40;
    const sMax = options.speedMax ?? 130;
    const upBias = options.upBias ?? 70;
    const gravity = options.gravity ?? 260;
    const size = options.size ?? 4;
    const life = options.life ?? 0.65;
    const shape = options.shape ?? 'square';

    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / Math.max(1, count) + (Math.random() - 0.5) * 0.6;
      const spd = sMin + Math.random() * (sMax - sMin);
      const color = options.colors[i % options.colors.length] ?? 0xf2c655;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - upBias,
        gravity,
        size,
        color,
        life: life * (0.75 + Math.random() * 0.45),
        maxLife: life,
        shape,
      });
    }
    if (this.particles.length > 320) {
      this.particles.splice(0, this.particles.length - 320);
    }
  }

  emitSlashArc(x: number, y: number, dir: 1 | -1, color = 0xfff0b3): void {
    this.slashes.push({ x, y, dir, color, life: 0.24, maxLife: 0.24 });
    this.burst(x + dir * 24, y, 5, {
      colors: [color, 0xffffff],
      speedMin: 55,
      speedMax: 120,
      upBias: 30,
      gravity: 160,
      size: 3,
      life: 0.32,
      shape: 'star',
    });
    if (this.slashes.length > 24) this.slashes.shift();
  }

  emitProjectile(fromX: number, toX: number, y: number, color = 0xb982ff): void {
    this.projectiles.push({ fromX, toX, y, color, life: 0.22, maxLife: 0.22 });
    if (this.projectiles.length > 28) this.projectiles.shift();
  }

  emitFloatingNumber(x: number, y: number, label: string, color = 0xfff0b3, isCrit = false): void {
    const node = new Text({
      text: isCrit ? `${label}!` : label,
      style: new TextStyle({
        fontFamily: 'Microsoft YaHei, WenQuanYi Micro Hei, Segoe UI, sans-serif',
        fontSize: isCrit ? 17 : 13,
        fontWeight: 'bold',
        fill: color,
        stroke: { color: 0x12061c, width: isCrit ? 4 : 3 },
      }),
    });
    node.anchor.set(0.5, 0.5);
    node.x = Math.round(x + (Math.random() - 0.5) * 22);
    node.y = Math.round(y);
    this.textContainer.addChild(node);

    this.floatingTexts.push({
      node,
      x: node.x,
      y: node.y,
      vy: isCrit ? -68 : -46,
      life: isCrit ? 1.05 : 0.78,
      maxLife: isCrit ? 1.05 : 0.78,
      isCrit,
    });
    if (this.floatingTexts.length > 36) {
      const old = this.floatingTexts.shift()!;
      this.textContainer.removeChild(old.node);
      old.node.destroy();
    }
  }

  /**
   * 0.25s floating damage aggregator: non-crit hits within the same 64px bucket merge cleanly;
   * crits bypass aggregation and pop on the upper gold track!
   */
  emitAggregatedDamage(x: number, y: number, amount: number, color = 0xfff0b3, isCrit = false): void {
    if (isCrit) {
      this.emitFloatingNumber(x, y - 22, `-${amount}`, 0xf2c655, true);
      return;
    }
    const bucketKey = Math.floor(x / 64);
    const existing = this.damageBuckets.get(bucketKey);
    if (existing) {
      existing.sum += amount;
      existing.x = (existing.x + x) * 0.5;
      existing.color = color;
    } else {
      this.damageBuckets.set(bucketKey, { x, y, sum: amount, color, timer: 0.25 });
    }
  }

  emitElectricArc(x: number, y: number): void {
    this.electricArcs.push({ x, y, life: 0.26, maxLife: 0.26 });
    this.burst(x, y - 24, 6, {
      colors: [0x6ce5ff, 0xffffff, 0xb982ff],
      speedMin: 40,
      speedMax: 110,
      upBias: 50,
      gravity: 120,
      size: 3,
      life: 0.35,
      shape: 'star',
    });
    if (this.electricArcs.length > 12) this.electricArcs.shift();
  }

  emitTickleFeathers(x: number, y: number): void {
    this.burst(x, y - 34, 10, {
      colors: [0xffa3d6, 0xfff0f8, 0xffd27d],
      speedMin: 24,
      speedMax: 80,
      upBias: 70,
      gravity: 48,
      size: 4,
      life: 1.05,
      shape: 'heart',
    });
  }

  emitMusicNotes(x: number, y: number): void {
    this.burst(x, y - 40, 9, {
      colors: [0xb982ff, 0xf2c655, 0xd99cff],
      speedMin: 28,
      speedMax: 78,
      upBias: 95,
      gravity: 25,
      size: 4,
      life: 0.95,
      shape: 'star',
    });
    this.emitFloatingNumber(x + (Math.random() - 0.5) * 28, y - 72, '♪ ♫', 0xd99cff, false);
  }

  emitDessertSparkles(x: number, y: number): void {
    this.burst(x, y - 32, 12, {
      colors: [0xffb347, 0xfff0b3, 0xff8ec8],
      speedMin: 25,
      speedMax: 85,
      upBias: 85,
      gravity: 55,
      size: 4,
      life: 0.9,
      shape: 'star',
    });
  }

  emitSpotlightBeam(x: number, y: number): void {
    this.spotlights.push({ x, y, life: 0.75, maxLife: 0.75 });
    this.burst(x, y - 54, 8, {
      colors: [0xffe985, 0xffffff, 0xf2c655],
      speedMin: 20,
      speedMax: 65,
      upBias: 60,
      gravity: 30,
      size: 3,
      life: 0.65,
      shape: 'star',
    });
    if (this.spotlights.length > 6) this.spotlights.shift();
  }

  emitSpellEffect(x: number, y: number, subId: string, color = 0xb982ff): void {
    this.spellBolts.push({ x, y, subId, color, life: 0.55, maxLife: 0.55 });
    this.emitAbyssalRitual(x, y);
    if (this.spellBolts.length > 14) this.spellBolts.shift();
  }

  emitChickenFeast(x: number, y: number, healAmt: number): void {
    this.emitFeatherBurst(x, y - 16);
    this.burst(x, y - 34, 8, {
      colors: [0x42d69f, 0xff8ec8, 0xfff0b3],
      speedMin: 30,
      speedMax: 85,
      upBias: 95,
      gravity: 80,
      size: 4,
      life: 0.85,
      shape: 'heart',
    });
    this.emitFloatingNumber(x, y - 62, `+${healAmt} HP`, 0x5be08a, false);
  }

  emitSlapBurst(x: number, y: number, isMasochist: boolean): void {
    this.burst(x, y, 14, {
      colors: isMasochist ? [0xf05674, 0xffa3b5, 0xf2c655] : [0xfff0b3, 0xf2c655, 0xf05674],
      speedMin: 60,
      speedMax: 170,
      upBias: 95,
      gravity: 220,
      size: 4,
      life: 0.62,
      shape: isMasochist ? 'heart' : 'star',
    });
  }

  emitGoldBurst(x: number, y: number): void {
    this.burst(x, y, 10, {
      colors: [0xf2c655, 0xcf932e, 0xfff0b3],
      speedMin: 45,
      speedMax: 120,
      upBias: 95,
      gravity: 310,
      size: 4,
      life: 0.7,
    });
  }

  emitRockDebris(x: number, y: number): void {
    this.burst(x, y, 14, {
      colors: [0x6e6278, 0x4a3f52, 0xf2c655, 0xa464cc],
      speedMin: 55,
      speedMax: 170,
      upBias: 110,
      gravity: 380,
      size: 5,
      life: 0.75,
    });
  }

  emitFeatherBurst(x: number, y: number): void {
    this.burst(x, y, 12, {
      colors: [0xfff0b3, 0xd6cede, 0xf05674],
      speedMin: 35,
      speedMax: 110,
      upBias: 85,
      gravity: 85,
      size: 4,
      life: 0.95,
    });
  }

  emitAbyssalRitual(x: number, y: number): void {
    this.burst(x, y, 22, {
      colors: [0xa464cc, 0x724096, 0xf2c655, 0xf05674],
      speedMin: 50,
      speedMax: 185,
      upBias: 130,
      gravity: 110,
      size: 5,
      life: 0.95,
      shape: 'star',
    });
  }

  emitRelicFountain(x: number, y: number): void {
    this.burst(x, y, 36, {
      colors: [0xf2c655, 0xfff0b3, 0xa464cc, 0xf05674],
      speedMin: 80,
      speedMax: 240,
      upBias: 190,
      gravity: 180,
      size: 6,
      life: 1.25,
      shape: 'star',
    });
  }

  update(dt: number): void {
    this.gfx.clear();

    // 0. Flush 0.25s aggregated damage buckets
    for (const [k, b] of this.damageBuckets.entries()) {
      b.timer -= dt;
      if (b.timer <= 0) {
        this.emitFloatingNumber(b.x, b.y, `-${Math.round(b.sum)}`, b.color, false);
        this.damageBuckets.delete(k);
      }
    }

    // 1. Standard particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      const px = Math.round(p.x);
      const py = Math.round(p.y);
      const s = p.size;

      if (p.shape === 'heart') {
        this.gfx.rect(px - s, py - s * 0.5, s, s).fill({ color: p.color, alpha });
        this.gfx.rect(px, py - s * 0.5, s, s).fill({ color: p.color, alpha });
        this.gfx.rect(px - s * 0.5, py + s * 0.3, s, s).fill({ color: p.color, alpha });
      } else if (p.shape === 'star') {
        this.gfx.rect(px - s, py, s * 2 + 2, 2).fill({ color: p.color, alpha });
        this.gfx.rect(px, py - s, 2, s * 2 + 2).fill({ color: p.color, alpha });
      } else {
        this.gfx.rect(px, py, s, s).fill({ color: p.color, alpha });
      }
    }

    // 2. Melee Crescent Slash Arcs!
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const sl = this.slashes[i]!;
      sl.life -= dt;
      if (sl.life <= 0) {
        this.slashes.splice(i, 1);
        continue;
      }
      const prog = 1 - sl.life / sl.maxLife;
      const alpha = Math.sin(Math.min(1, sl.life / sl.maxLife) * Math.PI * 0.7);
      const r = 24 + prog * 18;
      const startA = sl.dir > 0 ? -1.15 : Math.PI - 1.15;
      const endA = sl.dir > 0 ? 0.95 : Math.PI + 0.95;
      const cx1 = sl.x + sl.dir * 12;
      const cx2 = sl.x + sl.dir * 16;
      const r2 = r * 0.84;
      const startA2 = startA + 0.12;
      const endA2 = endA - 0.12;
      this.gfx
        .moveTo(cx1 + Math.cos(startA) * r, sl.y + Math.sin(startA) * r)
        .arc(cx1, sl.y, r, startA, endA)
        .stroke({ color: sl.color, width: 6 * (1 - prog * 0.5), alpha: Math.min(1, alpha + 0.25) });
      this.gfx
        .moveTo(cx2 + Math.cos(startA2) * r2, sl.y + Math.sin(startA2) * r2)
        .arc(cx2, sl.y, r2, startA2, endA2)
        .stroke({ color: 0xffffff, width: 2.5, alpha: Math.min(1, alpha + 0.3) });
    }

    // 3. Flying Ranged / Magic Projectiles with Luminous Trails!
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i]!;
      pr.life -= dt;
      if (pr.life <= 0) {
        this.projectiles.splice(i, 1);
        continue;
      }
      const t = 1 - pr.life / pr.maxLife;
      const cx = pr.fromX + (pr.toX - pr.fromX) * t;
      const tx = pr.fromX + (pr.toX - pr.fromX) * Math.max(0, t - 0.28);
      const arcY = pr.y - Math.sin(t * Math.PI) * 18;
      const tailY = pr.y - Math.sin(Math.max(0, t - 0.28) * Math.PI) * 18;
      this.gfx.moveTo(tx, tailY).lineTo(cx, arcY).stroke({ color: pr.color, width: 4, alpha: 0.75 });
      this.gfx.circle(cx, arcY, 5).fill({ color: pr.color, alpha: 0.95 });
      this.gfx.circle(cx, arcY, 2.5).fill({ color: 0xffffff, alpha: 1 });
    }

    // 4. Electric Chair Crackling Lightning Arcs!
    for (let i = this.electricArcs.length - 1; i >= 0; i--) {
      const el = this.electricArcs[i]!;
      el.life -= dt;
      if (el.life <= 0) {
        this.electricArcs.splice(i, 1);
        continue;
      }
      const alpha = el.life / el.maxLife;
      for (let b = 0; b < 3; b++) {
        let px = el.x + (Math.random() - 0.5) * 44;
        let py = el.y - 68;
        this.gfx.moveTo(px, py);
        for (let seg = 0; seg < 4; seg++) {
          px += (Math.random() - 0.5) * 26;
          py += 16;
          this.gfx.lineTo(px, py);
        }
        this.gfx.stroke({ color: b === 0 ? 0xffffff : 0x6ce5ff, width: b === 0 ? 2 : 3, alpha });
      }
    }

    // 4b. Truth Spotlight Conical Beams!
    for (let i = this.spotlights.length - 1; i >= 0; i--) {
      const sl = this.spotlights[i]!;
      sl.life -= dt;
      if (sl.life <= 0) {
        this.spotlights.splice(i, 1);
        continue;
      }
      const alpha = (sl.life / sl.maxLife) * 0.32;
      this.gfx
        .poly([sl.x - 14, sl.y - 146, sl.x + 14, sl.y - 146, sl.x + 56, sl.y, sl.x - 56, sl.y])
        .fill({ color: 0xffe985, alpha });
    }

    // 5. Overlord Spell VFX (Lightning Bolts / Blackhole Vortex / Mist)
    for (let i = this.spellBolts.length - 1; i >= 0; i--) {
      const sp = this.spellBolts[i]!;
      sp.life -= dt;
      if (sp.life <= 0) {
        this.spellBolts.splice(i, 1);
        continue;
      }
      const alpha = sp.life / sp.maxLife;
      if (sp.subId === 'abyss_lightning') {
        let lx = sp.x;
        let ly = sp.y - 160;
        this.gfx.moveTo(lx, ly);
        for (let seg = 0; seg < 6; seg++) {
          lx += (Math.random() - 0.5) * 28;
          ly += 27;
          this.gfx.lineTo(lx, ly);
        }
        this.gfx.stroke({ color: 0xd99cff, width: 6, alpha });
        this.gfx.stroke({ color: 0xffffff, width: 2, alpha });
      } else if (sp.subId === 'abyss_blackhole') {
        const r = 18 + (1 - alpha) * 42;
        this.gfx.circle(sp.x, sp.y - 36, r).stroke({ color: 0xa464cc, width: 4, alpha });
        this.gfx.circle(sp.x, sp.y - 36, r * 0.55).fill({ color: 0x160726, alpha: alpha * 0.85 });
      } else {
        const r = 24 + (1 - alpha) * 90;
        this.gfx.circle(sp.x, sp.y - 24, r).stroke({ color: sp.color, width: 3, alpha: alpha * 0.8 });
      }
    }

    // 6. Floating Damage / Heal / Gold Numbers
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i]!;
      ft.life -= dt;
      if (ft.life <= 0) {
        this.textContainer.removeChild(ft.node);
        ft.node.destroy();
        this.floatingTexts.splice(i, 1);
        continue;
      }
      ft.vy += 45 * dt;
      ft.y += ft.vy * dt;
      ft.node.y = Math.round(ft.y);
      ft.node.alpha = Math.min(1, (ft.life / ft.maxLife) * 1.6);
      if (ft.isCrit) {
        const pop = 1 + Math.max(0, (ft.life / ft.maxLife - 0.72) * 1.4);
        ft.node.scale.set(pop);
      }
    }
  }
}
