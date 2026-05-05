/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { audioService } from './services/audioService';
import { leaderboardService, type LeaderboardEntry } from './services/leaderboardService';
import { auth, signIn } from './services/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  Trophy, 
  Play, 
  RotateCcw, 
  Settings, 
  Gamepad2, 
  Zap, 
  Pause,
  Home,
  CheckCircle2,
  ListOrdered,
  User as UserIcon,
  LogOut,
  Send,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

// Constants
const GRID_SIZE = 20;
const INITIAL_SNAKE = [
  { x: 10, y: 10 },
  { x: 10, y: 11 },
  { x: 10, y: 12 },
];
const WIN_SCORE = 1000;

const GAME_TIPS = [
  "TIP: Collect power-ups to trigger special neon effects!",
  "TRIVIA: The synthwave sun is often called a 'Vaporwave Sun'.",
  "TIP: Hard mode gives you double points but maximum speed.",
  "TRIVIA: 'Outrun' is a synthwave sub-genre named after the 1986 game.",
  "TIP: Invincibility lets you pass through your own tail safely.",
  "TRIVIA: Neon lights were first demonstrated in Paris in 1910.",
  "TIP: Disco Mode randomizes colors but boosts your score multiplier!",
  "TRIVIA: 1984 is considered a peak year for 80s pop culture."
];

const SNAKE_COLORS = [
  { name: 'CYAN', class: 'bg-cyan-400', tailClass: 'bg-cyan-600/80', shadow: 'shadow-[0_0_15px_#22d3ee]' },
  { name: 'FUCHSIA', class: 'bg-fuchsia-400', tailClass: 'bg-fuchsia-600/80', shadow: 'shadow-[0_0_15px_#d946ef]' },
  { name: 'LIME', class: 'bg-lime-400', tailClass: 'bg-lime-600/80', shadow: 'shadow-[0_0_15px_#a3e635]' },
  { name: 'AMBER', class: 'bg-amber-400', tailClass: 'bg-amber-600/80', shadow: 'shadow-[0_0_15px_#fbbf24]' },
  { name: 'ROSE', class: 'bg-rose-400', tailClass: 'bg-rose-600/80', shadow: 'shadow-[0_0_15px_#fb7185]' },
  { name: 'INDIGO', class: 'bg-indigo-400', tailClass: 'bg-indigo-600/80', shadow: 'shadow-[0_0_15px_#818cf8]' },
];

const SNAKE_STYLES = [
  { id: 'BLOCK', name: 'Classic Block', radius: 'rounded-none', scale: 1 },
  { id: 'ROUNDED', name: 'Smooth Neon', radius: 'rounded-sm', scale: 0.9 },
  { id: 'PILL', name: 'Cyber Pill', radius: 'rounded-full', scale: 0.8 },
];

const SNAKE_PATTERNS = [
  { id: 'NONE', name: 'Solid' },
  { id: 'STRIPES', name: 'Stripes' },
  { id: 'DOTS', name: 'Digital' },
  { id: 'GLITCH', name: 'Glitch' },
];

const SNAKE_TRAILS = [
  { id: 'NONE', name: 'Standard' },
  { id: 'GHOST', name: 'Spectral' },
  { id: 'GLOW', name: 'Overdrive' },
];

const GlitchText = ({ text, className = "" }: { text: string, className?: string }) => (
  <span className={`glitch relative inline-block ${className}`} data-text={text}>
    {text}
  </span>
);

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
type Difficulty = 'EASY' | 'NORMAL' | 'HARD';
type GameStatus = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAMEOVER' | 'WIN';
type EffectType = 'NONE' | 'DOUBLE_POINTS' | 'INVINCIBLE' | 'DISCO';

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const ACHIEVEMENTS: Achievement[] = [
  { id: 'score-100', title: 'Glow Getter', description: 'Reach 100 points', icon: <Trophy className="w-4 h-4" /> },
  { id: 'score-500', title: 'Neon Master', description: 'Reach 500 points', icon: <Trophy className="w-4 h-4" /> },
  { id: 'score-1000', title: 'Cyber Legend', description: 'Reach 1000 points', icon: <Trophy className="w-4 h-4" /> },
  { id: 'disco-mode', title: 'Disco Fever', description: 'Trigger Disco Mode', icon: <Zap className="w-4 h-4" /> },
  { id: 'power-10', title: 'Power Tripping', description: 'Collect 10 power-ups in one run', icon: <Zap className="w-4 h-4" /> },
  { id: 'hard-mode', title: 'Hard Wired', description: 'Play on Hard difficulty', icon: <Gamepad2 className="w-4 h-4" /> },
];

interface Position {
  x: number;
  y: number;
}

interface PowerUp extends Position {
  type: EffectType;
}

const DIFFICULTY_CONFIG = {
  EASY: { speed: 180, multiplier: 1 },
  NORMAL: { speed: 120, multiplier: 1.5 },
  HARD: { speed: 80, multiplier: 2.5 },
};

export default function App() {
  // Game State
  const [snake, setSnake] = useState<Position[]>(INITIAL_SNAKE);
  const [food, setFood] = useState<Position>({ x: 5, y: 5 });
  const [powerUp, setPowerUp] = useState<PowerUp | null>(null);
  const [activeEffect, setActiveEffect] = useState<EffectType>('NONE');
  const [effectTimeRemaining, setEffectTimeRemaining] = useState(0);
  const [direction, setDirection] = useState<Direction>('UP');
  const [status, setStatus] = useState<GameStatus>('MENU');
  const [showSettings, setShowSettings] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [topScores, setTopScores] = useState<LeaderboardEntry[]>([]);
  const [isLoadingScores, setIsLoadingScores] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [menuTab, setMenuTab] = useState<'PLAY' | 'SCORES' | 'ACHIEVEMENTS'>('PLAY');
  const [leaderboardDifficulty, setLeaderboardDifficulty] = useState<Difficulty | 'ALL'>('ALL');
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [displayedScore, setDisplayedScore] = useState(0);
  const [pickupMessage, setPickupMessage] = useState<{ text: string, color: string } | null>(null);
  const [showHighScoreAlert, setShowHighScoreAlert] = useState(false);
  const [newHighScoreAchieved, setNewHighScoreAchieved] = useState(false);
  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>([]);
  const [activeAchievement, setActiveAchievement] = useState<Achievement | null>(null);
  const [sessionPowerUps, setSessionPowerUps] = useState(0);
  const [settings, setSettings] = useState({
    sfxVolume: 0.5,
    musicVolume: 0.3,
    musicEnabled: true,
    sfxEnabled: true,
    showGlow: true,
    glowIntensity: 0.5,
    snakeColor: 'CYAN',
    snakeStyle: 'ROUNDED',
    snakePattern: 'NONE',
    snakeTrail: 'NONE'
  });
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty>('NORMAL');
  
  // Refs for logic
  const nextDirection = useRef<Direction>('UP');
  const gameLoopRef = useRef<NodeJS.Timeout | null>(null);
  const effectTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u?.displayName && !playerName) setPlayerName(u.displayName.split(' ')[0]);
    });
    return () => unsubscribe();
  }, [playerName]);

  // Fetch Leaderboard
  // Score counting animation for Game Over
  useEffect(() => {
    if (status === 'GAMEOVER') {
      setDisplayedScore(0);
      const duration = 1500;
      const steps = 30;
      const stepTime = duration / steps;
      let currentStep = 0;
      
      const timer = setInterval(() => {
        currentStep++;
        const progress = currentStep / steps;
        // Ease out quadratic
        const easeOut = 1 - (1 - progress) * (1 - progress);
        setDisplayedScore(Math.floor(score * easeOut));
        
        if (currentStep >= steps) {
          setDisplayedScore(score);
          clearInterval(timer);
        }
      }, stepTime);
      
      return () => clearInterval(timer);
    }
  }, [status, score]);

  const fetchLeaderboard = useCallback(async () => {
    setIsLoadingScores(true);
    try {
      const scores = await leaderboardService.getTopScores(10, leaderboardDifficulty);
      setTopScores(scores);
    } catch (e) {
      console.error("Leaderboard fetch error:", e);
    } finally {
      setIsLoadingScores(false);
    }
  }, [leaderboardDifficulty]);

  useEffect(() => {
    if (status === 'MENU') {
      fetchLeaderboard();
      setHasSubmitted(false);
    }
  }, [status, fetchLeaderboard]);

  // Rotate Tips
  useEffect(() => {
    if (status !== 'MENU') return;
    const interval = setInterval(() => {
      setCurrentTipIndex(prev => (prev + 1) % GAME_TIPS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [status]);

  // Load High Score & Achievements & Settings
  useEffect(() => {
    const saved = localStorage.getItem('neon-snake-highscore');
    if (saved) setHighScore(parseInt(saved, 10));
    const savedAchievements = localStorage.getItem('neon-snake-achievements');
    if (savedAchievements) setUnlockedAchievements(JSON.parse(savedAchievements));
    const savedSettings = localStorage.getItem('neon-snake-settings');
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      setSettings(prev => ({ ...prev, ...parsed }));
      audioService.setSfxVolume(parsed.sfxVolume);
      audioService.setMusicVolume(parsed.musicVolume);
      if (parsed.musicEnabled !== undefined) audioService.setMusicEnabled(parsed.musicEnabled);
      if (parsed.sfxEnabled !== undefined) audioService.setSfxEnabled(parsed.sfxEnabled);
    }
  }, []);

  // Update Settings in LocalStorage
  useEffect(() => {
    localStorage.setItem('neon-snake-settings', JSON.stringify(settings));
  }, [settings]);

  // Initial Audio Setup on User Interaction
  useEffect(() => {
    const handleFirstInteraction = async () => {
      try {
        await audioService.init();
        // Sync volume after init
        audioService.setSfxVolume(settings.sfxVolume);
        audioService.setMusicVolume(settings.musicVolume);
        audioService.setSfxEnabled(settings.sfxEnabled);
        audioService.setMusicEnabled(settings.musicEnabled);
      } catch (e) {
        console.error("Audio initialization failed:", e);
      }
      window.removeEventListener('pointerdown', handleFirstInteraction);
    };
    window.addEventListener('pointerdown', handleFirstInteraction);
    return () => window.removeEventListener('pointerdown', handleFirstInteraction);
  }, []); // Only runs once on mount

  const unlockAchievement = useCallback((id: string) => {
    setUnlockedAchievements(prev => {
      if (prev.includes(id)) return prev;
      const newUnlocked = [...prev, id];
      localStorage.setItem('neon-snake-achievements', JSON.stringify(newUnlocked));
      const ach = ACHIEVEMENTS.find(a => a.id === id);
      if (ach) {
        setActiveAchievement(ach);
        // Play success sound
        audioService.playPowerUp();
        setTimeout(() => setActiveAchievement(null), 3000);
      }
      return newUnlocked;
    });
  }, []);

  // Update High Score
  useEffect(() => {
    if (score > highScore) {
      if (!newHighScoreAchieved && highScore >= 0) {
        setNewHighScoreAchieved(true);
        // Only show alert if it's not the very first points of the first game
        if (highScore > 0) {
          setShowHighScoreAlert(true);
          audioService.playHighScore();
          setTimeout(() => setShowHighScoreAlert(false), 3000);
        }
      }
      setHighScore(score);
      localStorage.setItem('neon-snake-highscore', score.toString());
    }
  }, [score, highScore, newHighScoreAchieved]);

  // Effect Timer logic
  useEffect(() => {
    if (effectTimeRemaining > 0 && status === 'PLAYING') {
      const timer = setInterval(() => {
        setEffectTimeRemaining(prev => {
          if (prev <= 1) {
            setActiveEffect('NONE');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [effectTimeRemaining, status]);

  // Generate Food
  const generateFood = useCallback((currentSnake: Position[]): Position => {
    let newFood;
    while (true) {
      newFood = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
      };
      const onSnake = currentSnake.some(
        segment => segment.x === newFood.x && segment.y === newFood.y
      );
      if (!onSnake) break;
    }
    return newFood;
  }, []);

  // Generate Power-up
  const spawnPowerUp = useCallback((currentSnake: Position[]) => {
    const rand = Math.random();
    if (rand > 0.2) return; // 20% overall chance

    let type: EffectType = 'DOUBLE_POINTS';
    if (rand < 0.02) {
      type = 'DISCO'; // Secret 2% rarity
    } else if (rand < 0.1) {
      type = 'INVINCIBLE';
    }

    let newPos;
    while (true) {
      newPos = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
      };
      const onSnake = currentSnake.some(
        segment => segment.x === newPos.x && segment.y === newPos.y
      );
      if (!onSnake) break;
    }
    setPowerUp({ ...newPos, type });
  }, []);

  // Handle Level Difficulty Scaling
  const currentSpeed = DIFFICULTY_CONFIG[difficulty].speed - Math.floor(score / 5);

  const moveSnake = useCallback(() => {
    setSnake(prevSnake => {
      const head = prevSnake[0];
      const newHead = { ...head };

      const currentNextDir = nextDirection.current;
      
      switch (currentNextDir) {
        case 'UP': newHead.y -= 1; break;
        case 'DOWN': newHead.y += 1; break;
        case 'LEFT': newHead.x -= 1; break;
        case 'RIGHT': newHead.x += 1; break;
      }

      setDirection(currentNextDir);

      // Check Wall Collision (Wraparound if Invincible)
      if (
        newHead.x < 0 || 
        newHead.x >= GRID_SIZE || 
        newHead.y < 0 || 
        newHead.y >= GRID_SIZE
      ) {
        if (activeEffect === 'INVINCIBLE') {
          if (newHead.x < 0) newHead.x = GRID_SIZE - 1;
          else if (newHead.x >= GRID_SIZE) newHead.x = 0;
          else if (newHead.y < 0) newHead.y = GRID_SIZE - 1;
          else if (newHead.y >= GRID_SIZE) newHead.y = 0;
        } else {
          setStatus('GAMEOVER');
          return prevSnake;
        }
      }

      // Check Self Collision
      if (activeEffect !== 'INVINCIBLE' && prevSnake.some(segment => segment.x === newHead.x && segment.y === newHead.y)) {
        setStatus('GAMEOVER');
        return prevSnake;
      }

      const newSnake = [newHead, ...prevSnake];

      // Check Food Consumption
      if (newHead.x === food.x && newHead.y === food.y) {
        audioService.playEat();
        const multiplier = DIFFICULTY_CONFIG[difficulty].multiplier * (activeEffect === 'DOUBLE_POINTS' ? 2 : activeEffect === 'DISCO' ? 3 : 1);
        const points = Math.floor(10 * multiplier);
        setScore(s => {
          const newScore = s + points;
          if (newScore >= 100) unlockAchievement('score-100');
          if (newScore >= 500) unlockAchievement('score-500');
          if (newScore >= 1000) unlockAchievement('score-1000');
          if (newScore >= WIN_SCORE) setStatus('WIN');
          return newScore;
        });
        setFood(generateFood(newSnake));
        spawnPowerUp(newSnake);
      } else if (powerUp && newHead.x === powerUp.x && newHead.y === powerUp.y) {
        // Power-up Consumption
        if (powerUp.type === 'DISCO') {
          audioService.playDisco();
          unlockAchievement('disco-mode');
        } else if (powerUp.type === 'INVINCIBLE') {
          audioService.playInvincibility();
        } else if (powerUp.type === 'DOUBLE_POINTS') {
          audioService.playDoublePoints();
        } else {
          audioService.playPowerUp();
        }
        setSessionPowerUps(p => {
          const newVal = p + 1;
          if (newVal >= 10) unlockAchievement('power-10');
          return newVal;
        });

        // Show notification
        const msg = powerUp.type === 'INVINCIBLE' ? { text: 'INVINCIBILITY', color: 'text-amber-400' } :
                   powerUp.type === 'DOUBLE_POINTS' ? { text: 'DOUBLE POINTS', color: 'text-fuchsia-400' } :
                   { text: 'DISCO MODE!', color: 'text-cyan-400' };
        setPickupMessage(msg);
        setTimeout(() => setPickupMessage(null), 2000);

        setActiveEffect(powerUp.type);
        setEffectTimeRemaining(powerUp.type === 'INVINCIBLE' ? 5 : 10);
        setPowerUp(null);
        newSnake.pop(); 
      } else {
        newSnake.pop(); // Remove tail
      }

      return newSnake;
    });
  }, [food, difficulty, generateFood, powerUp, activeEffect, spawnPowerUp]);

  // Game Loop
  useEffect(() => {
    if (status === 'PLAYING') {
      const interval = Math.max(50, currentSpeed);
      gameLoopRef.current = setInterval(moveSnake, interval);
    } else {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    }
    return () => {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    };
  }, [status, moveSnake, currentSpeed]);

  const [isGamepadConnected, setIsGamepadConnected] = useState(false);

  // Gamepad support
  useEffect(() => {
    const handleConnect = () => setIsGamepadConnected(true);
    const handleDisconnect = () => setIsGamepadConnected(false);
    window.addEventListener('gamepadconnected', handleConnect);
    window.addEventListener('gamepaddisconnected', handleDisconnect);
    return () => {
      window.removeEventListener('gamepadconnected', handleConnect);
      window.removeEventListener('gamepaddisconnected', handleDisconnect);
    };
  }, []);

  useEffect(() => {
    let requestRef: number;
    const threshold = 0.5;

    const updateGamepad = () => {
      const gamepads = navigator.getGamepads();
      const gp = gamepads[0];

      if (gp) {
        // D-Pad (Standard Mapping)
        if (gp.buttons[12].pressed && nextDirection.current !== 'DOWN') nextDirection.current = 'UP';
        if (gp.buttons[13].pressed && nextDirection.current !== 'UP') nextDirection.current = 'DOWN';
        if (gp.buttons[14].pressed && nextDirection.current !== 'RIGHT') nextDirection.current = 'LEFT';
        if (gp.buttons[15].pressed && nextDirection.current !== 'LEFT') nextDirection.current = 'RIGHT';

        // Left Analog Stick
        const xAxis = gp.axes[0];
        const yAxis = gp.axes[1];

        if (yAxis < -threshold && nextDirection.current !== 'DOWN') nextDirection.current = 'UP';
        if (yAxis > threshold && nextDirection.current !== 'UP') nextDirection.current = 'DOWN';
        if (xAxis < -threshold && nextDirection.current !== 'RIGHT') nextDirection.current = 'LEFT';
        if (xAxis > threshold && nextDirection.current !== 'LEFT') nextDirection.current = 'RIGHT';

        // Pause/Start buttons
        if (gp.buttons[9].pressed || gp.buttons[8].pressed) {
           // Start/Select - can be used for pause
        }
      }
      requestRef = requestAnimationFrame(updateGamepad);
    };

    requestRef = requestAnimationFrame(updateGamepad);
    return () => cancelAnimationFrame(requestRef);
  }, [status]); // Re-bind if status changes just in case, though refs handle the logic

  // Keyboard Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp': if (nextDirection.current !== 'DOWN') nextDirection.current = 'UP'; break;
        case 'ArrowDown': if (nextDirection.current !== 'UP') nextDirection.current = 'DOWN'; break;
        case 'ArrowLeft': if (nextDirection.current !== 'RIGHT') nextDirection.current = 'LEFT'; break;
        case 'ArrowRight': if (nextDirection.current !== 'LEFT') nextDirection.current = 'RIGHT'; break;
        case 'p': if (status === 'PLAYING') setStatus('PAUSED'); else if (status === 'PAUSED') setStatus('PLAYING'); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status]);

  // Audio Feedback for Status Changes
  useEffect(() => {
    if (status === 'GAMEOVER') {
      audioService.playGameOver();
    } else if (status === 'WIN') {
      audioService.playWin();
    }
  }, [status]);

  const startGame = async () => {
    await audioService.init();
    audioService.setSfxVolume(settings.sfxVolume);
    audioService.setMusicVolume(settings.musicVolume); 
    audioService.setSfxEnabled(settings.sfxEnabled);
    audioService.setMusicEnabled(settings.musicEnabled);
    if (difficulty === 'HARD') unlockAchievement('hard-mode');
    setSnake(INITIAL_SNAKE);
    setScore(0);
    setNewHighScoreAchieved(false);
    setShowHighScoreAlert(false);
    setSessionPowerUps(0);
    setDirection('UP');
    nextDirection.current = 'UP';
    setFood(generateFood(INITIAL_SNAKE));
    setPowerUp(null);
    setActiveEffect('NONE');
    setEffectTimeRemaining(0);
    setHasSubmitted(false);
    setStatus('PLAYING');
  };

  const handleSignIn = async () => {
    try {
      await signIn();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmitScore = async () => {
    if (!user || isSubmitting || hasSubmitted) return;
    setIsSubmitting(true);
    try {
      await leaderboardService.addScore(playerName || 'Anonymous', score, difficulty);
      setHasSubmitted(true);
      audioService.playPowerUp();
      fetchLeaderboard();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Touch Control State
  const touchStart = useRef<{ x: number, y: number } | null>(null);
  const minSwipeDistance = 30;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current || status !== 'PLAYING') return;

    const touchEnd = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    };

    const dx = touchEnd.x - touchStart.current.x;
    const dy = touchEnd.y - touchStart.current.y;

    // Detect if movement is enough to be a swipe
    if (Math.abs(dx) > minSwipeDistance || Math.abs(dy) > minSwipeDistance) {
      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal swipe
        if (dx > 0 && nextDirection.current !== 'LEFT') nextDirection.current = 'RIGHT';
        else if (dx < 0 && nextDirection.current !== 'RIGHT') nextDirection.current = 'LEFT';
      } else {
        // Vertical swipe
        if (dy > 0 && nextDirection.current !== 'UP') nextDirection.current = 'DOWN';
        else if (dy < 0 && nextDirection.current !== 'DOWN') nextDirection.current = 'UP';
      }
      // Reset touch start to prevent multiple direction changes in one swipe
      touchStart.current = touchEnd;
    }
  };

  const handleTouchEnd = () => {
    touchStart.current = null;
  };

  return (
    <div 
      className="min-h-[100dvh] bg-[#050505] text-white font-sans flex flex-col items-center justify-start md:justify-center p-4 md:p-8 selection:bg-cyan-500/30 overflow-x-hidden touch-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="scanlines" />
      <div className="noise-overlay" />
      {/* Background Glow */}
      <AnimatePresence>
        {settings.showGlow && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ 
              opacity: settings.glowIntensity * 2,
              backgroundColor: activeEffect === 'DISCO' ? ['rgba(34,211,238,0.1)', 'rgba(217,70,239,0.1)', 'rgba(234,179,8,0.1)'] : 'transparent'
            }}
            transition={activeEffect === 'DISCO' ? { duration: 0.5, repeat: Infinity, repeatType: 'reverse' } : {}}
            exit={{ opacity: 0 }}
            className="fixed inset-0 pointer-events-none overflow-hidden"
          >
            <div className={`absolute top-1/4 left-1/4 w-96 h-96 blur-[120px] rounded-full transition-all duration-1000 ${
              activeEffect === 'INVINCIBLE' ? 'bg-amber-500/20' : 
              activeEffect === 'DOUBLE_POINTS' ? 'bg-fuchsia-500/20' : 
              activeEffect === 'DISCO' ? 'bg-white/30' : 
              status === 'MENU' ? 'bg-cyan-500/5 scale-90' : 'bg-cyan-500/10'
            }`} style={{ opacity: settings.glowIntensity }} />
            <div className={`absolute bottom-1/4 right-1/4 w-96 h-96 blur-[120px] rounded-full transition-all duration-1000 ${
              activeEffect === 'INVINCIBLE' ? 'bg-amber-500/20' : 
              activeEffect === 'DOUBLE_POINTS' ? 'bg-fuchsia-500/20' : 
              activeEffect === 'DISCO' ? 'bg-white/30' : 
              status === 'MENU' ? 'bg-fuchsia-500/5 scale-90' : 'bg-fuchsia-500/10'
            }`} style={{ opacity: settings.glowIntensity }} />
          </motion.div>
        )}
      </AnimatePresence>

      <main className="relative z-10 w-full max-w-lg flex flex-col gap-4 md:gap-6">
        {/* Header HUD */}
        <div className="flex items-center justify-between bg-white/5 border border-white/10 backdrop-blur-xl p-4 rounded-2xl shadow-2xl">
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-cyan-500 animate-pulse" />
              SYSTEM_STATUS: ACTIVE
            </span>
            <div className="flex items-center gap-2">
              <GlitchText 
                text={score.toString().padStart(4, '0')} 
                className={`text-xl md:text-2xl font-mono font-bold tabular-nums ${activeEffect === 'DOUBLE_POINTS' ? 'text-fuchsia-400' : 'text-cyan-400'}`} 
              />
              {activeEffect === 'DOUBLE_POINTS' && (
                <motion.span 
                  animate={{ scale: [1, 1.2, 1] }} 
                  transition={{ repeat: Infinity, duration: 1 }}
                  className="text-[10px] font-bold text-fuchsia-400 bg-fuchsia-500/20 px-1.5 py-0.5 rounded border border-fuchsia-500/30"
                >
                  2X
                </motion.span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {(status === 'PLAYING' || status === 'PAUSED') && (
              <motion.button 
                whileHover={{ scale: 1.1, backgroundColor: 'rgba(255,255,255,0.1)' }}
                whileTap={{ scale: 0.9 }}
                onClick={() => status === 'PLAYING' ? setStatus('PAUSED') : setStatus('PLAYING')}
                className="p-3 rounded-xl bg-white/5 border border-white/10 transition-colors"
              >
                {status === 'PLAYING' ? <Pause className="w-5 h-5 text-zinc-400 group-hover:text-white" /> : <Play className="w-5 h-5 text-cyan-400" />}
              </motion.button>
            )}
            
            <div className="flex flex-col items-end text-right">
              <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">Record</span>
              <span className="text-xl md:text-2xl font-mono font-bold text-white/40 tabular-nums">{highScore.toString().padStart(4, '0')}</span>
            </div>
          </div>
        </div>

        {/* Game Area */}
        <div className="relative group shrink-0">
          <div 
            className={`relative aspect-square w-full bg-black/40 border rounded-2xl overflow-hidden backdrop-blur-sm transition-colors duration-500 ${
              activeEffect === 'INVINCIBLE' ? 'border-amber-500/50' : activeEffect === 'DOUBLE_POINTS' ? 'border-fuchsia-500/50' : 'border-white/10'
            }`}
            style={{
              maxHeight: 'min(65vh, 600px)',
              display: 'grid',
              gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
              gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)`,
            }}
          >
          {/* Grid lines (Subtle) */}
          <div className="absolute inset-0 pointer-events-none opacity-20"
            style={{
              backgroundImage: 'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
              backgroundSize: `${100 / GRID_SIZE}% ${100 / GRID_SIZE}%`
            }}
          />

          {/* Snake Segments */}
          {snake.map((segment, i) => {
            const colorOption = SNAKE_COLORS.find(c => c.name === settings.snakeColor) || SNAKE_COLORS[0];
            const styleOption = SNAKE_STYLES.find(s => s.id === settings.snakeStyle) || SNAKE_STYLES[1];
            
            // Pattern Logic
            let patternStyle = {};
            if (settings.snakePattern === 'STRIPES') {
              patternStyle = { backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px)` };
            } else if (settings.snakePattern === 'DOTS') {
              patternStyle = { backgroundImage: `radial-gradient(rgba(0,0,0,0.15) 1px, transparent 0)`, backgroundSize: '4px 4px' };
            } else if (settings.snakePattern === 'GLITCH') {
              patternStyle = { backgroundImage: `linear-gradient(0deg, transparent 50%, rgba(255,255,255,0.05) 50%)`, backgroundSize: '100% 2px' };
            }

            // Trail Logic
            const isSpectral = settings.snakeTrail === 'GHOST';
            const isOverdrive = settings.snakeTrail === 'GLOW';
            const opacity = isSpectral ? Math.max(0.2, 1 - (i / (snake.length > 5 ? snake.length : 10))) : 1;
            
            return (
              <motion.div
                key={`${i}-${segment.x}-${segment.y}`}
                initial={false}
                animate={{ 
                  x: `${segment.x * 100}%`, 
                  y: `${segment.y * 100}%`,
                  scale: i === 0 
                    ? [1, 1.08, 0.98, 1] 
                    : [styleOption.scale, styleOption.scale * 1.18, styleOption.scale],
                  rotate: i === 0 ? 0 : [0, 8, -8, 0],
                  filter: i === 0 
                    ? 'none' 
                    : ['brightness(1) contrast(1)', 'brightness(1.4) contrast(1.2)', 'brightness(1) contrast(1)']
                }}
                transition={{ 
                  x: { type: 'spring', damping: 25, stiffness: 300, mass: 0.5 },
                  y: { type: 'spring', damping: 25, stiffness: 300, mass: 0.5 },
                  scale: { 
                    duration: activeEffect !== 'NONE' ? 1 : 2.5, 
                    repeat: Infinity, 
                    repeatType: 'reverse', 
                    delay: i * 0.12,
                    ease: "easeInOut"
                  },
                  rotate: {
                    duration: 3.5,
                    repeat: Infinity,
                    repeatType: 'reverse',
                    delay: i * 0.2,
                    ease: "easeInOut"
                  },
                  filter: {
                    duration: 2,
                    repeat: Infinity,
                    repeatType: 'reverse',
                    delay: i * 0.15,
                    ease: "easeInOut"
                  }
                }}
                className={`absolute w-[5%] h-[5%] transition-colors duration-300 ${styleOption.radius} ${
                  activeEffect === 'INVINCIBLE' 
                    ? (i === 0 ? 'bg-amber-400 shadow-[0_0_15px_#fbbf24] z-20 animate-pulse' : 'bg-amber-600/80 z-10')
                    : activeEffect === 'DOUBLE_POINTS'
                      ? (i === 0 ? 'bg-fuchsia-400 shadow-[0_0_15px_#d946ef] z-20' : 'bg-fuchsia-600/80 z-10')
                      : activeEffect === 'DISCO'
                        ? (i % 2 === 0 ? 'bg-fuchsia-400 shadow-[0_0_15px_#d946ef] z-20' : 'bg-cyan-400 shadow-[0_0_15px_#22d3ee] z-20')
                        : (i === 0 ? `${colorOption.class} ${colorOption.shadow} z-20 ${isOverdrive ? 'shadow-[0_0_25px_white]' : ''}` : `${colorOption.tailClass} z-10 ${isOverdrive ? 'shadow-[0_0_10px_white/50]' : ''}`)
                }`}
                style={{ 
                  top: 0, 
                  left: 0, 
                  ...patternStyle,
                  opacity
                }}
              />
            );
          })}

          {/* Food */}
          <motion.div
            animate={{ scale: [0.8, 1.2, 0.8] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="absolute w-[5%] h-[5%] bg-fuchsia-500 rounded-full shadow-[0_0_20px_#d946ef] z-30"
            style={{
              left: `${food.x * (100 / GRID_SIZE)}%`,
              top: `${food.y * (100 / GRID_SIZE)}%`
            }}
          />

          {/* Power Up */}
          {powerUp && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: [0.8, 1.1, 0.8], rotate: 360 }}
              transition={{ 
                scale: { repeat: Infinity, duration: 1 },
                rotate: { repeat: Infinity, duration: 3, ease: 'linear' }
              }}
              className={`absolute w-[5%] h-[5%] rounded-md z-30 border ${
                powerUp.type === 'INVINCIBLE' 
                  ? 'bg-amber-500 border-amber-300 shadow-[0_0_20px_#f59e0b]' 
                  : powerUp.type === 'DISCO'
                    ? 'bg-white border-cyan-400 shadow-[0_0_30px_#ffffff]'
                    : 'bg-fuchsia-400 border-fuchsia-200 shadow-[0_0_20px_#d946ef]'
              }`}
              style={{
                left: `${powerUp.x * (100 / GRID_SIZE)}%`,
                top: `${powerUp.y * (100 / GRID_SIZE)}%`
              }}
            >
              <div className="w-full h-full flex items-center justify-center">
                {powerUp.type === 'INVINCIBLE' ? (
                  <Zap className="w-2 h-2 text-black fill-current" />
                ) : powerUp.type === 'DISCO' ? (
                  <Trophy className="w-2 h-2 text-black animate-bounce" />
                ) : (
                  <span className="text-[6px] font-black text-black">2X</span>
                )}
              </div>
            </motion.div>
          )}

          {/* Pickup Notification */}
          <AnimatePresence>
            {pickupMessage && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.8 }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none z-50"
              >
                <div className={`px-4 py-2 rounded-full bg-black/80 border border-white/20 backdrop-blur-md shadow-2xl flex flex-col items-center gap-1`}>
                  <span className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500 ml-1">Power System Engaged</span>
                  <span className={`text-xl font-black italic tracking-tighter ${pickupMessage.color} drop-shadow-lg`}>
                    {pickupMessage.text}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* High Score Alert */}
          <AnimatePresence>
            {showHighScoreAlert && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5, y: -100 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.5, y: -50 }}
                className="absolute top-1/4 left-0 right-0 flex justify-center z-[60] pointer-events-none"
              >
                <div className="relative group">
                  <div className="absolute inset-0 bg-fuchsia-500 blur-2xl opacity-40 animate-pulse" />
                  <div className="relative px-8 py-4 bg-black/60 border-2 border-fuchsia-500 rounded-2xl backdrop-blur-xl flex flex-col items-center gap-1">
                    <span className="text-[10px] font-black uppercase tracking-[0.6em] text-cyan-400">System Record Breached</span>
                    <span className="text-3xl font-black italic tracking-tighter text-white drop-shadow-[0_0_15px_rgba(217,70,239,0.8)]">
                      NEW HIGH SCORE!
                    </span>
                    <div className="flex gap-2 items-center mt-1">
                      <div className="w-12 h-[1px] bg-gradient-to-r from-transparent to-white/30" />
                      <span className="text-[10px] font-mono text-white/50 uppercase">Access Level: Elite</span>
                      <div className="w-12 h-[1px] bg-gradient-to-l from-transparent to-white/30" />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Overlays */}
          <AnimatePresence>
            {status !== 'PLAYING' && (
              <motion.div
                initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                animate={{ opacity: 1, backdropFilter: 'blur(8px)' }}
                exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                className="absolute inset-0 flex items-center justify-center bg-black/60 z-50 p-6"
              >
                {status === 'MENU' && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 30 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="flex flex-col items-center w-full max-h-[85vh] overflow-hidden"
                  >
                    <motion.h1 
                      initial={{ scale: 0.5, opacity: 0, filter: 'blur(20px)' }}
                      animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
                      transition={{ delay: 0.2, duration: 0.8, type: 'spring' }}
                      className="text-4xl md:text-5xl font-black italic tracking-tighter mb-8 flex items-center gap-3 shrink-0"
                    >
                      <GlitchText text="NEON" /> <span className="text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]">SNAKE</span>
                    </motion.h1>

                    {/* Menu Tabs */}
                    <motion.div 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 }}
                      className="flex w-full gap-2 p-1 bg-white/5 border border-white/10 rounded-xl mb-6 shrink-0 shadow-inner"
                    >
                      <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setMenuTab('PLAY')}
                        className={`flex-1 py-3 md:py-2 rounded-lg text-[10px] md:text-xs font-bold transition-colors ${menuTab === 'PLAY' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        PLAY
                      </motion.button>
                      <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setMenuTab('SCORES')}
                        className={`flex-1 py-3 md:py-2 rounded-lg text-[10px] md:text-xs font-bold transition-colors ${menuTab === 'SCORES' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        GLOBAL
                      </motion.button>
                      <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setMenuTab('ACHIEVEMENTS')}
                        className={`flex-1 py-3 md:py-2 rounded-lg text-[10px] md:text-xs font-bold transition-colors ${menuTab === 'ACHIEVEMENTS' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        GEAR
                      </motion.button>
                    </motion.div>
                    
                    <div className="w-full flex-1 overflow-y-auto custom-scrollbar pr-1">
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                      >
                        {menuTab === 'PLAY' ? (
                        <div className="flex flex-col gap-6">
                          <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between ml-1">
                              <label className="text-[10px] uppercase font-bold tracking-widest text-zinc-400">Simulation Difficulty</label>
                              <span className="text-[10px] font-mono text-cyan-400/80">
                                {difficulty === 'EASY' ? 'Relaxed • 1.0x Score' : difficulty === 'NORMAL' ? 'Standard • 1.5x Score' : 'Relentless • 2.5x Score'}
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 p-1 bg-white/5 rounded-2xl border border-white/10">
                              {(['EASY', 'NORMAL', 'HARD'] as Difficulty[]).map(d => {
                                const isSelected = difficulty === d;
                                return (
                                  <motion.button
                                    key={d}
                                    id={`btn-difficulty-${d.toLowerCase()}`}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => setDifficulty(d)}
                                    className="relative py-4 md:py-3 px-4 rounded-xl text-xs font-bold transition-colors z-10 overflow-hidden group min-h-[44px]"
                                  >
                                    <span className={isSelected ? 'text-black' : 'text-zinc-400 group-hover:text-zinc-200'}>{d}</span>
                                    {isSelected && (
                                      <motion.div
                                        layoutId="difficulty-pill"
                                        className="absolute inset-0 bg-cyan-400 -z-10 shadow-[0_0_20px_rgba(34,211,238,0.4)]"
                                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                      />
                                    )}
                                  </motion.button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <motion.button
                              id="btn-start"
                              whileHover={{ scale: 1.02, backgroundColor: '#f0f0f0' }}
                              whileTap={{ scale: 0.98 }}
                              onClick={startGame}
                              className="flex-[2] bg-white text-black py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                            >
                              <Play className="w-5 h-5 fill-current" /> START GAME
                            </motion.button>
                            <motion.button
                              id="btn-open-settings"
                              whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.1)' }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => setShowSettings(true)}
                              className="flex-1 bg-white/5 border border-white/10 text-white rounded-xl flex items-center justify-center transition-colors"
                            >
                              <Settings className="w-6 h-6" />
                            </motion.button>
                          </div>
                        </div>
                      ) : menuTab === 'SCORES' ? (
                        <div className="flex flex-col gap-4">
                          {/* Leaderboard Filters */}
                          <div className="flex gap-1 p-1 bg-white/5 rounded-lg border border-white/10 shrink-0">
                            {(['ALL', 'EASY', 'NORMAL', 'HARD'] as const).map(d => (
                              <motion.button
                                key={d}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => setLeaderboardDifficulty(d)}
                                className={`flex-1 py-3 md:py-1.5 rounded-md text-[9px] font-black tracking-widest transition-all ${
                                  leaderboardDifficulty === d 
                                    ? 'bg-cyan-400 text-black shadow-[0_0_10px_rgba(34,211,238,0.3)]' 
                                    : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                              >
                                {d}
                              </motion.button>
                            ))}
                          </div>

                          {isLoadingScores ? (
                            <div className="py-12 flex items-center justify-center">
                              <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2">
                              {topScores.map((s, i) => (
                                <div key={s.id} className="flex items-center justify-between bg-white/5 border border-white/10 p-3 rounded-xl">
                                  <div className="flex items-center gap-3">
                                    <span className={`w-5 text-xs font-bold ${i < 3 ? 'text-yellow-500' : 'text-zinc-500'}`}>
                                      #{i + 1}
                                    </span>
                                    <div className="flex flex-col">
                                      <span className="text-xs font-bold text-white uppercase tracking-tight">{s.username}</span>
                                      <span className="text-[8px] text-zinc-500 font-bold uppercase">{s.difficulty} MODE</span>
                                    </div>
                                  </div>
                                  <span className={`text-sm font-mono font-bold ${i < 3 ? 'text-cyan-400' : 'text-zinc-400'}`}>
                                    {s.score.toString().padStart(4, '0')}
                                  </span>
                                </div>
                              ))}
                              {topScores.length === 0 && (
                                <div className="text-center py-12 text-zinc-500 text-xs font-bold uppercase">No scores registered yet</div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {ACHIEVEMENTS.map((ach, idx) => {
                            const isUnlocked = unlockedAchievements.includes(ach.id);
                            return (
                              <motion.div 
                                key={ach.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.1 + idx * 0.05 }}
                                className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                                  isUnlocked 
                                    ? 'bg-cyan-500/10 border-cyan-500/30' 
                                    : 'bg-white/5 border-white/10 opacity-60 grayscale'
                                }`}
                              >
                                <div className={`p-2 rounded-lg ${isUnlocked ? 'bg-cyan-400 text-black' : 'bg-white/10 text-zinc-500'}`}>
                                  {ach.icon}
                                </div>
                                <div className="flex flex-col">
                                  <span className={`text-[10px] font-black uppercase tracking-widest ${isUnlocked ? 'text-cyan-300' : 'text-zinc-500'}`}>
                                    {ach.title}
                                  </span>
                                  <span className="text-[9px] text-zinc-400 font-bold">{ach.description}</span>
                                </div>
                                {isUnlocked && (
                                  <div className="ml-auto">
                                    <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                                  </div>
                                )}
                              </motion.div>
                            );
                          })}
                        </div>
                      )}
                    </motion.div>
                  </div>

                    {/* Game Tip Display */}
                    <div className="mt-4 border-t border-white/5 pt-4 pb-2">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={currentTipIndex}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="flex flex-col items-center text-center gap-1"
                        >
                          <span className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.3em] text-cyan-400 opacity-60">
                            System Intel
                          </span>
                          <p className="text-[10px] md:text-[11px] text-zinc-400 font-bold max-w-[280px] leading-relaxed italic">
                            "{GAME_TIPS[currentTipIndex]}"
                          </p>
                        </motion.div>
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}

                {status === 'PAUSED' && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center"
                  >
                    <Pause className="w-20 h-20 text-cyan-400 mb-6 drop-shadow-[0_0_20px_rgba(34,211,238,0.5)]" />
                    <h2 className="text-3xl font-black italic mb-8 tracking-[0.2em]">PAUSE_MODE</h2>
                    <motion.button
                      id="btn-resume"
                      whileHover={{ scale: 1.05, shadow: '0 0 30px rgba(255,255,255,0.2)' }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setStatus('PLAYING')}
                      className="bg-white text-black px-12 py-4 rounded-xl font-bold text-lg transition-transform"
                    >
                      RESUME_SYNC
                    </motion.button>
                  </motion.div>
                )}

              {status === 'GAMEOVER' && (
                <motion.div 
                  initial="hidden"
                  animate="visible"
                  variants={{
                    hidden: { opacity: 0 },
                    visible: { 
                      opacity: 1,
                      transition: { staggerChildren: 0.1, delayChildren: 0.1 }
                    }
                  }}
                  className="flex flex-col items-center text-center w-full relative crt-warp p-4 rounded-3xl"
                >
                  <div className="scanline-artifact" />
                  
                  <motion.div
                    variants={{
                      hidden: { scale: 2, opacity: 0, filter: 'blur(20px)' },
                      visible: { 
                        scale: 1, 
                        opacity: 1, 
                        filter: 'blur(0px)',
                        transition: { type: 'spring', damping: 15, stiffness: 100 }
                      }
                    }}
                    className="relative mb-2 game-over-glitch"
                  >
                    {/* Glitch Effect layers */}
                      <motion.h2 
                        animate={{ 
                          x: [0, -3, 3, -2, 0],
                          opacity: [1, 0.7, 1, 0.8, 1],
                          scale: [1, 1.05, 0.95, 1]
                        }}
                        transition={{ repeat: Infinity, duration: 0.15, repeatDelay: 1.5 }}
                        className="text-5xl md:text-7xl font-black text-rose-500 italic tracking-tighter drop-shadow-[0_0_30px_rgba(244,63,94,0.8)]"
                      >
                        <GlitchText text="GAME OVER" />
                      </motion.h2>
                      <motion.div 
                        animate={{ 
                          opacity: [0, 0.8, 0],
                          x: [-10, 10, -10],
                          skewY: [0, 5, -5, 0]
                        }}
                        transition={{ repeat: Infinity, duration: 0.1, repeatDelay: 1 }}
                        className="absolute inset-0 text-cyan-400 font-black text-5xl md:text-7xl italic tracking-tighter mix-blend-screen overflow-hidden pointer-events-none opacity-50"
                      >
                        <GlitchText text="GAME OVER" />
                      </motion.div>
                  </motion.div>
                  
                  <motion.div 
                    variants={{
                      hidden: { y: 10, opacity: 0 },
                      visible: { y: 0, opacity: 1 }
                    }}
                    className="flex flex-col items-center gap-1 mb-8"
                  >
                    <div className="h-[2px] w-16 bg-rose-500/50 rounded-full animate-pulse" />
                    <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.4em] font-mono">
                      Neural Link: <span className="text-rose-400 animate-pulse">TERMINATED</span>
                    </p>
                  </motion.div>
                  
                  <motion.div 
                    variants={{
                      hidden: { y: 30, opacity: 0, scale: 0.9 },
                      visible: { 
                        y: 0, 
                        opacity: 1, 
                        scale: 1,
                        transition: { type: 'spring', damping: 20, stiffness: 200 }
                      }
                    }}
                    className="bg-zinc-950/90 border border-white/20 p-8 md:p-10 rounded-[2.5rem] w-full mb-8 relative group shadow-[0_0_80px_rgba(244,63,94,0.15)] chromatic-box"
                  >
                    {/* Background decorative elements */}
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.03),transparent)]" />
                    
                    <div className="relative z-10">
                      <div className="text-[10px] md:text-[11px] uppercase text-zinc-500 font-black mb-4 tracking-[0.4em]">Final Score Payload</div>
                      
                      <div className="relative inline-block">
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-7xl md:text-8xl font-mono font-black text-white tabular-nums tracking-tighter leading-none"
                        >
                          {displayedScore}
                        </motion.div>
                        
                        {newHighScoreAchieved && displayedScore === score && (
                          <motion.div 
                            initial={{ scale: 0, rotate: -20 }}
                            animate={{ 
                              scale: 1, 
                              rotate: -12,
                              y: [-2, 2, -2]
                            }}
                            transition={{ 
                              scale: { type: 'spring', damping: 12, stiffness: 200 },
                              y: { repeat: Infinity, duration: 2, ease: "easeInOut" }
                            }}
                            className="absolute -top-12 -right-8 bg-cyan-400 text-black text-[10px] font-black px-4 py-1.5 rounded-sm shadow-[0_0_25px_rgba(34,211,238,0.7)] z-30 uppercase tracking-widest border-2 border-white/20"
                          >
                            NEW RECORD
                          </motion.div>
                        )}
                      </div>

                      <div className="mt-8 grid grid-cols-2 gap-4 border-t border-white/5 pt-6">
                        <div className="flex flex-col items-start gap-1">
                          <span className="text-[8px] text-zinc-600 font-black uppercase tracking-widest">Protocol</span>
                          <span className="text-xs text-white font-mono font-bold">{difficulty}</span>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[8px] text-zinc-600 font-black uppercase tracking-widest">Global Best</span>
                          <span className="text-xs text-cyan-400 font-mono font-bold">{highScore}</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>

                  {/* Global Submission */}
                  <motion.div 
                    variants={{
                      hidden: { opacity: 0 },
                      visible: { opacity: 1 }
                    }}
                    className="w-full mb-8 border-t border-white/5 pt-6"
                  >
                    {!user ? (
                      <motion.button
                        id="btn-login-to-save"
                        whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.08)' }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleSignIn}
                        className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex items-center justify-center gap-3 transition-all group"
                      >
                        <UserIcon className="w-4 h-4 text-zinc-400 group-hover:text-cyan-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 group-hover:text-white">Initialize Score Sync</span>
                      </motion.button>
                    ) : !hasSubmitted ? (
                      <div className="flex flex-col gap-4">
                        <label className="text-[9px] uppercase font-black text-zinc-500 text-left ml-1 tracking-[0.2em]">Broadcast to Leaderboard</label>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            maxLength={16}
                            placeholder="ID_IDENTIFIER"
                            value={playerName}
                            onChange={(e) => setPlayerName(e.target.value.slice(0, 16))}
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-sm font-mono tracking-tighter focus:outline-none focus:border-cyan-400 focus:bg-white/[0.08] focus:ring-1 focus:ring-cyan-500/30 transition-all placeholder:text-zinc-700"
                          />
                          <motion.button
                            id="btn-submit-score"
                            whileHover={{ scale: 1.05, backgroundColor: '#22d3ee' }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleSubmitScore}
                            disabled={isSubmitting || !playerName}
                            className="bg-cyan-500 disabled:opacity-20 disabled:grayscale transition-all text-black px-6 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.3)] min-h-[56px]"
                          >
                            {isSubmitting ? (
                              <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                            ) : (
                              <Send className="w-5 h-5" />
                            )}
                          </motion.button>
                        </div>
                      </div>
                    ) : (
                      <motion.div 
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="flex flex-col items-center justify-center gap-2 text-cyan-400 py-2"
                      >
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1, rotate: [0, 15, -15, 0] }}
                          transition={{ type: 'spring', damping: 8, stiffness: 200 }}
                        >
                          <CheckCircle2 className="w-12 h-12 drop-shadow-[0_0_25px_rgba(34,211,238,0.8)]" />
                        </motion.div>
                        <motion.div
                          initial={{ y: 5, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: 0.2 }}
                          className="flex flex-col items-center"
                        >
                          <span className="text-sm font-black uppercase tracking-[0.3em] mb-1">Transmission Success</span>
                          <span className="text-[8px] opacity-50 font-bold uppercase tracking-widest font-mono">Archive Synchronized</span>
                        </motion.div>
                      </motion.div>
                    )}
                  </motion.div>

                  <motion.div 
                    variants={{
                      hidden: { y: 10, opacity: 0 },
                      visible: { y: 0, opacity: 1 }
                    }}
                    className="flex flex-col gap-3 w-full"
                  >
                    <motion.button
                      id="btn-retry"
                      whileHover={{ scale: 1.02, backgroundColor: '#ffffff' }}
                      whileTap={{ scale: 0.98 }}
                      onClick={startGame}
                      className="w-full bg-white text-black py-5 md:py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition-all shadow-[0_0_30px_rgba(255,255,255,0.2)] min-h-[64px]"
                    >
                      <RotateCcw className="w-6 h-6" /> RELOAD SYSTEM
                    </motion.button>
                    <motion.button
                      id="btn-menu"
                      whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.1)' }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setStatus('MENU')}
                      className="w-full bg-white/5 border border-white/10 py-5 md:py-4 rounded-2xl font-bold tracking-widest text-zinc-400 hover:text-white transition-all min-h-[64px]"
                    >
                      RETURN TO ROOT
                    </motion.button>
                  </motion.div>
                </motion.div>
              )}

                {status === 'WIN' && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center text-center"
                  >
                    <div className="w-20 h-20 bg-yellow-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_#eab308]">
                      <CheckCircle2 className="w-10 h-10 text-black" />
                    </div>
                    <h2 className="text-4xl font-black text-yellow-500 mb-2 italic tracking-tighter">VICTORY</h2>
                    <p className="text-zinc-400 mb-8 max-w-[200px]">You reached the master score of {WIN_SCORE}!</p>
                    
                    <motion.button
                      id="btn-win-menu"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setStatus('MENU')}
                      className="w-full bg-white text-black py-4 rounded-xl font-black text-lg shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                    >
                      COLLECT GLORY
                    </motion.button>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Settings Modal */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-6"
            >
              <motion.div 
                initial={{ 
                  clipPath: 'polygon(0 45%, 100% 45%, 100% 55%, 0 55%)',
                  opacity: 0,
                  scale: 1.1
                }}
                animate={{ 
                  clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)',
                  opacity: 1,
                  scale: 1
                }}
                exit={{ 
                  clipPath: 'polygon(0 45%, 100% 45%, 100% 55%, 0 55%)',
                  opacity: 0,
                  scale: 0.95
                }}
                transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                className="bg-zinc-900 border border-white/10 rounded-3xl p-6 md:p-8 w-full max-w-sm shadow-[0_0_50px_rgba(34,211,238,0.15)] flex flex-col max-h-[90dvh] relative overflow-hidden"
              >
                {/* Decorative border elements */}
                <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-cyan-500 m-4" />
                <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-cyan-500 m-4" />
                <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-cyan-500 m-4" />
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-cyan-500 m-4" />
                <div className="flex items-center gap-3 mb-6 shrink-0">
                  <div className="p-2 bg-cyan-500/20 rounded-lg">
                    <Settings className="w-5 h-5 text-cyan-400" />
                  </div>
                  <h2 className="text-xl font-bold">System Settings</h2>
                </div>

                <div className="flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2 pb-2">
                  {/* SFX Control */}
                  <div className="flex flex-col gap-3">
                    <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-widest text-zinc-500">
                      <span>Sound Effects</span>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          const enabled = !settings.sfxEnabled;
                          setSettings(s => ({ ...s, sfxEnabled: enabled }));
                          audioService.setSfxEnabled(enabled);
                        }}
                        className={`px-2 py-0.5 rounded text-[8px] font-black tracking-tighter transition-colors ${settings.sfxEnabled ? 'bg-cyan-500 text-black' : 'bg-white/10 text-white'}`}
                      >
                        {settings.sfxEnabled ? 'ON' : 'OFF'}
                      </motion.button>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.01"
                      disabled={!settings.sfxEnabled}
                      value={settings.sfxVolume}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setSettings(s => ({ ...s, sfxVolume: val }));
                        audioService.setSfxVolume(val);
                      }}
                      className={`w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400 ${!settings.sfxEnabled && 'opacity-30 cursor-not-allowed'}`}
                    />
                  </div>

                  {/* Music Control */}
                  <div className="flex flex-col gap-3">
                    <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-widest text-zinc-500">
                      <span>Background Music</span>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          const enabled = !settings.musicEnabled;
                          setSettings(s => ({ ...s, musicEnabled: enabled }));
                          audioService.setMusicEnabled(enabled);
                        }}
                        className={`px-2 py-0.5 rounded text-[8px] font-black tracking-tighter transition-colors ${settings.musicEnabled ? 'bg-cyan-500 text-black' : 'bg-white/10 text-white'}`}
                      >
                        {settings.musicEnabled ? 'ON' : 'OFF'}
                      </motion.button>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.01"
                      disabled={!settings.musicEnabled}
                      value={settings.musicVolume}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setSettings(s => ({ ...s, musicVolume: val }));
                        audioService.setMusicVolume(val);
                      }}
                      className={`w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400 ${!settings.musicEnabled && 'opacity-30 cursor-not-allowed'}`}
                    />
                  </div>

                  {/* Visual Effects */}
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold">Neon Atmosphere</span>
                      <span className="text-[10px] text-zinc-500">Toggles background glow effects</span>
                    </div>
                    <button
                      onClick={() => setSettings(s => ({ ...s, showGlow: !s.showGlow }))}
                      className={`w-12 h-6 rounded-full transition-colors relative flex items-center ${settings.showGlow ? 'bg-cyan-500' : 'bg-white/10'}`}
                    >
                      <motion.div 
                        animate={{ x: settings.showGlow ? 26 : 4 }}
                        className="w-4 h-4 bg-white rounded-full shadow-sm"
                      />
                    </button>
                  </div>

                  {/* Glow Intensity */}
                  <div className="flex flex-col gap-3">
                    <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-widest text-zinc-500">
                      <span>Glow Intensity</span>
                      <span className="text-cyan-400">{Math.round(settings.glowIntensity * 100)}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.01"
                      disabled={!settings.showGlow}
                      value={settings.glowIntensity}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setSettings(s => ({ ...s, glowIntensity: val }));
                      }}
                      className={`w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400 ${!settings.showGlow && 'opacity-30 cursor-not-allowed'}`}
                    />
                  </div>

                  {/* Snake Color */}
                  <div className="flex flex-col gap-4 pt-4 border-t border-white/5">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold">Snake Identity</span>
                      <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Select Active Neon</span>
                    </div>
                    <div className="grid grid-cols-6 gap-3">
                      {SNAKE_COLORS.map(color => (
                        <motion.button
                          key={color.name}
                          whileHover={{ scale: 1.15 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => setSettings(s => ({ ...s, snakeColor: color.name }))}
                          className={`aspect-square min-h-[44px] rounded-lg border-2 transition-all ${
                            settings.snakeColor === color.name 
                              ? 'border-white scale-110 shadow-[0_0_15px_rgba(255,255,255,0.5)]' 
                              : 'border-transparent'
                          } ${color.class}`}
                          title={color.name}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Snake Style */}
                  <div className="flex flex-col gap-4 pt-4 border-t border-white/5">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold">Body Structure</span>
                      <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Chassis Configuration</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {SNAKE_STYLES.map(style => (
                        <motion.button
                          key={style.id}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setSettings(s => ({ ...s, snakeStyle: style.id }))}
                          className={`py-3 px-1 min-h-[44px] rounded-lg border text-[10px] font-black uppercase tracking-tighter transition-all ${
                            settings.snakeStyle === style.id 
                              ? 'bg-cyan-500 border-white text-black shadow-[0_0_15px_rgba(34,213,238,0.4)]' 
                              : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
                          }`}
                        >
                          {style.name}
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  {/* Snake Pattern */}
                  <div className="flex flex-col gap-4 pt-4 border-t border-white/5">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold">Surface Pattern</span>
                      <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Aesthetics Overdrive</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {SNAKE_PATTERNS.map(pattern => (
                         <motion.button
                          key={pattern.id}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setSettings(s => ({ ...s, snakePattern: pattern.id }))}
                          className={`py-3 px-1 min-h-[44px] rounded-lg border text-[10px] font-black uppercase tracking-tighter transition-all ${
                            settings.snakePattern === pattern.id 
                              ? 'bg-amber-500 border-white text-black shadow-[0_0_15px_rgba(245,158,11,0.4)]' 
                              : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
                          }`}
                        >
                          {pattern.name}
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  {/* Snake Trail */}
                  <div className="flex flex-col gap-4 pt-4 border-t border-white/5">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold">Trace Effect</span>
                      <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Kinetic Visualization</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {SNAKE_TRAILS.map(trail => (
                        <motion.button
                          key={trail.id}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setSettings(s => ({ ...s, snakeTrail: trail.id }))}
                          className={`py-3 px-1 min-h-[44px] rounded-lg border text-[10px] font-black uppercase tracking-tighter transition-all ${
                            settings.snakeTrail === trail.id 
                              ? 'bg-fuchsia-500 border-white text-black shadow-[0_0_15px_rgba(217,70,239,0.4)]' 
                              : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
                          }`}
                        >
                          {trail.name}
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.02, backgroundColor: '#f0f0f0' }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowSettings(false)}
                    className="w-full bg-white text-black py-5 md:py-4 rounded-xl font-black text-base md:text-lg mt-4 transition-all min-h-[56px] shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                  >
                    SAVE & CLOSE
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Effect Indicator (Floating HUD) */}
        <AnimatePresence>
          {activeEffect !== 'NONE' && (
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className={`absolute -top-16 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full border backdrop-blur-md shadow-2xl flex items-center gap-3 z-50 ${
                activeEffect === 'INVINCIBLE' 
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' 
                  : activeEffect === 'DISCO'
                    ? 'bg-white/20 border-white/40 text-white shadow-[0_0_30px_rgba(255,255,255,0.2)]'
                    : 'bg-fuchsia-500/20 border-fuchsia-500/40 text-fuchsia-400'
              }`}
            >
              <Zap className={`w-4 h-4 ${activeEffect === 'INVINCIBLE' || activeEffect === 'DISCO' ? 'animate-pulse' : ''}`} />
              <span className="text-sm font-black tracking-widest uppercase">
                {activeEffect === 'INVINCIBLE' ? 'Invincible' : activeEffect === 'DISCO' ? 'Disco Mode' : 'Double Points'}
              </span>
              <div className="w-[1px] h-4 bg-white/20" />
              <span className="text-sm font-mono font-bold w-4">{effectTimeRemaining}s</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Achievement Unlock Toast */}
        <AnimatePresence>
          {activeAchievement && (
            <motion.div
              initial={{ y: -100, x: '-50%', opacity: 0 }}
              animate={{ y: 20, x: '-50%', opacity: 1 }}
              exit={{ y: -100, x: '-50%', opacity: 0 }}
              className="fixed top-4 left-1/2 z-[200] flex items-center gap-4 bg-zinc-900 border-2 border-cyan-400 p-4 rounded-2xl shadow-[0_0_40px_rgba(34,211,238,0.3)] min-w-[280px]"
            >
              <div className="w-10 h-10 bg-cyan-400 rounded-xl flex items-center justify-center text-black shadow-[0_0_15px_#22d3ee]">
                <Trophy className="w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400">Achievement Unlocked</span>
                <span className="text-lg font-black italic tracking-tight">{activeAchievement.title}</span>
              </div>
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3 }}
                className="ml-auto"
              >
                <CheckCircle2 className="w-6 h-6 text-cyan-400" />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Controls / Info */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/5 border border-white/10 p-4 rounded-2xl flex items-center gap-3">
            <Zap className="w-5 h-5 text-fuchsia-400" />
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-zinc-500">Current Velocity</span>
              <span className="text-sm font-mono font-bold text-fuchsia-400">
                {Math.max(50, currentSpeed)} ms
              </span>
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 p-4 rounded-2xl flex items-center gap-3">
            <Settings className="w-5 h-5 text-zinc-400" />
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-zinc-500">Difficulty</span>
              <span className="text-sm font-mono font-bold text-white uppercase">{difficulty}</span>
            </div>
          </div>
        </div>

        <div className="text-center md:block hidden">
          <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold italic">
            Use ARROW KEYS to move • Press P to pause
          </p>
        </div>

        {/* Mobile D-Pad */}
        <div className="md:hidden grid grid-cols-3 gap-4 w-full max-w-[340px] mx-auto py-6 shrink-0">
          <div />
          <button 
            onPointerDown={(e) => { 
              e.preventDefault(); 
              if (nextDirection.current !== 'DOWN') {
                nextDirection.current = 'UP';
                if (window.navigator.vibrate) window.navigator.vibrate(10);
              }
            }}
            className="aspect-square flex items-center justify-center bg-white/5 border border-white/10 rounded-2xl active:bg-cyan-500/40 active:border-cyan-400 active:scale-95 transition-all text-zinc-400 active:text-cyan-400 shadow-lg active:shadow-[0_0_20px_rgba(34,211,238,0.4)] touch-none"
          >
            <ChevronUp className="w-12 h-12" />
          </button>
          <div />

          <button 
            onPointerDown={(e) => { 
              e.preventDefault(); 
              if (nextDirection.current !== 'RIGHT') {
                nextDirection.current = 'LEFT';
                if (window.navigator.vibrate) window.navigator.vibrate(10);
              }
            }}
            className="aspect-square flex items-center justify-center bg-white/5 border border-white/10 rounded-2xl active:bg-cyan-500/40 active:border-cyan-400 active:scale-95 transition-all text-zinc-400 active:text-cyan-400 shadow-lg active:shadow-[0_0_20px_rgba(34,211,238,0.4)] touch-none"
          >
            <ChevronLeft className="w-12 h-12" />
          </button>
          <button 
            onPointerDown={(e) => { 
              e.preventDefault(); 
              if (nextDirection.current !== 'UP') {
                nextDirection.current = 'DOWN';
                if (window.navigator.vibrate) window.navigator.vibrate(10);
              }
            }}
            className="aspect-square flex items-center justify-center bg-white/5 border border-white/10 rounded-2xl active:bg-cyan-500/40 active:border-cyan-400 active:scale-95 transition-all text-zinc-400 active:text-cyan-400 shadow-lg active:shadow-[0_0_20px_rgba(34,211,238,0.4)] touch-none"
          >
            <ChevronDown className="w-12 h-12" />
          </button>
          <button 
            onPointerDown={(e) => { 
              e.preventDefault(); 
              if (nextDirection.current !== 'LEFT') {
                nextDirection.current = 'RIGHT';
                if (window.navigator.vibrate) window.navigator.vibrate(10);
              }
            }}
            className="aspect-square flex items-center justify-center bg-white/5 border border-white/10 rounded-2xl active:bg-cyan-500/40 active:border-cyan-400 active:scale-95 transition-all text-zinc-400 active:text-cyan-400 shadow-lg active:shadow-[0_0_20px_rgba(34,211,238,0.4)] touch-none"
          >
            <ChevronRight className="w-12 h-12" />
          </button>

          <div />
          <button 
            onClick={() => {
              setShowSettings(true);
              if (window.navigator.vibrate) window.navigator.vibrate(10);
            }}
            className="aspect-square flex items-center justify-center bg-white/5 border border-white/10 rounded-2xl active:bg-zinc-700 transition-all text-zinc-600 active:text-zinc-400"
          >
            <Settings className="w-8 h-8" />
          </button>
          <div />
        </div>
      </main>
    </div>
  );
}
