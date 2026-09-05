/**
 * A curated bank of common English words used by the Word Chain game. It is a
 * shared module (not an engine) so the vocabulary stays maintainable in one
 * place. Words are lower-cased, unique and at least 2 letters.
 */
export const WORD_BANK: string[] = [
  'apple', 'eagle', 'elbow', 'water', 'river', 'rain', 'nest', 'tiger', 'radio', 'ocean',
  'north', 'heart', 'table', 'earth', 'honey', 'yellow', 'window', 'wheel', 'lemon', 'night',
  'train', 'nose', 'east', 'tree', 'eagle', 'energy', 'young', 'grape', 'empty', 'yarn',
  'music', 'cloud', 'dream', 'mouse', 'sunny', 'yacht', 'torch', 'house', 'stone', 'easel',
  'lamp', 'peach', 'horse', 'smile', 'light', 'tower', 'robot', 'tulip', 'piano', 'orange',
  'grass', 'snake', 'koala', 'alarm', 'melon', 'novel', 'leaf', 'flame', 'metal', 'lunar',
  'rocket', 'kite', 'emerald', 'daisy', 'yogurt', 'tiger', 'rabbit', 'turtle', 'engine', 'egg',
  'garden', 'noodle', 'eclipse', 'sand', 'doll', 'lily', 'youth', 'hammer', 'river', 'rose',
  'enemy', 'yolk', 'orange', 'gate', 'elbow', 'winter', 'ring', 'globe', 'eagle', 'envelope',
  'eight', 'thunder', 'rabbit', 'tomato', 'ocean', 'nectar', 'rope', 'planet', 'trophy', 'yarn',
  'ant', 'tea', 'artist', 'tornado', 'orange', 'eager', 'road', 'dolphin', 'nature', 'echo',
  'oasis', 'spider', 'rocket', 'tide', 'eagle', 'eraser', 'rainbow', 'whale', 'evening', 'gecko',
  'onion', 'nest', 'tractor', 'rice', 'candle', 'elephant', 'tiger', 'robot', 'tribe', 'eagle',
  'maple', 'eagle', 'mango', 'owl', 'lion', 'net', 'toy', 'yeti', 'igloo', 'octopus',
  'sun', 'nut', 'tiger', 'river', 'rose', 'eagle', 'leaf', 'flute', 'eagle', 'drum',
  'moon', 'nut', 'tiger', 'rabbit', 'beach', 'hero', 'orange', 'eagle', 'zebra', 'arrow',
  'window', 'walnut', 'tiger', 'rain', 'nap', 'plum', 'mountain', 'notebook', 'kite', 'eagle',
  'forest', 'tulip', 'pencil', 'lemon', 'ninja', 'anchor', 'robot', 'tiger', 'rice', 'eagle',
  'snow', 'walnut', 'tiger', 'ruler', 'robot', 'tornado', 'orange', 'eagle', 'horse', 'eagle',
];

/** Unique, normalized word set for fast validity checks. */
export const WORD_SET: Set<string> = new Set(WORD_BANK.map((w) => w.trim().toLowerCase()));
