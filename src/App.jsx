// TAP DASH SHOWDOWN — Modern Arcade Edition
import React, { useEffect, useRef, useState } from "react";
import './arcade.css';

// -----------------------------
// Configuration
// -----------------------------
const ROUND_SECONDS = 30;
const TARGET_BASE_LIFE = 900;
const BOMB_CHANCE = 0.12;

// -----------------------------
// Helper: Retro sound generator using WebAudio (no external assets)
// -----------------------------
function useRetroAudio() {
  const ctxRef = useRef(null);
  useEffect(() => {
    try {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      ctxRef.current = null;
    }
  }, []);

  function pinger(freq = 440, type = 'sine', duration = 0.06, gain = 0.12) {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + duration);
    // quick fade
    g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  }

  function coinSound() { pinger(880, 'square', 0.18, 0.14); }
  function hitSound() { pinger(1200, 'square', 0.06, 0.08); }
  function bombSound() { pinger(150, 'sawtooth', 0.2, 0.18); }
  function explodeSound() { pinger(600, 'sawtooth', 0.18, 0.12); }

  return { coinSound, hitSound, bombSound, explodeSound };
}

// -----------------------------
// Main App
// -----------------------------
export default function App() {
  const audio = useRetroAudio();

  // game state
  const [mode, setMode] = useState('single'); // 'single' | 'versus'
  const [running, setRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [leaderboard, setLeaderboard] = useState(() => JSON.parse(localStorage.getItem('tapdash_lb') || '[]'));

  // players state
  const [players, setPlayers] = useState({
    p1: { score: 0, target: null },
    p2: { score: 0, target: null },
  });

  // refs for intervals/timers
  const timerRef = useRef(null);
  const spawnRef = useRef({ p1: null, p2: null });
  const targetTimeoutRef = useRef({ p1: null, p2: null });
  const gameEndedRef = useRef(false);

  // -----------------------------
  // Target Management
  // -----------------------------
  function spawnTarget(pid) {
    // Clear any existing timeout for this player
    if (targetTimeoutRef.current[pid]) {
      clearTimeout(targetTimeoutRef.current[pid]);
    }

    const isBomb = Math.random() < BOMB_CHANCE;
    const life = TARGET_BASE_LIFE + Math.random() * 300;
    const newTarget = {
      id: Date.now() + Math.random(),
      isBomb,
      life,
      maxLife: life,
      x: Math.random() * 70 + 15, // 15-85%
      y: Math.random() * 60 + 20, // 20-80%
    };

    setPlayers((prev) => ({
      ...prev,
      [pid]: { ...prev[pid], target: newTarget },
    }));

    // auto-clear after life expires
    targetTimeoutRef.current[pid] = setTimeout(() => {
      setPlayers((p) => {
        if (p[pid].target?.id === newTarget.id) {
          return { ...p, [pid]: { ...p[pid], target: null } };
        }
        return p;
      });
      targetTimeoutRef.current[pid] = null;
    }, life);
  }

  function handleTap(pid) {
    // Clear the timeout for this target
    if (targetTimeoutRef.current[pid]) {
      clearTimeout(targetTimeoutRef.current[pid]);
      targetTimeoutRef.current[pid] = null;
    }

    setPlayers((prev) => {
      const t = prev[pid].target;
      if (!t) return prev;

      if (t.isBomb) {
        audio.bombSound();
        // penalty
        const newScore = Math.max(0, prev[pid].score - 50);
        return {
          ...prev,
          [pid]: { ...prev[pid], score: newScore, target: null },
        };
      } else {
        audio.hitSound();
        const newScore = prev[pid].score + 10;
        return {
          ...prev,
          [pid]: { ...prev[pid], score: newScore, target: null },
        };
      }
    });
  }

  // -----------------------------
  // Game Loop
  // -----------------------------
  function startGame() {
    // reset
    gameEndedRef.current = false;
    setPlayers({
      p1: { score: 0, target: null },
      p2: { score: 0, target: null },
    });
    setTimeLeft(ROUND_SECONDS);
    setRunning(true);
    audio.coinSound();

    // countdown timer
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          endGame();
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    // spawn targets periodically
    const spawnP1 = setInterval(() => spawnTarget('p1'), 800);
    spawnRef.current.p1 = spawnP1;

    if (mode === 'versus') {
      const spawnP2 = setInterval(() => spawnTarget('p2'), 800);
      spawnRef.current.p2 = spawnP2;
    }
  }

  function endGame() {
    // Prevent multiple calls
    if (gameEndedRef.current) return;
    gameEndedRef.current = true;
    
    setRunning(false);
    clearInterval(timerRef.current);
    clearInterval(spawnRef.current.p1);
    clearInterval(spawnRef.current.p2);
    if (targetTimeoutRef.current.p1) clearTimeout(targetTimeoutRef.current.p1);
    if (targetTimeoutRef.current.p2) clearTimeout(targetTimeoutRef.current.p2);
    audio.explodeSound();

    // update leaderboard (single mode only) - use functional update to get current state
    if (mode === 'single') {
      setPlayers((currentPlayers) => {
        const score = currentPlayers.p1.score;
        if (score > 0) {
          const entry = {
            score,
            date: new Date().toISOString(),
          };
          setLeaderboard((prevLeaderboard) => {
            const updated = [...prevLeaderboard, entry]
              .sort((a, b) => b.score - a.score)
              .slice(0, 10);
            localStorage.setItem('tapdash_lb', JSON.stringify(updated));
            return updated;
          });
        }
        return currentPlayers;
      });
    }
  }

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      clearInterval(spawnRef.current.p1);
      clearInterval(spawnRef.current.p2);
      if (targetTimeoutRef.current.p1) clearTimeout(targetTimeoutRef.current.p1);
      if (targetTimeoutRef.current.p2) clearTimeout(targetTimeoutRef.current.p2);
    };
  }, []);

  // -----------------------------
  // Render
  // -----------------------------
  return (
    <div className="arcade-machine">
      <div className="screen">
        {/* Title Bar */}
        <div className="title-bar">
          <h1 className="neon-title">TAP DASH SHOWDOWN</h1>
          <div className="crt-scanlines"></div>
        </div>

        {/* Menu Screen */}
        {!running && (
          <div className="menu">
            <div className="menu-buttons">
              <button
                className={`arcade-btn ${mode === 'single' ? 'active' : ''}`}
                onClick={() => setMode('single')}
              >
                1 PLAYER
              </button>
              {/* <button
                className={`arcade-btn ${mode === 'versus' ? 'active' : ''}`}
                onClick={() => setMode('versus')}
              >
                2 PLAYER VS
              </button> */}
            </div>
            <button className="arcade-btn start-btn" onClick={startGame}>
              START GAME
            </button>

            {/* Leaderboard */}
            {mode === 'single' && leaderboard.length > 0 && (
              <div className="leaderboard">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0 }}>HIGH SCORES</h3>
                  <button 
                    className="arcade-btn" 
                    style={{ padding: '8px 12px', fontSize: '10px' }}
                    onClick={() => {
                      setLeaderboard([]);
                      localStorage.removeItem('tapdash_lb');
                    }}
                  >
                    RESET
                  </button>
                </div>
                <ol>
                  {leaderboard.slice(0, 5).map((entry, i) => (
                    <li key={i}>
                      <span className="rank">#{i + 1}</span>
                      <span className="lb-score">{entry.score}</span>
                      <span className="lb-date">
                        {new Date(entry.date).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="instructions">
              <p>TAP GREEN TARGETS +10 POINTS</p>
              <p>AVOID RED BOMBS -50 POINTS</p>
              <p>TARGETS FADE QUICKLY</p>
            </div>
          </div>
        )}

        {/* Game Screen */}
        {running && (
          <div className="game-container">
            {/* Timer */}
            <div className="timer">TIME: {timeLeft}s</div>

            {/* Single Player */}
            {mode === 'single' && (
              <div className="player-zone full">
                <div className="score-display">SCORE: {players.p1.score}</div>
                <div className="tap-area">
                  {players.p1.target && (
                    <div
                      className={`target ${
                        players.p1.target.isBomb ? 'bomb' : 'normal'
                      }`}
                      style={{
                        left: `${players.p1.target.x}%`,
                        top: `${players.p1.target.y}%`,
                        animationDuration: `${players.p1.target.life / 1000}s`,
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleTap('p1');
                      }}
                    >
                    </div>
                  )}
                  <div className="tap-hint">TAP HERE!</div>
                </div>
              </div>
            )}

            {/* Versus Mode */}
            {mode === 'versus' && (
              <div className="versus-container">
                <div className="player-zone">
                  <div className="score-display p1">
                    P1: {players.p1.score}
                  </div>
                  <div className="tap-area">
                    {players.p1.target && (
                      <div
                        className={`target ${
                          players.p1.target.isBomb ? 'bomb' : 'normal'
                        }`}
                        style={{
                          left: `${players.p1.target.x}%`,
                          top: `${players.p1.target.y}%`,
                          animationDuration: `${players.p1.target.life / 1000}s`,
                        }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          handleTap('p1');
                        }}
                      >
                      </div>
                    )}
                    <div className="tap-hint">P1 ZONE</div>
                  </div>
                </div>

                <div className="vs-divider">VS</div>

                <div className="player-zone">
                  <div className="score-display p2">
                    P2: {players.p2.score}
                  </div>
                  <div className="tap-area">
                    {players.p2.target && (
                      <div
                        className={`target ${
                          players.p2.target.isBomb ? 'bomb' : 'normal'
                        }`}
                        style={{
                          left: `${players.p2.target.x}%`,
                          top: `${players.p2.target.y}%`,
                          animationDuration: `${players.p2.target.life / 1000}s`,
                        }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          handleTap('p2');
                        }}
                      >
                      </div>
                    )}
                    <div className="tap-hint">P2 ZONE</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Game Over Screen */}
        {!running && players.p1.score > 0 && (
          <div className="game-over">
            <h2 className="game-over-title">GAME OVER</h2>
            {mode === 'single' && (
              <div className="final-score">
                FINAL SCORE: {players.p1.score}
              </div>
            )}
            {mode === 'versus' && (
              <div className="versus-results">
                <div className="final-score">P1: {players.p1.score}</div>
                <div className="final-score">P2: {players.p2.score}</div>
                <div className="winner">
                  {players.p1.score > players.p2.score
                    ? 'PLAYER 1 WINS'
                    : players.p2.score > players.p1.score
                    ? 'PLAYER 2 WINS'
                    : 'TIE GAME'}
                </div>
              </div>
            )}
            <button 
              className="arcade-btn start-btn" 
              onClick={() => setPlayers({ p1: { score: 0, target: null }, p2: { score: 0, target: null } })}
              style={{ marginTop: '32px' }}
            >
              RETURN TO MENU
            </button>
          </div>
        )}
      </div>

      {/* Cabinet Decorations */}
      <div className="cabinet-decor">
        <div className="speaker-grill left"></div>
        <div className="speaker-grill right"></div>
      </div>
    </div>
  );
}
