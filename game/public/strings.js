// All player-visible text. Adding a language is a data change, never a code change.
export const LANGS = ["ru", "en"];

export const STRINGS = {
  ru: {
    title: "RAIL RUSH",
    tagline: "Беги. Уворачивайся. Собирай.",
    play: "ИГРАТЬ",
    tapToStart: "нажми, чтобы начать",
    best: "Рекорд",
    score: "Счёт",
    coins: "Монеты",
    meters: "м",
    pause: "Пауза",
    resume: "Продолжить",
    restart: "Заново",
    gameOver: "Попался!",
    newBest: "НОВЫЙ РЕКОРД!",
    revive: "Второй шанс",
    reviveCost: "100 монет",
    notEnoughCoins: "Не хватает монет",
    howToTitle: "Управление",
    howToSwipe: "Свайп влево / вправо — сменить путь",
    howToUp: "Свайп вверх или тап — прыжок",
    howToDown: "Свайп вниз — подкат",
    howToKeys: "Клавиатура: стрелки или WASD, пробел — прыжок",
    howToPad: "Геймпад: крестовина + кнопка A",
    gotIt: "Понятно",
    settings: "Настройки",
    sound: "Звук",
    music: "Музыка",
    effects: "Спецэффекты",
    language: "Язык",
    on: "вкл",
    off: "выкл",
    close: "Закрыть",
    loading: "Загрузка…",
    tutJump: "ПРЫГАЙ!",
    tutRoll: "ПОДКАТ!",
    tutSwipe: "МЕНЯЙ ПУТЬ!",
    tutRamp: "ТРАМПЛИН!",
    puMagnet: "МАГНИТ",
    puJetpack: "ДЖЕТПАК",
    puX2: "x2 ОЧКИ",
    puBoard: "ХОВЕРБОРД",
    boardSaved: "ХОВЕРБОРД СПАС!",
    distance: "Дистанция",
    coinsRun: "Собрано",
    total: "Всего монет",
  },
  en: {
    title: "RAIL RUSH",
    tagline: "Run. Dodge. Collect.",
    play: "PLAY",
    tapToStart: "tap to start",
    best: "Best",
    score: "Score",
    coins: "Coins",
    meters: "m",
    pause: "Pause",
    resume: "Resume",
    restart: "Restart",
    gameOver: "Busted!",
    newBest: "NEW BEST!",
    revive: "Second chance",
    reviveCost: "100 coins",
    notEnoughCoins: "Not enough coins",
    howToTitle: "Controls",
    howToSwipe: "Swipe left / right — change track",
    howToUp: "Swipe up or tap — jump",
    howToDown: "Swipe down — roll",
    howToKeys: "Keyboard: arrows or WASD, space to jump",
    howToPad: "Gamepad: d-pad + A button",
    gotIt: "Got it",
    settings: "Settings",
    sound: "Sound",
    music: "Music",
    effects: "Effects",
    language: "Language",
    on: "on",
    off: "off",
    close: "Close",
    loading: "Loading…",
    tutJump: "JUMP!",
    tutRoll: "ROLL!",
    tutSwipe: "SWITCH TRACK!",
    tutRamp: "RAMP!",
    puMagnet: "MAGNET",
    puJetpack: "JETPACK",
    puX2: "x2 SCORE",
    puBoard: "HOVERBOARD",
    boardSaved: "HOVERBOARD SAVED YOU!",
    distance: "Distance",
    coinsRun: "Collected",
    total: "Total coins",
  },
};

let lang = "en";

export function pickLang(stored) {
  if (stored && LANGS.includes(stored)) return stored;
  const nav = (navigator.language || "en").slice(0, 2).toLowerCase();
  return LANGS.includes(nav) ? nav : "en";
}

export function setLang(l) {
  if (LANGS.includes(l)) lang = l;
}

export function getLang() {
  return lang;
}

export function t(key) {
  return STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
}
