import type { RelicId } from '../types';

export interface RelicDef {
  id: RelicId;
  name: string;
  rarity: 'common' | 'rare' | 'abyssal';
  effect: string;
  lore: string;
}

export const RELIC_DEFS: readonly RelicDef[] = [
  {
    id: 'bullfrog_pocket_watch',
    name: '牛蛙发条金怀表',
    rarity: 'abyssal',
    effect: '苦工工作效率 +25%，全体移速 +10%',
    lore: '表面刻着“邪恶从不迟到”，指针逆向旋转。',
  },
  {
    id: 'succubus_lace_blindfold',
    name: '魅魔蕾丝眼罩',
    rarity: 'rare',
    effect: '刑讯室腐化速度 +30%，俘虏捕获率 +8%',
    lore: '遮住双眼后，圣女反而更容易听见深渊低语。',
  },
  {
    id: 'unbreakable_spike_gear',
    name: '不碎尖刺齿轮',
    rarity: 'rare',
    effect: '全体走廊陷阱伤害 +25%',
    lore: '黑铁工坊最引以为傲的永动机关核心。',
  },
  {
    id: 'abyssal_gold_chalice',
    name: '深渊贪婪圣杯',
    rarity: 'common',
    effect: '全渠道金币产出 +20%',
    lore: '盛满勇者眼泪与金币的纯金高脚杯。',
  },
  {
    id: 'obsidian_slap_glove',
    name: '黑曜石督战手套',
    rarity: 'abyssal',
    effect: '扇巴掌督战持续 +15 秒，督战效果额外 +15%',
    lore: '清脆响亮却绝不伤筋动骨，牛蛙认证手感。',
  },
  {
    id: 'roast_chicken_bell',
    name: '焦香小鸡摇铃',
    rarity: 'common',
    effect: '孵化场吃鸡额外回复 +15% 生命',
    lore: '叮铃一响，方圆三格的眷属齐刷刷流口水。',
  },
  {
    id: 'blood_moon_pendant',
    name: '血月吊坠',
    rarity: 'rare',
    effect: '全体眷属攻击吸血 +8%',
    lore: '莉莉丝加冕夜凝结的猩红露珠。',
  },
  {
    id: 'thorn_crown_shard',
    name: '荆棘王冠碎片',
    rarity: 'rare',
    effect: '陷阱伤害 +18%，眷属攻击力 +8%',
    lore: '伊丽莎白亲手折断的染血冠棘。',
  },
  {
    id: 'imp_overtime_whip',
    name: '小鬼加班小皮鞭',
    rarity: 'common',
    effect: '苦工挖矿、搬金与维修速度 +30%',
    lore: '啪地甩在空气里就能让小鬼跑出残影。',
  },
  {
    id: 'boulder_grease_barrel',
    name: '滚石润滑黑油桶',
    rarity: 'rare',
    effect: '牛蛙滚石巨砾伤害 +45%',
    lore: '给巨石抹上深渊黑油，一路保龄球式全倒！',
  },
  {
    id: 'frost_core_prism',
    name: '霜狱棱镜核心',
    rarity: 'common',
    effect: '霜狱魔纹冰冻时间 +0.8 秒',
    lore: '将勇者的战吼冻结成清脆冰渣。',
  },
  {
    id: 'spring_coil_blueprint',
    name: '地狱弹簧钢图纸',
    rarity: 'common',
    effect: '弹簧板伤害 +35，全体陷阱伤害 +12%',
    lore: '标注着“确保把圣骑士弹回远端走廊入口”。',
  },
  {
    id: 'forbidden_grimoire_page',
    name: '禁忌魔导残页',
    rarity: 'common',
    effect: '魔力产出 +25%',
    lore: '页脚还留着禁书见习魔女画的涂鸦。',
  },
  {
    id: 'corrupted_rosary',
    name: '背德黑曜念珠',
    rarity: 'rare',
    effect: '刑讯腐化速度 +25%，全体生命 +10%',
    lore: '每一颗珠子都曾属于一位投诚的圣咏修女。',
  },
  {
    id: 'dragonscale_pauldron',
    name: '黑曜龙鳞肩甲',
    rarity: 'rare',
    effect: '全体眷属最大生命 +22%',
    lore: '从重装龙裔蜕下的鳞片中精炼而成。',
  },
  {
    id: 'arachne_venom_vial',
    name: '蜜毒蛛后毒瓶',
    rarity: 'common',
    effect: '剧毒持续伤害 +50%',
    lore: '闻起来像蜂蜜，尝起来像葬礼。',
  },
  {
    id: 'altar_resonance_stone',
    name: '祭坛共鸣魔石',
    rarity: 'abyssal',
    effect: '祭坛合成等级保留率额外 +15%',
    lore: '让二合一仪式的灵魂损耗降到最低。',
  },
  {
    id: 'greedy_goblin_coin',
    name: '贪婪地精双面币',
    rarity: 'common',
    effect: '金币产出 +18%，宝库利息率 +1%',
    lore: '两面都是魔王侧脸的硬通货。',
  },
  {
    id: 'mana_siphon_crystal',
    name: '虹吸魔晶簇',
    rarity: 'rare',
    effect: '魔力产出 +20%，魔王神迹法术威力 +20%',
    lore: '静静汲取地表勇者的魔力残渣。',
  },
  {
    id: 'shadow_whetstone',
    name: '暗影磨刀石',
    rarity: 'rare',
    effect: '全体攻击力 +18%，暴击率 +8%',
    lore: '骸骨剑姬每天睡前必用的保养品。',
  },
  {
    id: 'dungeon_heart_aegis',
    name: '魔心黑曜护甲片',
    rarity: 'common',
    effect: '魔王殿魔心生命值 +35%',
    lore: '勇者砍到虎口发麻，魔王的核心水晶连漆都没掉一块。',
  },
  {
    id: 'payday_tax_ledger',
    name: '黑心发薪账本',
    rarity: 'common',
    effect: '发薪日薪水支出降低 30%',
    lore: '上面写着“宿舍费与小鸡自助餐按成本抵扣”。',
  },
  {
    id: 'crimson_velvet_choker',
    name: '绯红天鹅绒项圈',
    rarity: 'abyssal',
    effect: '全体暴击率 +12%，吸血 +5%',
    lore: '深渊贵族间最受追捧的忠诚象征。',
  },
  {
    id: 'soul_shackle_chain',
    name: '缚魂暗金锁链',
    rarity: 'rare',
    effect: '精英女勇者捕获率额外 +12%',
    lore: '只要她倒下，锁链就会自动扣上脚踝。',
  },
  {
    id: 'hellforge_bellows',
    name: '地狱熔炉风箱',
    rarity: 'common',
    effect: '工坊陷阱零件制造效率 +35%',
    lore: '呼呼鼓风间，一箱箱尖刺新鲜出炉。',
  },
  {
    id: 'eclipse_hourglass',
    name: '日蚀训练沙漏',
    rarity: 'rare',
    effect: '训练室经验获取速度 +35%',
    lore: '沙漏里的黑沙流逝得比现世更快。',
  },
  {
    id: 'vampiric_fang_brooch',
    name: '血族獠牙胸针',
    rarity: 'rare',
    effect: '全体吸血 +10%，攻击力 +10%',
    lore: '直接吸干勇者的血当下午茶，顺便替孵化场省下两只肥鸡——深渊降本增效典范。',
  },
  {
    id: 'skeleton_metronome',
    name: '骨笛节拍器',
    rarity: 'common',
    effect: '全体攻击与移动速度 +18%',
    lore: '哒哒哒的节奏让整个地下城进入暴走拍点。',
  },
  {
    id: 'emerald_slime_gel',
    name: '翡翠史莱姆凝露',
    rarity: 'common',
    effect: '全体生命 +18%，吃鸡回血 +10%',
    lore: '粘液守卫随地留下的 Q 弹副产物；糊伤口极灵，就是石像鬼看一眼血压就飙到两百。',
  },
  {
    id: 'overlord_signet_ring',
    name: '深渊魔王玺戒',
    rarity: 'abyssal',
    effect: '全军攻血、金币与魔力产出全面 +12%',
    lore: '桌底魔王城至高无上的统御权柄。',
  },
];

export const RELIC_MAP: Record<RelicId, RelicDef> = Object.fromEntries(
  RELIC_DEFS.map((r) => [r.id, r]),
) as Record<RelicId, RelicDef>;
