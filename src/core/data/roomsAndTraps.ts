import type { BuildableRoomType, RoomType, SpellId, TrapType } from '../types';

export interface RoomDef {
  type: RoomType;
  name: string;
  shortName: string;
  buildCost: number;
  baseUpgradeCost: number;
  baseOutput: number;
  unitCapacity: number;
  allowsTrap: boolean;
  description: string;
}

export const ROOM_DEFS: Record<RoomType, RoomDef> = {
  throne: {
    type: 'throne',
    name: '魔王王座',
    shortName: '王座',
    buildCost: 0,
    baseUpgradeCost: 115,
    baseOutput: 1.8, // Mana/s baseline
    unitCapacity: 2,
    allowsTrap: false,
    description: '魔王坐镇的中枢大殿，左侧为后院宝库与秘室，右侧为迎击长廊。点击王座可直接升级魔王与技能！',
  },
  treasury: {
    type: 'treasury',
    name: '后院宝库',
    shortName: '宝库',
    buildCost: 60,
    baseUpgradeCost: 75,
    baseOutput: 900, // Gold capacity baseline
    unitCapacity: 2,
    allowsTrap: false,
    description: '藏于王座后方的金库，升级可大幅扩容并产生深渊利息。注意防备绕过前线偷钱的暗影女飞贼！',
  },
  hatchery: {
    type: 'hatchery',
    name: '咕咕孵化场',
    shortName: '孵化场',
    buildCost: 65,
    baseUpgradeCost: 80,
    baseOutput: 4,
    unitCapacity: 3,
    allowsTrap: false,
    description: '持续孵出肥美小鸡，眷属饥饿或负伤时会飞扑进来大快朵颐并立刻恢复 35% 生命值。',
  },
  training: {
    type: 'training',
    name: '暗影训练室',
    shortName: '训练室',
    buildCost: 85,
    baseUpgradeCost: 95,
    baseOutput: 7.2,
    unitCapacity: 3,
    allowsTrap: false,
    description: '驻留眷属每秒持续演武获取经验升级，配合右键扇巴掌可瞬间开启 30 秒狂暴速成。',
  },
  library: {
    type: 'library',
    name: '禁忌魔导书库',
    shortName: '书库',
    buildCost: 90,
    baseUpgradeCost: 100,
    baseOutput: 2.0,
    unitCapacity: 3,
    allowsTrap: false,
    description: '法系眷属研读秘典产出深渊魔力，驱动魔王神迹法术、二合一祭坛与刑讯仪式。',
  },
  workshop: {
    type: 'workshop',
    name: '黑铁工坊',
    shortName: '工坊',
    buildCost: 95,
    baseUpgradeCost: 105,
    baseOutput: 1.8,
    unitCapacity: 3,
    allowsTrap: false,
    description: '锻造陷阱零件自动补满走廊杀阵，溢出零件将自动铸成金币入库。',
  },
  corruption: {
    type: 'corruption',
    name: '魅魔刑讯室',
    shortName: '刑讯室',
    buildCost: 135,
    baseUpgradeCost: 130,
    baseOutput: 2.6,
    unitCapacity: 2,
    allowsTrap: false,
    description: '关押战败的圣堂精锐勇者并装配高压电椅等各色刑具，彻底瓦解意志后收编为三阶麾下王牌！',
  },
  prison: {
    type: 'prison',
    name: '深渊囚笼',
    shortName: '囚笼',
    buildCost: 90,
    baseUpgradeCost: 95,
    baseOutput: 4,
    unitCapacity: 1,
    allowsTrap: false,
    description: '全图限建 1 座！建在王座左侧后院 100% 稳妥养老；建在右侧前线则化身活体钓鱼吊笼，诱杀红眼劫狱勇者与触发双人间反水喜剧！',
  },
  altar: {
    type: 'altar',
    name: '深渊合成祭坛',
    shortName: '合成祭坛',
    buildCost: 140,
    baseUpgradeCost: 140,
    baseOutput: 1,
    unitCapacity: 2,
    allowsTrap: false,
    description: '将两名麾下眷属融合进阶为稀有二阶精锐或升星强化，完美继承核心战斗词条。',
  },
  corridor: {
    type: 'corridor',
    name: '迎击走廊',
    shortName: '走廊',
    buildCost: 0,
    baseUpgradeCost: 70,
    baseOutput: 1,
    unitCapacity: 4,
    allowsTrap: true,
    description: '可部署五类经典牛蛙走廊陷阱与前排精锐协同绞杀勇者，也可设在后院门口拦截偷金飞贼！',
  },
  rock_vein: {
    type: 'rock_vein',
    name: '深层矿脉岩层',
    shortName: '矿脉岩',
    buildCost: 0,
    baseUpgradeCost: 0,
    baseOutput: 0,
    unitCapacity: 0,
    allowsTrap: false,
    description: '点击标记后由苦工小鬼扛镐真实开采并搬运金块回宝库，深处岩层还埋藏秘银、血钻与古代圣物箱！',
  },
};

export const BUILDABLE_ROOMS: readonly BuildableRoomType[] = [
  'treasury',
  'hatchery',
  'training',
  'library',
  'workshop',
  'prison',
  'corruption',
  'altar',
  'corridor',
];

export interface TrapDef {
  type: TrapType;
  name: string;
  buildCostGold: number;
  buildCostParts: number;
  baseDamage: number;
  cooldownSec: number;
  maxCharges: number;
  refillPartCost: number;
  description: string;
}

export const TRAP_DEFS: Record<TrapType, TrapDef> = {
  iron_spikes: {
    type: 'iron_spikes',
    name: '黑铁尖刺阵',
    buildCostGold: 55,
    buildCostParts: 6,
    baseDamage: 34,
    cooldownSec: 2.3,
    maxCharges: 14,
    refillPartCost: 2,
    description: '穿刺伤害并减速 30%，对冰冻目标触发 1.6× 碎冰暴击。',
  },
  boulder_trap: {
    type: 'boulder_trap',
    name: '牛蛙滚石巨砾',
    buildCostGold: 110,
    buildCostParts: 14,
    baseDamage: 78,
    cooldownSec: 9.2,
    maxCharges: 8,
    refillPartCost: 4,
    description: '释放碾压整条长廊的巨石，造成毁灭性范围碾压伤害与大幅击退！',
  },
  charm_censer: {
    type: 'charm_censer',
    name: '魅惑粉雾香炉',
    buildCostGold: 85,
    buildCostParts: 10,
    baseDamage: 18,
    cooldownSec: 6.5,
    maxCharges: 10,
    refillPartCost: 3,
    description: '使踏入的勇者陷入 3 秒魅惑混乱，转身痛击身后的队友！',
  },
  frost_rune: {
    type: 'frost_rune',
    name: '霜狱魔纹',
    buildCostGold: 80,
    buildCostParts: 9,
    baseDamage: 26,
    cooldownSec: 5.0,
    maxCharges: 12,
    refillPartCost: 3,
    description: '冻结勇者 2.0 秒，与尖刺阵和滚石巨砾形成致命碎冰连携。',
  },
  hell_spring: {
    type: 'hell_spring',
    name: '地狱弹簧板',
    buildCostGold: 95,
    buildCostParts: 11,
    baseDamage: 30,
    cooldownSec: 8.8,
    maxCharges: 10,
    refillPartCost: 3,
    description: '将冲在最前面的入侵者直接弹飞回走廊远端入口，逼她重走一遍陷阱街！',
  },
};

export interface SpellDef {
  id: SpellId;
  name: string;
  manaCost: number;
  cooldownSec: number;
  baseUpgradeGold: number;
  description: string;
}

export const SPELL_DEFS: Record<SpellId, SpellDef> = {
  abyss_lightning: {
    id: 'abyss_lightning',
    name: '深渊落雷',
    manaCost: 48,
    cooldownSec: 22,
    baseUpgradeGold: 180,
    description: '对前线最多 4 名勇者劈下深渊雷霆，升级显著提升暴雷倍率。',
  },
  demon_frenzy: {
    id: 'demon_frenzy',
    name: '群魔狂暴',
    manaCost: 58,
    cooldownSec: 30,
    baseUpgradeGold: 220,
    description: '全体深渊眷属 15 秒内攻速 +45%、移速 +30%，升级延长持续时间。',
  },
  charm_mist: {
    id: 'charm_mist',
    name: '魅惑迷雾',
    manaCost: 68,
    cooldownSec: 38,
    baseUpgradeGold: 260,
    description: '令走廊内所有非 Boss 勇者陷入魅惑混乱并互相火拼。',
  },
  abyss_blackhole: {
    id: 'abyss_blackhole',
    name: '深渊引力坍缩',
    manaCost: 85,
    cooldownSec: 45,
    baseUpgradeGold: 340,
    description: '在走廊中段撕开暗影黑洞，将所有勇者强行拉扯聚集并造成巨额暗影震荡（极佳滚石连携）！',
  },
};
