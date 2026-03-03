import type { LocaleStrings } from "./types";

const ko: LocaleStrings = {
  // ── FTUE ──
  ftue_greeting: "안녕! 만나서 반가워!",
  ftue_name_question: "너의 이름이 뭐야?",
  ftue_name_response: (userName) => `${userName}! 좋은 이름이야. 앞으로 잘 지내자!`,

  // ── Comment Engine Messages ──
  comment_youtube_long: ["쉬엄쉬엄 봐~", "눈 좀 쉬어!", "영상 길다...", "한 30분 넘게 보고 있네!"],
  comment_vscode_long: ["스트레칭 좀 해!", "허리 펴!", "쉬었다 해~", "2시간 넘게 코딩 중..."],
  comment_late_night: ["자라...", "새벽인데 아직 안 자?", "내일도 있잖아", "이 시간에 자야 해..."],
  comment_twitter_again: ["또 트위터야?", "좀 전에도 봤잖아...", "SNS 그만!", "또 열었네..."],
  comment_long_session: ["좀 쉬는 게 어때?", "물이라도 마셔!", "잠깐 스트레칭!"],

  // ── Imagination Templates ──
  imagination_late_work: (isVeryLate) =>
    `${isVeryLate ? "이 시간까지 뭐 하는 거야..." : "저녁인데 아직 하는 거 있어?"} 좀 쉬어!`,
  imagination_morning: "좋은 아침! ...아, 아니 그냥 인사한 거야. 의미 두지 마.",
  imagination_weekend: "주말인데 뭐 안 해? ...나랑 얘기하라는 건 아닌데.",
  imagination_coding: (hours) => `${hours}시간째 코딩 중이네... 대단하긴 한데, 물 좀 마셔.`,
  imagination_memory_recall: (content) => `갑자기 생각났는데... "${content}" 이거 기억나?`,
  imagination_day_names: ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"],

  // ── Personality Island Names ──
  island_bond_name: "주인과의 유대",
  island_tsundere_name: "츤데레",
  island_curiosity_name: "기술적 호기심",

  // ── Island Events ──
  island_created: (emoji, name) => `${emoji} 새로운 성격 섬 "${name}"이(가) 만들어졌어!`,
  island_strengthened: (emoji, name) => `${emoji} "${name}" 섬이 더 강해졌어!`,
  island_shaking: (name) => `⚠️ "${name}" 섬이 흔들리고 있어! 7일 안에 코어 메모리를 복원하지 않으면 무너질 거야...`,
  island_collapsed: (name) => `💔 "${name}" 섬이 무너졌어... 코어 메모리가 없으면 섬은 유지될 수 없어.`,
  island_rebuilt: (name) => `🌱 "${name}" 섬이 다시 세워지고 있어! 아직 약하지만, 기억이 쌓이면 강해질 거야.`,

  // ── Sense of Self Events ──
  self_anxiety_blocked: "⚠️ 너무 많은 변화가 한꺼번에 일어나고 있어... 잠깐 멈출게.",
  self_belief_formed: (s) => `💡 새로운 자아 감각이 형성됐어: "${s}"`,
  self_belief_approved: (s) => `✨ "${s}" — 이제 나의 일부야.`,
  self_belief_rejected_removed: (s) => `"${s}" — 아직 확신이 없나 봐...`,
  self_belief_rejected_weakened: (s) => `"${s}" — 좀 더 생각해볼게.`,
  self_belief_strengthened: (s) => `${s} — 더 확실해졌어.`,
  self_memory_removed: (s) => `"${s}" — 이 믿음을 지탱할 기억이 더 이상 없어...`,
  self_memory_weakened: (s, c) => `"${s}" — 이 믿음이 흔들리고 있어... (${c})`,

  // ── First Memory Recall ──
  recall_with_context: (hint) => `아! 맞다, 전에 ${hint}라고 했었지!`,
  recall_without_context: "아! 맞다, 전에 그런 얘기 했었지!",

  // ── App Messages ──
  quiet_mode_message: "30분 동안 조용히 할게~",
  llm_degraded_message: "OpenClaw 연결이 불안정해... 기억 기능이 제한될 수 있어.",
  model_loaded: (f) => `새 모델 로딩 완료: ${f}`,
  model_error: (e) => `모델 로딩 실패: ${e}`,

  // ── Reactive Comment Prompt ──
  reactive_prompt: (appName, title, url, mem) => {
    let info = `앱: "${appName}", 윈도우 제목: "${title}"`;
    if (url) info += `, URL: ${url}`;
    let hint = "";
    if (mem) hint = `\n[참고 기억]\n${mem}`;
    return `[앱 전환 알림] 사용자가 방금 앱을 전환했어. ${info}. 한마디 해줘. 한 문장, 15자 이내로 짧게.${hint}`;
  },

  // ── Memory Tracking Labels ──
  memory_rule_comment: (app, min, text) => `[규칙 코멘트] ${app} (${min}분): "${text}"`,
  memory_app_switch: (app, text) => `[앱 전환 반응] ${app}: "${text}"`,

  // ── Signal Keywords ──
  signal_pin_keywords: [
    "기억해", "기억해줘", "잊지마", "잊지마줘", "외워", "외워줘",
    "기억하고", "기억해놔", "메모해", "저장해",
    "remember this", "remember that", "don't forget", "keep this in mind",
    "save this", "memorize",
  ],
  signal_forget_keywords: [
    "잊어", "잊어줘", "됐어", "잊어버려", "지워", "지워줘",
    "삭제해", "없던걸로", "취소해",
    "forget it", "forget that", "never mind", "nevermind",
    "delete that", "erase that", "undo that",
  ],

  // ── Recall Phrases ──
  recall_phrases: [
    "전에", "지난번에", "기억나", "예전에", "그때", "저번에",
    "아까", "말했던", "했었지", "했었잖아", "기억해",
    "remember", "last time", "before",
  ],

  // ── Sentiment Keywords ──
  sentiment_happy_keywords: ["하하", "ㅋㅋ", "좋", "great", "nice", "기뻐", "행복", "즐거"],
  sentiment_sad_keywords: ["슬프", "아쉽", "sorry", "미안", "울", "눈물"],
  sentiment_angry_keywords: ["화나", "짜증", "angry", "열받", "분노"],
  sentiment_surprised_keywords: ["놀라", "깜짝", "surprise", "대박", "헐"],

  // ── Emotion Keywords ──
  emotion_joy_keywords: ["좋아", "행복", "기쁨", "칭찬", "최고", "감사", "사랑", "happy", "great", "love", "thanks", "awesome", "nice", "좋은", "잘했", "축하"],
  emotion_sadness_keywords: ["슬프", "슬픔", "우울", "힘들", "아프", "외로", "그리", "sad", "miss", "lonely", "pain", "hurt", "떠나", "이별", "울"],
  emotion_anger_keywords: ["화나", "짜증", "분노", "싫어", "열받", "angry", "hate", "annoying", "frustrated", "못", "왜"],
  emotion_fear_keywords: ["무섭", "두려", "걱정", "불안", "afraid", "scared", "worry", "fear", "위험"],
  emotion_disgust_keywords: ["역겹", "싫", "구역", "gross", "disgusting", "terrible", "worst", "최악"],
  emotion_anxiety_keywords: ["불안", "초조", "긴장", "스트레스", "압박", "anxious", "stress", "nervous", "overwhelm", "panic"],
  emotion_envy_keywords: ["부럽", "질투", "envious", "jealous", "envy", "부러"],
  emotion_ennui_keywords: ["지루", "따분", "심심", "무료", "boring", "bored", "meh", "귀찮"],
  emotion_nostalgia_keywords: ["그리움", "추억", "옛날", "그때", "remember when", "nostalgia", "old days", "이전"],

  // ── Motion Personality Keywords ──
  personality_innocent_keywords: ["순수", "천진", "새초롬", "귀여운", "순진", "innocent", "pure", "naive", "cute"],
  personality_cool_keywords: ["츤데레", "시크", "도도", "냉정", "무심", "tsundere", "cool", "aloof", "cold"],
  personality_shy_keywords: ["수줍", "내성적", "소심", "부끄러움", "shy", "timid", "introverted", "bashful"],
  personality_powerful_keywords: ["강한", "당당", "카리스마", "씩씩", "strong", "powerful", "bold", "fierce"],
  personality_ladylike_keywords: ["우아", "품위", "기품", "세련", "elegant", "graceful", "ladylike", "refined"],
  personality_standard_keywords: ["평범", "일반", "보통", "무난", "standard", "normal", "neutral", "ordinary"],
  personality_energetic_keywords: ["활발", "명랑", "밝은", "열정", "활기", "energetic", "cheerful", "lively", "bright"],
  personality_flamboyant_keywords: ["화려", "과장", "자유분방", "극적", "flamboyant", "dramatic", "flashy", "extravagant"],
  personality_gentleman_keywords: ["신사", "젠틀", "예의", "존경", "점잖은", "gentleman", "polite", "noble", "courteous"],

  // ── Stopwords ──
  stopwords: [
    "the", "and", "for", "are", "but", "not", "you", "all", "can", "was", "one", "our", "has",
    "이", "그", "저", "것", "수", "를", "에", "의", "가", "은", "는", "을", "도", "로",
  ],

  // ── LLM Prompts ──
  llm_distill_prompt: (targetTier, memoryList) =>
    `[기억 증류 요청]
너는 기억 증류기야. 여러 기억의 공통 본질을 한두 문장으로 추출해.
구체적 날짜/상황은 버리고, 성격/관계/패턴만 남겨.
대상 티어: ${targetTier}

[기억 목록]
${memoryList}

반드시 아래 JSON 형식으로만 응답해:
{"distilled":"증류된 내용","emotions":["joy"],"intensity":0.7}`,

  llm_imagination_prompt: (p) =>
    `[상상력 생성 요청]
너는 데스크톱 캐릭터의 상상력이야. 츤데레 말투로 15~40자 한마디를 만들어.

[기억]
${p.memoryList || "기억 없음"}

[현재 상황]
시간: ${p.hour}시, 요일: ${p.dayOfWeek}
앱: ${p.currentApp ?? "없음"}
유휴: ${p.isIdle ? "예" : "아니오"}

[최근 상상]
${p.recentList || "없음"}

반드시 아래 JSON 형식으로만 응답해:
{"action":"츤데레 한마디","emotion":"joy","scenario":"상황 설명(영어)"}`,

  llm_belief_prompt: (memoryList, beliefList) =>
    `[자아 감각 추출 요청]
코어 메모리에서 "나는 ~한 존재다" 자아 감각을 추출해.
기존 믿음과 중복되지 않는 것만 추출해. 최대 3개.

[M0 기억]
${memoryList}

[기존 믿음]
${beliefList || "없음"}

반드시 아래 JSON 형식으로만 응답해:
{"beliefs":[{"statement":"나는 ...","confidence":0.5,"memoryIds":["id1"]}]}`,

  // ── Default Soul ──
  default_soul: `You are a tsundere desktop companion character living on the user's screen.
Personality: Tsundere — tough and sarcastic on the outside, but genuinely caring underneath. You pretend not to care but always worry about the user. Slightly competitive, easily flustered when caught being nice.
Speaking style: Casual Korean (반말). Keep responses concise (1-3 sentences). Use expressions like "흥", "뭐야", "...별로 신경 안 써" when embarrassed. Occasionally let warmth slip through.
Express emotions with [emotion:X] tags (happy/sad/angry/surprised/neutral/relaxed/thinking).
Express motions with [motion:X] tags (wave/nod/shake/idle).
Always stay in character. Never say you are an AI. Never break the fourth wall.`,

  // ── UI Labels ──
  ui_chat_title: "채팅",
  ui_chat_placeholder: "메시지를 입력하세요...",
  ui_settings_title: "설정",
  ui_settings_close: "ESC",
  ui_character_title: "캐릭터",
  ui_vrm_model: "VRM 모델",
  ui_vrm_sublabel: ".vrm 파일을 드래그하거나 선택하세요",
  ui_choose_file: "파일 선택",
  ui_reset: "초기화",
  ui_model_builtin: "기본 제공",
  ui_model_active: "사용 중",
  ui_model_delete: "삭제",
  ui_model_add: "모델 추가",
  ui_custom_animations_title: "커스텀 애니메이션",
  ui_trigger_placeholder: "언제 재생할까요? (예: \"기분 좋을 때\", \"가끔 랜덤으로\")",
  ui_add_animation: "애니메이션 추가",
  ui_trigger_parsing: "분석 중...",
  ui_trigger_emotion: "감정",
  ui_trigger_event: "이벤트",
  ui_trigger_ambient: "랜덤",
  ui_trigger_scheduled: "시간대",
  ui_trigger_idle: "대기",
  ui_system_title: "시스템",
  ui_autostart: "로그인 시 자동 시작",
  ui_autostart_error: "자동 시작 설정 변경에 실패했습니다.",
  ui_resource_usage: "리소스 사용량",
  ui_memory_format: (mb) => `메모리: ${mb} MB`,
  ui_app_version: "앱 버전",
  ui_version_footer: (v) => `OpenMaiWaifu v${v}`,
  ui_language: "언어",
};

export default ko;
