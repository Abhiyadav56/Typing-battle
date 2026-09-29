import { useEffect, useRef, useState } from "react";
import {
  Copy,
  Gamepad2,
  HelpCircle,
  LogOut,
  Pause,
  Play,
  Swords,
  Users,
  X,
} from "lucide-react";
import { io } from "socket.io-client";
import { nextCommand, normalizeText } from "../../shared/content.js";
import { english, hindi } from "../../shared/contentData.js";

const socket = io(import.meta.env.VITE_SERVER_URL || window.location.origin, {
  autoConnect: false,
  transports: ["websocket", "polling"],
});
const languageLabel = {
  english: "English",
  hindi: "Hindi",
  both: "English + Hindi",
};
const actionLabel = {
  attack: "Strike",
  defense: "Guard",
  dodge: "Dodge",
  move: "Advance",
  counter: "Counter",
  special: "Special",
};
const actions = [
  ["Strike", "Complete an attack command to damage your opponent."],
  ["Guard", "Complete a defense command to reduce an incoming hit."],
  ["Dodge", "Complete a dodge command to avoid an incoming hit."],
  ["Advance", "Move toward the center to take space."],
  ["Counter", "Use after an enemy attack for its full power."],
  ["Special", "A heavy attack with a longer cooldown."],
];
const freshName = () => `Fighter ${Math.floor(100 + Math.random() * 900)}`;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const soloConfig = {
  easy: { duration: 90, attackEvery: 5200, damage: 8 },
  medium: { duration: 75, attackEvery: 4000, damage: 11 },
  hard: { duration: 60, attackEvery: 3000, damage: 14 },
};

function makeSoloGame(name, settings) {
  const startedAt = Date.now();
  return {
    startedAt,
    endsAt: startedAt + soloConfig[settings.difficulty].duration * 1000,
    nextAttackAt: startedAt + soloConfig[settings.difficulty].attackEvery,
    player: {
      id: "solo-player",
      name: name || "You",
      health: 100,
      position: 28,
      stats: {
        correctChars: 0,
        errors: 0,
        streak: 0,
        bestStreak: 0,
        damageDealt: 0,
        blocks: 0,
        dodges: 0,
        completedWords: 0,
        completedSentences: 0,
      },
    },
    rival: { id: "solo-rival", name: "Arena AI", health: 100, position: 72 },
    commandSequence: 0,
    command: nextCommand({
      language: settings.language,
      difficulty: settings.difficulty,
      sequence: 0,
      seed: 62,
      english,
      hindi,
    }),
    defenseUntil: 0,
    dodgeUntil: 0,
    rivalLastAttackAt: 0,
    event: {
      type: "solo",
      message: "The arena AI is watching your first move.",
    },
    paused: false,
    pausedAt: null,
    finished: false,
    winner: null,
  };
}

function App() {
  const [screen, setScreen] = useState("home");
  const [room, setRoom] = useState(null);
  const [message, setMessage] = useState("");
  const [name, setName] = useState(
    () => sessionStorage.getItem("tb-name") || freshName(),
  );
  const [settings, setSettings] = useState({
    language: "english",
    difficulty: "medium",
  });
  const [joinCode, setJoinCode] = useState("");
  const [token, setToken] = useState(
    () => sessionStorage.getItem("tb-token") || "",
  );
  const [howTo, setHowTo] = useState(false);
  const timer = useRef(null);
  const currentPlayer = room?.players.find((player) => player.id === socket.id);

  const connect = (job) => {
    if (socket.connected) return job();
    socket.connect();
    socket.once("connect", job);
  };
  const saveSession = (nextRoom, nextToken) => {
    sessionStorage.setItem("tb-code", nextRoom.code);
    sessionStorage.setItem("tb-token", nextToken);
    sessionStorage.setItem("tb-name", name);
    setToken(nextToken);
  };
  const enter = (mode) =>
    connect(() => {
      const payload =
        mode === "create"
          ? { ...settings, name }
          : { code: joinCode.toUpperCase(), name };
      socket.emit(
        mode === "create" ? "create_room" : "join_room",
        payload,
        (result) => {
          if (!result?.ok)
            return setMessage(result?.message || "Could not enter that arena.");
          setRoom(result.room);
          saveSession(result.room, result.token);
          setScreen("lobby");
          setMessage("");
        },
      );
    });
  const leave = () => {
    socket.emit("leave_room");
    sessionStorage.removeItem("tb-code");
    sessionStorage.removeItem("tb-token");
    setRoom(null);
    setScreen("home");
  };

  useEffect(() => {
    const state = (next) => {
      setRoom(next);
      if (next.phase === "countdown" || next.phase === "playing" || next.phase === "paused")
        setScreen("game");
      if (next.phase === "finished") setScreen("results");
    };
    const event = (data) => {
      setRoom((old) => (old ? { ...old, lastEvent: data } : old));
    };
    const disconnected = () =>
      setMessage("Connection interrupted. Reconnecting to the arena...");
    const restore = () => {
      const code = sessionStorage.getItem("tb-code");
      const savedToken = sessionStorage.getItem("tb-token");
      if (code && savedToken)
        socket.emit("reconnect_game", { code, token: savedToken }, (result) => {
          if (result?.ok) {
            setRoom(result.room);
            setToken(result.token);
            setMessage("");
          }
        });
    };
    socket.on("room_state", state);
    socket.on("combat_event", event);
    socket.on("match_end", state);
    socket.on("disconnect", disconnected);
    socket.on("connect", restore);
    return () => {
      socket.off("room_state", state);
      socket.off("combat_event", event);
      socket.off("match_end", state);
      socket.off("disconnect", disconnected);
      socket.off("connect", restore);
    };
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = (text) => {
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(""), 2800);
  };
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      flash("Room code copied.");
    } catch {
      flash(`Share this code: ${room.code}`);
    }
  };
  const ready = () => socket.emit("set_ready", !currentPlayer?.ready, () => {});
  const start = () =>
    socket.emit("start_match", (result) => {
      if (!result?.ok)
        flash(result?.message || "Both fighters need to be ready.");
    });
  const rematch = () => socket.emit("rematch");
  const togglePause = () => socket.emit("toggle_pause", (result) => {
    if (!result?.ok) flash("Pause is only available during an active match.");
    else if (result.requested) flash("Pause request sent. Waiting for the other fighter.");
  });

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={leave}>
          <Swords size={22} /> Typing Battle
        </button>
        {room && (
          <div className="room-pill">
            <Users size={15} /> Room {room.code}
          </div>
        )}
        <button
          className="icon-button"
          aria-label="How to play"
          title="How to play"
          onClick={() => setHowTo(true)}
        >
          <HelpCircle size={20} />
        </button>
      </header>
      {message && <div className="toast">{message}</div>}
      {screen === "home" && (
        <Home
          name={name}
          setName={setName}
          settings={settings}
          setSettings={setSettings}
          joinCode={joinCode}
          setJoinCode={setJoinCode}
          solo={() => setScreen("solo")}
          create={() => enter("create")}
          join={() => enter("join")}
          openHow={() => setHowTo(true)}
        />
      )}
      {screen === "lobby" && room && (
        <Lobby
          room={room}
          me={currentPlayer}
          copyCode={copyCode}
          ready={ready}
          start={start}
          leave={leave}
        />
      )}
      {screen === "game" && room && (
        <Game
          room={room}
          me={currentPlayer}
          send={(text, errors) =>
            socket.emit("command_complete", { text, errors })
          }
          controls={() => setHowTo(true)}
          pause={togglePause}
          exit={leave}
        />
      )}
      {screen === "results" && room && (
        <Results
          room={room}
          me={currentPlayer}
          rematch={rematch}
          leave={leave}
        />
      )}
      {screen === "solo" && (
        <SoloGame
          name={name}
          settings={settings}
          exit={() => setScreen("home")}
          controls={() => setHowTo(true)}
        />
      )}
      {howTo && <HowTo close={() => setHowTo(false)} />}
    </main>
  );
}

function Home({
  name,
  setName,
  settings,
  setSettings,
  joinCode,
  setJoinCode,
  solo,
  create,
  join,
  openHow,
}) {
  return (
    <section className="home">
      <div className="title-block">
        <div className="eyebrow">
          <Gamepad2 size={16} /> REAL-TIME 1V1 TYPING COMBAT
        </div>
        <h1>Typing Battle</h1>
        <p>
          Every completed command becomes a move. Outtype your rival, protect
          your health, and own the arena.
        </p>
      </div>
      <div className="home-grid">
        <div className="setup-panel">
          <label>
            Fighter name
            <input
              maxLength="18"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <span className="field-title">Language</span>
          <div className="segmented">
            {["english", "hindi", "both"].map((item) => (
              <button
                key={item}
                className={settings.language === item ? "selected" : ""}
                onClick={() => setSettings({ ...settings, language: item })}
              >
                {languageLabel[item]}
              </button>
            ))}
          </div>
          <span className="field-title">Difficulty</span>
          <div className="difficulty-grid">
            {["easy", "medium", "hard"].map((item) => (
              <button
                key={item}
                className={
                  settings.difficulty === item
                    ? `difficulty ${item} selected`
                    : `difficulty ${item}`
                }
                onClick={() => setSettings({ ...settings, difficulty: item })}
              >
                <b>{item}</b>
                <small>
                  {item === "easy"
                    ? "90 sec / relaxed"
                    : item === "medium"
                      ? "75 sec / balanced"
                      : "60 sec / fierce"}
                </small>
              </button>
            ))}
          </div>
          <button className="mode-button solo-mode" onClick={solo}>
            <Swords size={19} /> Solo
          </button>
          <button className="mode-button multiplayer-mode" onClick={create}>
            <Users size={19} /> Multiplayer
          </button>
        </div>
        <aside className="join-panel">
          <h2>Join a battle</h2>
          <p>
            Enter a room code to join a multiplayer battle.
          </p>
          <input
            className="code-input"
            placeholder="ABCDE"
            maxLength="5"
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
          />
          <button
            className="secondary-button"
            onClick={join}
            disabled={joinCode.length !== 5}
          >
            Join Room
          </button>
          <button className="text-button" onClick={openHow}>
            <HelpCircle size={17} /> How to play
          </button>
        </aside>
      </div>
      <section className="command-preview">
        <span>TYPE TO FIGHT</span>
        <div>
          <b>STRIKE</b>
          <i>!</i>
          <b>GUARD</b>
          <i>[]</i>
          <b>DODGE</b>
          <i>&lt;&gt;</i>
          <b>ADVANCE</b>
          <i>-&gt;</i>
        </div>
      </section>
    </section>
  );
}

function Lobby({ room, me, copyCode, ready, start, leave }) {
  const everyoneReady =
    room.players.length === 2 && room.players.every((player) => player.ready);
  return (
    <section className="lobby-screen">
      <div className="section-kicker">ARENA LOBBY</div>
      <h1>Gather your fighter</h1>
      <div className="code-card">
        <span>ROOM CODE</span>
        <strong>{room.code}</strong>
        <button
          className="icon-button"
          onClick={copyCode}
          title="Copy room code"
          aria-label="Copy room code"
        >
          <Copy size={19} />
        </button>
      </div>
      <p className="settings-line">
        {languageLabel[room.language]} <i /> {room.difficulty} difficulty
      </p>
      <div className="fighter-list">
        {[0, 1].map((side) => {
          const player = room.players.find((item) => item.side === side);
          return (
            <div
              key={side}
              className={`fighter-slot ${player ? "occupied" : ""}`}
            >
              <div className="mini-fighter">
                <span />
              </div>
              <div>
                <b>{player?.name || "Waiting for opponent..."}</b>
                <small>
                  {player
                    ? player.ready
                      ? "READY"
                      : "CHOOSING LOADOUT"
                    : "Share your room code"}
                </small>
              </div>
              <em>{player?.ready ? "READY" : player ? "HERE" : "..."}</em>
            </div>
          );
        })}
      </div>
      <div className="lobby-actions">
        <button
          className={me?.ready ? "secondary-button active" : "primary-button"}
          onClick={ready}
        >
          {me?.ready ? "Not Ready" : "Ready Up"}
        </button>
        {me?.id === room.hostId && (
          <button
            className="secondary-button"
            disabled={!everyoneReady}
            onClick={start}
          >
            Start Match
          </button>
        )}
        <button
          className="icon-button"
          title="Leave room"
          aria-label="Leave room"
          onClick={leave}
        >
          <LogOut size={19} />
        </button>
      </div>
    </section>
  );
}

function Game({ room, me, send, controls, pause, exit }) {
  const [value, setValue] = useState("");
  const [errors, setErrors] = useState(0);
  const [started, setStarted] = useState(Date.now());
  const input = useRef(null);
  const command = me?.command;
  const paused = room.phase === "paused";
  const seconds =
    room.phase === "countdown"
      ? Math.max(0, Math.ceil((room.countdownEndsAt - Date.now()) / 1000))
      : Math.max(0, Math.ceil((room.matchEndsAt - Date.now()) / 1000));
  const [clock, setClock] = useState(seconds);
  useEffect(() => {
    if (room.phase === "paused") return undefined;
    const id = setInterval(
      () =>
        setClock(
          room.phase === "countdown"
            ? Math.max(0, Math.ceil((room.countdownEndsAt - Date.now()) / 1000))
            : Math.max(0, Math.ceil((room.matchEndsAt - Date.now()) / 1000)),
        ),
      150,
    );
    return () => clearInterval(id);
  }, [room.phase, room.countdownEndsAt, room.matchEndsAt]);
  useEffect(() => {
    setValue("");
    setErrors(0);
    setStarted(Date.now());
    input.current?.focus();
  }, [command?.id]);
  const target = command?.text || "";
  const typed = Array.from(value.normalize("NFC"));
  const targetChars = Array.from(target);
  const correct = typed.reduce(
    (sum, char, index) => sum + (char === targetChars[index] ? 1 : 0),
    0,
  );
  const accuracy = typed.length
    ? Math.round((correct / typed.length) * 100)
    : 100;
  const change = (next) => {
    setValue(next);
    if (next.length > value.length) {
      const i = Array.from(next).length - 1;
      if (Array.from(next)[i] !== targetChars[i])
        setErrors((count) => count + 1);
    }
    if (next.normalize("NFC").trim() === target) send(next, errors);
  };
  const elapsed = Math.max(1, (Date.now() - started) / 60000);
  const liveWpm = Math.round(correct / 5 / elapsed);
  return (
    <section className="game-screen">
      <div className="hud">
        <Health player={room.players[0]} />{" "}
        <div className="timer">
          <span>
            {room.phase === "countdown"
              ? clock
                ? clock
                : "GO"
              : `${String(Math.floor(clock / 60)).padStart(2, "0")}:${String(clock % 60).padStart(2, "0")}`}
          </span>
          <small>{paused ? "PAUSED" : room.phase === "countdown" ? "GET READY" : "TIME LEFT"}</small>
        </div>
        <Health player={room.players[1]} flip />
      </div>
      <Arena players={room.players} event={room.lastEvent} />
      {paused && <div className="pause-notice">Paused. Both fighters can select resume.</div>}
      <div className="command-zone">
        <div className="action-chip">
          {actionLabel[command?.action] || "Prepare"}{" "}
          <span>
            {command?.action === "attack"
              ? "!"
              : command?.action === "defense"
                ? "[]"
                : command?.action === "dodge"
                  ? "<>"
                  : command?.action === "move"
                    ? "->"
                    : command?.action === "counter"
                      ? "*"
                      : "+"}
          </span>
        </div>
        <div
          className="target-text"
          lang={command?.language === "hindi" ? "hi" : "en"}
        >
          {targetChars.map((char, index) => (
            <span
              key={`${char}-${index}`}
              className={
                index < typed.length
                  ? typed[index] === char
                    ? "correct"
                    : "wrong"
                  : ""
              }
            >
              {char}
            </span>
          ))}
        </div>
        <input
          ref={input}
          className="typing-input"
          value={value}
          onChange={(event) => change(event.target.value)}
          disabled={room.phase !== "playing"}
          placeholder={
            room.phase === "countdown"
              ? "The battle is about to begin..."
              : "Type the command here"
          }
          autoComplete="off"
          autoCapitalize="off"
          spellCheck="false"
        />
        <div className="progress">
          <span
            style={{
              width: `${targetChars.length ? clamp((correct / targetChars.length) * 100, 0, 100) : 0}%`,
            }}
          />
        </div>
        <p className="context-hint">
          {room.phase === "playing"
            ? `Stuck? Type the highlighted command to ${actionLabel[command?.action]?.toLowerCase() || "act"}.`
            : "Get your fingers ready."}
        </p>
      </div>
      <div className="live-stats">
        <Stat label="WPM" value={liveWpm} />
        <Stat label="Accuracy" value={`${accuracy}%`} />
        <Stat label="Errors" value={errors} />
        <Stat label="Streak" value={me?.stats?.streak || 0} />
      </div>
      <button className="controls-float" onClick={controls}>
        <HelpCircle size={18} /> Controls
      </button>
      <GameActions paused={paused} pause={pause} exit={exit} />
    </section>
  );
}

function SoloGame({ name, settings, exit, controls }) {
  const [game, setGame] = useState(() => makeSoloGame(name, settings));
  const [value, setValue] = useState("");
  const [errors, setErrors] = useState(0);
  const input = useRef(null);
  const command = game.command;
  const targetChars = Array.from(command.text);
  const typed = Array.from(value.normalize("NFC"));
  const correct = typed.reduce(
    (total, character, index) =>
      total + (character === targetChars[index] ? 1 : 0),
    0,
  );
  const accuracy = typed.length
    ? Math.round((correct / typed.length) * 100)
    : 100;
  const [clock, setClock] = useState(() =>
    Math.ceil((game.endsAt - Date.now()) / 1000),
  );

  useEffect(() => {
    input.current?.focus();
    setValue("");
    setErrors(0);
  }, [command.id]);
  useEffect(() => {
    if (game.paused) return undefined;
    const interval = setInterval(() => {
      const now = Date.now();
      setGame((previous) => {
        if (previous.finished || previous.paused) return previous;
        const secondsLeft = previous.endsAt - now;
        if (secondsLeft <= 0)
          return {
            ...previous,
            finished: true,
            winner:
              previous.player.health === previous.rival.health
                ? "draw"
                : previous.player.health > previous.rival.health
                  ? "player"
                  : "rival",
            event: { type: "finish", message: "Time is up." },
          };
        if (now < previous.nextAttackAt) return previous;
        const dodged = previous.dodgeUntil > now;
        const guarded = previous.defenseUntil > now;
        const rawDamage = soloConfig[settings.difficulty].damage;
        const damage = dodged
          ? 0
          : guarded
            ? Math.ceil(rawDamage * 0.25)
            : rawDamage;
        const health = Math.max(0, previous.player.health - damage);
        return {
          ...previous,
          player: { ...previous.player, health },
          nextAttackAt: now + soloConfig[settings.difficulty].attackEvery,
          rivalLastAttackAt: now,
          finished: health === 0,
          winner: health === 0 ? "rival" : null,
          event: {
            type: "attack",
            actorId: previous.rival.id,
            targetId: previous.player.id,
            damage,
            outcome: dodged
              ? "AI attack dodged"
              : guarded
                ? "AI attack blocked"
                : "Arena AI strikes",
          },
        };
      });
      setClock(Math.max(0, Math.ceil((game.endsAt - now) / 1000)));
    }, 150);
    return () => clearInterval(interval);
  }, [game.endsAt, game.paused, settings.difficulty]);

  const complete = (text, completedErrors) => {
    if (normalizeText(text) !== command.text || game.finished || game.paused) return;
    const now = Date.now();
    setGame((previous) => {
      const action = previous.command.action;
      let damage = 0;
      let position = previous.player.position;
      let outcome = actionLabel[action];
      const player = {
        ...previous.player,
        stats: { ...previous.player.stats },
      };
      player.stats.correctChars += targetChars.length;
      player.stats.errors += completedErrors;
      player.stats.streak += 1;
      player.stats.bestStreak = Math.max(
        player.stats.bestStreak,
        player.stats.streak,
      );
      if (previous.command.text.includes(" "))
        player.stats.completedSentences += 1;
      else player.stats.completedWords += 1;
      if (action === "move") {
        position = Math.min(55, position + 9);
        outcome = "You advance";
      }
      if (action === "defense") {
        player.stats.blocks += 1;
        outcome = "Guard raised";
      }
      if (action === "dodge") {
        player.stats.dodges += 1;
        outcome = "Ready to dodge";
      }
      if (["attack", "counter", "special"].includes(action)) {
        damage =
          action === "special"
            ? 19
            : action === "counter" && now - previous.rivalLastAttackAt < 1600
              ? 15
              : action === "counter"
                ? 7
                : 10;
        damage += position >= 46 ? 2 : 0;
        outcome = damage > 0 ? `${actionLabel[action]} lands` : outcome;
      }
      const rivalHealth = Math.max(0, previous.rival.health - damage);
      player.health = previous.player.health;
      player.position = position;
      player.stats.damageDealt += damage;
      const nextSequence = previous.commandSequence + 1;
      return {
        ...previous,
        player,
        rival: { ...previous.rival, health: rivalHealth },
        commandSequence: nextSequence,
        command: nextCommand({
          language: settings.language,
          difficulty: settings.difficulty,
          sequence: nextSequence,
          seed: 62,
          english,
          hindi,
        }),
        defenseUntil: action === "defense" ? now + 1700 : previous.defenseUntil,
        dodgeUntil: action === "dodge" ? now + 1400 : previous.dodgeUntil,
        finished: rivalHealth === 0,
        winner: rivalHealth === 0 ? "player" : null,
        event: {
          type: action,
          actorId: player.id,
          targetId: previous.rival.id,
          damage,
          outcome,
        },
      };
    });
  };
  const change = (next) => {
    const nextChars = Array.from(next);
    const nextErrors =
      nextChars.length > typed.length &&
      nextChars[nextChars.length - 1] !== targetChars[nextChars.length - 1]
        ? errors + 1
        : errors;
    setValue(next);
    setErrors(nextErrors);
    if (normalizeText(next) === command.text) complete(next, nextErrors);
  };
  const minutes = Math.max(1 / 60, (Date.now() - game.startedAt) / 60000);
  const wpm = Math.round(game.player.stats.correctChars / 5 / minutes);
  const togglePause = () => {
    const now = Date.now();
    setGame((previous) => {
      if (previous.finished) return previous;
      if (!previous.paused) return { ...previous, paused: true, pausedAt: now, event: { type: "pause", message: "Solo battle paused." } };
      const pausedFor = now - previous.pausedAt;
      return { ...previous, paused: false, pausedAt: null, endsAt: previous.endsAt + pausedFor, nextAttackAt: previous.nextAttackAt + pausedFor, defenseUntil: previous.defenseUntil + pausedFor, dodgeUntil: previous.dodgeUntil + pausedFor, event: { type: "resume", message: "Solo battle resumed." } };
    });
  };
  if (game.finished)
    return (
      <SoloResults
        game={game}
        restart={() => setGame(makeSoloGame(name, settings))}
        exit={exit}
      />
    );
  return (
    <section className="game-screen">
      <div className="solo-banner">
        SOLO BATTLE <span>Offline against Arena AI</span>
      </div>
      <div className="hud">
        <Health player={game.player} />{" "}
        <div className="timer">
          <span>{`${String(Math.floor(clock / 60)).padStart(2, "0")}:${String(clock % 60).padStart(2, "0")}`}</span>
          <small>{game.paused ? "PAUSED" : "TIME LEFT"}</small>
        </div>
        <Health player={game.rival} flip />
      </div>
      <Arena players={[game.player, game.rival]} event={game.event} />
      {game.paused && <div className="pause-notice">Solo battle paused.</div>}
      <div className="command-zone">
        <div className="action-chip">
          {actionLabel[command.action]}{" "}
          <span>
            {command.action === "attack"
              ? "!"
              : command.action === "defense"
                ? "[]"
                : command.action === "dodge"
                  ? "<>"
                  : command.action === "move"
                    ? "->"
                    : command.action === "counter"
                      ? "*"
                      : "+"}
          </span>
        </div>
        <div
          className="target-text"
          lang={command.language === "hindi" ? "hi" : "en"}
        >
          {targetChars.map((character, index) => (
            <span
              key={`${character}-${index}`}
              className={
                index < typed.length
                  ? typed[index] === character
                    ? "correct"
                    : "wrong"
                  : ""
              }
            >
              {character}
            </span>
          ))}
        </div>
        <input
          ref={input}
          className="typing-input"
          value={value}
          onChange={(event) => change(event.target.value)}
          disabled={game.paused}
          placeholder="Type the command here"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck="false"
        />
        <div className="progress">
          <span
            style={{
              width: `${clamp((correct / targetChars.length) * 100, 0, 100)}%`,
            }}
          />
        </div>
        <p className="context-hint">
          Stuck? Type the highlighted command to{" "}
          {actionLabel[command.action].toLowerCase()}.
        </p>
      </div>
      <div className="live-stats">
        <Stat label="WPM" value={wpm} />
        <Stat label="Accuracy" value={`${accuracy}%`} />
        <Stat label="Errors" value={errors} />
        <Stat label="Streak" value={game.player.stats.streak} />
      </div>
      <button className="controls-float" onClick={controls}>
        <HelpCircle size={18} /> Controls
      </button>
      <GameActions paused={game.paused} pause={togglePause} exit={exit} />
    </section>
  );
}

function SoloResults({ game, restart, exit }) {
  const player = game.player;
  const minutes = Math.max(1 / 60, (Date.now() - game.startedAt) / 60000);
  const wpm = Math.round(player.stats.correctChars / 5 / minutes);
  const accuracy = Math.round(
    (player.stats.correctChars /
      Math.max(1, player.stats.correctChars + player.stats.errors)) *
      100,
  );
  const title =
    game.winner === "player"
      ? "Victory!"
      : game.winner === "draw"
        ? "Draw!"
        : "Arena AI wins";
  return (
    <section className="results">
      <div className="section-kicker">SOLO MATCH COMPLETE</div>
      <h1>{title}</h1>
      <p>
        {game.winner === "player"
          ? "You outtyped the Arena AI."
          : game.winner === "draw"
            ? "Neither side gave an inch."
            : "Reset and take the next round."}
      </p>
      <div className="result-score">
        <div className={game.winner === "player" ? "winner" : ""}>
          <b>{player.name}</b>
          <strong>{player.health} HP</strong>
          <small>{player.stats.damageDealt} DAMAGE</small>
        </div>
        <div className={game.winner === "rival" ? "winner" : ""}>
          <b>Arena AI</b>
          <strong>{game.rival.health} HP</strong>
          <small>AI OPPONENT</small>
        </div>
      </div>
      {game.winner !== "draw" && <VictoryScene winner={game.winner === "player" ? player : game.rival} loser={game.winner === "player" ? game.rival : player} />}
      <div className="results-grid solo-results">
        <div className="result-stats">
          <h2>Your typing</h2>
          <p>
            WPM <b>{wpm}</b>
          </p>
          <p>
            Accuracy <b>{accuracy}%</b>
          </p>
          <p>
            Errors <b>{player.stats.errors}</b>
          </p>
          <p>
            Best streak <b>{player.stats.bestStreak}</b>
          </p>
          <p>
            Blocks / dodges{" "}
            <b>
              {player.stats.blocks} / {player.stats.dodges}
            </b>
          </p>
          <p>
            Words / sentences{" "}
            <b>
              {player.stats.completedWords} / {player.stats.completedSentences}
            </b>
          </p>
        </div>
      </div>
      <div className="lobby-actions">
        <button className="primary-button" onClick={restart}>
          Play Again
        </button>
        <button className="secondary-button" onClick={exit}>
          Return Home
        </button>
      </div>
    </section>
  );
}

function Health({ player, flip }) {
  return (
    <div className={`health ${flip ? "flip" : ""}`}>
      <div>
        <b>{player?.name || "Waiting..."}</b>
        <small>{player?.health ?? 0} HP</small>
      </div>
      <div className="health-track">
        <span style={{ width: `${player?.health ?? 0}%` }} />
      </div>
    </div>
  );
}
function Arena({ players, event }) {
  const one = players[0];
  const two = players[1];
  return (
    <div className="arena">
      <div className="arena-grid" />
      <div className="arena-message">
        {event?.outcome || event?.message || "The arena awaits"}
      </div>
      <Fighter player={one} event={event} side="left" />
      <Fighter player={two} event={event} side="right" />
      <div
        className={`impact ${event?.damage ? "show" : ""}`}
        style={{
          left: `${event?.targetId === one?.id ? one?.position : two?.position}%`,
        }}
      >
        {event?.damage ? `-${event.damage}` : ""}
        <span className="impact-spray"><i /><i /><i /><i /></span>
      </div>
    </div>
  );
}
function Fighter({ player, event, side, pose = "" }) {
  const active = event?.actorId === player?.id ? event.type : "";
  const hit = event?.targetId === player?.id && event?.damage;
  return (
    <div
      className={`fighter ${side} ${active} ${hit ? "hit" : ""} ${pose}`}
      style={{ left: `${player?.position || (side === "left" ? 28 : 72)}%` }}
    >
      <div className="fighter-name">{player?.name || "..."}</div>
      <div className="head" />
      <div className="body">
        <i />
        <i />
      </div>
      <div className="legs">
        <i />
        <i />
      </div>
    </div>
  );
}

function VictoryScene({ winner, loser }) {
  if (!winner || !loser) return null;
  return <div className="victory-scene"><Fighter player={{ ...winner, position: 35 }} side="left" pose="celebrate" /><Fighter player={{ ...loser, position: 71 }} side="right" pose="fallen" /><div className="victory-caption">FINISH</div></div>;
}

function GameActions({ paused, pause, exit }) {
  return <div className="game-actions"><button className="utility-button" onClick={pause}>{paused ? <Play size={16} /> : <Pause size={16} />}{paused ? "Resume" : "Pause"}</button><button className="utility-button exit-button" onClick={exit}><X size={17} /> Exit</button></div>;
}

function Stat({ label, value }) {
  return (
    <div>
      <small>{label}</small>
      <b>{value}</b>
    </div>
  );
}

function Results({ room, me, rematch, leave }) {
  const winner = room.players.find((player) => player.id === room.winnerId);
  const metrics = (player) => {
    const minutes = Math.max(
      1 / 60,
      (Date.now() - player.stats.startedAt) / 60000,
    );
    return {
      wpm: Math.round(player.stats.correctChars / 5 / minutes),
      accuracy: Math.round(
        (player.stats.correctChars /
          Math.max(1, player.stats.correctChars + player.stats.errors)) *
          100,
      ),
    };
  };
  return (
    <section className="results">
      <div className="section-kicker">MATCH COMPLETE</div>
      <h1>
        {winner
          ? winner.id === me?.id
            ? "Victory!"
            : `${winner.name} wins`
          : "Draw!"}
      </h1>
      <p>
        {winner
          ? `${winner.name} controlled the arena.`
          : "Neither fighter gave an inch."}
      </p>
      <div className="result-score">
        {room.players.map((player) => (
          <div
            key={player.id}
            className={player.id === winner?.id ? "winner" : ""}
          >
            <b>{player.name}</b>
            <strong>{player.health} HP</strong>
            <small>{player.stats.score} SCORE</small>
          </div>
        ))}
      </div>
      {winner && <VictoryScene winner={winner} loser={room.players.find((player) => player.id !== winner.id)} />}
      <div className="results-grid">
        {room.players.map((player) => (
          <div className="result-stats" key={player.id}>
            <h2>{player.name}</h2>
            <p>
              WPM <b>{metrics(player).wpm}</b>
            </p>
            <p>
              Accuracy <b>{metrics(player).accuracy}%</b>
            </p>
            <p>
              Damage dealt <b>{player.stats.damageDealt}</b>
            </p>
            <p>
              Blocks / dodges{" "}
              <b>
                {player.stats.blocks} / {player.stats.dodges}
              </b>
            </p>
            <p>
              Errors <b>{player.stats.errors}</b>
            </p>
            <p>
              Best streak <b>{player.stats.bestStreak}</b>
            </p>
            <p>
              Words / sentences{" "}
              <b>
                {player.stats.completedWords} /{" "}
                {player.stats.completedSentences}
              </b>
            </p>
          </div>
        ))}
      </div>
      <div className="lobby-actions">
        <button className="primary-button" onClick={rematch}>
          Rematch
        </button>
        <button className="secondary-button" onClick={leave}>
          Return Home
        </button>
      </div>
    </section>
  );
}

function HowTo({ close }) {
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <section
        className="howto"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="icon-button modal-close"
          onClick={close}
          aria-label="Close controls"
        >
          x
        </button>
        <div className="section-kicker">CONTROLS</div>
        <h2>Type. React. Win.</h2>
        <p>
          Each prompt has an action above it. Finish the highlighted text
          exactly to perform that action. Hindi prompts use standard Unicode
          text; switch to a Hindi keyboard or transliteration input in your
          browser or operating system when needed.
        </p>
        <div className="how-grid">
          {actions.map(([title, description]) => (
            <div key={title}>
              <b>{title}</b>
              <span>{description}</span>
            </div>
          ))}
        </div>
        <button className="primary-button" onClick={close}>
          Ready to fight
        </button>
      </section>
    </div>
  );
}

export default App;
