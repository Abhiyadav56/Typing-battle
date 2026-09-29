import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Gamepad2, HelpCircle, LogOut, Swords, Users, WifiOff } from 'lucide-react';
import { io } from 'socket.io-client';

const socket = io(import.meta.env.VITE_SERVER_URL || window.location.origin, { autoConnect: false, transports: ['websocket', 'polling'] });
const languageLabel = { english: 'English', hindi: 'Hindi', both: 'English + Hindi' };
const actionLabel = { attack: 'Strike', defense: 'Guard', dodge: 'Dodge', move: 'Advance', counter: 'Counter', special: 'Special' };
const actions = [
  ['Strike', 'Complete an attack command to damage your opponent.'], ['Guard', 'Complete a defense command to reduce an incoming hit.'],
  ['Dodge', 'Complete a dodge command to avoid an incoming hit.'], ['Advance', 'Move toward the center to take space.'],
  ['Counter', 'Use after an enemy attack for its full power.'], ['Special', 'A heavy attack with a longer cooldown.']
];
const freshName = () => `Fighter ${Math.floor(100 + Math.random() * 900)}`;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function App() {
  const [screen, setScreen] = useState('home'); const [room, setRoom] = useState(null); const [message, setMessage] = useState('');
  const [name, setName] = useState(() => sessionStorage.getItem('tb-name') || freshName()); const [settings, setSettings] = useState({ language: 'english', difficulty: 'medium' });
  const [joinCode, setJoinCode] = useState(''); const [token, setToken] = useState(() => sessionStorage.getItem('tb-token') || ''); const [howTo, setHowTo] = useState(false);
  const timer = useRef(null);
  const currentPlayer = room?.players.find((player) => player.id === socket.id);

  const connect = (job) => { if (socket.connected) return job(); socket.connect(); socket.once('connect', job); };
  const saveSession = (nextRoom, nextToken) => { sessionStorage.setItem('tb-code', nextRoom.code); sessionStorage.setItem('tb-token', nextToken); sessionStorage.setItem('tb-name', name); setToken(nextToken); };
  const enter = (mode) => connect(() => {
    const payload = mode === 'create' ? { ...settings, name } : { code: joinCode.toUpperCase(), name };
    socket.emit(mode === 'create' ? 'create_room' : 'join_room', payload, (result) => {
      if (!result?.ok) return setMessage(result?.message || 'Could not enter that arena.');
      setRoom(result.room); saveSession(result.room, result.token); setScreen('lobby'); setMessage('');
    });
  });
  const leave = () => { socket.emit('leave_room'); sessionStorage.removeItem('tb-code'); sessionStorage.removeItem('tb-token'); setRoom(null); setScreen('home'); };

  useEffect(() => {
    const state = (next) => { setRoom(next); if (next.phase === 'countdown' || next.phase === 'playing') setScreen('game'); if (next.phase === 'finished') setScreen('results'); };
    const event = (data) => { setRoom((old) => old ? { ...old, lastEvent: data } : old); };
    const disconnected = () => setMessage('Connection interrupted. Reconnecting to the arena...');
    const restore = () => {
      const code = sessionStorage.getItem('tb-code'); const savedToken = sessionStorage.getItem('tb-token');
      if (code && savedToken) socket.emit('reconnect_game', { code, token: savedToken }, (result) => {
        if (result?.ok) { setRoom(result.room); setToken(result.token); setMessage(''); }
      });
    };
    socket.on('room_state', state); socket.on('combat_event', event); socket.on('match_end', state); socket.on('disconnect', disconnected); socket.on('connect', restore);
    return () => { socket.off('room_state', state); socket.off('combat_event', event); socket.off('match_end', state); socket.off('disconnect', disconnected); socket.off('connect', restore); };
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = (text) => { setMessage(text); clearTimeout(timer.current); timer.current = setTimeout(() => setMessage(''), 2800); };
  const copyCode = async () => { try { await navigator.clipboard.writeText(room.code); flash('Room code copied.'); } catch { flash(`Share this code: ${room.code}`); } };
  const ready = () => socket.emit('set_ready', !currentPlayer?.ready, () => {});
  const start = () => socket.emit('start_match', (result) => { if (!result?.ok) flash(result?.message || 'Both fighters need to be ready.'); });
  const rematch = () => socket.emit('rematch');

  return <main className="app-shell">
    <header className="topbar"><button className="brand" onClick={leave}><Swords size={22} /> Typing Battle</button>{room && <div className="room-pill"><Users size={15} /> Room {room.code}</div>}<button className="icon-button" aria-label="How to play" title="How to play" onClick={() => setHowTo(true)}><HelpCircle size={20} /></button></header>
    {message && <div className="toast">{message}</div>}
    {screen === 'home' && <Home name={name} setName={setName} settings={settings} setSettings={setSettings} joinCode={joinCode} setJoinCode={setJoinCode} create={() => enter('create')} join={() => enter('join')} openHow={() => setHowTo(true)} />}
    {screen === 'lobby' && room && <Lobby room={room} me={currentPlayer} copyCode={copyCode} ready={ready} start={start} leave={leave} />}
    {screen === 'game' && room && <Game room={room} me={currentPlayer} send={(text, errors) => socket.emit('command_complete', { text, errors })} controls={() => setHowTo(true)} />}
    {screen === 'results' && room && <Results room={room} me={currentPlayer} rematch={rematch} leave={leave} />}
    {howTo && <HowTo close={() => setHowTo(false)} />}
  </main>;
}

function Home({ name, setName, settings, setSettings, joinCode, setJoinCode, create, join, openHow }) {
  return <section className="home">
    <div className="title-block"><div className="eyebrow"><Gamepad2 size={16} /> REAL-TIME 1V1 TYPING COMBAT</div><h1>Typing Battle</h1><p>Every completed command becomes a move. Outtype your rival, protect your health, and own the arena.</p></div>
    <div className="home-grid"><div className="setup-panel"><label>Fighter name<input maxLength="18" value={name} onChange={(event) => setName(event.target.value)} /></label><span className="field-title">Language</span><div className="segmented">{['english', 'hindi', 'both'].map((item) => <button key={item} className={settings.language === item ? 'selected' : ''} onClick={() => setSettings({ ...settings, language: item })}>{languageLabel[item]}</button>)}</div><span className="field-title">Difficulty</span><div className="difficulty-grid">{['easy', 'medium', 'hard'].map((item) => <button key={item} className={settings.difficulty === item ? `difficulty ${item} selected` : `difficulty ${item}`} onClick={() => setSettings({ ...settings, difficulty: item })}><b>{item}</b><small>{item === 'easy' ? '90 sec / relaxed' : item === 'medium' ? '75 sec / balanced' : '60 sec / fierce'}</small></button>)}</div><button className="primary-button" onClick={create}><Swords size={19} /> Create Room</button></div>
      <aside className="join-panel"><h2>Join a battle</h2><p>Have a room code? Enter it and step into the arena.</p><input className="code-input" placeholder="ABCDE" maxLength="5" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} /><button className="secondary-button" onClick={join} disabled={joinCode.length !== 5}>Join Room</button><button className="text-button" onClick={openHow}><HelpCircle size={17} /> How to play</button></aside></div>
    <section className="command-preview"><span>TYPE TO FIGHT</span><div><b>STRIKE</b><i>!</i><b>GUARD</b><i>[]</i><b>DODGE</b><i>&lt;&gt;</i><b>ADVANCE</b><i>-&gt;</i></div></section>
  </section>;
}

function Lobby({ room, me, copyCode, ready, start, leave }) {
  const everyoneReady = room.players.length === 2 && room.players.every((player) => player.ready);
  return <section className="lobby-screen"><div className="section-kicker">ARENA LOBBY</div><h1>Gather your fighter</h1><div className="code-card"><span>ROOM CODE</span><strong>{room.code}</strong><button className="icon-button" onClick={copyCode} title="Copy room code" aria-label="Copy room code"><Copy size={19} /></button></div><p className="settings-line">{languageLabel[room.language]} <i /> {room.difficulty} difficulty</p><div className="fighter-list">{[0, 1].map((side) => { const player = room.players.find((item) => item.side === side); return <div key={side} className={`fighter-slot ${player ? 'occupied' : ''}`}><div className="mini-fighter"><span /></div><div><b>{player?.name || 'Waiting for opponent...'}</b><small>{player ? (player.ready ? 'READY' : 'CHOOSING LOADOUT') : 'Share your room code'}</small></div><em>{player?.ready ? 'READY' : player ? 'HERE' : '...'}</em></div>; })}</div><div className="lobby-actions"><button className={me?.ready ? 'secondary-button active' : 'primary-button'} onClick={ready}>{me?.ready ? 'Not Ready' : 'Ready Up'}</button>{me?.id === room.hostId && <button className="secondary-button" disabled={!everyoneReady} onClick={start}>Start Match</button>}<button className="icon-button" title="Leave room" aria-label="Leave room" onClick={leave}><LogOut size={19} /></button></div></section>;
}

function Game({ room, me, send, controls }) {
  const [value, setValue] = useState(''); const [errors, setErrors] = useState(0); const [started, setStarted] = useState(Date.now()); const input = useRef(null);
  const opponent = room.players.find((player) => player.id !== me?.id); const command = me?.command;
  const seconds = room.phase === 'countdown' ? Math.max(0, Math.ceil((room.countdownEndsAt - Date.now()) / 1000)) : Math.max(0, Math.ceil((room.matchEndsAt - Date.now()) / 1000));
  const [clock, setClock] = useState(seconds); useEffect(() => { const id = setInterval(() => setClock(room.phase === 'countdown' ? Math.max(0, Math.ceil((room.countdownEndsAt - Date.now()) / 1000)) : Math.max(0, Math.ceil((room.matchEndsAt - Date.now()) / 1000))), 150); return () => clearInterval(id); }, [room.phase, room.countdownEndsAt, room.matchEndsAt]);
  useEffect(() => { setValue(''); setErrors(0); setStarted(Date.now()); input.current?.focus(); }, [command?.id]);
  const target = command?.text || ''; const typed = Array.from(value.normalize('NFC')); const targetChars = Array.from(target); const correct = typed.reduce((sum, char, index) => sum + (char === targetChars[index] ? 1 : 0), 0); const accuracy = typed.length ? Math.round(correct / typed.length * 100) : 100;
  const change = (next) => { setValue(next); if (next.length > value.length) { const i = Array.from(next).length - 1; if (Array.from(next)[i] !== targetChars[i]) setErrors((count) => count + 1); } if (next.normalize('NFC').trim() === target) send(next, errors); };
  const elapsed = Math.max(1, (Date.now() - started) / 60000); const liveWpm = Math.round((correct / 5) / elapsed);
  return <section className="game-screen"><div className="hud"><Health player={room.players[0]} /> <div className="timer"><span>{room.phase === 'countdown' ? (clock ? clock : 'GO') : `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`}</span><small>{room.phase === 'countdown' ? 'GET READY' : 'TIME LEFT'}</small></div><Health player={room.players[1]} flip /></div><Arena players={room.players} event={room.lastEvent} /><div className="command-zone"><div className="action-chip">{actionLabel[command?.action] || 'Prepare'} <span>{command?.action === 'attack' ? '!' : command?.action === 'defense' ? '[]' : command?.action === 'dodge' ? '<>' : command?.action === 'move' ? '->' : command?.action === 'counter' ? '*' : '+'}</span></div><div className="target-text" lang={command?.language === 'hindi' ? 'hi' : 'en'}>{targetChars.map((char, index) => <span key={`${char}-${index}`} className={index < typed.length ? (typed[index] === char ? 'correct' : 'wrong') : ''}>{char}</span>)}</div><input ref={input} className="typing-input" value={value} onChange={(event) => change(event.target.value)} disabled={room.phase !== 'playing'} placeholder={room.phase === 'countdown' ? 'The battle is about to begin...' : 'Type the command here'} autoComplete="off" autoCapitalize="off" spellCheck="false" /><div className="progress"><span style={{ width: `${targetChars.length ? clamp(correct / targetChars.length * 100, 0, 100) : 0}%` }} /></div><p className="context-hint">{room.phase === 'playing' ? `Stuck? Type the highlighted command to ${actionLabel[command?.action]?.toLowerCase() || 'act'}.` : 'Get your fingers ready.'}</p></div><div className="live-stats"><Stat label="WPM" value={liveWpm} /><Stat label="Accuracy" value={`${accuracy}%`} /><Stat label="Errors" value={errors} /><Stat label="Streak" value={me?.stats?.streak || 0} /></div><button className="controls-float" onClick={controls}><HelpCircle size={18} /> Controls</button></section>;
}

function Health({ player, flip }) { return <div className={`health ${flip ? 'flip' : ''}`}><div><b>{player?.name || 'Waiting...'}</b><small>{player?.health ?? 0} HP</small></div><div className="health-track"><span style={{ width: `${player?.health ?? 0}%` }} /></div></div>; }
function Arena({ players, event }) { const one = players[0]; const two = players[1]; return <div className="arena"><div className="arena-grid" /><div className="arena-message">{event?.outcome || event?.message || 'The arena awaits'}</div><Fighter player={one} event={event} side="left" /><Fighter player={two} event={event} side="right" /><div className={`impact ${event?.damage ? 'show' : ''}`} style={{ left: `${event?.targetId === one?.id ? one?.position : two?.position}%` }}>{event?.damage ? `-${event.damage}` : ''}</div></div>; }
function Fighter({ player, event, side }) { const active = event?.actorId === player?.id ? event.type : ''; const hit = event?.targetId === player?.id && event?.damage; return <div className={`fighter ${side} ${active} ${hit ? 'hit' : ''}`} style={{ left: `${player?.position || (side === 'left' ? 28 : 72)}%` }}><div className="fighter-name">{player?.name || '...'}</div><div className="head" /><div className="body"><i /><i /></div><div className="legs"><i /><i /></div></div>; }
function Stat({ label, value }) { return <div><small>{label}</small><b>{value}</b></div>; }

function Results({ room, me, rematch, leave }) { const winner = room.players.find((player) => player.id === room.winnerId); const metrics = (player) => { const minutes = Math.max(1 / 60, (Date.now() - player.stats.startedAt) / 60000); return { wpm: Math.round((player.stats.correctChars / 5) / minutes), accuracy: Math.round(player.stats.correctChars / Math.max(1, player.stats.correctChars + player.stats.errors) * 100) }; }; return <section className="results"><div className="section-kicker">MATCH COMPLETE</div><h1>{winner ? winner.id === me?.id ? 'Victory!' : `${winner.name} wins` : 'Draw!'}</h1><p>{winner ? `${winner.name} controlled the arena.` : 'Neither fighter gave an inch.'}</p><div className="result-score">{room.players.map((player) => <div key={player.id} className={player.id === winner?.id ? 'winner' : ''}><b>{player.name}</b><strong>{player.health} HP</strong><small>{player.stats.score} SCORE</small></div>)}</div><div className="results-grid">{room.players.map((player) => <div className="result-stats" key={player.id}><h2>{player.name}</h2><p>WPM <b>{metrics(player).wpm}</b></p><p>Accuracy <b>{metrics(player).accuracy}%</b></p><p>Damage dealt <b>{player.stats.damageDealt}</b></p><p>Blocks / dodges <b>{player.stats.blocks} / {player.stats.dodges}</b></p><p>Errors <b>{player.stats.errors}</b></p><p>Best streak <b>{player.stats.bestStreak}</b></p><p>Words / sentences <b>{player.stats.completedWords} / {player.stats.completedSentences}</b></p></div>)}</div><div className="lobby-actions"><button className="primary-button" onClick={rematch}>Rematch</button><button className="secondary-button" onClick={leave}>Return Home</button></div></section>; }

function HowTo({ close }) { return <div className="modal-backdrop" onMouseDown={close}><section className="howto" onMouseDown={(event) => event.stopPropagation()}><button className="icon-button modal-close" onClick={close} aria-label="Close controls">x</button><div className="section-kicker">CONTROLS</div><h2>Type. React. Win.</h2><p>Each prompt has an action above it. Finish the highlighted text exactly to perform that action. Hindi prompts use standard Unicode text; switch to a Hindi keyboard or transliteration input in your browser or operating system when needed.</p><div className="how-grid">{actions.map(([title, description]) => <div key={title}><b>{title}</b><span>{description}</span></div>)}</div><button className="primary-button" onClick={close}>Ready to fight</button></section></div>; }

export default App;
