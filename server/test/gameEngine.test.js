import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, setReady, startMatch, submitCommand, tickRoom } from '../src/gameEngine.js';
import { nextCommand } from '../../shared/content.js';
import { english, hindi } from '../../shared/contentData.js';

test('command generator does not repeat the prior prompt', () => {
  const first = nextCommand({ language: 'english', difficulty: 'medium', sequence: 4, seed: 62, english, hindi });
  const second = nextCommand({ language: 'english', difficulty: 'medium', sequence: 5, seed: 62, english, hindi, lastText: first.text });
  assert.notEqual(second.text, first.text);
});

test('a ready room starts, accepts an exact command, and advances state', () => {
  const room = createRoom('one', 'One', { language: 'english', difficulty: 'medium' });
  room.players.push({ ...createRoom('two', 'Two', { language: 'english', difficulty: 'medium' }).players[0], id: 'two', side: 1 });
  assert.equal(setReady(room, 'one', true), true);
  assert.equal(setReady(room, 'two', true), true);
  assert.equal(startMatch(room), true);
  assert.equal(tickRoom(room, room.countdownEndsAt + 1), 'playing');
  const player = room.players[0];
  const result = submitCommand(room, 'one', player.command.text, 0);
  assert.ok(result);
  assert.equal(player.commandSequence, 1);
  assert.equal(player.stats.streak, 1);
});

test('a wrong command is rejected and the clock decides a winner', () => {
  const room = createRoom('one', 'One', { language: 'hindi', difficulty: 'hard' });
  room.players.push({ ...createRoom('two', 'Two', { language: 'hindi', difficulty: 'hard' }).players[0], id: 'two', side: 1 });
  setReady(room, 'one', true); setReady(room, 'two', true); startMatch(room); tickRoom(room, room.countdownEndsAt + 1);
  assert.equal(submitCommand(room, 'one', 'गलत कमांड'), null);
  room.players[0].health = 77; room.players[1].health = 33;
  assert.equal(tickRoom(room, room.matchEndsAt + 1), 'finished');
  assert.equal(room.winnerId, 'one');
});
