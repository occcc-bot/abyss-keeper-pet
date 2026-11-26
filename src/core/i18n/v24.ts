import { hash32 } from '../hash';
import type { ChronicleKey, GrudgeTag, PrisonerStance, QuirkId } from '../types';
import { QUIRK_DEFS } from '../data/quirks';
import { getLocale } from '../i18n';

export function locQuirk(id: QuirkId): { name: string; desc: string; lines: readonly string[] } {
  const def = QUIRK_DEFS[id];
  if (getLocale() === 'en') {
    return { name: def.enName, desc: def.enDesc, lines: def.linesEn };
  }
  return { name: def.zhName, desc: def.zhDesc, lines: def.linesZh };
}

export function locStance(stance: PrisonerStance): { label: string; color: string } {
  const en = getLocale() === 'en';
  switch (stance) {
    case 'resist':
      return { label: en ? 'Holy Defiance' : '圣光抵抗', color: '#8ad8ff' };
    case 'waver':
      return { label: en ? 'Wavering' : '羞愤动摇', color: '#f2c655' };
    case 'broken':
      return { label: en ? 'Broken (HR)' : '彻底破防', color: '#f05674' };
    case 'dessert':
      return { label: en ? 'Dessert Hooked' : '甜品依赖', color: '#ffb347' };
  }
}

export function locNemesisGrudgeLine(grudge: GrudgeTag): string {
  const en = getLocale() === 'en';
  switch (grudge) {
    case 'dessert':
      return en
        ? '"You fed me pudding for seven days! My plate armor went up a size!"'
        : '「你喂了我七天焦糖布丁！我的板甲腰围都紧了一圈！！」';
    case 'electric_chair':
      return en
        ? '"I had nightmares about that Electric Chair for three months!"'
        : '「那把高压电椅我做了三个月噩梦！今天新账旧账一起算！」';
    case 'feather_tickler':
      return en
        ? '"My ribs still hurt from laughing! I am NOT getting tickled again!"'
        : '「上次笑得肋骨疼了一礼拜！休想再拿羽毛碰我！」';
    case 'brainwash_gramophone':
      return en
        ? '"Get that Abyssal Benefits jingle out of my head RIGHT NOW!!"'
        : '「把那首《深渊五险一金》洗脑歌从我脑子里清出去！！」';
    case 'truth_spotlight':
      return en
        ? '"You leaked my secret stash to the whole Cathedral! Unforgivable!"'
        : '「你把我的私房钱账本全念给全圣堂听了！不可原谅！」';
    case 'hell_dessert_table':
      return en
        ? '"I swear I only came back for vengeance—NOT for the lava cake!"'
        : '「我发誓回来是为了复仇——绝对不是惦记你们的熔岩蛋糕！」';
    default:
      return en
        ? '"Back from the Abyss! You won’t lock me up a second time!"'
        : '「从深渊归来者驾到！休想再把本小姐关进铁笼！」';
  }
}

export interface GazetteHeadline {
  tag: string;
  text: string;
}

export interface GazetteInput {
  before: Partial<Record<ChronicleKey, number>>;
  after: Partial<Record<ChronicleKey, number>>;
  slackerNaps?: number;
  elapsedSec?: number;
  seed?: number;
}

/**
 * Pure deterministic composer for 《深渊八卦小报 / The Abyss Gazette》.
 * Reads only integer chronicle deltas + UI-side nap count (never relies on truncated vfxQueue).
 */
export function composeGazette(input: GazetteInput): GazetteHeadline[] {
  const en = getLocale() === 'en';
  const diff = (k: ChronicleKey): number =>
    Math.max(0, (input.after[k] ?? 0) - (input.before[k] ?? 0));

  const candidates: Array<{ priority: number; tag: string; text: string }> = [];

  const twinSuites = diff('twinSuites');
  if (twinSuites > 0) {
    candidates.push({
      priority: 100,
      tag: en ? 'FRONT PAGE' : '头版奇闻',
      text: en
        ? `A broken captive kicked her rescuer straight into the Twin Suite (${twinSuites}x). Roommate chemistry: awkward.`
        : `破防俘虏反手举报并踹晕救援队友，喜提囚笼双人间（${twinSuites} 次），牢内气氛略显尴尬。`,
    });
  }

  const obits = diff('obituaries');
  if (obits > 0) {
    candidates.push({
      priority: 95,
      tag: en ? 'HR INCIDENT' : '工伤简报',
      text: en
        ? `Extreme Voltage claimed ${obits} stubborn heroine(s). Senior Ghost Tutor & Martyr Bounty now active.`
        : `极限电椅累计签发 ${obits} 份《深渊工伤讣告》：怨灵助教与殉道双倍赏金已就位。`,
    });
  }

  const perfects = diff('perfectFinishes');
  if (perfects > 0) {
    candidates.push({
      priority: 90,
      tag: en ? 'MASTERWORK' : '压线神操',
      text: en
        ? `Scored ${perfects} Clean Finish(es) at ≤10% HP—one more volt and HR would’ve owed an obituary!`
        : `完成 ${perfects} 次 ≤10% HP 压线「完美收口」，再多一伏特就得写讣告了！`,
    });
  }

  const raids = diff('raids');
  const escapes = diff('escapes');
  if (raids > 0) {
    candidates.push({
      priority: 85,
      tag: en ? 'CELLBLOCK' : '前线钓鱼',
      text: en
        ? `Prison weathered ${raids} jailbreak attempt(s) (${escapes} slipped into Nemesis Pool, zero wasted Will).`
        : `深渊囚笼共上演 ${raids} 场劫狱大戏（逃脱 ${escapes} 人已入宿敌池，腐化进度零浪费）。`,
    });
  }

  const conversions = diff('conversions');
  if (conversions > 0) {
    candidates.push({
      priority: 80,
      tag: en ? 'RECRUITMENT' : '深渊扩编',
      text: en
        ? `${conversions} Cathedral elite(s) signed our Abyssal employment contract. Afternoon tea budget stretched.`
        : `新收编 ${conversions} 名圣堂精锐改投深渊麾下，下午茶焦糖布丁采购量紧急上调。`,
    });
  }

  const thieves = diff('thievesCaught');
  if (thieves > 0) {
    candidates.push({
      priority: 75,
      tag: en ? 'VAULT WATCH' : '防贼通报',
      text: en
        ? `Backyard security intercepted ${thieves} vault burglar(s) and shook loose double ransom.`
        : `后院安保累计截杀 ${thieves} 名潜行偷金贼，双倍赃款已悉数充公。`,
    });
  }

  const slime = diff('slimeMopped');
  if (slime > 0) {
    candidates.push({
      priority: 65,
      tag: en ? 'SANITATION' : '卫生通报',
      text: en
        ? `Obsidian Gargoyle mopped ${slime} more emerald ooze puddle(s) and filed an HR transfer request.`
        : `曜石石像鬼又擦除 ${slime} 滩翡翠粘液，已向王座递交第 8 份工伤调岗申请。`,
    });
  }

  const naps = input.slackerNaps ?? 0;
  if (naps > 0) {
    const mins = Math.max(1, Math.round((input.elapsedSec ?? 900) / 60));
    candidates.push({
      priority: 60,
      tag: en ? 'OVERSEER MEMO' : '督战内参',
      text: en
        ? `While you coded for ${mins}m, castle slackers performed "tactical meditation" (naps) ${naps} time(s).`
        : `趁您专心干正事的 ${mins} 分钟里，摸鱼眷属共计进行「战术冥想（打盹）」${naps} 次。`,
    });
  }

  const quirks = diff('quirksRevealed');
  if (quirks > 0) {
    candidates.push({
      priority: 55,
      tag: en ? 'DOSSIER' : '怪癖目击',
      text: en
        ? `Witnessed ${quirks} new retainer quirk(s) in the wild—Grimoire dossiers updated.`
        : `现场目击并解锁 ${quirks} 项眷属隐藏怪癖，圣典档案已同步入库。`,
    });
  }

  candidates.sort((a, b) => b.priority - a.priority);
  const picked = candidates.slice(0, 3).map(({ tag, text }) => ({ tag, text }));

  // Deterministic flavor filler if fewer than 2 headlines
  const fillers: GazetteHeadline[] = en
    ? [
        {
          tag: 'CANTEEN',
          text: 'Hatchery chickens filed a formal complaint about Food Critic retainers rating them 3.5 stars.',
        },
        {
          tag: 'FINANCE',
          text: 'Toiling Imps petitioned for overtime pay. Throne response: "Rewarded with bonus overtime."',
        },
        {
          tag: 'WEATHER',
          text: 'Corridor forecast: 90% chance of Rolling Boulders with scattered Cathedral helmets.',
        },
      ]
    : [
        {
          tag: '食堂速报',
          text: '孵化场肥鸡集体抗议美食评委只给三星半，声称自己肉质完全对得起米其林标准。',
        },
        {
          tag: '财务内参',
          text: '苦工小鬼联名询问有没有加班费，王座批复：「有，奖励双倍加班时长。」',
        },
        {
          tag: '走廊气象',
          text: '前线长廊今日晴转滚石，局部伴随圣堂骑士头盔碎裂与暗金金币阵雨。',
        },
      ];

  let idx = hash32(input.seed ?? 1337, Math.round(input.elapsedSec ?? 0), 'gazette') % fillers.length;
  while (picked.length < 2) {
    const f = fillers[idx % fillers.length]!;
    if (!picked.some((p) => p.tag === f.tag)) picked.push(f);
    idx += 1;
  }

  return picked;
}

export const V24_UI_BANTER_LINES = {
  slackerWakeZh: (n: number) =>
    n > 1 ? `老板好！正在全力挖矿！×${n}` : '老板好！正在全力挖矿！（擦口水）',
  slackerWakeEn: (n: number) =>
    n > 1 ? `Hello Boss! Mining hard! ×${n}` : 'Hello Boss! Mining at full speed!',
  slackerSlapZh: '刚才那叫战术冥想！绝对不是在打盹！',
  slackerSlapEn: 'That was tactical meditation! Definitely NOT a nap!',
  nightOwlMorningZh: '白天是给勇者那种早起怪胎准备的…再睡五分钟…',
  nightOwlMorningEn: 'Mornings are for early-bird heroes… five more minutes…',
  nightOwlMidnightZh: '都几点了还不睡？…哦，你不也在熬夜敲代码吗？',
  nightOwlMidnightEn: 'Still up at this hour? …Oh, you’re coding late too, huh?',
  pastLifeImpZh: '嘶……老板，咱俩上辈子是不是也在任务栏底下搭过违建？',
  pastLifeImpEn: 'Wait… Boss, did we build an illegal dungeon under this taskbar in a past life too?',
  pastLifeKnightZh: '奇怪，这条走廊的滚石黑油味……怎么这么眼熟？',
  pastLifeKnightEn: 'Strange… why does the boulder grease in this corridor smell so familiar?',
} as const;
