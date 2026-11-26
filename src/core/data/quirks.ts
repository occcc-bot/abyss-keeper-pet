import { hash32 } from '../hash';
import type { AbyssalSpeciesId, QuirkId, RoomType } from '../types';

export interface QuirkDef {
  id: QuirkId;
  layer: 'sim' | 'ui';
  venue: RoomType | 'any_corridor' | 'any_trap' | 'self';
  actSec: number;
  zhName: string;
  enName: string;
  zhDesc: string;
  enDesc: string;
  linesZh: readonly string[];
  linesEn: readonly string[];
}

export const ALL_QUIRK_IDS: readonly QuirkId[] = [
  'masochist',
  'sadist',
  'food_critic',
  'mad_tinkerer',
  'chronic_slacker',
  'ocd_hoarder',
  'narcissist',
  'pedantic_bookworm',
  'dungeon_gossip',
  'neat_freak',
  'pyromaniac',
  'stockholm_heart',
  'chuunibyou',
  'night_owl',
] as const;

export const QUIRK_DEFS: Record<QuirkId, QuirkDef> = {
  masochist: {
    id: 'masochist',
    layer: 'sim',
    venue: 'corruption',
    actSec: 5.5,
    zhName: '受虐狂',
    enName: 'Masochist',
    zhDesc: '刑讯室空闲时自己偷坐电椅，或去走廊踩尖刺当足底按摩。',
    enDesc: 'Sneaks onto the Electric Chair for afternoon spa sessions or uses spike traps as foot massage.',
    linesZh: [
      '主人，我预约了下午场高压电椅保养♥',
      '黑铁尖刺阵的足底按摩力道刚刚好~',
      '发薪日能不能倒扣我工资？求你了♥',
    ],
    linesEn: [
      'Master, I booked the 3 PM Electric Chair spa session♥',
      'These iron spikes hit the exact acupressure spots~',
      'Could you dock my pay on Payday? Pretty please♥',
    ],
  },
  sadist: {
    id: 'sadist',
    layer: 'sim',
    venue: 'prison',
    actSec: 5.0,
    zhName: '虐待狂',
    enName: 'Sadist',
    zhDesc: '路过囚笼晃钥匙逗俘虏，最爱看勇者踩进滚石阵。',
    enDesc: 'Jingles keys outside the prison bars and applauds whenever heroes eat a Rolling Boulder.',
    linesZh: [
      '猜猜钥匙在哪只手里呀~ 猜对也不放你出来哦♥',
      '滚石碾过去的声音简直比教堂管风琴悦耳一百倍！',
      '哭吧，大声求饶吧——哎，怎么又来个笑得比我还开心的？',
    ],
    linesEn: [
      'Guess which hand holds the key~ Spoiler: you stay inside either way♥',
      'The crunch of a Rolling Boulder beats any Cathedral choir!',
      'Cry louder! …Wait, why is this one smiling?!',
    ],
  },
  food_critic: {
    id: 'food_critic',
    layer: 'sim',
    venue: 'hatchery',
    actSec: 5.0,
    zhName: '美食评委',
    enName: 'Food Critic',
    zhDesc: '孵化场满仓溢出时溜去品鉴烤鸡并打星，绝不抢伤员救命鸡。',
    enDesc: 'Samples surplus Hatchery chickens and hands out Michelin-style ratings without stealing from wounded allies.',
    linesZh: [
      '这批鸡好瘦，孵化场是不是偷偷吃回扣克扣饲料了？',
      '三星半。外皮焦脆，可惜少了一丝圣堂覆灭的绝望烟熏味。',
      '这只肥鸡一直在瞪我……那我不客气了！',
    ],
    linesEn: [
      'These chickens are awfully skinny. Is the Hatchery skimming the feed budget?',
      'Three and a half stars. Crispy skin—just missing a smoky note of Cathedral despair.',
      'This plump chicken keeps glaring at me… digging in then!',
    ],
  },
  mad_tinkerer: {
    id: 'mad_tinkerer',
    layer: 'sim',
    venue: 'any_trap',
    actSec: 5.5,
    zhName: '机关宅',
    enName: 'Mad Tinkerer',
    zhDesc: '备战间隙拎扳手魔改走廊陷阱，偶尔把自己弹上天花板。',
    enDesc: 'Tinkers with corridor traps between waves and occasionally launches herself into the ceiling.',
    linesZh: [
      '把滚石黑油换成高爆配方…咻——咳咳，数据非常成功！',
      '给尖刺阵加装蓝牙音箱，扎中勇者自动播放嘲讽笑声！',
      '弹簧板张力调到 200%…哎呀我的帽子挂吊灯上了！',
    ],
    linesEn: [
      'Swapped boulder grease for rocket fuel… WHOOSH—*cough* data looks great!',
      'Wired a speaker to the spikes so it laughs every time a hero steps on it!',
      'Spring coil tension at 200%… oops, my hat is stuck on the ceiling!',
    ],
  },
  chronic_slacker: {
    id: 'chronic_slacker',
    layer: 'ui',
    venue: 'self',
    actSec: 4.0,
    zhName: '摸鱼惯犯',
    enName: 'Chronic Slacker',
    zhDesc: '玩家 3 分钟未碰地牢就集体打盹，鼠标一移入立刻弹起喊老板好！',
    enDesc: 'Naps whenever the mortal ignores the dungeon for 3 minutes, then snaps to attention the instant the cursor returns!',
    linesZh: [
      '老板好！正在全力挖矿！（擦口水）',
      '刚才那叫战术冥想！绝对不是在打盹！',
      '呼噜……魔王城双休……焦糖布丁……zzz',
    ],
    linesEn: [
      'Hello Boss! Mining at 200% capacity! (*wipes drool*)',
      'That was tactical meditation! Definitely NOT a nap!',
      'Zzz… Abyssal weekends… caramel pudding… zzz',
    ],
  },
  ocd_hoarder: {
    id: 'ocd_hoarder',
    layer: 'sim',
    venue: 'treasury',
    actSec: 5.5,
    zhName: '强迫症守财奴',
    enName: 'OCD Hoarder',
    zhDesc: '蹲宝库把金币按面额码成金字塔，最恨飞贼弄乱她擦过的金币。',
    enDesc: 'Stacks treasury coins into exact pyramids by mint year and loses her mind if a thief smudges them.',
    linesZh: [
      '不许碰我刚用袖口擦过三遍的暗金金字塔！！',
      '发薪日到了？呜呜呜每枚金币离开我都像割肉…',
      '这枚硬币魔王侧脸朝左，那枚朝右，强迫症要犯了！',
    ],
    linesEn: [
      'Hands off my freshly polished dark-gold pyramid!!',
      'Payday already? Every coin leaving the vault feels like losing a limb…',
      'This coin faces left, that one faces right—unacceptable!',
    ],
  },
  narcissist: {
    id: 'narcissist',
    layer: 'sim',
    venue: 'training',
    actSec: 5.0,
    zhName: '自恋狂',
    enName: 'Narcissist',
    zhDesc: '在训练室对着剑刃照镜子摆 Pose，总嫌别人特写打光不如自己。',
    enDesc: 'Poses in front of polished blades in Training and critiques everyone else’s Cut-in lighting.',
    linesZh: [
      '切，刚才那张王牌收编特写的打光还没我好看。',
      '剑刃擦这么亮，不就是为了倒映本小姐的盛世美颜吗~',
      '老板多看我两眼嘛，看代码哪有看我养眼？',
    ],
    linesEn: [
      'Tch, the lighting on that last Cut-in banner had nothing on my good side.',
      'Why else polish a sword to a mirror sheen if not to admire perfection~',
      'Look down here, Boss—surely I beat staring at stack traces?',
    ],
  },
  pedantic_bookworm: {
    id: 'pedantic_bookworm',
    layer: 'sim',
    venue: 'library',
    actSec: 5.5,
    zhName: '学术书呆子',
    enName: 'Pedantic Bookworm',
    zhDesc: '泡书库写论文批注，连激战中都要纠正圣堂法师的咒语重音。',
    enDesc: 'Annotates forbidden tomes and even corrects Cathedral mages’ spell pronunciation mid-battle.',
    linesZh: [
      '重音在 Lu-men 不是 Lu-min，圣堂连基础魔导语都教错？',
      '据《深渊劳动法》第 42 条，俘虏下午茶应记入员工培训经费。',
      '嘘——我正在撰写《论滚石动能与骑士头盔硬度之相关系数》。',
    ],
    linesEn: [
      'It is pronounced Lu-MEN, not Lu-min. Does the Cathedral even teach basic arcane phonetics?',
      'Per Abyssal Labor Code §42, captive pudding qualifies as onboarding expense.',
      'Shh—I am drafting "Kinetic Momentum of Boulders vs. Paladin Helmets."',
    ],
  },
  dungeon_gossip: {
    id: 'dungeon_gossip',
    layer: 'sim',
    venue: 'throne',
    actSec: 5.0,
    zhName: '八卦传话筒',
    enName: 'Dungeon Gossip',
    zhDesc: '在宝库、书库与囚笼间串门咬耳朵，波次前会提前剧透精英阵容！',
    enDesc: 'Spreads juicy castle gossip across rooms—and leaks the next wave’s elite roster ahead of time!',
    linesZh: [
      '听说了吗？隔壁刑讯室的圣女昨天偷吃了三块熔岩蛋糕！',
      '大新闻！石像鬼的拖把今天又被粘液黏在天花板上了！',
      '悄悄告诉你，圣堂主教的私房钱密码还是 0000 呢~',
    ],
    linesEn: [
      'Did you hear? The Sister in Torture secretly ate three lava cakes yesterday!',
      'Breaking news! The Gargoyle’s mop got glued to the ceiling by ooze again!',
      'Word on the corridor is the Bishop’s vault PIN is still 0000~',
    ],
  },
  neat_freak: {
    id: 'neat_freak',
    layer: 'sim',
    venue: 'any_corridor',
    actSec: 5.0,
    zhName: '洁癖',
    enName: 'Neat Freak',
    zhDesc: '战后拎拖把狂擦走廊血迹与粘液印，与翡翠粘液守卫是宿命冤家。',
    enDesc: 'Obsessively mops blood and slime trails off the corridor floor; sworn nemesis of the Ooze Warden.',
    linesZh: [
      '第 47 滩粘液！我都拿小本本记着呢！',
      '勇者能不能把靴子上的泥擦干净再进来送死？！',
      '黑曜石地板刚打完蜡，谁滴血我跟谁急！',
    ],
    linesEn: [
      'Puddle #47! I am keeping an exact tally in my ledger!',
      'Could invading heroes at least wipe their muddy boots before dying here?!',
      'I just waxed these obsidian tiles—bleed somewhere else!',
    ],
  },
  pyromaniac: {
    id: 'pyromaniac',
    layer: 'sim',
    venue: 'workshop',
    actSec: 5.5,
    zhName: '纵火爆破迷',
    enName: 'Pyromaniac',
    zhDesc: '在工坊调高爆配方冒黑烟，隔着铁栏能和拆弹工兵聊成火药知音。',
    enDesc: 'Brews smoky high-explosive recipes in the Workshop and bonds with captured Sappers over sulfur ratios.',
    linesZh: [
      '加三钱地狱硫磺更响？知音啊！回头把你调来工坊！',
      '只要当量够大，就没有滚石解决不了的勇者方阵！',
      '工坊屋顶只是熏黑了一点点，不算工伤吧？',
    ],
    linesEn: [
      'Three pinches of hell-sulfur makes it louder? Soulmate! Transferring you to Workshop!',
      'With enough blast yield, no hero formation survives!',
      'The Workshop ceiling is only lightly scorched—hardly an incident!',
    ],
  },
  stockholm_heart: {
    id: 'stockholm_heart',
    layer: 'sim',
    venue: 'prison',
    actSec: 5.0,
    zhName: '斯德哥尔摩潜质',
    enName: 'Stockholm Heart',
    zhDesc: '对魔王城的下午茶与双休福利死心塌地，最爱劝牢里新俘虏早日跳槽。',
    enDesc: 'Totally devoted to the castle’s tea-and-weekends perks; enthusiastically recruits fresh captives.',
    linesZh: [
      '圣堂连下午茶都没有，他们对我都没魔王大人好！',
      '新来的姐妹听句劝，早签卖身契早领三点钟焦糖布丁~',
      '魔王大人今天看我了一眼，一定是表扬我干活卖力♥',
    ],
    linesEn: [
      'The Cathedral didn’t even have afternoon tea—the Overlord treats us way better!',
      'Take a tip from a senior, sis: sign early and catch the 3 PM pudding!',
      'The Overlord glanced my way today—clearly praising my dedication♥',
    ],
  },
  chuunibyou: {
    id: 'chuunibyou',
    layer: 'ui',
    venue: 'self',
    actSec: 3.0,
    zhName: '中二病',
    enName: 'Chuunibyou',
    zhDesc: '每次普通攻击都要吟唱灭世级奥义名，结果噗叽打出 26 点伤害。',
    enDesc: 'Chants apocalyptic forbidden technique names for every basic attack.',
    linesZh: [
      '解开吧，暗之右眼第七封印·黑炎灭世葬送！！',
      '颤抖吧凡人！吾之左手正因深渊禁忌之力而躁动！',
      '漆黑的因果律啊，在此刻将这名圣堂杂兵化为尘埃！',
    ],
    linesEn: [
      'Unseal the Seventh Eye of Ruin—BLACK FLAME APOCALYPSE!!',
      'Tremble, mortals! My sealed left hand throbs with forbidden abyssal might!',
      'O dark threads of causality, reduce this Cathedral grunt to stardust!',
    ],
  },
  night_owl: {
    id: 'night_owl',
    layer: 'ui',
    venue: 'self',
    actSec: 4.0,
    zhName: '夜猫子',
    enName: 'Night Owl',
    zhDesc: '读取本机真实时钟：清晨 6–11 点犯困打哈欠，凌晨 0–4 点精神百倍吐槽熬夜的你。',
    enDesc: 'Reads your real local clock: yawns from 6–11 AM and perks up after midnight to roast your late-night coding.',
    linesZh: [
      '白天是给勇者那种早起怪胎准备的…再睡五分钟…',
      '都几点了还不睡？…哦，你不也在熬夜敲代码吗？',
      '午夜三点的深渊咖啡最香了，老板来一杯不？',
    ],
    linesEn: [
      'Mornings are for morning-person heroes… five more minutes…',
      'Still awake at this hour? …Oh, you’re coding late too, huh?',
      '3 AM Abyssal espresso hits different. Want a mug, Boss?',
    ],
  },
};

export const QUIRK_WEIGHTS: Record<AbyssalSpeciesId, Partial<Record<QuirkId, number>>> = {
  imp: { chronic_slacker: 4, ocd_hoarder: 4, food_critic: 3, dungeon_gossip: 2 },
  slime_girl: { masochist: 5, food_critic: 3, stockholm_heart: 2 },
  skeleton_blademaid: { neat_freak: 4, narcissist: 4, chuunibyou: 3 },
  imp_witch: { chronic_slacker: 4, pedantic_bookworm: 4, chuunibyou: 3 },
  hellforge_smith: { mad_tinkerer: 5, pyromaniac: 4, ocd_hoarder: 2 },
  bat_scout: { dungeon_gossip: 5, night_owl: 5, chronic_slacker: 2 },
  gargoyle_warden: { neat_freak: 6, ocd_hoarder: 3, food_critic: 2 },
  medusa_archer: { sadist: 5, narcissist: 3, night_owl: 2 },
  crimson_succubus: { sadist: 5, dungeon_gossip: 4, narcissist: 3 },
  necro_cantor: { pedantic_bookworm: 5, chuunibyou: 4, night_owl: 3 },
  obsidian_dragonmaid: { food_critic: 5, narcissist: 3, pyromaniac: 3 },
  arachne_weaver: { mad_tinkerer: 5, sadist: 4, neat_freak: 2 },
  phantom_dancer: { narcissist: 5, chronic_slacker: 3, night_owl: 4 },
  alchemist_belle: { pyromaniac: 5, mad_tinkerer: 4, ocd_hoarder: 4 },
  fallen_paladin: { masochist: 5, stockholm_heart: 4, neat_freak: 2 },
  corrupted_sister: { sadist: 4, stockholm_heart: 5, dungeon_gossip: 3 },
  abyssal_ranger: { narcissist: 4, night_owl: 4, stockholm_heart: 3 },
  shadow_phantom_thief: { ocd_hoarder: 5, dungeon_gossip: 4, chronic_slacker: 3 },
  eclipse_archmage: { pedantic_bookworm: 5, chuunibyou: 5, narcissist: 3 },
  dread_dragon_knight: { pyromaniac: 4, food_critic: 4, stockholm_heart: 3 },
};

/** Pure deterministic quirk derivation from (seed, unit.id, species) — zero save migration needed! */
export function deriveQuirk(seed: number, unitId: string, species: AbyssalSpeciesId): QuirkId {
  const weights = QUIRK_WEIGHTS[species];
  const entries = Object.entries(weights) as Array<[QuirkId, number]>;
  if (entries.length === 0) return 'chronic_slacker';
  let total = 0;
  for (const [, w] of entries) total += w;
  let roll = hash32(seed, unitId, 'quirk') % total;
  for (const [q, w] of entries) {
    if (roll < w) return q;
    roll -= w;
  }
  return entries[0]![0];
}

export interface CpPairDef {
  id: string;
  speciesA: AbyssalSpeciesId;
  speciesB: AbyssalSpeciesId | 'prisoner:holy_knight';
  /** Optional flavor will hit on prisoner:holy_knight */
  prisonerWillDropRatio?: number;
  lines: ReadonlyArray<{
    speaker: 'A' | 'B';
    zh: string;
    en: string;
  }>;
}

export const CP_PAIRS: readonly CpPairDef[] = [
  {
    id: 'slime_vs_gargoyle',
    speciesA: 'gargoyle_warden',
    speciesB: 'slime_girl',
    lines: [
      {
        speaker: 'A',
        zh: '第 47 滩粘液了！你走路能不能用飘的？！',
        en: 'Puddle #47! Can’t you float instead of oozing everywhere?!',
      },
      {
        speaker: 'B',
        zh: '噗叽…人家本来就是液体诶~',
        en: 'Squish… I’m literally made of liquid~',
      },
    ],
  },
  {
    id: 'succubus_vs_masochist',
    speciesA: 'crimson_succubus',
    speciesB: 'slime_girl',
    lines: [
      {
        speaker: 'A',
        zh: '哭吧，大声向本执事求饶吧！',
        en: 'Cry for me! Beg for mercy right now!',
      },
      {
        speaker: 'B',
        zh: '再扇重点♥ 好有弹性呀~',
        en: 'Slap harder♥ That bounce feels amazing~',
      },
      {
        speaker: 'A',
        zh: '……下一位，你笑那么开心我很没成就感啊！',
        en: '…Next! You’re smiling so much it ruins the mood!',
      },
    ],
  },
  {
    id: 'imp_vs_thief',
    speciesA: 'imp',
    speciesB: 'shadow_phantom_thief',
    lines: [
      {
        speaker: 'A',
        zh: '喂！刚入职就往金库摸，手往哪放呢？！',
        en: 'Hey! Eyes off the gold pile—where’s that hand going?!',
      },
      {
        speaker: 'B',
        zh: '本小姐早改正归邪了！……纯属职业肌肉记忆~',
        en: 'I’m properly villainous now! …Pure professional muscle memory~',
      },
    ],
  },
  {
    id: 'cantor_vs_scout',
    speciesA: 'bat_scout',
    speciesB: 'necro_cantor',
    lines: [
      {
        speaker: 'A',
        zh: '大八卦！听说刑讯室昨天——',
        en: 'Huge gossip! Heard in the Torture Chamber yesterday—',
      },
      {
        speaker: 'B',
        zh: '书库禁声。滚出去。',
        en: 'Silence in the Library. Out.',
      },
    ],
  },
  {
    id: 'paladin_faith_shatter',
    speciesA: 'fallen_paladin',
    speciesB: 'prisoner:holy_knight',
    prisonerWillDropRatio: 0.15,
    lines: [
      {
        speaker: 'B',
        zh: '团长？！您怎么穿成暗影铠甲了？！',
        en: 'Captain?! Why are you wearing Abyssal plate armor?!',
      },
      {
        speaker: 'A',
        zh: '那种虚伪头衔早扔了——叫我暗影女武神。顺便一提，三点有布丁。',
        en: 'Tossed that hollow title ages ago—call me Shadow Valkyrie. Also, pudding is at three.',
      },
    ],
  },
];
