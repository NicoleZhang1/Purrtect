import { useState, useEffect } from "react";
import { moods } from "./moods";

const FRAME_W = 32; // width of one frame in your sprite sheets

// ---------- Intro: box ----------
const BOX_HOLD_MS = 3000; // how long it sits in the box after landing

// Hand-timed animations: [frameIndex, milliseconds to hold it].
const TIMELINES = {
  sleep: [[0, 1700], [1, 200], [2, 2000], [3, 200]],
  sleepy: [
    [5, 900], [6, 600], [7, 700],
    [4, 450], [0, 500], [1, 500], [2, 800], [3, 500],
    [4, 450], [5, 500], [6, 600], [7, 900],
  ],
};

// Pet mode rotation. Box animations are NOT in here, so they only play at startup.
// sad / angry / displeased / surprised are reserved for texting mode.
const PET_ACTIVITIES = [
  [["dance", 4000]],
  [["eating", 6000]],
  [["laydown", 6000]],
  [["sleepy", 7600], ["sleep", 24000]],
];

const FPS = {
  idle: 4, 
  box1: 3, 
  box2: 12,  
};

// Animations that play once and stop on their last frame
const ONCE = new Set(["box2"]);

// ---------- Load and decode every sheet up front so switching never flashes ----------
const sheetInfo = {};
function loadSheets() {
  return Promise.all(
    Object.values(moods).map(async (src) => {
      const img = new Image();
      img.src = src;
      try {
        await img.decode();
      } catch {
        /* still use whatever size we got */
      }
      sheetInfo[src] = {
        count: Math.max(1, Math.round(img.naturalWidth / FRAME_W)),
        ratio: FRAME_W / (img.naturalHeight || FRAME_W),
      };
    })
  );
}

// ---------- Squeaky toy sound ----------
let audioCtx;
function getCtx() {
  if (!audioCtx) audioCtx = new AudioContext({ latencyHint: "interactive" });
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

// Start the audio system early so the first squeak isn't delayed
function warmUpAudio() {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.value = 0; // silent
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.05);
}

function squeak(strength = 1) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const base = 750 + Math.random() * 200;

  osc.type = "triangle";
  osc.frequency.setValueAtTime(base, t);
  osc.frequency.exponentialRampToValueAtTime(base * 2.4, t + 0.04);
  osc.frequency.exponentialRampToValueAtTime(base * 1.5, t + 0.14);

  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.3 * strength, t + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);

  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.18);
}

function Sprite({ src, timeline, fps = 8, loop = true }) {
  const { count, ratio } = sheetInfo[src]; // already loaded, so no flash
  const [frame, setFrame] = useState(timeline ? timeline[0][0] : 0);

  useEffect(() => {
    if (timeline) {
      let i = 0;
      let t;
      const step = () => {
        setFrame(timeline[i][0]);
        t = setTimeout(() => {
          i = (i + 1) % timeline.length;
          step();
        }, timeline[i][1]);
      };
      step();
      return () => clearTimeout(t);
    }
    const id = setInterval(
      () =>
        setFrame((f) => {
          if (!loop && f >= count - 1) return f; // play once, hold the last frame
          return (f + 1) % count;
        }),
      1000 / fps
    );
    return () => clearInterval(id);
  }, [timeline, count, fps, loop]);

  return (
    <div
      className="sprite"
      style={{
        backgroundImage: `url(${src})`,
        backgroundSize: `${count * 100}% 100%`,
        backgroundPosition: `${count > 1 ? (frame / (count - 1)) * 100 : 0}% 0`,
        aspectRatio: ratio,
      }}
    />
  );
}

export default function App() {
  const [mood, setMood] = useState("box1"); // starts in the box
  const [ready, setReady] = useState(false);

  useEffect(() => {
    warmUpAudio();
    // window flag stops the listener being added twice (dev mode re-runs effects)
    if (!window.__bounceHooked) {
      window.__bounceHooked = true;
      window.cat?.onBounce(squeak);
    }
  }, []);

  // Tell the main process every time the animation changes
  useEffect(() => {
    window.cat?.setMood(mood);
  }, [mood]);

  // Startup sequence, then the pet mode loop
  useEffect(() => {
    let cancelled = false;
    let timer;
    const wait = (ms) => new Promise((r) => (timer = setTimeout(r, ms)));

    // Resolves when the main process says the cat has landed
    const landed = new Promise((resolve) => {
      if (window.cat?.onIntroDone) window.cat.onIntroDone(resolve);
      setTimeout(resolve, 7000); // fallback so it can never get stuck in the box
    });

    (async () => {
      await loadSheets();
      if (cancelled) return;
      setReady(true);

      // 1. In the box while being thrown, plus a bit after landing
      setMood("box1");
      await landed;
      if (cancelled) return;
      await wait(BOX_HOLD_MS);
      if (cancelled) return;

      // 2. Climb out, once
      setMood("box2");
      const box2Ms = (sheetInfo[moods.box2].count / (FPS.box2 ?? 8)) * 1000;
      await wait(box2Ms);

      // 3. Normal pet mode, forever
      while (!cancelled) {
        setMood("idle");
        await wait(5000 + Math.random() * 5000);
        if (cancelled) return;
        const act = PET_ACTIVITIES[Math.floor(Math.random() * PET_ACTIVITIES.length)];
        for (const [m, ms] of act) {
          if (cancelled) return;
          setMood(m);
          await wait(ms);
        }
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="wrap">
      <div className="cat">
        {ready && (
          <Sprite
            key={mood}
            src={moods[mood]}
            timeline={TIMELINES[mood]}
            fps={FPS[mood]}
            loop={!ONCE.has(mood)}
          />
        )}
      </div>
    </div>
  );
}