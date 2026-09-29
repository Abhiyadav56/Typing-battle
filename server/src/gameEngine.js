import { ACTIONS, DIFFICULTY, nextCommand, normalizeText } from '../../shared/content.js';
import { english, hindi } from '../../shared/contentData.js';

const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 5 }, () => codeAlphabet[Math.floor(Math.random() * codeAlphabet.length)]).join('');
const now = () => Date.now();

function makePlayer(id, name, side) {
  return {
    id, token: crypto.randomUUID(), name: String(name || `Fighter ${side + 1}`).slice(0, 18), side,
    connected: true, ready: false, health: 100, position: side ? 72 : 28, commandSequence: 0,
    command: null, lastAction: null, lastActionAt: 0, cooldowns: {}, stats: {
      completedWords: 0, completedSentences: 0, correctChars: 0, errors: 0, streak: 0,
      bestStreak: 0, damageDealt: 0, blocks: 0, dodges: 0, score: 0, startedAt: 0
    }
  };
}

export function createRoom(hostId, name, settings) {
  const host = makePlayer(hostId, name, 0);
  return {
    code: makeCode(), hostId, language: settings.language, difficulty: settings.difficulty,
    phase: 'lobby', createdAt: now(), countdownEndsAt: null, matchEndsAt: null, pausedAt: null, pauseVotes: [], winnerId: null,
    players: [host], lastEvent: { type: 'join', message: `${host.name} created the arena.` }
  };
}

export function publicRoom(room) {
  return {
    code: room.code, hostId: room.hostId, language: room.language, difficulty: room.difficulty,
    phase: room.phase, countdownEndsAt: room.countdownEndsAt, matchEndsAt: room.matchEndsAt, pauseVotes: room.pauseVotes,
    winnerId: room.winnerId, lastEvent: room.lastEvent,
    players: room.players.map(({ token, cooldowns, ...player }) => player)
  };
}

function newCommand(room, player) {
  player.command = nextCommand({
    language: room.language, difficulty: room.difficulty, sequence: player.commandSequence,
    seed: (player.side + 2) * 31, english, hindi
  });
}

export function setReady(room, playerId, ready) {
  const player = room.players.find((item) => item.id === playerId);
  if (!player || room.phase !== 'lobby') return false;
  player.ready = Boolean(ready);
  room.lastEvent = { type: 'ready', message: `${player.name} is ${player.ready ? 'ready' : 'not ready'}.` };
  return true;
}

export function startMatch(room) {
  if (room.phase !== 'lobby' || room.players.length !== 2 || !room.players.every((player) => player.ready)) return false;
  const started = now();
  room.phase = 'countdown';
  room.countdownEndsAt = started + 4000;
  room.matchEndsAt = room.countdownEndsAt + DIFFICULTY[room.difficulty].duration * 1000;
  room.winnerId = null;
  room.pausedAt = null; room.pauseVotes = [];
  room.players.forEach((player) => {
    player.health = 100; player.position = player.side ? 72 : 28; player.commandSequence = 0;
    player.lastAction = null; player.lastActionAt = 0; player.cooldowns = {}; player.stats = {
      completedWords: 0, completedSentences: 0, correctChars: 0, errors: 0, streak: 0,
      bestStreak: 0, damageDealt: 0, blocks: 0, dodges: 0, score: 0, startedAt: started
    };
    newCommand(room, player);
  });
  room.lastEvent = { type: 'countdown', message: 'The battle begins!' };
  return true;
}

function winnerFor(room) {
  const [one, two] = room.players;
  if (one.health === two.health) return null;
  return one.health > two.health ? one.id : two.id;
}

export function tickRoom(room, at = now()) {
  if (room.phase === 'countdown' && at >= room.countdownEndsAt) {
    room.phase = 'playing'; room.lastEvent = { type: 'go', message: 'GO!' }; return 'playing';
  }
  if (room.phase === 'playing' && at >= room.matchEndsAt) {
    room.phase = 'finished'; room.winnerId = winnerFor(room); room.lastEvent = { type: 'finish', message: room.winnerId ? 'Time is up.' : 'A perfectly even draw.' }; return 'finished';
  }
  return null;
}

export function submitCommand(room, playerId, input, errors = 0) {
  if (room.phase !== 'playing') return null;
  const player = room.players.find((item) => item.id === playerId);
  const opponent = room.players.find((item) => item.id !== playerId);
  if (!player || !opponent || normalizeText(input) !== player.command?.text) return null;

  const at = now();
  const action = ACTIONS.find((item) => item.id === player.command.action);
  const cooldown = action.cooldown * DIFFICULTY[room.difficulty].cooldown;
  if ((player.cooldowns[action.id] || 0) > at) return { rejected: 'That action is cooling down.' };
  player.cooldowns[action.id] = at + cooldown;
  player.stats.correctChars += [...player.command.text].length;
  player.stats.errors += Math.min(Math.max(Number(errors) || 0, 0), 100);
  player.stats.streak += 1; player.stats.bestStreak = Math.max(player.stats.bestStreak, player.stats.streak);
  player.stats.score += 10 + player.stats.streak;
  if (player.command.text.includes(' ')) player.stats.completedSentences += 1; else player.stats.completedWords += 1;
  player.lastAction = action.id; player.lastActionAt = at;
  const event = { type: action.id, actorId: player.id, targetId: opponent.id, damage: 0, outcome: action.label };

  if (action.id === 'move') { player.position = Math.min(Math.max(player.position + (player.side ? -9 : 9), 12), 88); event.outcome = 'Advanced'; }
  if (action.id === 'defense') { player.stats.blocks += 1; event.outcome = 'Guard raised'; }
  if (action.id === 'dodge') { player.stats.dodges += 1; event.outcome = 'Ready to dodge'; }
  if (['attack', 'counter', 'special'].includes(action.id)) {
    let damage = action.damage;
    if (action.id === 'counter' && (!['attack', 'special'].includes(opponent.lastAction) || at - opponent.lastActionAt > 1500)) damage = 7;
    const guarded = opponent.lastAction === 'defense' && at - opponent.lastActionAt < 1600;
    const dodged = opponent.lastAction === 'dodge' && at - opponent.lastActionAt < 1300;
    if (guarded) { damage = Math.ceil(damage * 0.25); event.outcome = 'Blocked'; }
    if (dodged) { damage = 0; event.outcome = 'Dodged'; }
    opponent.health = Math.max(0, opponent.health - damage); player.stats.damageDealt += damage; event.damage = damage;
    if (opponent.health === 0) { room.phase = 'finished'; room.winnerId = player.id; event.outcome = 'Knockout'; }
  }
  player.commandSequence += 1; newCommand(room, player); room.lastEvent = event;
  return event;
}

export function togglePause(room, playerId) {
  if (!room.players.some((player) => player.id === playerId) || !['playing', 'paused'].includes(room.phase)) return null;
  room.pauseVotes = room.pauseVotes.includes(playerId) ? room.pauseVotes.filter((id) => id !== playerId) : [...room.pauseVotes, playerId];
  if (room.phase === 'playing' && room.pauseVotes.length === room.players.length) {
    room.phase = 'paused'; room.pausedAt = now(); room.pauseVotes = [];
    room.lastEvent = { type: 'pause', message: 'Match paused. Both fighters must resume.' };
    return { paused: true };
  }
  if (room.phase === 'paused' && room.pauseVotes.length === room.players.length) {
    room.matchEndsAt += now() - room.pausedAt; room.pausedAt = null; room.phase = 'playing'; room.pauseVotes = [];
    room.lastEvent = { type: 'resume', message: 'Match resumed.' };
    return { paused: false };
  }
  room.lastEvent = { type: 'pause_request', message: `${room.players.find((player) => player.id === playerId).name} wants to ${room.phase === 'paused' ? 'resume' : 'pause'}.` };
  return { paused: room.phase === 'paused', requested: true };
}

export function resetRematch(room) {
  if (room.players.length !== 2) return false;
  room.phase = 'lobby'; room.countdownEndsAt = null; room.matchEndsAt = null; room.pausedAt = null; room.pauseVotes = []; room.winnerId = null;
  room.players.forEach((player) => { player.ready = false; player.command = null; });
  room.lastEvent = { type: 'rematch', message: 'Rematch ready. Confirm when you are ready.' };
  return true;
}

export function removePlayer(room, playerId) {
  const index = room.players.findIndex((player) => player.id === playerId);
  if (index === -1) return null;
  const [leaving] = room.players.splice(index, 1);
  if (!room.players.length) return { empty: true };
  const remaining = room.players[0];
  room.hostId = remaining.id; remaining.side = 0; remaining.position = 28; remaining.ready = false;
  room.phase = 'lobby'; room.pauseVotes = []; room.lastEvent = { type: 'leave', message: `${leaving.name} left the arena.` };
  return { empty: false, remaining };
}

export function reconnect(room, token, socketId) {
  const player = room.players.find((item) => item.token === token);
  if (!player) return null;
  const previousId = player.id;
  player.id = socketId; player.connected = true;
  if (room.hostId === previousId) room.hostId = socketId;
  return { player, previousId };
}
