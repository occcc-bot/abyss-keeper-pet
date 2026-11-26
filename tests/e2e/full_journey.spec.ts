import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SHOTS_DIR = path.resolve(process.cwd(), 'docs/screenshots');

test.describe('V2.0 Full Journey E2E & 6-Shot Real-Engine Visual Showcase', () => {
  test('verifies V2.1 scrollable 28-slot dungeon, resonances, expression crossfade, 4-state gallery, demon heart badge & p95 <= 12ms', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    fs.mkdirSync(SHOTS_DIR, { recursive: true });

    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      errors.push(`pageerror: ${err.message}`);
    });
    page.on('response', (res) => {
      if (res.status() >= 400 && !res.url().includes('favicon')) {
        errors.push(`HTTP ${res.status()}: ${res.url()}`);
      }
    });

    await page.goto('/?fresh=1&desktop_preview=1', {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    });
    await page.waitForFunction(() => Boolean(window.__KEEPER_PET__), null, { timeout: 25_000 });
    await page.waitForTimeout(1450);

    // =========================================================================
    // Shot 00: V2.3 Fresh Stage-0 Start (6 Core HUD Buttons + Sealed Fog Wall + Prologue Story #1!)
    // =========================================================================
    await expect(page.locator('#abyss-story-stage')).toBeVisible();
    const visibleHudBtns = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll<HTMLElement>('#abyss-hud-bar .gothic-btn'));
      return btns.filter((b) => window.getComputedStyle(b).display !== 'none').length;
    });
    expect(visibleHudBtns).toBe(6);
    const stage0TMax = await page.evaluate(() => {
      const kp = window.__KEEPER_PET__!;
      kp.stage.panToSlot(9); // Show #12 dark-gold vein + #13 Abyssal Seal fog wall clearly on right!
      kp.stage.update(1 / 60);
      return kp.engine.state.progression.territoryMax;
    });
    expect(stage0TMax).toBe(12);
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(SHOTS_DIR, '00_fresh_start_stage0.png') });

    // Skip Prologue Story #1 -> Tutorial Bar immediately resumes via mutual-exclusion relay!
    await page.click('[data-story-skip="1"]');
    await expect(page.locator('#abyss-story-stage')).toBeHidden();
    await expect(page.locator('#abyss-tutorial-bar')).toBeVisible();

    // =========================================================================
    // Shot 01: V2.1 Desktop Cutaway Overview (Switch showcase harness to sandbox progression!)
    // =========================================================================
    await page.evaluate(() => {
      const kp = window.__KEEPER_PET__!;
      kp.engine.state.progression.sandbox = true;
      kp.engine.state.progression.territoryMax = 27;
      kp.engine.state.gold = 2200;
      kp.engine.state.bullion = 1420;
      kp.engine.state.trapParts = 60;
      kp.engine.state.trapPartsCap = 60;
      kp.engine.buildRoom(2, 'corruption');
      kp.engine.buildRoom(3, 'altar');
      kp.engine.buildRoom(5, 'library');
      kp.engine.installTrap(8, 'frost_rune');
      kp.engine.installTrap(9, 'boulder_trap');
      kp.engine.stepSeconds(2);
      kp.stage.panToSlot(5);
      kp.ui.closeDrawer();
      kp.ui.syncHudNumbers();
    });
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(SHOTS_DIR, '01_desktop_cutaway_overview.png') });

    // =========================================================================
    // Shot 02: Right-Click Drag Scroll + Right-Click Slap + Left-Drag Hand of Evil + Plant Milk Portrait!
    // =========================================================================
    // Test genuine Right-Click Drag panning camera across the 28-slot dungeon!
    const camBefore = await page.evaluate(() => window.__KEEPER_PET__!.stage.cameraX);
    await page.mouse.move(1100, 960);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(740, 960, { steps: 10 });
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(120);
    const camAfter = await page.evaluate(() => window.__KEEPER_PET__!.stage.cameraX);
    expect(camAfter).toBeGreaterThan(camBefore + 100);

    // Pan back cleanly to Throne/Frontline for Shot 02 showcase
    const targets = await page.evaluate(() => {
      const kp = window.__KEEPER_PET__!;
      kp.stage.panToSlot(6);
      kp.engine.dismissTutorial();
      kp.engine.state.heroes = [];
      kp.ui.closeDrawer();
      kp.ui.syncHudNumbers();
      const m = kp.stage.getViewportMetrics();
      const slime = kp.engine.state.units.find((u) => u.species === 'slime_girl')!;
      const blade = kp.engine.state.units.find((u) => u.species === 'skeleton_blademaid')!;
      slime.x = 1260;
      slime.slotIndex = 7;
      slime.assignedSlot = 7;
      slime.activity = 'idle';
      blade.x = 1520;
      blade.slotIndex = 9;
      blade.assignedSlot = 9;
      blade.activity = 'idle';
      return {
        slimeId: slime.id,
        bladeId: blade.id,
        slimeX: kp.stage.worldToScreenX(slime.x),
        slimeY: m.floorY - 48,
        bladeX: kp.stage.worldToScreenX(blade.x),
        bladeY: m.floorY - 48,
        dropX: kp.stage.worldToScreenX(1200),
        dropY: m.floorY - 40,
      };
    });

    // Real right-click short tap -> Bullfrog Slap!
    await page.mouse.click(targets.slimeX, targets.slimeY, { button: 'right' });
    await page.waitForTimeout(120);
    expect(await page.evaluate(() => window.__KEEPER_PET__!.engine.state.metrics.totalSlaps)).toBeGreaterThanOrEqual(1);

    // Real left-click press & drag -> Hand of Evil Grab Claw + Pendulum Dangle!
    await page.mouse.move(targets.bladeX, targets.bladeY);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(1120, 740, { steps: 6 });
    await page.mouse.move(1240, 690, { steps: 10 });
    await page.waitForTimeout(80);
    expect(await page.evaluate(() => window.__KEEPER_PET__!.stage.isDragging())).toBe(true);

    // Open V2.1 Portrait Drawer (4 semantic gothic commands + no 28-slot table!) while Hand of Evil grips Blademaid!
    await page.evaluate((id) => window.__KEEPER_PET__!.ui.openPortrait(id), targets.slimeId);
    await page.waitForTimeout(300);
    await expect(page.locator('.portrait-drawer .portrait-img')).toBeVisible();
    await expect(page.locator('[data-sem-cmd]')).toHaveCount(4);
    await page.screenshot({ path: path.join(SHOTS_DIR, '02_hand_of_evil_grab_and_slap.png') });

    // Release real drag cleanly
    await page.mouse.move(targets.dropX, targets.dropY, { steps: 6 });
    await page.mouse.up({ button: 'left' });
    await page.evaluate(() => {
      window.__KEEPER_PET__!.ui.closeDrawer();
      window.__KEEPER_PET__!.stage.clearBubbles();
    });

    // =========================================================================
    // Shot 03: Vivid Combat VFX (Slash Arcs, Projectiles, Damage Numbers, Rolling Boulder & Thief Heist!)
    // =========================================================================
    await page.evaluate(() => {
      const kp = window.__KEEPER_PET__!;
      const s = kp.engine.state;
      kp.stage.clearBubbles();
      s.heroes = [];
      s.boulders = [];
      s.gold = 2200;
      s.trapParts = 50;
      s.trapPartsCap = 60;
      s.wave = 5;
      s.autoCastSpells = false;
      kp.engine.installTrap(8, 'boulder_trap');
      kp.engine.installTrap(9, 'frost_rune');
      kp.engine.installTrap(10, 'iron_spikes');
      kp.engine.installTrap(11, 'charm_censer');
      kp.engine.provokeNextWave();
      kp.engine.stepSeconds(2.5);
      kp.stage.panToSlot(9);
      const m = kp.stage.getViewportMetrics();
      if (s.boulders.length === 0) {
        s.boulders.push({
          id: 'boulder_v2_showcase',
          x: 1380,
          speed: 255,
          damage: 280,
          knockback: 145,
          hitHeroIds: [],
          sourceSlot: 8,
        });
      }
      // Emit crisp visible slash, projectile, crit numbers & restrained 1.6s Cut-in banner + Top Boss Bar!
      kp.stage.fxLayer.emitSlashArc(1520, m.floorY - 52, 1, 0xfff0b3);
      kp.stage.fxLayer.emitProjectile(1320, 1620, m.floorY - 60, 0xb982ff);
      kp.stage.fxLayer.emitFloatingNumber(1620, m.floorY - 88, '-342', 0xf2c655, true);
      kp.stage.spawnBubble(1420, m.floorY - 114, '牛蛙滚石 3 连碾！', 0xf05674);
      kp.ui.triggerCutin({ subId: 'boss:valkyrie_captain', label: 'W5 军团长【炽翼女武神队长】空降突袭！' }, true);
      kp.ui.syncHudNumbers();
    });
    await page.waitForTimeout(180);
    await expect(page.locator('#abyss-boss-bar')).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS_DIR, '03_hero_invasion_boulder_trap.png') });

    // =========================================================================
    // Shot 04: Torture Chamber — Zero Horizontal Wobble Check + Electric Chair Wu Jing Gag + 5 Implements!
    // =========================================================================
    // First test empty chamber stability (previously wobbled every 0.6s!)
    await page.evaluate(() => {
      const kp = window.__KEEPER_PET__!;
      kp.stage.clearBubbles();
      kp.engine.state.heroes = [];
      kp.engine.state.boulders = [];
      kp.engine.state.gold = 3500;
      kp.engine.state.mana = 200;
      kp.engine.buildRoom(2, 'corruption');
      kp.engine.buildRoom(3, 'altar');
      kp.stage.panToSlot(3);
      kp.ui.openDrawer({ kind: 'torture' });
    });
    await page.waitForTimeout(300);
    const box1 = await page.locator('.torture-drawer').boundingBox();
    await page.waitForTimeout(900); // Longer than old 0.6s wobble interval!
    const box2 = await page.locator('.torture-drawer').boundingBox();
    expect(box1).not.toBeNull();
    expect(box2).not.toBeNull();
    expect(Math.abs(box1!.x - box2!.x)).toBeLessThanOrEqual(1);

    // Place captured Holy Knight at 66% Opportune Window on Electric Chair + verify V2.5 Overcharge & expression crossfade!
    await page.evaluate(() => {
      const kp = window.__KEEPER_PET__!;
      const s = kp.engine.state;
      s.mana = 300;
      s.overchargeCd = 0;
      s.prisoners = [
        {
          id: 'prisoner_v2_knight',
          sourceHero: 'holy_knight',
          targetSpecies: 'fallen_paladin',
          heroName: '圣光女骑士',
          waveCaptured: 6,
          will: 210,
          maxWill: 630,
          progress: 0.67,
          hp: 62,
          cell: 'chamber',
          mercy: false,
          dessertHooked: false,
          flavorHits: 0,
          feedCd: 0,
          ward: 0.25,
          satiety: 15,
          drowsyTimer: 0,
          overchargeTimer: 0,
          overchargeCrit: false,
          vintageWaves: 2,
          escortedByHeroId: null,
        },
      ];
      kp.ui.openDrawer({ kind: 'torture' });
      const m = kp.stage.getViewportMetrics();
      kp.stage.fxLayer.emitElectricArc(2 * 160 + 80, m.floorY);
      kp.stage.spawnBubble(2 * 160 + 80, m.floorY - 114, '圣光女骑士：「哈啊…不行了…圣光好像断线了…」', 0x6ce5ff);
      kp.ui.syncHudNumbers();
    });
    await page.waitForTimeout(350);
    await expect(page.locator('[data-overcharge-torture="1"]')).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS_DIR, '04_torture_chamber_corruption.png') });

    // Trigger V2.5 engine-level Opportune Overcharge button & advance until Fallen Paladin joins roster
    await page.click('[data-overcharge-torture="1"]');
    await page.evaluate(() => {
      const kp = window.__KEEPER_PET__!;
      kp.engine.stepSeconds(180);
      kp.ui.syncHudNumbers();
    });
    expect(
      await page.evaluate(() => window.__KEEPER_PET__!.engine.state.units.some((u) => u.species === 'fallen_paladin')),
    ).toBe(true);

    // =========================================================================
    // Shot 05: V2.1 High-Res 4-State Codex Appreciation Gallery + Top-Right Safe Relic Banner!
    // =========================================================================
    await page.evaluate(() => {
      const kp = window.__KEEPER_PET__!;
      kp.stage.clearBubbles();
      kp.engine.state.gold = 5000;
      kp.engine.upgradeOverlord();
      if (!kp.engine.state.prestige.codexHeroes.includes('elf_sharpshooter')) {
        kp.engine.state.prestige.codexHeroes.push('elf_sharpshooter');
      }
      kp.ui.openGrimoire('codex');
      kp.ui.showRelicBanner('bullfrog_pocket_watch');
      kp.ui.syncHudNumbers();
    });
    await page.waitForTimeout(250);
    await expect(page.locator('.relic-celebration-banner')).toBeVisible();
    await page.click('[data-gallery-hero="elf_sharpshooter"]');
    await expect(page.locator('.gallery-drawer')).toBeVisible();
    await page.click('[data-gal-stage="2"]');
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(SHOTS_DIR, '05_fusion_altar_and_grimoire.png') });

    // Verify 10-node Abyssal Tech Tree, Build Tab #20-#27 & x5 batch upgrade render cleanly
    await page.click('[data-back-codex="1"]');
    await page.click('[data-gtab="prestige"]');
    await expect(page.locator('[data-buy-tech]')).toHaveCount(10);
    await page.click('[data-gtab="build"]');
    await expect(page.locator('[data-focus-slot="27"]')).toBeVisible();
    await expect(page.locator('[data-upgrade-slot-5]')).toBeVisible();

    // =========================================================================
    // Shot 06: V2.1 Demon Heart Badge + Hover Slack Report (pointer-events: none, background 20 TPS intact!)
    // =========================================================================
    await page.click('[data-act="minimize"]');
    await expect(page.locator('#abyss-crystal-orb')).toBeVisible();
    await expect(page.locator('#abyss-hud-bar')).toBeHidden();
    const tickBefore = await page.evaluate(() => window.__KEEPER_PET__!.engine.state.tick);
    await page.waitForTimeout(450);
    const tickAfter = await page.evaluate(() => window.__KEEPER_PET__!.engine.state.tick);
    expect(tickAfter).toBeGreaterThan(tickBefore);
    await page.hover('#abyss-crystal-orb');
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOTS_DIR, '06_mini_crystal_orb_mode.png') });

    // Restore cleanly & sample 300 frames of stage.update() to enforce p95 <= 12ms!
    await page.click('#abyss-crystal-orb');
    await expect(page.locator('#abyss-hud-bar')).toBeVisible();

    // =========================================================================
    // Shot 07: V2.2 Live English Language Switch + Flow-Music BGM Console & Audio Fetch Check!
    // =========================================================================
    const bgmCheck = await page.evaluate(async () => {
      const r1 = await fetch('/assets/bgm/abyss_lounge.mp3', { method: 'HEAD' });
      const r2 = await fetch('/assets/bgm/valkyrie_raid.mp3', { method: 'HEAD' });
      return { loungeOk: r1.ok, raidOk: r2.ok };
    });
    expect(bgmCheck.loungeOk).toBe(true);
    expect(bgmCheck.raidOk).toBe(true);

    await page.click('[data-act="settings"]');
    await expect(page.locator('#abyss-settings-popover')).toBeVisible();
    await page.click('#abyss-settings-popover [data-act="lang"]');
    await page.click('[data-act="throne"]');
    await expect(page.locator('.audio-lang-console')).toBeVisible();
    await expect(page.locator('.drawer-title')).toContainText('Overlord Grimoire');
    await page.click('[data-bgm-mode="battle"]');
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => window.__KEEPER_PET__!.sfx.activeBgmTrack)).toBe('valkyrie_raid');
    await page.screenshot({ path: path.join(SHOTS_DIR, '07_english_ui_and_bgm_controls.png') });
    await page.click('[data-bgm-mode="auto"]');
    await page.click('[data-set-lang="zh"]'); // Switch back cleanly to ZH
    await page.evaluate(() => {
      window.__KEEPER_PET__!.ui.closeDrawer();
      window.__KEEPER_PET__!.sfx.setBgmMuted(true);
      window.__KEEPER_PET__!.stage.update(1 / 60); // Warm up ZH label cache after language toggle
    });
    await page.waitForTimeout(100);

    // =========================================================================
    // Shot 08: V2.3 Safe-Lane Speech Bubbles + Zero-Intersection Assertion vs HUD / Boss Bar / Tutorial Bar!
    // =========================================================================
    await page.evaluate(() => {
      const kp = window.__KEEPER_PET__!;
      kp.ui.closeDrawer();
      kp.ui.clearStoryQueue();
      kp.stage.clearBubbles();
      kp.stage.panToSlot(6);
      // Re-enable tutorial bar & boss bar simultaneously to stress-test 2-tier avoidance!
      kp.engine.state.tutorialDismissed = false;
      kp.engine.state.tutorialStep = 0;
      kp.engine.state.wave = 5;
      kp.engine.state.heroes = [];
      kp.engine.provokeNextWave();
      kp.ui.clearStoryQueue();
      kp.ui.syncHudNumbers();

      const slime = kp.engine.state.units.find((u) => u.species === 'slime_girl');
      const imp = kp.engine.state.units.find((u) => u.species === 'imp');
      const boss = kp.engine.state.heroes.find((h) => h.isBoss);
      if (slime) {
        slime.x = 7 * 160 + 80;
        kp.stage.spawnBubble(slime.x, 0, '哼！再扇我我就干得更快给你看！', 0xf2c655, {
          speakerId: slime.id,
          speakerName: '翡翠粘液守卫',
          priority: 'interactive',
          faction: 'ally',
        });
      }
      if (imp) {
        imp.x = 4 * 160 + 80;
        kp.stage.spawnBubble(imp.x, 0, '报——！上面敲键盘震得金渣直往下掉！', 0xf2c655, {
          speakerId: imp.id,
          speakerName: '苦工小鬼',
          priority: 'interactive',
          faction: 'ally',
        });
      }
      if (boss) {
        boss.x = 9 * 160 + 80;
        kp.stage.spawnBubble(boss.x, 0, '奉圣堂之命，查封任务栏下方违建地下室！', 0xf05674, {
          speakerId: boss.id,
          speakerName: '炽翼女武神',
          priority: 'interactive',
          faction: 'enemy',
        });
      }
      kp.stage.update(1 / 60);
    });
    await page.waitForTimeout(220);

    const bubbleAudit = await page.evaluate(() => {
      const kp = window.__KEEPER_PET__!;
      const bubbles = kp.stage.getActiveBubbleScreenRects();
      const getVisibleRect = (id: string) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const st = window.getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) < 0.05) return null;
        const r = el.getBoundingClientRect();
        return r.width > 4 && r.height > 4
          ? { id, left: r.left, top: r.top, right: r.right, bottom: r.bottom }
          : null;
      };
      const obstacles = ['abyss-hud-bar', 'abyss-boss-bar', 'abyss-tutorial-bar', 'abyss-story-stage']
        .map(getVisibleRect)
        .filter((x): x is NonNullable<typeof x> => x !== null);
      const overlaps: string[] = [];
      for (const b of bubbles) {
        for (const o of obstacles) {
          const hitX = b.left < o.right && b.right > o.left;
          const hitY = b.top < o.bottom && b.bottom > o.top;
          if (hitX && hitY) {
            overlaps.push(`Bubble "${b.text}" [${b.left.toFixed(0)},${b.top.toFixed(0)},${b.right.toFixed(0)},${b.bottom.toFixed(0)}] overlapped ${o.id} [${o.left.toFixed(0)},${o.top.toFixed(0)},${o.right.toFixed(0)},${o.bottom.toFixed(0)}]`);
          }
        }
      }
      return {
        bubbleCount: bubbles.length,
        obstacleIds: obstacles.map((o) => o.id),
        overlaps,
      };
    });
    expect(bubbleAudit.bubbleCount).toBeGreaterThanOrEqual(2);
    expect(bubbleAudit.obstacleIds).toContain('abyss-hud-bar');
    expect(bubbleAudit.overlaps).toEqual([]);
    await page.screenshot({ path: path.join(SHOTS_DIR, '08_bubble_safe_lane.png') });

    // Dynamic speaker-follow avoidance test: move slime directly under #abyss-tutorial-bar, advance 30 frames, assert ZERO overlap!
    const movedBubbleAudit = await page.evaluate(() => {
      const kp = window.__KEEPER_PET__!;
      const slime = kp.engine.state.units.find((u) => u.species === 'slime_girl');
      if (slime) {
        slime.x = 2 * 160 + 80; // Directly underneath left-aligned #abyss-tutorial-bar
      }
      kp.stage.refreshBubbleObstacles();
      for (let f = 0; f < 30; f++) {
        kp.stage.update(1 / 60);
      }
      const bubbles = kp.stage.getActiveBubbleScreenRects();
      const getVisibleRect = (id: string) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const st = window.getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) < 0.05) return null;
        const r = el.getBoundingClientRect();
        return r.width > 4 && r.height > 4
          ? { id, left: r.left, top: r.top, right: r.right, bottom: r.bottom }
          : null;
      };
      const obstacles = ['abyss-hud-bar', 'abyss-boss-bar', 'abyss-tutorial-bar', 'abyss-story-stage']
        .map(getVisibleRect)
        .filter((x): x is NonNullable<typeof x> => x !== null);
      const overlaps: string[] = [];
      for (const b of bubbles) {
        for (const o of obstacles) {
          if (b.left < o.right && b.right > o.left && b.top < o.bottom && b.bottom > o.top) {
            overlaps.push(`Moved bubble "${b.text}" overlapped ${o.id}`);
          }
        }
      }
      return { bubbleCount: bubbles.length, overlaps };
    });
    expect(movedBubbleAudit.bubbleCount).toBeGreaterThanOrEqual(2);
    expect(movedBubbleAudit.overlaps).toEqual([]);

    // V2.4 Gate A: 3 bubbles x 30 frames pairwise zero overlap
    const pairwiseAudit = await page.evaluate(() => {
      const kp = window.__KEEPER_PET__!;
      kp.stage.clearBubbles();
      kp.stage.spawnBubble(900, 0, '气泡一：这批鸡好瘦，孵化场克扣饲料了？', 0xf2c655, { priority: 'interactive', faction: 'ally' });
      kp.stage.spawnBubble(920, 0, '气泡二：第 47 滩粘液！我记着呢！', 0xf2c655, { priority: 'interactive', faction: 'ally' });
      kp.stage.spawnBubble(940, 0, '气泡三：欢迎入住双人间！三点发布丁~', 0xf05674, { priority: 'interactive', faction: 'enemy' });
      const pairOverlaps: string[] = [];
      for (let f = 0; f < 30; f++) {
        kp.stage.update(1 / 60);
        const rects = kp.stage.getActiveBubbleScreenRects();
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i]!;
            const b = rects[j]!;
            if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
              pairOverlaps.push(`f=${f} ${i}x${j}`);
            }
          }
        }
      }
      return { count: kp.stage.getActiveBubbleScreenRects().length, pairOverlaps };
    });
    expect(pairwiseAudit.count).toBe(3);
    expect(pairwiseAudit.pairOverlaps).toEqual([]);

    // V2.4 Gate B: Wave countdown HUD zero width/height jitter across 60s..0s
    const hudJitter = await page.evaluate(() => {
      const kp = window.__KEEPER_PET__!;
      kp.engine.state.heroes = [];
      const hud = document.getElementById('abyss-hud-bar')!;
      kp.engine.state.waveTimer = 60;
      kp.ui.syncHudNumbers();
      const base = hud.getBoundingClientRect();
      let maxDw = 0;
      let maxDh = 0;
      for (let sec = 60; sec >= 0; sec -= 5) {
        kp.engine.state.waveTimer = sec;
        kp.ui.syncHudNumbers();
        const r = hud.getBoundingClientRect();
        maxDw = Math.max(maxDw, Math.abs(r.width - base.width));
        maxDh = Math.max(maxDh, Math.abs(r.height - base.height));
      }
      return { maxDw, maxDh };
    });
    expect(hudJitter.maxDw).toBeLessThanOrEqual(0.5);
    expect(hudJitter.maxDh).toBeLessThanOrEqual(0.5);

    // V2.4 Gate C: T-15s horizon silhouettes 100% match actual spawned hero species
    const silMatch = await page.evaluate(() => {
      const kp = window.__KEEPER_PET__!;
      kp.engine.state.heroes = [];
      kp.engine.state.wave = 5;
      kp.engine.state.waveTimer = 12;
      kp.stage.update(1 / 60);
      const shown = kp.stage.getVisibleSilhouetteSpecies();
      kp.engine.provokeNextWave();
      const spawned = kp.engine.state.heroes.map((h) => h.species).slice(0, 8);
      return { shown, spawned };
    });
    expect(silMatch.shown.length).toBeGreaterThan(0);
    expect(silMatch.shown).toEqual(silMatch.spawned);

    // V2.5 Screenshot 09: Frontline Prison + 820px ECG / Ward / Dual-Chicken / Overcharge Drawer + HUD Bullion Badge
    await page.evaluate(() => {
      const kp = window.__KEEPER_PET__!;
      kp.engine.state.gold = kp.engine.state.goldCap;
      kp.engine.state.bullion = Math.round(kp.engine.state.bullionCap * 0.85);
      kp.engine.state.heroes = [];
      kp.stage.clearBubbles();
      kp.engine.buildRoom(8, 'prison');
      kp.engine.state.prisoners = [
        {
          id: 'p_ecg_1',
          sourceHero: 'holy_knight',
          targetSpecies: 'fallen_paladin',
          heroName: '圣光女骑士',
          waveCaptured: 6,
          will: 210,
          maxWill: 630,
          progress: 0.67,
          hp: 58,
          cell: 'chamber',
          mercy: false,
          dessertHooked: false,
          flavorHits: 0,
          feedCd: 0,
          ward: 0.3,
          satiety: 45,
          drowsyTimer: 0,
          overchargeTimer: 0,
          overchargeCrit: false,
          vintageWaves: 2,
          escortedByHeroId: null,
        },
        {
          id: 'p_cell_1',
          sourceHero: 'holy_sister',
          targetSpecies: 'corrupted_sister',
          heroName: '圣咏修女',
          waveCaptured: 6,
          will: 480,
          maxWill: 630,
          progress: 0.24,
          hp: 92,
          cell: 'prison',
          mercy: false,
          dessertHooked: false,
          flavorHits: 0,
          feedCd: 0,
          ward: 0.72,
          satiety: 0,
          drowsyTimer: 0,
          overchargeTimer: 0,
          overchargeCrit: false,
          vintageWaves: 3,
          abandonedByCathedral: true,
          escortedByHeroId: null,
        },
      ];
      kp.stage.panToSlot(8);
      kp.ui.openDrawer({ kind: 'torture', tab: 'chamber' });
      kp.ui.syncHudNumbers();
      kp.stage.update(1 / 60);
    });
    await page.waitForTimeout(250);
    const tortureBox = await page.locator('.torture-drawer').boundingBox();
    expect(tortureBox).not.toBeNull();
    expect(tortureBox!.height).toBeLessThanOrEqual(490);
    await page.screenshot({ path: path.join(SHOTS_DIR, '09_prison_and_ecg_torture.png') });

    // V2.5 Screenshot 10: The Abyss Gazette (with Bullion summary) & Destroy World Atomic Reset check
    await page.evaluate(() => {
      const kp = window.__KEEPER_PET__!;
      kp.ui.openGazetteModal(
        { raids: 0, twinSuites: 0 },
        { raids: 3, twinSuites: 1, slimeMopped: 47, conversions: 2 },
        4,
        1500,
        { gold: 12800, bullion: 4200, mana: 940, xp: 640, converted: 2 },
      );
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOTS_DIR, '10_gazette_and_destroy_modal.png') });

    // V2.4 Gate D: Atomic Destroy World reset prevents beforeunload from writing back old save, preserves locale & creates backup!
    const resetAudit = await page.evaluate(() => {
      const kp = window.__KEEPER_PET__!;
      window.localStorage.setItem('abyss_keeper_pet_locale', 'zh');
      kp.saveNow();
      const hadSaveBefore = Boolean(window.localStorage.getItem('abyss_keeper_pet_save_v2'));
      kp.destroyWorldAtomic(true);
      window.dispatchEvent(new Event('beforeunload'));
      kp.saveNow();
      return {
        hadSaveBefore,
        saveAfterReset: window.localStorage.getItem('abyss_keeper_pet_save_v2'),
        backupExists: Boolean(window.localStorage.getItem('abyss_keeper_pet_prereset_backup')),
        localePreserved: window.localStorage.getItem('abyss_keeper_pet_locale'),
      };
    });
    expect(resetAudit.hadSaveBefore).toBe(true);
    expect(resetAudit.saveAfterReset).toBeNull();
    expect(resetAudit.backupExists).toBe(true);
    expect(resetAudit.localePreserved).toBe('zh');

    // Clean up for p95 frame benchmark (with 8 heroes + 3 bubbles + candle + silhouettes!)
    await page.evaluate(() => {
      const kp = window.__KEEPER_PET__!;
      kp.ui.closeDrawer();
      kp.engine.dismissTutorial();
      kp.engine.state.wave = 10;
      kp.engine.state.waveTimer = 10;
      kp.stage.clearBubbles();
      kp.stage.spawnBubble(900, 0, '压测气泡一', 0xf2c655, { priority: 'interactive', faction: 'ally' });
      kp.stage.spawnBubble(1100, 0, '压测气泡二', 0xf2c655, { priority: 'interactive', faction: 'ally' });
      kp.stage.spawnBubble(1300, 0, '压测气泡三', 0xf05674, { priority: 'interactive', faction: 'enemy' });
      kp.ui.syncHudNumbers();
    });

    const p95Ms = await page.evaluate(() => {
      const kp = window.__KEEPER_PET__!;
      const samples: number[] = [];
      for (let i = 0; i < 300; i++) {
        const t0 = performance.now();
        kp.stage.update(1 / 60);
        samples.push(performance.now() - t0);
      }
      samples.sort((a, b) => a - b);
      return samples[Math.floor(samples.length * 0.95)]!;
    });
    expect(p95Ms).toBeLessThanOrEqual(12);

    expect(errors).toEqual([]);
  });
});
