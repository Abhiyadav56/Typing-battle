export const ACTIONS = [
  { id: 'attack', label: 'Strike', symbol: '!', damage: 10, cooldown: 1000 },
  { id: 'defense', label: 'Guard', symbol: '[]', damage: 0, cooldown: 900 },
  { id: 'dodge', label: 'Dodge', symbol: '<>', damage: 0, cooldown: 1100 },
  { id: 'move', label: 'Advance', symbol: '->', damage: 0, cooldown: 750 },
  { id: 'counter', label: 'Counter', symbol: '*', damage: 14, cooldown: 1350 },
  { id: 'special', label: 'Special', symbol: '+', damage: 18, cooldown: 2600 }
];

export const DIFFICULTY = {
  easy: { label: 'Easy', duration: 90, minLength: 3, sentenceChance: 0.1, cooldown: 1.25 },
  medium: { label: 'Medium', duration: 75, minLength: 4, sentenceChance: 0.24, cooldown: 1 },
  hard: { label: 'Hard', duration: 60, minLength: 6, sentenceChance: 0.4, cooldown: 0.82 }
};

export const normalizeText = (value) => String(value || '').normalize('NFC').trim();
export const actionFor = (seed) => ACTIONS[Math.abs(seed) % ACTIONS.length];

export function nextCommand({ language, difficulty, sequence, seed, english, hindi, lastText = '' }) {
  const set = language === 'both' ? ((seed + sequence) % 2 ? hindi : english) : language === 'hindi' ? hindi : english;
  const options = ((seed * 13 + sequence * 7) % 100 < DIFFICULTY[difficulty].sentenceChance * 100 ? set.sentences : set.words)
    .filter((item) => normalizeText(item).length >= DIFFICULTY[difficulty].minLength);
  const start = (seed * 17 + sequence * 11 + Math.floor(sequence / 3) * 19) % options.length;
  const text = options.find((item, index) => index >= start && normalizeText(item) !== lastText)
    || options.find((item) => normalizeText(item) !== lastText)
    || options[start]
    || set.words[0];
  return { id: `${set.language}-${sequence}-${seed}`, text: normalizeText(text), language: set.language, action: actionFor(seed + sequence).id };
}
