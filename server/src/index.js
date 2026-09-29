import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createRoom, publicRoom, reconnect, removePlayer, resetRematch, setReady, startMatch, submitCommand, tickRoom } from './gameEngine.js';

const app = express();
const server = createServer(app);
const allowedOrigins = process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',').map((item) => item.trim()) : true;
const io = new Server(server, { cors: { origin: allowedOrigins, methods: ['GET', 'POST'] } });
const rooms = new Map();
const playerRooms = new Map();
const disconnectTimers = new Map();
const port = Number(process.env.PORT || 3001);

app.get('/health', (_request, response) => response.json({ ok: true, rooms: rooms.size }));

function settingsAreValid(settings) {
  return settings && ['english', 'hindi', 'both'].includes(settings.language) && ['easy', 'medium', 'hard'].includes(settings.difficulty);
}
function emitRoom(room) { io.to(room.code).emit('room_state', publicRoom(room)); }
function removeFromRoom(socket) {
  const code = playerRooms.get(socket.id); const room = rooms.get(code);
  if (!room) return;
  playerRooms.delete(socket.id); socket.leave(code);
  const outcome = removePlayer(room, socket.id);
  if (outcome?.empty) rooms.delete(code); else emitRoom(room);
}
function markDisconnected(socket) {
  const code = playerRooms.get(socket.id); const room = rooms.get(code);
  if (!room) return;
  const player = room.players.find((item) => item.id === socket.id);
  if (!player) return;
  player.connected = false;
  room.lastEvent = { type: 'disconnect', message: `${player.name} disconnected. Waiting 15 seconds for reconnection.` };
  emitRoom(room);
  const timer = setTimeout(() => {
    disconnectTimers.delete(player.token);
    if (!player.connected && room.players.some((item) => item.token === player.token)) {
      playerRooms.delete(player.id);
      const outcome = removePlayer(room, player.id);
      if (outcome?.empty) rooms.delete(room.code); else emitRoom(room);
    }
  }, 15000);
  disconnectTimers.set(player.token, timer);
}

io.on('connection', (socket) => {
  socket.on('create_room', (payload, reply) => {
    if (!settingsAreValid(payload)) return reply({ ok: false, message: 'Choose a language and difficulty first.' });
    let room = createRoom(socket.id, payload.name, payload);
    while (rooms.has(room.code)) room = createRoom(socket.id, payload.name, payload);
    rooms.set(room.code, room); playerRooms.set(socket.id, room.code); socket.join(room.code);
    const player = room.players[0]; reply({ ok: true, room: publicRoom(room), token: player.token }); emitRoom(room);
  });

  socket.on('join_room', (payload, reply) => {
    const code = String(payload?.code || '').trim().toUpperCase(); const room = rooms.get(code);
    if (!room) return reply({ ok: false, message: 'That room code was not found.' });
    if (room.phase !== 'lobby') return reply({ ok: false, message: 'That match has already started.' });
    if (room.players.length >= 2) return reply({ ok: false, message: 'This arena is full.' });
    const player = { ...createRoom(socket.id, payload.name, room).players[0], side: 1, name: String(payload.name || 'Fighter 2').slice(0, 18) };
    room.players.push(player); playerRooms.set(socket.id, code); socket.join(code);
    room.lastEvent = { type: 'join', message: `${player.name} joined the arena.` }; reply({ ok: true, room: publicRoom(room), token: player.token }); emitRoom(room);
  });

  socket.on('set_ready', (ready, reply) => { const room = rooms.get(playerRooms.get(socket.id)); if (!room || !setReady(room, socket.id, ready)) return reply?.({ ok: false }); emitRoom(room); reply?.({ ok: true }); });
  socket.on('start_match', (reply) => { const room = rooms.get(playerRooms.get(socket.id)); if (!room || socket.id !== room.hostId || !startMatch(room)) return reply?.({ ok: false, message: 'Both fighters must be ready.' }); emitRoom(room); reply?.({ ok: true }); });
  socket.on('command_complete', (payload, reply) => { const room = rooms.get(playerRooms.get(socket.id)); const result = room && submitCommand(room, socket.id, payload?.text, payload?.errors); if (!result) return reply?.({ ok: false }); emitRoom(room); io.to(room.code).emit('combat_event', result); if (room.phase === 'finished') io.to(room.code).emit('match_end', publicRoom(room)); reply?.({ ok: true, result }); });
  socket.on('rematch', (reply) => { const room = rooms.get(playerRooms.get(socket.id)); if (!room || !resetRematch(room)) return reply?.({ ok: false }); emitRoom(room); reply?.({ ok: true }); });
  socket.on('leave_room', () => removeFromRoom(socket));
  socket.on('reconnect_game', (payload, reply) => { const room = rooms.get(String(payload?.code || '').toUpperCase()); const restored = room && reconnect(room, payload.token, socket.id); if (!restored) return reply({ ok: false, message: 'Your old room is no longer available.' }); clearTimeout(disconnectTimers.get(restored.player.token)); disconnectTimers.delete(restored.player.token); playerRooms.delete(restored.previousId); playerRooms.set(socket.id, room.code); socket.join(room.code); reply({ ok: true, room: publicRoom(room), token: restored.player.token }); emitRoom(room); });
  socket.on('disconnect', () => markDisconnected(socket));
});

setInterval(() => {
  for (const room of rooms.values()) {
    const changed = tickRoom(room);
    if (changed) { emitRoom(room); if (changed === 'finished') io.to(room.code).emit('match_end', publicRoom(room)); }
  }
}, 250);

server.listen(port, () => console.log(`Typing Battle server listening on ${port}`));
