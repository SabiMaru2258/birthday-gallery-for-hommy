import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Group } from "three";
import { Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Candle } from "./models/candle";
import { Cake } from "./models/cake";
import { Table } from "./models/table";
import { PictureFrame } from "./models/pictureFrame";
import { Fireworks } from "./components/Fireworks";
import { BirthdayCard } from "./components/BirthdayCard";

import "./App.css";

// Set to true to skip the intro typing animation and start the scene immediately
const SKIP_INTRO = false;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

type AnimatedSceneProps = {
  isPlaying: boolean;
  onBackgroundFadeChange?: (opacity: number) => void;
  onEnvironmentProgressChange?: (progress: number) => void;
  candleLit: boolean;
  onAnimationComplete?: () => void;
  cards: ReadonlyArray<BirthdayCardConfig>;
  activeCardId: string | null;
  onToggleCard: (id: string) => void;
};

const CAKE_START_Y = 10;
const CAKE_END_Y = 0;
const CAKE_DESCENT_DURATION = 3;

const TABLE_START_Z = 30;
const TABLE_END_Z = 0;
const TABLE_SLIDE_DURATION = 0.7;
const TABLE_SLIDE_START = CAKE_DESCENT_DURATION - TABLE_SLIDE_DURATION - 0.1;

const CANDLE_START_Y = 5;
const CANDLE_END_Y = 0;
const CANDLE_DROP_DURATION = 1.2;
const CANDLE_DROP_START =
  Math.max(CAKE_DESCENT_DURATION, TABLE_SLIDE_START + TABLE_SLIDE_DURATION) +
  1.0;

const totalAnimationTime = CANDLE_DROP_START + CANDLE_DROP_DURATION;

const ORBIT_TARGET = new Vector3(0, 1, 0);
const ORBIT_INITIAL_RADIUS = 3;
const ORBIT_INITIAL_HEIGHT = 1;
const ORBIT_INITIAL_AZIMUTH = Math.PI / 2;
const ORBIT_MIN_DISTANCE = 2;
const ORBIT_MAX_DISTANCE = 8;
const ORBIT_MIN_POLAR = Math.PI * 0;
const ORBIT_MAX_POLAR = Math.PI / 2;

const BACKGROUND_FADE_DURATION = 1;
const BACKGROUND_FADE_OFFSET = 0;
const BACKGROUND_FADE_END = Math.max(
  CANDLE_DROP_START - BACKGROUND_FADE_OFFSET,
  BACKGROUND_FADE_DURATION
);
const BACKGROUND_FADE_START = Math.max(
  BACKGROUND_FADE_END - BACKGROUND_FADE_DURATION,
  0
);

const TYPED_LINES = [
  "> Hello Hom Hom !",
  "...",
  "> today is your birthday !",
  "...",
  "> so i made you this little gallery program",
  "...",
  "٩(◕‿◕)۶ ٩(◕‿◕)۶ ٩(◕‿◕)۶"
];
const TYPED_CHAR_DELAY = 100;
const POST_TYPING_SCENE_DELAY = 1000;
const CURSOR_BLINK_INTERVAL = 480;

const TERMINAL_LINES = [
  "> INITIALIZING CAMERA MODULE...",
  "> SCANNING FOR DEVICES...",
  "> ERROR: NO CAMERA DETECTED.",
  "...",
  "> I GUESS YOU'LL NEED A NEW CAMERA NOW.",
  "> :)"
];
const TERMINAL_CHAR_DELAY = 50; // 30-60ms per character (using 50ms)
const TERMINAL_LINE_DELAYS = [800, 1000, 1200, 1000, 800, 600]; // Pause between lines (400-1200ms)
const TERMINAL_CURSOR_BLINK_INTERVAL = 480;

type BirthdayCardConfig = {
  id: string;
  image: string;
  position: [number, number, number];
  rotation: [number, number, number];
};

const BIRTHDAY_CARDS: ReadonlyArray<BirthdayCardConfig> = [
  {
    id: "confetti",
    image: `${import.meta.env.BASE_URL}my-card.png`,
    position: [1, 0.081, -2],
    rotation: [-Math.PI / 2 , 0, Math.PI / 3],
  }
];

function AnimatedScene({
  isPlaying,
  onBackgroundFadeChange,
  onEnvironmentProgressChange,
  candleLit,
  onAnimationComplete,
  cards,
  activeCardId,
  onToggleCard,
}: AnimatedSceneProps) {
  const cakeGroup = useRef<Group>(null);
  const tableGroup = useRef<Group>(null);
  const candleGroup = useRef<Group>(null);
  const animationStartRef = useRef<number | null>(null);
  const hasPrimedRef = useRef(false);
  const hasCompletedRef = useRef(false);
  const completionNotifiedRef = useRef(false);
  const backgroundOpacityRef = useRef(1);
  const environmentProgressRef = useRef(0);

  useEffect(() => {
    onBackgroundFadeChange?.(backgroundOpacityRef.current);
    onEnvironmentProgressChange?.(environmentProgressRef.current);
  }, [onBackgroundFadeChange, onEnvironmentProgressChange]);

  const emitBackgroundOpacity = (value: number) => {
    const clamped = clamp(value, 0, 1);
    if (Math.abs(clamped - backgroundOpacityRef.current) > 0.005) {
      backgroundOpacityRef.current = clamped;
      onBackgroundFadeChange?.(clamped);
    }
  };

  const emitEnvironmentProgress = (value: number) => {
    const clamped = clamp(value, 0, 1);
    if (Math.abs(clamped - environmentProgressRef.current) > 0.005) {
      environmentProgressRef.current = clamped;
      onEnvironmentProgressChange?.(clamped);
    }
  };

  useFrame(({ clock }) => {
    const cake = cakeGroup.current;
    const table = tableGroup.current;
    const candle = candleGroup.current;

    if (!cake || !table || !candle) {
      return;
    }

    if (!hasPrimedRef.current) {
      cake.position.set(0, CAKE_START_Y, 0);
      cake.rotation.set(0, 0, 0);
      table.position.set(0, 0, TABLE_START_Z);
      table.rotation.set(0, 0, 0);
      candle.position.set(0, CANDLE_START_Y, 0);
      candle.visible = false;
      hasPrimedRef.current = true;
    }

    if (!isPlaying) {
      emitBackgroundOpacity(1);
      emitEnvironmentProgress(0);
      animationStartRef.current = null;
      hasCompletedRef.current = false;
      completionNotifiedRef.current = false;
      return;
    }

    if (hasCompletedRef.current) {
      emitBackgroundOpacity(0);
      emitEnvironmentProgress(1);
      if (!completionNotifiedRef.current) {
        completionNotifiedRef.current = true;
        onAnimationComplete?.();
      }
      return;
    }

    if (animationStartRef.current === null) {
      animationStartRef.current = clock.elapsedTime;
    }

    const elapsed = clock.elapsedTime - animationStartRef.current;
    const clampedElapsed = clamp(elapsed, 0, totalAnimationTime);

    const cakeProgress = clamp(clampedElapsed / CAKE_DESCENT_DURATION, 0, 1);
    const cakeEase = easeOutCubic(cakeProgress);
    cake.position.y = lerp(CAKE_START_Y, CAKE_END_Y, cakeEase);
    cake.position.x = 0;
    cake.position.z = 0;
    cake.rotation.y = cakeEase * Math.PI * 2;
    cake.rotation.x = 0;
    cake.rotation.z = 0;

    let tableZ = TABLE_START_Z;
    if (clampedElapsed >= TABLE_SLIDE_START) {
      const tableProgress = clamp(
        (clampedElapsed - TABLE_SLIDE_START) / TABLE_SLIDE_DURATION,
        0,
        1
      );
      const tableEase = easeOutCubic(tableProgress);
      tableZ = lerp(TABLE_START_Z, TABLE_END_Z, tableEase);
    }
    table.position.set(0, 0, tableZ);
    table.rotation.set(0, 0, 0);

    if (clampedElapsed >= CANDLE_DROP_START) {
      if (!candle.visible) {
        candle.visible = true;
      }
      const candleProgress = clamp(
        (clampedElapsed - CANDLE_DROP_START) / CANDLE_DROP_DURATION,
        0,
        1
      );
      const candleEase = easeOutCubic(candleProgress);
      candle.position.y = lerp(CANDLE_START_Y, CANDLE_END_Y, candleEase);
    } else {
      candle.visible = false;
      candle.position.set(0, CANDLE_START_Y, 0);
    }

    if (clampedElapsed < BACKGROUND_FADE_START) {
      emitBackgroundOpacity(1);
      emitEnvironmentProgress(0);
    } else {
      const fadeProgress = clamp(
        (clampedElapsed - BACKGROUND_FADE_START) / BACKGROUND_FADE_DURATION,
        0,
        1
      );
      const eased = easeOutCubic(fadeProgress);
      const backgroundOpacity = 1 - eased;
      emitBackgroundOpacity(backgroundOpacity);
      emitEnvironmentProgress(1 - backgroundOpacity);
    }

    const animationDone = clampedElapsed >= totalAnimationTime;
    if (animationDone) {
      cake.position.set(0, CAKE_END_Y, 0);
      cake.rotation.set(0, 0, 0);
      table.position.set(0, 0, TABLE_END_Z);
      candle.position.set(0, CANDLE_END_Y, 0);
      candle.visible = true;
      emitBackgroundOpacity(0);
      emitEnvironmentProgress(1);
      hasCompletedRef.current = true;
      if (!completionNotifiedRef.current) {
        completionNotifiedRef.current = true;
        onAnimationComplete?.();
      }
    }
  });

  return (
    <>
      <group ref={tableGroup}>
        <Table />
        <PictureFrame
          image={`${import.meta.env.BASE_URL}frame2.jpg`}
          position={[0, 0.735, 3]}
          rotation={[0, 5.6, 0]}
          scale={0.75}
        />
        <PictureFrame
          image={`${import.meta.env.BASE_URL}frame3.jpg`}
          position={[0, 0.735, -3]}
          rotation={[0, 4.0, 0]}
          scale={0.75}
        />
        <PictureFrame
          image={`${import.meta.env.BASE_URL}frame4.jpg`}
          position={[-1.5, 0.735, 2.5]}
          rotation={[0, 5.4, 0]}
          scale={0.75}
        />
        <PictureFrame
          image={`${import.meta.env.BASE_URL}frame1.jpg`}
          position={[-1.5, 0.735, -2.5]}
          rotation={[0, 4.2, 0]}
          scale={0.75}
        />
        {cards.map((card) => (
          <BirthdayCard
            key={card.id}
            id={card.id}
            image={card.image}
            tablePosition={card.position}
            tableRotation={card.rotation}
            isActive={activeCardId === card.id}
            onToggle={onToggleCard}
          />
        ))}
      </group>
      <group ref={cakeGroup}>
        <Cake />
      </group>
      <group ref={candleGroup}>
        <Candle isLit={candleLit} scale={0.25} position={[0, 1.1, 0]} />
      </group>
    </>
  );
}

function ConfiguredOrbitControls() {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    const offset = new Vector3(
      Math.sin(ORBIT_INITIAL_AZIMUTH) * ORBIT_INITIAL_RADIUS,
      ORBIT_INITIAL_HEIGHT,
      Math.cos(ORBIT_INITIAL_AZIMUTH) * ORBIT_INITIAL_RADIUS
    );
    const cameraPosition = ORBIT_TARGET.clone().add(offset);
    camera.position.copy(cameraPosition);
    camera.lookAt(ORBIT_TARGET);

    const controls = controlsRef.current;
    if (controls) {
      controls.target.copy(ORBIT_TARGET);
      controls.update();
    }
  }, [camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.05}
      minDistance={ORBIT_MIN_DISTANCE}
      maxDistance={ORBIT_MAX_DISTANCE}
      minPolarAngle={ORBIT_MIN_POLAR}
      maxPolarAngle={ORBIT_MAX_POLAR}
      enablePan={true}
      enableZoom={true}
      enableRotate={true}
      touches={{
        ONE: 2, // Rotate
        TWO: 1, // Zoom
      }}
    />
  );
}

type EnvironmentBackgroundControllerProps = {
  intensity: number;
};

function EnvironmentBackgroundController({
  intensity,
}: EnvironmentBackgroundControllerProps) {
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    if ("backgroundIntensity" in scene) {
      // Cast required because older typings might not include backgroundIntensity yet.
      (scene as typeof scene & { backgroundIntensity: number }).backgroundIntensity =
        intensity;
    }
  }, [scene, intensity]);

  return null;
}


export default function App() {
  const [hasStarted, setHasStarted] = useState(false);
  const [backgroundOpacity, setBackgroundOpacity] = useState(1);
  const [environmentProgress, setEnvironmentProgress] = useState(0);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const [sceneStarted, setSceneStarted] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);
  const [hasAnimationCompleted, setHasAnimationCompleted] = useState(false);
  const [isCandleLit, setIsCandleLit] = useState(true);
  const [fireworksActive, setFireworksActive] = useState(false);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [terminalLineIndex, setTerminalLineIndex] = useState(0);
  const [terminalCharIndex, setTerminalCharIndex] = useState(0);
  const [terminalCursorVisible, setTerminalCursorVisible] = useState(true);
  const [terminalTypingComplete, setTerminalTypingComplete] = useState(false);
  const backgroundAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(`${import.meta.env.BASE_URL}music.mp3`);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 1.0;
    backgroundAudioRef.current = audio;
    return () => {
      audio.pause();
      backgroundAudioRef.current = null;
    };
  }, []);


  const playTypingSound = useCallback(() => {
    // Generate a realistic typing sound using Web Audio API
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const now = audioContext.currentTime;
      
      // Create a more realistic typing sound with multiple frequencies
      // Simulates the mechanical click of a keyboard
      const frequencies = [
        200 + Math.random() * 50,  // Low click
        400 + Math.random() * 100,  // Mid click
        600 + Math.random() * 150   // High click
      ];
      
      frequencies.forEach((freq, index) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = freq;
        oscillator.type = 'sine';
        
        // Create a quick attack and decay for realistic typing sound
        const delay = index * 0.002; // Slight stagger for realism
        const duration = 0.015 + Math.random() * 0.01;
        const volume = 0.12 - (index * 0.03); // Decrease volume for higher frequencies
        
        gainNode.gain.setValueAtTime(0, now + delay);
        gainNode.gain.linearRampToValueAtTime(volume, now + delay + 0.001);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + delay + duration);
        
        oscillator.start(now + delay);
        oscillator.stop(now + delay + duration);
      });
    } catch (error) {
      // Fallback: ignore if Web Audio API is not available
    }
  }, []);

  // Skip intro if flag is enabled
  useEffect(() => {
    if (SKIP_INTRO) {
      setHasStarted(true);
      setSceneStarted(true);
      setBackgroundOpacity(0);
      setEnvironmentProgress(1);
      setCurrentLineIndex(TYPED_LINES.length);
      setCurrentCharIndex(0);
      // Start music
      const audio = backgroundAudioRef.current;
      if (audio) {
        audio.currentTime = 0;
        void audio.play().catch(() => {
          // ignore play errors (browser might block)
        });
      }
    }
  }, []);

  const playBackgroundMusic = useCallback(() => {
    const audio = backgroundAudioRef.current;
    if (!audio) {
      return;
    }
    if (!audio.paused) {
      return;
    }
    audio.currentTime = 0;
    audio.volume = 1.0;
    void audio.play().catch(() => {
      // ignore play errors (browser might block)
    });
  }, []);

  const fadeOutMusic = useCallback(() => {
    const audio = backgroundAudioRef.current;
    if (!audio || audio.paused) {
      return;
    }

    const fadeDuration = 1000; // 1 second fade
    const fadeSteps = 20;
    const fadeInterval = fadeDuration / fadeSteps;
    const volumeStep = audio.volume / fadeSteps;

    const fadeTimer = setInterval(() => {
      if (audio.volume > 0.1) {
        audio.volume = Math.max(0, audio.volume - volumeStep);
      } else {
        audio.volume = 0;
        audio.pause();
        clearInterval(fadeTimer);
      }
    }, fadeInterval);
  }, []);

  const fadeInMusic = useCallback(() => {
    const audio = backgroundAudioRef.current;
    if (!audio) {
      return;
    }

    // Start playing if paused
    if (audio.paused) {
      audio.volume = 0;
      void audio.play().catch(() => {
        // ignore play errors (browser might block)
      });
    }

    const fadeDuration = 1000; // 1 second fade
    const fadeSteps = 20;
    const fadeInterval = fadeDuration / fadeSteps;
    const targetVolume = 1.0;
    const volumeStep = targetVolume / fadeSteps;

    const fadeTimer = setInterval(() => {
      if (audio.volume < targetVolume - 0.05) {
        audio.volume = Math.min(targetVolume, audio.volume + volumeStep);
      } else {
        audio.volume = targetVolume;
        clearInterval(fadeTimer);
      }
    }, fadeInterval);
  }, []);

  const typingComplete = currentLineIndex >= TYPED_LINES.length;
  const typedLines = useMemo(() => {
    if (TYPED_LINES.length === 0) {
      return [""];
    }

    return TYPED_LINES.map((line, index) => {
      if (typingComplete || index < currentLineIndex) {
        return line;
      }
      if (index === currentLineIndex) {
        return line.slice(0, Math.min(currentCharIndex, line.length));
      }
      return "";
    });
  }, [currentCharIndex, currentLineIndex, typingComplete]);

  const cursorLineIndex = typingComplete
    ? Math.max(typedLines.length - 1, 0)
    : currentLineIndex;
  const cursorTargetIndex = Math.max(
    Math.min(cursorLineIndex, typedLines.length - 1),
    0
  );

  useEffect(() => {
    if (!hasStarted) {
      setCurrentLineIndex(0);
      setCurrentCharIndex(0);
      setSceneStarted(false);
      setIsCandleLit(true);
      setFireworksActive(false);
      setHasAnimationCompleted(false);
      return;
    }

    if (typingComplete) {
      if (!sceneStarted) {
        const handle = window.setTimeout(() => {
          setSceneStarted(true);
        }, POST_TYPING_SCENE_DELAY);
        return () => window.clearTimeout(handle);
      }
      return;
    }

    const currentLine = TYPED_LINES[currentLineIndex] ?? "";
    const handle = window.setTimeout(() => {
      if (currentCharIndex < currentLine.length) {
        playTypingSound();
        setCurrentCharIndex((prev) => prev + 1);
        return;
      }

      let nextLineIndex = currentLineIndex + 1;
      while (
        nextLineIndex < TYPED_LINES.length &&
        TYPED_LINES[nextLineIndex].length === 0
      ) {
        nextLineIndex += 1;
      }

      setCurrentLineIndex(nextLineIndex);
      setCurrentCharIndex(0);
    }, TYPED_CHAR_DELAY);

    return () => window.clearTimeout(handle);
  }, [
    hasStarted,
    currentCharIndex,
    currentLineIndex,
    typingComplete,
    sceneStarted,
    playTypingSound,
  ]);

  useEffect(() => {
    const handle = window.setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, CURSOR_BLINK_INTERVAL);
    return () => window.clearInterval(handle);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      if (!hasStarted) {
        playBackgroundMusic();
        setHasStarted(true);
        return;
      }
      if (hasAnimationCompleted && isCandleLit) {
        setIsCandleLit(false);
        setFireworksActive(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasStarted, hasAnimationCompleted, isCandleLit, playBackgroundMusic]);

  const handleCardToggle = useCallback((id: string) => {
    setActiveCardId((current) => (current === id ? null : id));
  }, []);

  const handleTakePhoto = useCallback(() => {
    fadeOutMusic();
    setShowCameraModal(true);
    setTerminalLineIndex(0);
    setTerminalCharIndex(0);
    setTerminalTypingComplete(false);
    setTerminalCursorVisible(true);
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
  }, [fadeOutMusic]);

  const handleCloseModal = useCallback(() => {
    if (terminalTypingComplete) {
      fadeInMusic();
      setShowCameraModal(false);
      setTerminalLineIndex(0);
      setTerminalCharIndex(0);
      setTerminalTypingComplete(false);
      // Restore body scroll
      document.body.style.overflow = '';
    }
  }, [terminalTypingComplete, fadeInMusic]);

  // Terminal typing animation
  const terminalTypedLines = useMemo(() => {
    if (TERMINAL_LINES.length === 0) {
      return [""];
    }

    return TERMINAL_LINES.map((line, index) => {
      if (terminalTypingComplete || index < terminalLineIndex) {
        return line;
      }
      if (index === terminalLineIndex) {
        return line.slice(0, Math.min(terminalCharIndex, line.length));
      }
      return "";
    });
  }, [terminalCharIndex, terminalLineIndex, terminalTypingComplete]);

  const terminalCursorLineIndex = terminalTypingComplete
    ? Math.max(terminalTypedLines.length - 1, 0)
    : terminalLineIndex;
  const terminalCursorTargetIndex = Math.max(
    Math.min(terminalCursorLineIndex, terminalTypedLines.length - 1),
    0
  );

  // Terminal typing effect
  useEffect(() => {
    if (!showCameraModal || terminalTypingComplete) {
      return;
    }

    const currentLine = TERMINAL_LINES[terminalLineIndex] ?? "";
    
    // If we've finished typing the current line, wait before moving to next
    if (terminalCharIndex >= currentLine.length) {
      const lineDelay = TERMINAL_LINE_DELAYS[terminalLineIndex] ?? 800;
      const handle = window.setTimeout(() => {
        let nextLineIndex = terminalLineIndex + 1;
        while (
          nextLineIndex < TERMINAL_LINES.length &&
          TERMINAL_LINES[nextLineIndex].length === 0
        ) {
          nextLineIndex += 1;
        }

        if (nextLineIndex >= TERMINAL_LINES.length) {
          setTerminalTypingComplete(true);
        } else {
          setTerminalLineIndex(nextLineIndex);
          setTerminalCharIndex(0);
        }
      }, lineDelay);

      return () => window.clearTimeout(handle);
    }

    // Continue typing current line
    const handle = window.setTimeout(() => {
      playTypingSound();
      setTerminalCharIndex((prev) => prev + 1);
    }, TERMINAL_CHAR_DELAY);

    return () => window.clearTimeout(handle);
  }, [
    showCameraModal,
    terminalCharIndex,
    terminalLineIndex,
    terminalTypingComplete,
    playTypingSound,
  ]);

  // Terminal cursor blink
  useEffect(() => {
    if (!showCameraModal) {
      return;
    }
    const handle = window.setInterval(() => {
      setTerminalCursorVisible((prev) => !prev);
    }, TERMINAL_CURSOR_BLINK_INTERVAL);
    return () => window.clearInterval(handle);
  }, [showCameraModal]);

  // ESC key handler for terminal
  useEffect(() => {
    if (!showCameraModal) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && terminalTypingComplete) {
        handleCloseModal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showCameraModal, terminalTypingComplete, handleCloseModal]);

  const isScenePlaying = hasStarted && sceneStarted;

  return (
    <div className="App">
      <div
        className="background-overlay"
        style={{ opacity: backgroundOpacity }}
      >
        <div className="typed-text">
          {typedLines.map((line, index) => {
            const showCursor =
              cursorVisible &&
              index === cursorTargetIndex &&
              (!typingComplete || !sceneStarted);
            return (
              <span className="typed-line" key={`typed-line-${index}`}>
                {line || "\u00a0"}
                {showCursor && (
                  <span aria-hidden="true" className="typed-cursor">
                    _
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </div>
      {hasAnimationCompleted && isCandleLit && (
        <div className="hint-overlay">tap to blow out the candle</div>
      )}
      {hasAnimationCompleted && (
        <button 
          className="take-photo-button"
          onClick={handleTakePhoto}
          aria-label="Take Photo"
        >
          Take Photo
        </button>
      )}
      {showCameraModal && (
        <div className="terminal-overlay">
          <div className="terminal-window">
            <div className="terminal-content">
              {terminalTypedLines.map((line, index) => {
                const showCursor =
                  terminalCursorVisible &&
                  index === terminalCursorTargetIndex &&
                  !terminalTypingComplete;
                return (
                  <div className="terminal-line" key={`terminal-line-${index}`}>
                    <span className="terminal-text">
                      {line || "\u00a0"}
                      {showCursor && (
                        <span aria-hidden="true" className="terminal-cursor">
                          _
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            {terminalTypingComplete && (
              <div className="terminal-close-container">
                <button 
                  className="terminal-close-button"
                  onClick={handleCloseModal}
                >
                  CLOSE
                </button>
                <div className="terminal-close-hint">Press ESC to close</div>
              </div>
            )}
          </div>
        </div>
      )}
      <Canvas
        gl={{ 
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
          stencil: false,
          depth: true,
        }}
        style={{ background: "transparent", touchAction: "none" }}
        onCreated={({ gl }) => {
          gl.setClearColor("#000000", 0);
          // Optimize for mobile devices - limit pixel ratio for better performance
          gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        }}
      >
        <Suspense fallback={null}>
          <AnimatedScene
            isPlaying={isScenePlaying}
            candleLit={isCandleLit}
            onBackgroundFadeChange={setBackgroundOpacity}
            onEnvironmentProgressChange={setEnvironmentProgress}
            onAnimationComplete={() => setHasAnimationCompleted(true)}
            cards={BIRTHDAY_CARDS}
            activeCardId={activeCardId}
            onToggleCard={handleCardToggle}
          />
          <ambientLight intensity={0.8} />
          <directionalLight intensity={0.5} position={[2, 10, 0]} color={[1, 0.9, 0.95]}/>
          <Environment
            files={[`${import.meta.env.BASE_URL}champagne_castle_1_4k.exr`]}
            backgroundRotation={[0, 3.3, 0]}
            environmentRotation={[0, 3.3, 0]}
            background
            environmentIntensity={0.1 * environmentProgress}
            backgroundIntensity={1.0 * environmentProgress}
          />
          <EnvironmentBackgroundController intensity={1.0 * environmentProgress} />
          <Fireworks isActive={fireworksActive} origin={[0, 10, 0]} />
          <ConfiguredOrbitControls />
        </Suspense>
      </Canvas>
    </div>
  );
}
