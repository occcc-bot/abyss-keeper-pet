import { Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import {
  ABYSSAL_UNIT_DEFS,
  HERO_DEFS,
  locHeroDef,
  locHeroName,
  t,
  type AbyssalUnit,
  type HeroUnit,
} from '../core';
import type { LoadedGameAssets } from './AssetLoader';

const SLOT_STAGGER_PX = [-36, -12, 12, 36] as const;

function renderStaggerOffset(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return SLOT_STAGGER_PX[Math.abs(h) % 4]!;
}

/**
 * V2.1 High-Detail Option B Gothic Chibi Unit Renderer:
 * - Renders 256x256 Plant Milk Walnut 2.5-head Gothic Chibis cleanly (smooth linear scale)
 * - Unmistakable team floor auras (Ally = Violet/Gold, Hero = Holy Blue + Role Tag Badge)
 * - Lively procedural walk bounce, combat lunge-slash, hurt flash, chicken-feast chomp,
 *   pendulum dangle physics, Imp overhead gold nugget, and Thief stolen-gold sack!
 */
export class UnitSprite {
  public readonly container = new Container();
  private readonly shadowGfx = new Graphics();
  private readonly auraGfx = new Graphics();
  private readonly sprite: Sprite;
  private readonly carryGfx = new Graphics();
  private readonly hpBarGfx = new Graphics();
  private readonly badgeText: Text;

  private readonly usesChibi: boolean;

  private animPhase = 0;
  private lastX = 0;

  // Pendulum physics state when lifted in Hand of Evil!
  private swingAngle = 0;
  private swingVel = 0;
  private lastGrabX = 0;

  constructor(assets: LoadedGameAssets, speciesKey: string, isHero: boolean) {

    const chibiKey = isHero
      ? HERO_DEFS[speciesKey as keyof typeof HERO_DEFS]?.chibiKey ?? speciesKey
      : ABYSSAL_UNIT_DEFS[speciesKey as keyof typeof ABYSSAL_UNIT_DEFS]?.chibiKey ?? speciesKey;

    const chibiTex: Texture | undefined = assets.chibis[chibiKey];
    this.usesChibi = Boolean(chibiTex);
    const fallbackTex =
      assets.unitsSheet.textures[`${speciesKey}_idle_0`] ??
      assets.unitsSheet.textures['slime_girl_idle_0']!;

    this.sprite = new Sprite(chibiTex ?? fallbackTex);
    // Foot-grounded anchor (256x256 chibi rests feet at y=244 -> 244/256 ≈ 0.953)
    this.sprite.anchor.set(0.5, this.usesChibi ? 0.953 : 0.96);

    this.badgeText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'Microsoft YaHei, WenQuanYi Micro Hei, Segoe UI, sans-serif',
        fontSize: 11,
        fontWeight: 'bold',
        fill: 0xfff0b3,
        stroke: { color: 0x140a1c, width: 3 },
      }),
    });
    this.badgeText.anchor.set(0.5, 1);

    this.container.addChild(
      this.shadowGfx,
      this.auraGfx,
      this.sprite,
      this.carryGfx,
      this.hpBarGfx,
      this.badgeText,
    );
  }

  private getChibiBaseScale(targetPxHeight: number): number {
    if (!this.usesChibi) return targetPxHeight / 48;
    return targetPxHeight / 228;
  }

  public syncAbyssal(
    unit: AbyssalUnit,
    floorY: number,
    dt: number,
    isHeld: boolean,
    pointerWorldX: number,
    pointerScreenY: number,
  ): void {
    const targetH = unit.species === 'imp' ? 84 : unit.tier === 3 ? 114 : unit.tier === 2 ? 108 : 100;
    const baseScale = this.getChibiBaseScale(targetH);
    const facing = unit.facing ?? (unit.x >= this.lastX ? 1 : -1);
    this.lastX = unit.x;

    this.animPhase += dt * (unit.slapBuffTimer > 0 ? 13 : 8);
    this.shadowGfx.clear();
    this.auraGfx.clear();
    this.carryGfx.clear();

    // ===== DANGLING IN HAND OF EVIL (Pendulum Physics!) =====
    if (isHeld) {
      const targetX = pointerWorldX;
      const targetY = pointerScreenY + 34;
      const vx = (targetX - this.lastGrabX) / Math.max(0.008, dt);
      this.lastGrabX = targetX;

      const accel = -34 * this.swingAngle - 5.2 * this.swingVel + Math.max(-18, Math.min(18, -vx * 0.025));
      this.swingVel += accel * dt;
      this.swingAngle = Math.max(-0.85, Math.min(0.85, this.swingAngle + this.swingVel * dt));

      this.container.x = Math.round(targetX);
      this.container.y = Math.round(targetY);

      this.sprite.anchor.set(0.5, 0.22);
      const kickWobble = Math.sin(this.animPhase * 2.8) * 0.09;
      this.sprite.rotation = this.swingAngle + kickWobble;
      this.sprite.scale.set(facing * baseScale, baseScale);
      this.sprite.tint = 0xffffff;
      this.hpBarGfx.clear();
      this.badgeText.visible = false;
      return;
    }

    // Grounded normal anchor
    this.sprite.anchor.set(0.5, this.usesChibi ? 0.953 : 0.96);
    this.swingAngle *= 0.7;
    this.swingVel *= 0.7;

    // Ground shadow + Unmistakable ALLY Dark-Violet/Gold Floor Aura Ring!
    this.shadowGfx.ellipse(0, 0, 26, 7).fill({ color: 0x0a0410, alpha: 0.65 });
    this.auraGfx.ellipse(0, -1, 30, 8).stroke({
      color: unit.tier === 3 ? 0xf05674 : unit.tier === 2 ? 0xf2c655 : 0xa464cc,
      width: 2,
      alpha: 0.75,
    });

    // Procedural lively animation offsets!
    let offsetX = 0;
    let offsetY = 0;
    let rot = 0;
    let scaleX = baseScale;
    let scaleY = baseScale;

    if (unit.slapReactTimer > 0) {
      this.sprite.tint = 0xff7090;
      rot = -facing * 0.24;
      scaleX = baseScale * 1.14;
      scaleY = baseScale * 0.86;
    } else if (unit.attackAnimTimer > 0) {
      // Snappy forward combat lunge!
      const p = Math.sin((unit.attackAnimTimer / 0.28) * Math.PI);
      offsetX = facing * p * 18;
      offsetY = -p * 8;
      rot = facing * p * 0.22;
      scaleX = baseScale * (1 + p * 0.1);
      scaleY = baseScale * (1 - p * 0.05);
      this.sprite.tint = 0xffffff;
    } else if (unit.eatAnimTimer > 0) {
      // Joyful chicken-feast pounce & chomp bounce!
      const chomp = Math.abs(Math.sin(this.animPhase * 2.4));
      offsetY = -chomp * 12;
      scaleX = baseScale * (1 + chomp * 0.12);
      scaleY = baseScale * (1 - chomp * 0.1);
      this.sprite.tint = 0xdfffe8;
    } else if (unit.activity === 'moving' || unit.activity === 'working') {
      const hop = Math.abs(Math.sin(this.animPhase));
      offsetY = -hop * (unit.activity === 'moving' ? 8 : 3);
      rot = Math.sin(this.animPhase) * (unit.activity === 'moving' ? 0.07 : 0.04);
      this.sprite.tint = 0xffffff;
    } else {
      // Gentle breathing idle
      const breath = Math.sin(this.animPhase * 0.45);
      scaleY = baseScale * (1 + breath * 0.025);
      scaleX = baseScale * (1 - breath * 0.015);
      this.sprite.tint = 0xffffff;
    }

    const staggerX = unit.activity === 'moving' ? 0 : renderStaggerOffset(unit.id);
    this.container.x = Math.round(unit.x + staggerX + offsetX);
    this.container.y = Math.round(floorY + offsetY);
    this.sprite.rotation = rot;
    this.sprite.scale.set(facing * scaleX, scaleY);

    // Slap / Frenzy glowing golden-crimson aura
    if (unit.slapBuffTimer > 0 || unit.frenzyBuffTimer > 0) {
      const pulse = 0.55 + 0.35 * Math.sin(this.animPhase * 1.4);
      this.auraGfx
        .ellipse(0, -2, 34, 10)
        .stroke({ color: unit.slapBuffTimer > 0 ? 0xf05674 : 0xf2c655, width: 2.5, alpha: pulse });
    }

    // Visible golden ore nugget carried overhead when Imp is hauling gold back to Backyard Treasury!
    if (unit.species === 'imp' && unit.carryingGold > 0) {
      const gy = -targetH - 4 + Math.sin(this.animPhase * 1.5) * 2;
      this.carryGfx.circle(0, gy, 10).fill({ color: 0xf2c655 }).stroke({ color: 0x5c3608, width: 2 });
      this.carryGfx.circle(-3, gy - 3, 3).fill({ color: 0xfff8d6 });
    }

    // Ally HP Bar (emerald / gold)
    this.hpBarGfx.clear();
    const hpRatio = Math.max(0, Math.min(1, unit.hp / Math.max(1, unit.maxHp)));
    const bw = 46;
    const bx = -bw / 2;
    const by = -targetH - 10;
    if (hpRatio < 0.99 || unit.activity === 'fighting' || unit.slapBuffTimer > 0) {
      this.hpBarGfx.rect(bx - 1, by - 1, bw + 2, 6).fill({ color: 0x140a1c, alpha: 0.9 });
      this.hpBarGfx.rect(bx, by, bw, 4).fill({ color: 0x331c47 });
      this.hpBarGfx
        .rect(bx, by, Math.round(bw * hpRatio), 4)
        .fill({ color: hpRatio > 0.35 ? 0x42d69f : 0xf05674 });
    }

    if (unit.slapBuffTimer > 0) {
      this.badgeText.text = t(`狂暴 ${Math.ceil(unit.slapBuffTimer)}s`, `Frenzy ${Math.ceil(unit.slapBuffTimer)}s`);
      this.badgeText.style.fill = 0xf05674;
      this.badgeText.y = by - 2;
      this.badgeText.visible = true;
    } else if (unit.species === 'imp' && unit.carryingGold > 0) {
      this.badgeText.text = `+${Math.round(unit.carryingGold)}G`;
      this.badgeText.style.fill = 0xf2c655;
      this.badgeText.y = by - 14;
      this.badgeText.visible = true;
    } else if (unit.eatAnimTimer > 0) {
      this.badgeText.text = t('真香♥', 'Yum♥');
      this.badgeText.style.fill = 0x5be08a;
      this.badgeText.y = by - 2;
      this.badgeText.visible = true;
    } else if (unit.level > 1) {
      this.badgeText.text = `Lv.${unit.level}`;
      this.badgeText.style.fill = 0xfff0b3;
      this.badgeText.y = by - 2;
      this.badgeText.visible = unit.activity === 'fighting';
    } else {
      this.badgeText.visible = false;
    }
  }

  public syncHero(
    hero: HeroUnit,
    floorY: number,
    dt: number,
    isHeld = false,
    pointerWorldX = 0,
    pointerScreenY = 0,
  ): void {
    const targetH = hero.isBoss ? 122 : 102;
    const baseScale = this.getChibiBaseScale(targetH);
    // Heroes march left (-1) normally, or sprint right (+1) when fleeing with stolen gold!
    const facing: 1 | -1 = hero.fleeingWithLoot ? 1 : -1;

    this.animPhase += dt * (hero.fleeingWithLoot ? 14 : 9);
    this.shadowGfx.clear();
    this.auraGfx.clear();
    this.carryGfx.clear();

    // Grabbed Thief OR Downed Captive dangling in Hand of Evil!
    if (isHeld) {
      this.container.x = Math.round(pointerWorldX);
      this.container.y = Math.round(pointerScreenY + 34);
      this.sprite.anchor.set(0.5, 0.22);
      this.sprite.rotation = Math.sin(this.animPhase * 3.5) * 0.28;
      this.sprite.scale.set(facing * baseScale, baseScale);
      this.sprite.alpha = 1;
      this.sprite.tint = hero.downedForCapture ? 0xe4c7ff : 0xffb3c8;
      this.hpBarGfx.clear();
      this.badgeText.text = hero.downedForCapture
        ? t('呀啊！拖去刑讯室！', 'Eek! To the Torture Room!')
        : t('放开我！钱还你！', 'Let go! Take the gold back!');
      this.badgeText.style.fill = hero.downedForCapture ? 0xffa3d6 : 0xf2c655;
      this.badgeText.y = -24;
      this.badgeText.visible = true;
      return;
    }

    this.sprite.anchor.set(0.5, this.usesChibi ? 0.953 : 0.96);

    // Downed elite hero awaiting Imp haul to Corruption Chamber
    if (hero.downedForCapture) {
      this.container.x = Math.round(hero.x);
      this.container.y = Math.round(floorY - 6);
      this.shadowGfx.ellipse(0, 6, 30, 7).fill({ color: 0x0a0410, alpha: 0.55 });
      this.sprite.rotation = -Math.PI * 0.42;
      this.sprite.scale.set(baseScale, baseScale);
      this.sprite.tint = 0xd6b5ff;
      this.sprite.alpha = 1;
      this.badgeText.text = t('可俘虏 ★', 'Capturable ★');
      this.badgeText.style.fill = 0xffa3d6;
      this.badgeText.y = -48;
      this.badgeText.visible = true;
      this.hpBarGfx.clear();
      return;
    }

    // Stealth cloak translucency for sneaky Backyard Thieves!
    this.sprite.alpha = hero.stealthTimer > 0 ? 0.45 : 1.0;

    // Ground shadow + Unmistakable ENEMY Holy Ice-Blue / Crimson Floor Aura!
    this.shadowGfx.ellipse(0, 0, hero.isBoss ? 34 : 26, 7).fill({ color: 0x0a0410, alpha: 0.65 });
    this.auraGfx.ellipse(0, -1, hero.isBoss ? 38 : 30, 8).stroke({
      color: hero.fleeingWithLoot ? 0xf2c655 : hero.isBoss ? 0xf2c655 : 0x59b8ff,
      width: hero.isBoss ? 3 : 2,
      alpha: 0.85,
    });

    let offsetX = 0;
    let offsetY = 0;
    let rot = 0;
    if (hero.freezeTimer > 0) {
      this.sprite.tint = 0x8ad8ff;
      this.auraGfx.rect(-28, -targetH + 6, 56, targetH - 6).fill({ color: 0x59a3e8, alpha: 0.25 });
      this.auraGfx.rect(-28, -targetH + 6, 56, targetH - 6).stroke({ color: 0xaee1ff, width: 2, alpha: 0.8 });
    } else if (hero.hurtAnimTimer > 0) {
      this.sprite.tint = 0xff7088;
      offsetX = -facing * 8;
      rot = -facing * 0.16;
    } else if (hero.attackAnimTimer > 0) {
      const p = Math.sin((hero.attackAnimTimer / 0.25) * Math.PI);
      offsetX = facing * p * 16;
      rot = facing * p * 0.2;
      this.sprite.tint = 0xffffff;
    } else {
      const hop = Math.abs(Math.sin(this.animPhase));
      offsetY = -hop * 7;
      rot = Math.sin(this.animPhase) * 0.06;
      this.sprite.tint =
        hero.charmTimer > 0 ? 0xffa3d6 : hero.poisonTimer > 0 ? 0x82e8ba : 0xffffff;
    }

    const heroStaggerX = hero.isBoss ? 0 : Math.round(renderStaggerOffset(hero.id) * 0.65);
    this.container.x = Math.round(hero.x + heroStaggerX + offsetX);
    this.container.y = Math.round(floorY + offsetY);
    this.sprite.rotation = rot;
    this.sprite.scale.set(facing * baseScale, baseScale);

    // Stolen gold sack bouncing on fleeing thief's back!
    if (hero.fleeingWithLoot && hero.stolenGold > 0) {
      const sy = -targetH * 0.55;
      this.carryGfx
        .circle(-18, sy, 13)
        .fill({ color: 0xf2c655 })
        .stroke({ color: 0x7a480a, width: 2.5 });
      this.carryGfx.circle(-21, sy - 4, 3.5).fill({ color: 0xfff7cc });
    }

    // Enemy HP bar (bright crimson) + Role Tag Badge
    this.hpBarGfx.clear();
    const hpRatio = Math.max(0, Math.min(1, hero.hp / Math.max(1, hero.maxHp)));
    const bw = hero.isBoss ? 66 : 46;
    const bx = -bw / 2;
    const by = hero.isBoss ? -104 : -92;
    this.hpBarGfx.rect(bx - 1, by - 1, bw + 2, 7).fill({ color: 0x140a1c, alpha: 0.92 });
    this.hpBarGfx.rect(bx, by, bw, 5).fill({ color: 0x2a0b16 });
    this.hpBarGfx
      .rect(bx, by, Math.round(bw * hpRatio), 5)
      .fill({ color: hero.isBoss ? 0xf2c655 : 0xf05674 });

    const hLoc = locHeroDef(hero.species);
    if (hero.fleeingWithLoot) {
      this.badgeText.text = t(`偷金逃跑 +${hero.stolenGold}G!`, `LOOT +${hero.stolenGold}G!`);
      this.badgeText.style.fill = 0xf2c655;
      this.badgeText.y = by - 3;
      this.badgeText.visible = true;
    } else if (hero.isBoss) {
      this.badgeText.text = `BOSS ${locHeroName(hero)}`;
      this.badgeText.style.fill = 0xf2c655;
      this.badgeText.y = by - 3;
      this.badgeText.visible = true;
    } else if (hero.charmTimer > 0) {
      this.badgeText.text = t('魅惑内讧♥', 'Charmed♥');
      this.badgeText.style.fill = 0xffa3b5;
      this.badgeText.y = by - 3;
      this.badgeText.visible = true;
    } else if (hero.stealthTimer > 0) {
      this.badgeText.text = t(`[${hLoc.roleTag}] 潜行中…`, `[${hLoc.roleTag}] Stealth…`);
      this.badgeText.style.fill = 0xd6b5ff;
      this.badgeText.y = by - 3;
      this.badgeText.visible = true;
    } else {
      // V2.1 Battlefield De-clutter: regular minions show compact [Role] tag only; Bosses & specials show full labels
      this.badgeText.text = `[${hLoc.roleTag}]`;
      this.badgeText.style.fill = 0xaee1ff;
      this.badgeText.y = by - 3;
      this.badgeText.visible = true;
    }
  }
}
