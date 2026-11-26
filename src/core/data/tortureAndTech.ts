import type { TechId, TortureImplementId } from '../types';

export interface TortureImplementDef {
  id: TortureImplementId;
  name: string;
  subtitle: string;
  unlockCostGold: number;
  speedMult: number;
  manaCostMult: number;
  aoeAllPrisoners: boolean;
  goldPerSec: number;
  bonusHappinessOnConvert: number;
  propKey: string;
  accentColor: number;
  gagLines: string[];
}

export const TORTURE_IMPLEMENTS: Record<TortureImplementId, TortureImplementDef> = {
  electric_chair: {
    id: 'electric_chair',
    name: '高压雷击电椅',
    subtitle: '招牌真言器 · 极速瓦解意志',
    unlockCostGold: 0,
    speedMult: 1.65,
    manaCostMult: 1.0,
    aoeAllPrisoners: false,
    goldPerSec: 0,
    bonusHappinessOnConvert: 0,
    propKey: 'electric_chair',
    accentColor: 0x6ce5ff,
    gagLines: [
      '我什么都不会告诉你的！！（吴京脸）',
      '休想让我屈服——滋滋滋——别电发型啊！！',
      '圣堂给我的加班费根本不够买护发素啊！！',
      '电流太麻了…等等，你们魔王城有防脱洗发水吗？',
    ],
  },
  feather_tickler: {
    id: 'feather_tickler',
    name: '自动羽毛挠痒机',
    subtitle: '零伤害高愉悦 · 笑到签卖身契',
    unlockCostGold: 320,
    speedMult: 1.45,
    manaCostMult: 0.75,
    aoeAllPrisoners: false,
    goldPerSec: 0,
    bonusHappinessOnConvert: 25,
    propKey: 'feather_tickler',
    accentColor: 0xff8ec8,
    gagLines: [
      '哈哈哈哈停下！圣殿骑士的尊严——哈哈哈哈救命！',
      '别挠脚心！呜哈哈哈哈我投降我签字还不行吗！',
      '这比圣堂早课折磨一百倍啊哈哈哈哈！',
    ],
  },
  brainwash_gramophone: {
    id: 'brainwash_gramophone',
    name: '洗脑魔音留声机',
    subtitle: '群体范围侵蚀 · 24h 循环职场洗脑',
    unlockCostGold: 580,
    speedMult: 1.25,
    manaCostMult: 0.85,
    aoeAllPrisoners: true,
    goldPerSec: 0,
    bonusHappinessOnConvert: 10,
    propKey: 'brainwash_gramophone',
    accentColor: 0xb982ff,
    gagLines: [
      '别念了别念了！你们真包五险一金还双休？我跳槽！',
      '这首歌怎么听两遍就会唱了…魔王大人万岁？不对！',
      '圣堂天天画大饼，不如来魔王城领全勤奖！',
    ],
  },
  hell_dessert_table: {
    id: 'hell_dessert_table',
    name: '地狱甜品诱惑桌',
    subtitle: '零耗魔 · 极速瓦解吃货意志',
    unlockCostGold: 900,
    speedMult: 1.85,
    manaCostMult: 0.0,
    aoeAllPrisoners: false,
    goldPerSec: 0,
    bonusHappinessOnConvert: 30,
    propKey: 'hell_dessert_table',
    accentColor: 0xffb347,
    gagLines: [
      '咕噜…熔岩蛋糕配烤鸡？我才不吃魔族的糖衣炮弹！（疯狂偷瞄）',
      '就吃一口…嗯？！这比教会黑面包好吃一万倍！',
      '只要管饱下午茶，圣光什么的先放一放吧…',
    ],
  },
  truth_spotlight: {
    id: 'truth_spotlight',
    name: '圣光真言聚光灯',
    subtitle: '审讯创收 · 边转化边拷问宝藏情报',
    unlockCostGold: 1400,
    speedMult: 1.55,
    manaCostMult: 0.9,
    aoeAllPrisoners: false,
    goldPerSec: 3.5,
    bonusHappinessOnConvert: 5,
    propKey: 'truth_spotlight',
    accentColor: 0xffe985,
    gagLines: [
      '别拿强光怼脸了！我招还不行吗——主教私藏的禁书漫画全塞在告解室地板底下！',
      '灯太亮了睁不开眼！我说！教会私房钱埋在东门石碑下！',
      '别照了！圣堂骑士团的财务报表确实少写了个零！',
    ],
  },
};

export const TORTURE_IMPLEMENT_LIST: readonly TortureImplementId[] = [
  'electric_chair',
  'feather_tickler',
  'brainwash_gramophone',
  'hell_dessert_table',
  'truth_spotlight',
];

export interface TechDef {
  id: TechId;
  name: string;
  maxLevel: number;
  baseShardCost: number;
  costGrowth: number;
  effectPerLevel: string;
}

export const ABYSS_TECH_TREE: readonly TechDef[] = [
  {
    id: 'abyssal_might',
    name: '深渊战意铭文',
    maxLevel: 20,
    baseShardCost: 8,
    costGrowth: 1.42,
    effectPerLevel: '全军生命与攻击力永久 +12% / 级',
  },
  {
    id: 'golden_greed',
    name: '暗金贪婪律令',
    maxLevel: 15,
    baseShardCost: 10,
    costGrowth: 1.45,
    effectPerLevel: '战利品、矿脉与宝库收益永久 +15% / 级',
  },
  {
    id: 'overlord_crown',
    name: '魔王冠冕共鸣',
    maxLevel: 10,
    baseShardCost: 14,
    costGrowth: 1.55,
    effectPerLevel: '魔王属性 +18% 且战斗人口上限 +1 / 级',
  },
  {
    id: 'trap_engineering',
    name: '牛蛙机关精密学',
    maxLevel: 15,
    baseShardCost: 10,
    costGrowth: 1.45,
    effectPerLevel: '全陷阱伤害 +18%、工坊零件产出 +15% / 级',
  },
  {
    id: 'arcane_well',
    name: '永动魔力源井',
    maxLevel: 15,
    baseShardCost: 10,
    costGrowth: 1.45,
    effectPerLevel: '魔力回复与魔王技能威力 +15% / 级',
  },
  {
    id: 'torture_mastery',
    name: '暗夜审讯宗师',
    maxLevel: 10,
    baseShardCost: 12,
    costGrowth: 1.5,
    effectPerLevel: '俘虏转化速度 +22%、捕获率 +2% / 级',
  },
  {
    id: 'deep_excavation',
    name: '深层秘银钻探术',
    maxLevel: 6,
    baseShardCost: 15,
    costGrowth: 1.6,
    effectPerLevel: '开局多预挖 1 格前线走廊且深层矿脉爆率 +25% / 级',
  },
  {
    id: 'offline_chronicle',
    name: '永恒挂机沙漏',
    maxLevel: 6,
    baseShardCost: 16,
    costGrowth: 1.65,
    effectPerLevel: '离线挂机上限 +2 小时（最高 24h）且离线效率 +10% / 级',
  },
  {
    id: 'auto_slap_aura',
    name: '自动威压督战环',
    maxLevel: 5,
    baseShardCost: 18,
    costGrowth: 1.6,
    effectPerLevel: '周期性自动给予随机眷属狂暴督战增益 / 级',
  },
  {
    id: 'rare_trait_boost',
    name: '血脉词条觉醒',
    maxLevel: 5,
    baseShardCost: 14,
    costGrowth: 1.6,
    effectPerLevel: '招募与融合时觉醒额外稀有词条概率 +17% / 级',
  },
];

export interface TutorialStepDef {
  step: number;
  title: string;
  hint: string;
  rewardGold: number;
  rewardParts: number;
}

export const TUTORIAL_STEPS: readonly TutorialStepDef[] = [
  {
    step: 0,
    title: '① 圈地挖矿搞违建',
    hint: '点开右侧闪烁的【深层矿脉岩层】，把摸鱼的苦工小鬼赶去抡镐搬金，把咱们的桌底违建越扩越大！',
    rewardGold: 120,
    rewardParts: 8,
  },
  {
    step: 1,
    title: '② 右键巡视本王疆土',
    hint: '按住【鼠标右键左右拖动】（或滚轮）横扫 28 格地下城——左边后院藏钱，右边走廊留给勇者送人头！',
    rewardGold: 100,
    rewardParts: 6,
  },
  {
    step: 2,
    title: '③ 物理督战：扇巴掌加速',
    hint: '看见磨洋工的手下了吗？【右键短按】赏她一记清脆耳光——深渊不兴画大饼，物理督战直接狂暴 30 秒！',
    rewardGold: 110,
    rewardParts: 6,
  },
  {
    step: 3,
    title: '④ 拎后颈精准投放',
    hint: '【左键按住拖起】把不听话的眷属像拎猫一样甩进训练室或前线走廊——记住，这才是魔王的管理美学！',
    rewardGold: 130,
    rewardParts: 8,
  },
  {
    step: 4,
    title: '⑤ 强化至高魔王威严',
    hint: '点【王座】或左上角魔王头像，狠砸金币点击【强化魔王等级】升至 Lv.2，让圣堂杂兵见你就腿软！',
    rewardGold: 160,
    rewardParts: 10,
  },
  {
    step: 5,
    title: '⑥ 铺设牛蛙经典陷阱街',
    hint: '打开【造物修建】或点前线走廊，装上滚石巨砾或黑铁尖刺——看正道勇者排队踩机关最解压了！',
    rewardGold: 180,
    rewardParts: 12,
  },
  {
    step: 6,
    title: '⑦ 建造刑讯室迎贵客',
    hint: '在后院修起【魅魔刑讯室】并配上【深渊囚笼】，把落网的圣堂精英绑上电椅，手把手教她们改正归邪！',
    rewardGold: 260,
    rewardParts: 16,
  },
];

// Mixed idle daily banter lines (pure Bullfrog villain workplace dark humor)
export const IDLE_BANTER_LINES: readonly string[] = [
  '上面的凡人又在假装敲代码了，眼珠子早往咱们地牢瞟八百回了吧？',
  '听说圣堂那边单休还没下午茶，幸好我在魔王城领全勤奖~',
  '这批鸡好瘦，孵化场是不是偷偷吃回扣克扣饲料了？',
  '嘘——上次那个潜行女飞贼刚摸进宝库，就被魔王直接拎去喂滚石了…',
  '挖了三天暗金矿，发薪日还是三个铜板，深渊劳动仲裁在哪？',
  '老板，深渊有加班费吗？——「有，奖励你双倍加班时长。」',
  '喂，上面交电费的房东别猝死了，你倒了谁给魔王城续电费开电椅？',
  '这届圣堂勇者怎么战吼都像复制粘贴的，连台词本都不换一版？',
  '听说刑讯室高压电椅新换了绝缘坐垫，隔壁修女都快笑场了…',
  '嘘！人类老板巡街警报！速按右下角【魔心徽章】装死，本王替你打掩护！',
  '深处岩层埋着秘银和古代圣物箱，快扇两下小鬼让她们往右挖！',
  '为什么挨了魔王一巴掌干活反而变快了？难道这就是物理 KPI 的魔力？',
];
