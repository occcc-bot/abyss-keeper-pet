import type { SeededRng } from '../rng';
import type {
  AbyssalUnit,
  CapturableHeroId,
  CorruptedTargetId,
  CorruptionMarkId,
  RoomResonanceId,
  RoomSlot,
  TortureImplementId,
  TrapSynergyId,
} from '../types';

export interface CorruptionMarkDef {
  id: CorruptionMarkId;
  name: string;
  shortTag: string;
  desc: string;
}

export const CORRUPTION_MARKS: Record<CorruptionMarkId, CorruptionMarkDef> = {
  oathbreaker: {
    id: 'oathbreaker',
    name: '背誓狂信',
    shortTag: '背誓',
    desc: '对所有圣堂勇者伤害 +22%',
  },
  night_collar: {
    id: 'night_collar',
    name: '暗夜项圈',
    shortTag: '项圈',
    desc: '驻守书库/工坊/训练/刑讯产出 +30%，挨巴掌愉悦翻倍',
  },
  true_hound: {
    id: 'true_hound',
    name: '真视猎犬',
    shortTag: '猎犬',
    desc: '反潜抓贼侦测范围翻倍（480px），击杀偷金贼赏金 +25%',
  },
};

export const CORRUPTION_MARK_LIST: readonly CorruptionMarkId[] = [
  'oathbreaker',
  'night_collar',
  'true_hound',
];

export function defaultCorruptionMarkForSpecies(species: CorruptedTargetId): CorruptionMarkId {
  switch (species) {
    case 'corrupted_sister':
    case 'eclipse_archmage':
      return 'night_collar';
    case 'shadow_phantom_thief':
      return 'true_hound';
    case 'fallen_paladin':
    case 'abyssal_ranger':
    case 'dread_dragon_knight':
    default:
      return 'oathbreaker';
  }
}

export function getUnitRoomWorkOutputMult(unit: AbyssalUnit): number {
  return unit.corruptionMark === 'night_collar' ? 1.3 : 1.0;
}

export interface RoomResonanceDef {
  id: RoomResonanceId;
  name: string;
  pairLabel: string;
  desc: string;
  accentColor: number;
}

export const ROOM_RESONANCE_DEFS: Record<RoomResonanceId, RoomResonanceDef> = {
  dark_inquisition_rite: {
    id: 'dark_inquisition_rite',
    name: '暗夜审讯祭礼',
    pairLabel: '刑讯室 ↔ 合成祭坛',
    desc: '腐化速度 +30%，收编/融合保底额外觉醒 +1 稀有词条（上限 3）',
    accentColor: 0xd966ff,
  },
  arcane_throne_corridor: {
    id: 'arcane_throne_corridor',
    name: '魔导王座回廊',
    pairLabel: '魔导书库 ↔ 魔王王座',
    desc: '魔王神迹冷却 -20%，书库与王座魔力产出 +25%',
    accentColor: 0x8a6eff,
  },
  demon_boot_canteen: {
    id: 'demon_boot_canteen',
    name: '魔鬼特训食堂',
    pairLabel: '暗影训练室 ↔ 孵化场',
    desc: '演武经验 +35%，吃鸡额外赋予 12s 狂暴攻速',
    accentColor: 0xf2c655,
  },
  forge_kill_array: {
    id: 'forge_kill_array',
    name: '军工淬火杀阵',
    pairLabel: '黑铁工坊 ↔ 陷阱走廊',
    desc: '全走廊陷阱伤害 +30%，工坊零件产出 +25%',
    accentColor: 0xff8a3d,
  },
  iron_transfer_ward: {
    id: 'iron_transfer_ward',
    name: '铁幕提审走廊',
    pairLabel: '深渊囚笼 ↔ 刑讯室',
    desc: '牢内回血 +50%、意志缓降 -0.5%/min、提审零耗时、捕获率 +4%',
    accentColor: 0xc066ff,
  },
  aroma_temptation: {
    id: 'aroma_temptation',
    name: '飘香诱惑牢房',
    pairLabel: '深渊囚笼 ↔ 孵化场',
    desc: '烤鸡香味令非素食俘虏意志缓降 -0.5%/min',
    accentColor: 0xffb347,
  },
  night_school_cell: {
    id: 'night_school_cell',
    name: '强制夜校讲堂',
    pairLabel: '深渊囚笼 ↔ 魔导书库',
    desc: '隔墙旁听《深渊劳动法》，牢内俘虏意志缓降 -0.5%/min',
    accentColor: 0x6ce5ff,
  },
  gilded_cell_window: {
    id: 'gilded_cell_window',
    name: '贼心不死金窗',
    pairLabel: '深渊囚笼 ↔ 后院宝库',
    desc: '金光晃眼，撬锁女飞贼“见钱忘义”弃救偷金概率 50%→100%',
    accentColor: 0xf2c655,
  },
};

export interface TrapSynergyDef {
  id: TrapSynergyId;
  name: string;
  pairLabel: string;
  desc: string;
  accentColor: number;
}

export const TRAP_SYNERGY_DEFS: Record<TrapSynergyId, TrapSynergyDef> = {
  shatter_frost_lane: {
    id: 'shatter_frost_lane',
    name: '极寒碎冰长廊',
    pairLabel: '霜狱魔纹 ↔ 滚石/尖刺',
    desc: '相邻两格陷阱伤害 +35%，碎冰暴击倍率进一步提升',
    accentColor: 0x6ce5ff,
  },
  phantom_labyrinth: {
    id: 'phantom_labyrinth',
    name: '魅影鬼打墙',
    pairLabel: '地狱弹簧板 ↔ 魅惑香炉',
    desc: '相邻两格陷阱伤害 +35%，魅惑时长 +1.0s',
    accentColor: 0xff8ec8,
  },
};

export interface ActiveResonanceLink {
  id: RoomResonanceId;
  slotA: number;
  slotB: number;
}

export interface ActiveTrapSynergyLink {
  id: TrapSynergyId;
  slotA: number;
  slotB: number;
}

export interface DungeonResonanceSummary {
  activeResonances: RoomResonanceId[];
  resonanceLinks: ActiveResonanceLink[];
  trapSynergyLinks: ActiveTrapSynergyLink[];
  slotTrapSynergies: Map<number, Set<TrapSynergyId>>;
  highlightedSlots: Set<number>;
}

/**
 * Evaluates all 4 room adjacency resonances (global boolean once, no stacking!)
 * and 2 corridor trap-pair synergies (strictly scoped to the participating adjacent pair).
 */
export function evaluateDungeonResonances(slots: readonly RoomSlot[]): DungeonResonanceSummary {
  const activeSet = new Set<RoomResonanceId>();
  const resonanceLinks: ActiveResonanceLink[] = [];
  const trapSynergyLinks: ActiveTrapSynergyLink[] = [];
  const slotTrapSynergies = new Map<number, Set<TrapSynergyId>>();
  const highlightedSlots = new Set<number>();

  const addResonance = (id: RoomResonanceId, a: number, b: number): void => {
    if (!activeSet.has(id)) {
      activeSet.add(id);
      resonanceLinks.push({ id, slotA: a, slotB: b });
      highlightedSlots.add(a);
      highlightedSlots.add(b);
    }
  };

  const addTrapSyn = (id: TrapSynergyId, a: number, b: number): void => {
    trapSynergyLinks.push({ id, slotA: a, slotB: b });
    highlightedSlots.add(a);
    highlightedSlots.add(b);
    let setA = slotTrapSynergies.get(a);
    if (!setA) {
      setA = new Set();
      slotTrapSynergies.set(a, setA);
    }
    setA.add(id);
    let setB = slotTrapSynergies.get(b);
    if (!setB) {
      setB = new Set();
      slotTrapSynergies.set(b, setB);
    }
    setB.add(id);
  };

  for (let i = 0; i < slots.length - 1; i++) {
    const a = slots[i]!;
    const b = slots[i + 1]!;
    const ta = a.type;
    const tb = b.type;

    if ((ta === 'corruption' && tb === 'altar') || (ta === 'altar' && tb === 'corruption')) {
      addResonance('dark_inquisition_rite', a.index, b.index);
    }
    if ((ta === 'library' && tb === 'throne') || (ta === 'throne' && tb === 'library')) {
      addResonance('arcane_throne_corridor', a.index, b.index);
    }
    if ((ta === 'training' && tb === 'hatchery') || (ta === 'hatchery' && tb === 'training')) {
      addResonance('demon_boot_canteen', a.index, b.index);
    }
    if (
      (ta === 'workshop' && tb === 'corridor' && b.trap !== null) ||
      (tb === 'workshop' && ta === 'corridor' && a.trap !== null)
    ) {
      addResonance('forge_kill_array', a.index, b.index);
    }
    if ((ta === 'prison' && tb === 'corruption') || (ta === 'corruption' && tb === 'prison')) {
      addResonance('iron_transfer_ward', a.index, b.index);
    }
    if ((ta === 'prison' && tb === 'hatchery') || (ta === 'hatchery' && tb === 'prison')) {
      addResonance('aroma_temptation', a.index, b.index);
    }
    if ((ta === 'prison' && tb === 'library') || (ta === 'library' && tb === 'prison')) {
      addResonance('night_school_cell', a.index, b.index);
    }
    if ((ta === 'prison' && tb === 'treasury') || (ta === 'treasury' && tb === 'prison')) {
      addResonance('gilded_cell_window', a.index, b.index);
    }

    if (a.trap && b.trap) {
      const x = a.trap.type;
      const y = b.trap.type;
      if (
        (x === 'frost_rune' && (y === 'boulder_trap' || y === 'iron_spikes')) ||
        (y === 'frost_rune' && (x === 'boulder_trap' || x === 'iron_spikes'))
      ) {
        addTrapSyn('shatter_frost_lane', a.index, b.index);
      }
      if (
        (x === 'hell_spring' && y === 'charm_censer') ||
        (y === 'hell_spring' && x === 'charm_censer')
      ) {
        addTrapSyn('phantom_labyrinth', a.index, b.index);
      }
    }
  }

  return {
    activeResonances: Array.from(activeSet),
    resonanceLinks,
    trapSynergyLinks,
    slotTrapSynergies,
    highlightedSlots,
  };
}

export const evaluateTrapSynergies = evaluateDungeonResonances;

/**
 * 6 Capturable Heroes × 5 Torture Implements × 3 Will Stages:
 *   stage 0: 0%..40%  (Defiant Resistance)
 *   stage 1: 40%..80% (Flustered Wavering)
 *   stage 2: 80%..100% (Broken Yielding)
 */
const HERO_TORTURE_SCRIPTS: Record<
  CapturableHeroId,
  Record<TortureImplementId, readonly [string, string, string]>
> = {
  holy_knight: {
    electric_chair: [
      '我什么都不会告诉你的！！（吴京脸）圣光会庇佑骑士团的尊严！',
      '滋滋滋——别电我的金发啊！呜…骑士的铠甲居然导电…！',
      '哈啊…不行了…圣光好像断线了，魔王大人的电流…有点让人上瘾…',
    ],
    feather_tickler: [
      '区区羽毛也想动摇圣殿骑士？哼，我绝不会笑出一声——',
      '噗哈哈哈哈停下！肋下是铠甲死角啊呜哈哈救命！',
      '笑到眼泪都出来了…别挠了！我签卖身契还不行吗呜呜…',
    ],
    brainwash_gramophone: [
      '邪恶的魔音休想污染我的信念！圣堂是正义的归宿！',
      '等等…你们魔王城真的双休还报销铠甲保养费？不对，我在想什么！',
      '魔王大人万岁…圣堂天天画大饼，还是深渊给的待遇实在…',
    ],
    hell_dessert_table: [
      '骑士只吃圣餐黑面包！绝不屈服于魔族的糖衣炮弹！',
      '咕噜…那块熔岩蛋糕为什么在发光…我才没有咽口水！',
      '呜…就一口！好甜！只要管饱下午茶，我替魔王守大门！',
    ],
    truth_spotlight: [
      '圣光在上，我问心无愧，随你怎么照！',
      '灯太亮了别照脸！好吧我说…其实我偷偷觉得魔王的王座很帅！',
      '全招了全招了！骑士团金库密码是 0000，快关灯让我入职吧！',
    ],
  },
  holy_sister: {
    electric_chair: [
      '阿门…主啊，请赐予我忍受这异端雷霆的虔诚！',
      '呀啊！头纱要炸毛了…呜呜，麻麻的感觉从指尖蔓延开来了…',
      '主好像不在服务区…那就改向魔王大人祈祷吧♥',
    ],
    feather_tickler: [
      '修女的清修岂会被这种小把戏打乱心境…',
      '咿呀哈哈哈哈！别碰脚心呀！圣洁的形象全毁了呜哈哈！',
      '呼啊…笑得浑身发软了…修女服都要散开了，我投降啦…',
    ],
    brainwash_gramophone: [
      '快关掉这首亵渎圣歌的唱片！我只听教堂管风琴！',
      '奇怪…怎么忍不住跟着哼起来了？“深渊福利好”是什么歌词呀！',
      '原来向魔王献上祷言才是真正的救赎…请收下我的虔诚吧~',
    ],
    hell_dessert_table: [
      '暴食是七宗罪之一！修女绝不碰半口甜点！',
      '可、可是那个草莓舒芙蕾看起来好无辜…闻一下不算犯戒吧？',
      '唔姆…真香！要是深渊天天有布丁，我立刻改行当暗影修女！',
    ],
    truth_spotlight: [
      '我一生侍奉圣堂，绝无半句虚言！',
      '别照啦！我承认…早课的时候我经常在圣经里夹漫画看…！',
      '呜呜别问了，圣堂私房钱藏在告解室地板下，我这就带路！',
    ],
  },
  elf_sharpshooter: {
    electric_chair: [
      '高等精灵的骄傲绝不会屈服于粗鄙的铁椅子！',
      '呜啊！尖耳朵被电得好敏感…！不许盯着我看！',
      '哈…弓弦都拉不动了…别电了，我的箭以后只为你射出…',
    ],
    feather_tickler: [
      '森林的风都吹不乱我的瞄准，何况几根羽毛！',
      '咿呀！别用羽毛扫我的精灵耳啊哈哈哈哈太犯规了！',
      '呜…耳朵通红了…再挠下去连站都站不稳了，我认输…',
    ],
    brainwash_gramophone: [
      '难听死了！精灵只聆听世界树的低语！',
      '啧…这鼓点居然挺带感…不行，我怎么在跟着打拍子！',
      '森林太冷清了…魔王城这边热闹又好玩，留下好像也不错…',
    ],
    hell_dessert_table: [
      '精灵只饮晨露与浆果，才不稀罕油腻的魔界料理！',
      '那、那个蜂蜜烤鸡怎么这么香…就瞄一眼，绝不吃！',
      '真香警告…魔王城大厨手艺秒杀精灵王庭，我归顺了！',
    ],
    truth_spotlight: [
      '直视精灵的眼睛吧，你休想套出半点情报！',
      '刺眼！好吧我说…其实我刚才射偏是因为被魔王的气场晃了神！',
      '别照了啦！精灵弓术秘籍都给你，快放我下来换深渊套装！',
    ],
  },
  dwarf_gold_thief: {
    electric_chair: [
      '嘿，想从老娘嘴里撬出藏宝图？门都没有！',
      '哇滋滋滋！停停停，再电我口袋里的金币都要融化啦！',
      '服了服了老板！我连圣堂国库的备用钥匙都交出来，带我干吧！',
    ],
    feather_tickler: [
      '抓贼审讯用羽毛？你们魔王城经费这么紧张吗哈哈——',
      '等等哈哈哈别挠腰啊！那是我的笑穴呜哈哈哈哈快停！',
      '笑死我了…行行行，以后我替你抓同行，提成五五分…不，三七！',
    ],
    brainwash_gramophone: [
      '切，画大饼的话术我比你们溜多了！',
      '哎？抓同行还有双倍悬赏金和五险一金？这买卖不亏啊…',
      '老板英明！从今天起我就是魔王御用反扒队长！',
    ],
    hell_dessert_table: [
      '我只爱金币，区区甜品贿赂不了专业飞贼！',
      '哇，这蛋糕上居然撒了真金箔？！老板你真大方啊…',
      '吃人嘴短…这顿豪华烤鸡我认了，以后宝库我替你看着！',
    ],
    truth_spotlight: [
      '审讯灯？老娘走南闯北什么大场面没见过！',
      '喂别照这么近！行行行，上次偷走的 200 金币我埋在门口花坛了！',
      '全交代了老板！以后谁敢偷咱们后院，我第一个把她挂电椅上！',
    ],
  },
  sun_archmage: {
    electric_chair: [
      '区区低阶雷电魔法，也敢在烈阳大魔导面前班门弄斧？',
      '唔…这高压频率竟干扰了我的魔力回路…可恶，好麻！',
      '哈啊…太阳魔力完全溃散了…这股深渊暗流，竟如此迷人…',
    ],
    feather_tickler: [
      '荒谬！对一位大魔导使用如此无礼的机械装置！',
      '住手…噗哈哈！别碰我的锁骨啊！魔导袍要滑下来了呜哈哈！',
      '呼…呼…尊严彻底碎掉了…别挠了，我把禁咒全献给你…',
    ],
    brainwash_gramophone: [
      '低俗的噪音！根本无法撼动我的奥术壁垒！',
      '等等…书库的无限魔力源井居然免费开放给学者研究？',
      '圣堂只会限制禁术研究，深渊才是大魔导真正的学术天堂！',
    ],
    hell_dessert_table: [
      '高贵的魔导师岂会沉溺于口腹之欲！',
      '那个暗焰焦糖布丁的魔力波动…我只是出于学术目的品尝一下！',
      '天哪，太美味了…为了下午茶与禁书库，我愿化作蚀月大魔导！',
    ],
    truth_spotlight: [
      '以烈阳之名，我的意志比恒星更耀眼！',
      '唔！别把聚光灯对准我…好吧，其实我早就厌倦当圣堂吉祥物了！',
      '承认了！我渴望禁忌的蚀月之力，快为我戴上深渊刻印吧！',
    ],
  },
  dragon_general: {
    electric_chair: [
      '这点电流，连帝国龙骑兵的日常耐力训练都比不上！',
      '啧…加大电压了吗？牙关在打颤…可恶，别小看将军！',
      '呼啊…全身力气被抽空了…这份压迫力，确实配得上让我俯首…',
    ],
    feather_tickler: [
      '哼，刀枪都不惧的铁血将军，会怕几根鸟毛？',
      '唔噗——哈哈！喂！铠甲缝隙不许偷袭啊哈哈哈哈！',
      '够了！堂堂龙骑将军笑到流泪成何体统…我归降便是！',
    ],
    brainwash_gramophone: [
      '军人的誓言坚如磐石，休想用靡靡之音动摇我！',
      '帝国元老院确实腐朽不堪…反观魔王城，赏罚分明…',
      '旧帝国已死，深渊的铁血秩序才值得我挥舞龙枪！',
    ],
    hell_dessert_table: [
      '行军打仗只吃干粮，享乐会腐蚀战士的锋芒！',
      '……这只油亮烤鸡的火候，竟然比御膳房还强三分…',
      '吃饱了才有力气冲锋！魔王，给我备好最沉的魔渊龙枪！',
    ],
    truth_spotlight: [
      '龙骑将军光明磊落，没有什么可隐瞒的！',
      '闭嘴！我才没有羡慕你们魔王城不用写万字战报…！',
      '说穿了吧，跟着你打天下比伺候帝国贵族痛快一百倍！',
    ],
  },
};

export function getTortureStageIndex(progress: number): 0 | 1 | 2 {
  if (progress >= 0.8) return 2;
  if (progress >= 0.4) return 1;
  return 0;
}

export function getTortureStageLine(
  heroId: CapturableHeroId,
  implementId: TortureImplementId,
  progress: number,
  _rng?: SeededRng,
): string {
  const stage = getTortureStageIndex(progress);
  const byHero = HERO_TORTURE_SCRIPTS[heroId];
  if (byHero && byHero[implementId]) {
    return byHero[implementId][stage];
  }
  return '我什么都不会告诉你的！！（吴京脸）';
}
