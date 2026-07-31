// Reference glossary — common terms from Chinese wuxia/xianxia novels and
// Korean web novels.  Sourced from Immortal Mountain and WuxiaWorld glossaries.
// These entries are available globally (across all books) and are injected into
// every translation context so the AI always knows genre-standard terminology.

export interface RefGlossaryEntry {
  term: string;
  translation: string;
  category: "character" | "location" | "word" | "slang";
  gender: "F" | "M" | "N" | null;
  notes: string;
}

// ── Chinese: Wuxia / Xianxia / Xuanhuan Terms ─────────────────────────

const WUXIA_TERMS: RefGlossaryEntry[] = [
  // Cultivation ranks
  { term: "练气", translation: "Qi Condensation", category: "word", gender: null, notes: "First cultivation stage — gathering qi in the dantian" },
  { term: "筑基", translation: "Foundation Establishment", category: "word", gender: null, notes: "Second cultivation stage — solidifying the spiritual foundation" },
  { term: "金丹", translation: "Core Formation", category: "word", gender: null, notes: "Third cultivation stage — forming a golden core in the dantian" },
  { term: "元婴", translation: "Nascent Soul", category: "word", gender: null, notes: "Fourth cultivation stage — birthing a miniature spiritual body" },
  { term: "化神", translation: "Spirit Severing / Deity Transformation", category: "word", gender: null, notes: "Fifth cultivation stage" },
  { term: "炼虚", translation: "Void Refining", category: "word", gender: null, notes: "Sixth cultivation stage" },
  { term: "合体", translation: "Body Integration", category: "word", gender: null, notes: "Seventh cultivation stage" },
  { term: "大乘", translation: "Mahayana", category: "word", gender: null, notes: "Eighth cultivation stage" },
  { term: "渡劫", translation: "Tribulation Transcendence", category: "word", gender: null, notes: "Crossing heavenly tribulation to ascend" },
  { term: "飞升", translation: "Ascension", category: "word", gender: null, notes: "Ascending to a higher realm after tribulation" },

  // Core concepts
  { term: "内力", translation: "Internal Energy", category: "word", gender: null, notes: "Inner power cultivated through martial arts training" },
  { term: "真气", translation: "True Qi", category: "word", gender: null, notes: "Refined internal energy used in advanced techniques" },
  { term: "灵气", translation: "Spiritual Energy / Spiritual Qi", category: "word", gender: null, notes: "Natural energy in the environment used for cultivation" },
  { term: "丹田", translation: "Dantian", category: "word", gender: null, notes: "Energy center below the navel where qi is stored" },
  { term: "经脉", translation: "Meridians", category: "word", gender: null, notes: "Channels through which qi flows in the body" },
  { term: "气海", translation: "Qi Sea", category: "word", gender: null, notes: "The ocean of qi within the dantian" },
  { term: "神识", translation: "Divine Sense / Spiritual Consciousness", category: "word", gender: null, notes: "A cultivator's ability to perceive surroundings with the mind" },
  { term: "神念", translation: "Divine Intent", category: "word", gender: null, notes: "Projected spiritual consciousness for scanning or attacking" },
  { term: "悟道", translation: "Enlightenment / Comprehending the Dao", category: "word", gender: null, notes: "Sudden understanding of a natural law or cultivation principle" },
  { term: "心魔", translation: "Heart Demon / Inner Demon", category: "word", gender: null, notes: "Psychological barrier or negative emotion that hinders cultivation" },
  { term: "天劫", translation: "Heavenly Tribulation", category: "word", gender: null, notes: "Lightning strikes from heaven to test advancing cultivators" },
  { term: "天道", translation: "Heavenly Dao / Way of Heaven", category: "word", gender: null, notes: "The natural law governing the universe" },
  { term: "大道", translation: "Great Dao", category: "word", gender: null, notes: "The supreme underlying principle of all existence" },
  { term: "造化", translation: "Creation / Fortune", category: "word", gender: null, notes: "Heavenly fortune or miraculous opportunity" },
  { term: "机缘", translation: "Serendipity / Opportunity", category: "word", gender: null, notes: "A fateful encounter or lucky chance, often for cultivation breakthroughs" },
  { term: "秘境", translation: "Secret Realm", category: "location", gender: null, notes: "Hidden dimension or pocket world containing treasures" },
  { term: "遗迹", translation: "Ruins / Ancient Ruins", category: "location", gender: null, notes: "Remnants of ancient civilizations containing valuable inheritances" },
  { term: "禁地", translation: "Forbidden Ground", category: "location", gender: null, notes: "Extremely dangerous area restricted by sects or nations" },

  // Martial arts
  { term: "轻功", translation: "Qinggong / Light Body Technique", category: "word", gender: null, notes: "Martial art of leaping and moving at extreme speeds" },
  { term: "剑法", translation: "Sword Technique", category: "word", gender: null, notes: "Methods and forms of sword combat" },
  { term: "剑意", translation: "Sword Intent", category: "word", gender: null, notes: "The conceptual willpower infused into sword strikes" },
  { term: "拳法", translation: "Fist Technique", category: "word", gender: null, notes: "Hand-to-hand combat methods" },
  { term: "掌法", translation: "Palm Technique", category: "word", gender: null, notes: "Palm strike combat methods" },
  { term: "身法", translation: "Movement Technique", category: "word", gender: null, notes: "Evasion and positioning martial arts" },
  { term: "暗器", translation: "Hidden Weapon", category: "word", gender: null, notes: "Concealed projectile weapons (needles, darts, etc.)" },
  { term: "点穴", translation: "Acupoint Strikes / Pressure Point Technique", category: "word", gender: null, notes: "Striking pressure points to paralyze or kill" },
  { term: "绝招", translation: "Ultimate Technique / Finishing Move", category: "word", gender: null, notes: "A fighter's strongest or signature move" },
  { term: "功法", translation: "Cultivation Technique / Cultivation Manual", category: "word", gender: null, notes: "A method or scripture for cultivating qi and advancing in power" },
  { term: "心法", translation: "Mental Cultivation Method", category: "word", gender: null, notes: "Inner cultivation technique focused on the mind and spirit" },
  { term: "秘法", translation: "Secret Art", category: "word", gender: null, notes: "Rare or forbidden technique passed down through generations" },
  { term: "阵法", translation: "Formation / Array", category: "word", gender: null, notes: "Magical arrangement of energy for attack, defense, or utility" },
  { term: "结界", translation: "Barrier / Domain", category: "word", gender: null, notes: "Magical boundary or protective shield" },

  // Hierarchy & titles
  { term: "宗主", translation: "Sect Master", category: "character", gender: "M", notes: "Head of a cultivation sect" },
  { term: "宗门", translation: "Sect", category: "location", gender: null, notes: "An organization of cultivators" },
  { term: "掌门", translation: "Sect Leader", category: "character", gender: null, notes: "Leader of a martial arts sect" },
  { term: "长老", translation: "Elder", category: "character", gender: null, notes: "Senior member of a sect with authority" },
  { term: "太上长老", translation: "Grand Elder / Supreme Elder", category: "character", gender: null, notes: "The most senior elder, often retired from leadership" },
  { term: "师兄", translation: "Senior Brother (Martial)", category: "character", gender: "M", notes: "Older male fellow disciple" },
  { term: "师姐", translation: "Senior Sister (Martial)", category: "character", gender: "F", notes: "Older female fellow disciple" },
  { term: "师弟", translation: "Junior Brother (Martial)", category: "character", gender: "M", notes: "Younger male fellow disciple" },
  { term: "师妹", translation: "Junior Sister (Martial)", category: "character", gender: "F", notes: "Younger female fellow disciple" },
  { term: "师父", translation: "Master / Teacher", category: "character", gender: null, notes: "One's martial arts or cultivation teacher" },
  { term: "弟子", translation: "Disciple", category: "character", gender: null, notes: "A student or follower of a master or sect" },
  { term: "门主", translation: "Gate Master / Sect Head", category: "character", gender: null, notes: "Leader of a smaller martial arts school" },
  { term: "教主", translation: "Cult Leader / Holy Master", category: "character", gender: null, notes: "Leader of a religious or dark cult organization" },
  { term: "盟主", translation: "Alliance Leader", category: "character", gender: null, notes: "Leader of a coalition of sects or clans" },
  { term: "家主", translation: "Patriarch / Family Head", category: "character", gender: "M", notes: "Head of a cultivation family or clan" },
  { term: "老祖", translation: "Old Ancestor / Patriarch", category: "character", gender: null, notes: "The oldest and most powerful ancestor of a clan" },
  { term: "散修", translation: "Rogue Cultivator / Itinerant Cultivator", category: "character", gender: null, notes: "A cultivator without a sect affiliation" },
  { term: "天才", translation: "Genius / Prodigy", category: "character", gender: null, notes: "Someone with exceptional cultivation talent" },
  { term: "废物", translation: "Trash / Waste", category: "slang", gender: null, notes: "Derogatory term for someone with no cultivation talent" },

  // Items & treasures
  { term: "灵石", translation: "Spirit Stones", category: "word", gender: null, notes: "Crystallized spiritual energy used as currency and cultivation resource" },
  { term: "灵药", translation: "Spirit Herbs / Spirit Medicines", category: "word", gender: null, notes: "Medicinal plants with spiritual properties" },
  { term: "丹药", translation: "Pills / Medicinal Pills", category: "word", gender: null, notes: "Refined pills for cultivation, healing, or enhancement" },
  { term: "法器", translation: "Magical Artifact / Spirit Tool", category: "word", gender: null, notes: "Enchanted weapon or tool imbued with spiritual energy" },
  { term: "法宝", translation: "Magical Treasure", category: "word", gender: null, notes: "High-grade magical artifact of great power" },
  { term: "灵宝", translation: "Spirit Treasure", category: "word", gender: null, notes: "An extremely rare and powerful treasure" },
  { term: "仙器", translation: "Immortal Artifact", category: "word", gender: null, notes: "Artifact of immortal-grade power" },
  { term: "戒指", translation: "Storage Ring / Space Ring", category: "word", gender: null, notes: "Ring with a pocket dimension for storing items" },
  { term: "储物袋", translation: "Storage Pouch", category: "word", gender: null, notes: "Bag with spatial expansion for carrying items" },
  { term: "玉简", translation: "Jade Slip", category: "word", gender: null, notes: "Jade tablet used to store cultivation techniques or information" },
  { term: "令牌", translation: "Command Token / Medallion", category: "word", gender: null, notes: "Identification or authority token from a sect" },
  { term: "飞剑", translation: "Flying Sword", category: "word", gender: null, notes: "A sword that can fly and be ridden as transport" },

  // Creatures & realms
  { term: "妖兽", translation: "Demon Beast / Monster Beast", category: "word", gender: null, notes: "Spiritual beasts that cultivate and gain power" },
  { term: "灵兽", translation: "Spirit Beast", category: "word", gender: null, notes: "A beast with spiritual affinity, often tamed as companions" },
  { term: "神兽", translation: "Divine Beast", category: "word", gender: null, notes: "Mythical creature of immense power (dragon, phoenix, etc.)" },
  { term: "妖", translation: "Demon / Yao", category: "word", gender: null, notes: "Non-human beings that cultivate to gain human form" },
  { term: "魔", translation: "Devil / Mo", category: "word", gender: null, notes: "Dark cultivator or demonic being" },
  { term: "仙", translation: "Immortal / Xian", category: "word", gender: null, notes: "One who has achieved immortality through cultivation" },
  { term: "凡人", translation: "Mortal", category: "word", gender: null, notes: "An ordinary person without cultivation" },
  { term: "修士", translation: "Cultivator", category: "character", gender: null, notes: "A person who practices cultivation" },
  { term: "仙人", translation: "Immortal Being", category: "character", gender: null, notes: "One who has transcended mortality" },

  // Places
  { term: "修真界", translation: "Cultivation World", category: "location", gender: null, notes: "The realm where cultivators reside" },
  { term: "仙界", translation: "Immortal Realm", category: "location", gender: null, notes: "The higher realm where immortals dwell" },
  { term: "凡界", translation: "Mortal Realm", category: "location", gender: null, notes: "The ordinary world of mortals" },
  { term: "魔界", translation: "Demon Realm", category: "location", gender: null, notes: "The realm of demons and dark cultivators" },
  { term: "冥界", translation: "Underworld / Netherworld", category: "location", gender: null, notes: "Realm of the dead" },
  { term: "洞天福地", translation: "Blessed Land / Grotto-Heaven", category: "location", gender: null, notes: "A location with extremely dense spiritual energy" },
  { term: "断魂崖", translation: "Soul Severing Cliff", category: "location", gender: null, notes: "Common trope location — dangerous cliff where people fall and gain power" },

  // Common phrases
  { term: "你找死", translation: "You're courting death!", category: "slang", gender: null, notes: "Classic antagonist threat in xianxia novels" },
  { term: "不知死活", translation: "You don't know the meaning of death", category: "slang", gender: null, notes: "Said to someone who is provoking a far stronger opponent" },
  { term: "有眼不识泰山", translation: "Having eyes but failing to recognize Mount Tai", category: "slang", gender: null, notes: "Idiom for failing to recognize someone's greatness" },
  { term: "杀鸡儆猴", translation: "Kill the chicken to scare the monkey", category: "slang", gender: null, notes: "Making an example of someone to warn others" },
  { term: "以牙还牙", translation: "A tooth for a tooth", category: "slang", gender: null, notes: "Retaliation in kind" },
  { term: "一山不容二虎", translation: "One mountain cannot house two tigers", category: "slang", gender: null, notes: "Two powerful people cannot coexist in the same domain" },
  { term: "画蛇添足", translation: "Drawing legs on a snake", category: "slang", gender: null, notes: "Doing something unnecessary that ruins the result" },
  { term: "九牛一毛", translation: "One hair from nine oxen", category: "slang", gender: null, notes: "An insignificant amount — a drop in the bucket" },
  { term: "脱胎换骨", translation: "Shedding the mortal body and exchanging the bones", category: "word", gender: null, notes: "A complete transformation, often after a breakthrough" },
  { term: "一步登天", translation: "Ascending to heaven in a single step", category: "slang", gender: null, notes: "Achieving great success instantly, often used sarcastically" },

  // Common titles and address
  { term: "前辈", translation: "Senior / Predecessor", category: "character", gender: null, notes: "Respectful address for an older or more powerful cultivator" },
  { term: "晚辈", translation: "Junior / Younger Generation", category: "character", gender: null, notes: "Self-deprecating term when addressing a senior" },
  { term: "道友", translation: "Fellow Daoist", category: "character", gender: null, notes: "Polite address between cultivators of similar rank" },
  { term: "大人", translation: "Lord / Your Excellency", category: "character", gender: null, notes: "Respectful address for someone of high status" },
  { term: "小子", translation: "Kid / Brat", category: "character", gender: "M", notes: "Condescending address for a young male" },
  { term: "丫头", translation: "Girl / Lass", category: "character", gender: "F", notes: "Familiar or condescending address for a young female" },
  { term: "老爷子", translation: "Old Master", category: "character", gender: "M", notes: "Respectful term for an elderly man" },
  { term: "大侠", translation: "Great Hero / Hero", category: "character", gender: null, notes: "Title for a righteous martial arts hero" },
  { term: "少侠", translation: "Young Hero", category: "character", gender: "M", notes: "Address for a young martial arts hero" },
  { term: "仙子", translation: "Fairy / Immortal Maiden", category: "character", gender: "F", notes: "Respectful address for a beautiful female cultivator" },
  { term: "圣女", translation: "Holy Maiden / Saintess", category: "character", gender: "F", notes: "A young woman chosen as the representative of a sect or religion" },
  { term: "老妖怪", translation: "Old Monster", category: "character", gender: null, notes: "An extremely old and powerful cultivator (informal/disrespectful)" },
];

// ── Chinese: Mythological Creatures ────────────────────────────────────

const MYTHOLOGICAL_CREATURES: RefGlossaryEntry[] = [
  { term: "龙", translation: "Dragon (Long)", category: "word", gender: null, notes: "Chinese dragon — symbol of power and imperial authority, unlike Western dragons" },
  { term: "凤凰", translation: "Phoenix (Fenghuang)", category: "word", gender: "F", notes: "Chinese phoenix — symbol of grace and virtue, associated with the empress" },
  { term: "麒麟", translation: "Qilin", category: "word", gender: null, notes: "Chimeric beast symbolizing prosperity and good fortune" },
  { term: "白虎", translation: "White Tiger", category: "word", gender: null, notes: "Guardian of the West; one of the Four Symbols" },
  { term: "玄武", translation: "Black Tortoise / Dark Warrior", category: "word", gender: null, notes: "Guardian of the North; tortoise-snake hybrid" },
  { term: "青龙", translation: "Azure Dragon", category: "word", gender: null, notes: "Guardian of the East; one of the Four Symbols" },
  { term: "朱雀", translation: "Vermilion Bird", category: "word", gender: null, notes: "Guardian of the South; one of the Four Symbols" },
  { term: "饕餮", translation: "Taotie", category: "word", gender: null, notes: "Gluttonous beast; often used to describe insatiable greed" },
  { term: "穷奇", translation: "Qiongqi", category: "word", gender: null, notes: "Winged tiger that encourages evil and punishes good" },
  { term: "梼杌", translation: "Taowu", category: "word", gender: null, notes: "Fierce beast representing stubbornness and ignorance" },
  { term: "混沌", translation: "Hundun / Chaos", category: "word", gender: null, notes: "Primordial chaos; also a faceless creature in mythology" },
  { term: "九尾狐", translation: "Nine-Tailed Fox", category: "word", gender: "F", notes: "Shape-shifting fox spirit, often a beautiful seductress" },
  { term: "狐妖", translation: "Fox Demon", category: "word", gender: "F", notes: "A fox spirit that has cultivated to take human form" },
  { term: "夜叉", translation: "Yaksha", category: "word", gender: null, notes: "Fierce supernatural being, sometimes a nature spirit" },
  { term: "罗刹", translation: "Rakshasa", category: "word", gender: null, notes: "Demon or evil spirit in Buddhist-influenced mythology" },
  { term: "判官", translation: "Judge of the Dead", category: "character", gender: "M", notes: "Underworld official who judges the souls of the dead" },
  { term: "阎王", translation: "King of Hell / Yama", category: "character", gender: "M", notes: "Ruler of the underworld in Chinese mythology" },
  { term: "牛头马面", translation: "Bull Head and Horse Face", category: "character", gender: "M", notes: "Two guardians of the underworld who capture wandering souls" },
];

// ── Chinese: Terms of Address & Family ─────────────────────────────────

const TERMS_OF_ADDRESS: RefGlossaryEntry[] = [
  { term: "老爷子", translation: "Old Master", category: "character", gender: "M", notes: "Respectful term for an elderly patriarch" },
  { term: "老夫人", translation: "Old Madam", category: "character", gender: "F", notes: "Respectful term for an elderly matriarch" },
  { term: "夫人", translation: "Madam / Lady", category: "character", gender: "F", notes: "Polite address for a married woman of status" },
  { term: "公子", translation: "Young Master", category: "character", gender: "M", notes: "Address for a young man from a noble or wealthy family" },
  { term: "小姐", translation: "Miss / Young Lady", category: "character", gender: "F", notes: "Address for a young woman from a noble family" },
  { term: "老爷", translation: "Master / Lord", category: "character", gender: "M", notes: "Address for the head of a household" },
  { term: "少爷", translation: "Young Lord", category: "character", gender: "M", notes: "Son of the household master" },
  { term: "娘娘", translation: "Imperial Consort / Empress", category: "character", gender: "F", notes: "Address for an imperial consort or the empress" },
  { term: "皇上", translation: "Your Majesty (Emperor)", category: "character", gender: "M", notes: "Direct address to the emperor" },
  { term: "陛下", translation: "Your Majesty", category: "character", gender: null, notes: "Formal address for a sovereign" },
  { term: "殿下", translation: "Your Highness", category: "character", gender: null, notes: "Address for a prince or princess" },
  { term: "爱卿", translation: "Beloved Minister", category: "character", gender: null, notes: "How the emperor addresses a favored court official" },
  { term: "草民", translation: "Humble Commoner", category: "character", gender: null, notes: "Self-deprecating term used by commoners before officials" },
  { term: "奴婢", translation: "Servant / Slave", category: "character", gender: "F", notes: "Self-deprecating term used by female servants" },
  { term: "奴才", translation: "Slave / Servant", category: "character", gender: "M", notes: "Self-deprecating term used by male servants before superiors" },
  { term: "小的", translation: "This lowly one", category: "character", gender: null, notes: "Humble self-reference used by commoners" },
];

// ── Korean: Web Novel Terms ────────────────────────────────────────────

const KOREAN_TERMS: RefGlossaryEntry[] = [
  // Honorifics & address
  { term: "형", translation: "Hyung", category: "word", gender: "M", notes: "What a younger male calls an older male (brother)" },
  { term: "오빠", translation: "Oppa", category: "word", gender: "M", notes: "What a younger female calls an older male (brother/boyfriend)" },
  { term: "누나", translation: "Nuna", category: "word", gender: "F", notes: "What a younger male calls an older female (sister)" },
  { term: "언니", translation: "Unni", category: "word", gender: "F", notes: "What a younger female calls an older female (sister)" },
  { term: "선배", translation: "Sunbae / Senior", category: "character", gender: null, notes: "A senior at school, work, or in a field" },
  { term: "후배", translation: "Hoobae / Junior", category: "character", gender: null, notes: "A junior at school, work, or in a field" },
  { term: "씨", translation: "ssi (Mr./Ms.)", category: "word", gender: null, notes: "Polite suffix attached after a name" },
  { term: "님", translation: "nim (Honorable)", category: "word", gender: null, notes: "Honorific suffix showing high respect" },
  { term: "아저씨", translation: "Ahjussi", category: "character", gender: "M", notes: "Middle-aged man; familiar term like 'uncle'" },
  { term: "아줌마", translation: "Ahjumma", category: "character", gender: "F", notes: "Middle-aged woman; familiar term like 'auntie'" },
  { term: "할아버지", translation: "Harabeoji / Grandfather", category: "character", gender: "M", notes: "Old man or paternal grandfather" },
  { term: "할머니", translation: "Halmeoni / Grandmother", category: "character", gender: "F", notes: "Old woman or paternal grandmother" },

  // Common words in web novels
  { term: "재벌", translation: "Chaebol", category: "word", gender: null, notes: "Korean family-controlled mega-corporation (Samsung, Hyundai, etc.)" },
  { term: "능력자", translation: "Ability User / Powered Individual", category: "character", gender: null, notes: "Someone with supernatural abilities in fantasy/hunter novels" },
  { term: "헌터", translation: "Hunter", category: "character", gender: null, notes: "A person who hunts monsters in dungeons (common in Korean fantasy)" },
  { term: "던전", translation: "Dungeon", category: "location", gender: null, notes: "A pocket dimension containing monsters and treasures" },
  { term: "게이트", translation: "Gate", category: "location", gender: null, notes: "Portal that spawns dungeons and monsters" },
  { term: "각성", translation: "Awakening", category: "word", gender: null, notes: "Gaining supernatural abilities, often triggered by a Gate event" },
  { term: "회귀", translation: "Regression / Return", category: "word", gender: null, notes: "Going back in time to the past (common regression trope)" },
  { term: "환생", translation: "Reincarnation / Rebirth", category: "word", gender: null, notes: "Being reborn in a new body or world" },
  { term: "빙의", translation: "Possession / Transmigration", category: "word", gender: null, notes: "Soul entering another person's body (often into a novel/game character)" },
  { term: "시스템", translation: "System", category: "word", gender: null, notes: "A game-like interface granting quests, stats, and abilities" },
  { term: "스탯", translation: "Stats", category: "word", gender: null, notes: "Character attributes (strength, agility, etc.) in a game-like system" },
  { term: "레벨업", translation: "Level Up", category: "word", gender: null, notes: "Increasing one's level/rank through experience" },
  { term: "회복", translation: "Recovery / Restoration", category: "word", gender: null, notes: "Healing or restoring health/mana" },
  { term: "마나", translation: "Mana", category: "word", gender: null, notes: "Magical energy used for skills and spells" },
  { term: "스킬", translation: "Skill", category: "word", gender: null, notes: "A special ability or technique, often from a system" },
  { term: "클래스", translation: "Class", category: "word", gender: null, notes: "A character's role or profession (warrior, mage, etc.)" },
  { term: "랭크", translation: "Rank / Grade", category: "word", gender: null, notes: "A classification of power level (S-rank, A-rank, etc.)" },
  { term: "S급", translation: "S-Rank / S-Grade", category: "word", gender: null, notes: "The highest rank in a ranking system" },
  { term: "만렙", translation: "Max Level", category: "word", gender: null, notes: "Having reached the maximum level" },
  { term: "보스", translation: "Boss", category: "word", gender: null, notes: "A powerful monster at the end of a dungeon" },

  // Korean food & culture
  { term: "김치", translation: "Kimchi", category: "word", gender: null, notes: "Fermented vegetables, staple Korean side dish" },
  { term: "소주", translation: "Soju", category: "word", gender: null, notes: "Korean distilled spirit" },
  { term: "삼겹살", translation: "Samgyeopsal / Pork Belly", category: "word", gender: null, notes: "Grilled pork belly, popular Korean BBQ dish" },
  { term: "치킨", translation: "Chimaek / Korean Fried Chicken", category: "word", gender: null, notes: "Korean fried chicken, often paired with beer" },
  { term: "한옥", translation: "Hanok", category: "word", gender: null, notes: "Traditional Korean house" },
  { term: "한복", translation: "Hanbok", category: "word", gender: null, notes: "Traditional Korean clothing" },
  { term: "노래방", translation: "Noraebang / Karaoke Room", category: "location", gender: null, notes: "Private karaoke room, popular entertainment venue" },
  { term: "PC방", translation: "PC Bang / Internet Cafe", category: "location", gender: null, notes: "Gaming cafe, very popular in Korea" },

  // Titles & professions
  { term: "회장님", translation: "Chairman (honorific)", category: "character", gender: "M", notes: "Respectful address for a company chairman or chaebol head" },
  { term: "사장님", translation: "Boss / CEO (honorific)", category: "character", gender: null, notes: "Respectful address for a business owner" },
  { term: "선생님", translation: "Teacher (honorific)", category: "character", gender: null, notes: "Respectful address for a teacher" },
  { term: "박사님", translation: "Doctor / PhD (honorific)", category: "character", gender: null, notes: "Respectful address for someone with a doctoral degree" },
  { term: "의사", translation: "Doctor / Physician", category: "character", gender: null, notes: "Medical doctor" },
  { term: "검사", translation: "Prosecutor", category: "character", gender: null, notes: "Legal prosecutor (common profession in Korean thrillers)" },

  // Common exclamations
  { term: "아이고", translation: "Aigoo", category: "slang", gender: null, notes: "Exclamation of surprise, frustration, or exhaustion" },
  { term: "헐", translation: "Heol", category: "slang", gender: null, notes: "Exclamation of shock or disbelief" },
  { term: "대박", translation: "Daebak / Jackpot", category: "slang", gender: null, notes: "Exclamation for something amazing or unbelievable" },
  { term: "화이팅", translation: "Hwaiting / Fighting!", category: "slang", gender: null, notes: "Encouragement — 'You can do it!'" },
  { term: "아이씨", translation: "Aish", category: "slang", gender: null, notes: "Expression of annoyance or frustration (mild expletive)" },
];

// ── Merged export ──────────────────────────────────────────────────────

export const REFERENCE_GLOSSARY: RefGlossaryEntry[] = [
  ...WUXIA_TERMS,
  ...MYTHOLOGICAL_CREATURES,
  ...TERMS_OF_ADDRESS,
  ...KOREAN_TERMS,
];
