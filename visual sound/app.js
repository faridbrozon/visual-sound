import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import htm from 'htm';
import * as Tone from 'tone';

const html = htm.bind(React.createElement);

class Particle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.size = Math.random() * 8 + 2;
    this.speedX = Math.random() * 4 - 2;
    this.speedY = Math.random() * -6 - 1; // Fly upwards
    this.life = 1.0;
    this.decay = Math.random() * 0.03 + 0.02; // Variar decaimiento
    this.color = color;
  }
  update() {
    this.x += this.speedX;
    this.y += this.speedY;
    this.life -= this.decay;
    if (this.size > 0.1) this.size -= 0.15;
  }
  draw(ctx) {
    ctx.globalAlpha = this.life;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }
}

const NOTES = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F'];

const CHORD_INTERVALS = {
  'Mayor': [0, 4, 7],
  'Menor': [0, 3, 7],
  '7ma': [0, 4, 7, 10],
  'm7': [0, 3, 7, 10]
};
const TYPES = Object.keys(CHORD_INTERVALS);

const INSTRUMENTS = {
  'Grand Piano Neo': () => new Tone.PolySynth(Tone.FMSynth, {
    maxPolyphony: 24,
    harmonicity: 2, modulationIndex: 5,
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.005, decay: 1, sustain: 0.1, release: 1 },
    modulation: { type: 'sine' },
    modulationEnvelope: { attack: 0.01, decay: 0.3, sustain: 0, release: 0.1 }
  }),
  'Vintage Lead': () => new Tone.PolySynth(Tone.MonoSynth, {
    maxPolyphony: 12,
    oscillator: { type: 'square' },
    envelope: { attack: 0.02, decay: 0.1, sustain: 0.5, release: 0.4 },
    filter: { Q: 2, type: 'lowpass', rolloff: -12 },
    filterEnvelope: { attack: 0.05, decay: 0.2, sustain: 0.5, release: 0.2, baseFrequency: 200, octaves: 4 }
  }),
  'Celestial Bells': () => new Tone.PolySynth(Tone.AMSynth, {
    maxPolyphony: 16,
    harmonicity: 3.5,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.005, decay: 0.4, sustain: 0, release: 0.6 }
  })
};

const WheelWedge = (props) => {
  const { index, total, label, isSelected, isHarmonic } = props;
  const cx = 160, cy = 160, r = 160;
  const angle = 360 / total;
  const offset = -90 - (angle / 2);

  const startAngle = (index * angle + offset) * (Math.PI / 180);
  const endAngle = ((index + 1) * angle + offset) * (Math.PI / 180);

  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);

  const textR = r * 0.65;
  const midAngle = (index * angle + offset + angle / 2) * (Math.PI / 180);
  const textX = cx + textR * Math.cos(midAngle);
  const textY = cy + textR * Math.sin(midAngle);

  const pathData = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`;

  let classes = `wedge-group ${isSelected ? 'selected' : ''}`;
  if (isHarmonic) classes += ' harmonic-guide';

  return html`
    <g class=${classes}>
      <path d=${pathData} class="wedge-path ${isSelected ? 'selected' : ''}" />
      <text x=${textX} y=${textY} class="note-label">${label}</text>
    </g>
  `;
};

const ControlSphere = (props) => {
  const { items, activeItem, activeItemAlt, containerRef, title, glowColor, showActiveCenter = true } = props;
  const activeIdx = items.indexOf(activeItem);
  const activeAltIdx = items.indexOf(activeItemAlt);
  const harmonicNeighbors = new Set();

  if (activeIdx !== -1) {
    harmonicNeighbors.add((activeIdx - 1 + items.length) % items.length);
    harmonicNeighbors.add((activeIdx + 1) % items.length);
  }
  if (activeAltIdx !== -1) {
    harmonicNeighbors.add((activeAltIdx - 1 + items.length) % items.length);
    harmonicNeighbors.add((activeAltIdx + 1) % items.length);
  }

  return html`
    <div class="sphere-wrapper">
      <h3 class="sphere-title" style=${{ color: glowColor }}>${title}</h3>
      <div 
        class="wheel-container" 
        ref=${containerRef}
        style=${{ boxShadow: `0 0 40px rgba(0,0,0,0.5), 0 0 20px ${glowColor}20` }}
      >
        <svg width="320" height="320" viewBox="0 0 320 320">
          ${items.map((item, idx) => html`
            <${WheelWedge} 
              key=${idx}
              index=${idx} 
              total=${items.length} 
              label=${item} 
              isSelected=${activeItem === item || activeItemAlt === item}
              isHarmonic=${harmonicNeighbors.has(idx)}
            />
          `)}
        </svg>

        ${showActiveCenter && html`
          <div class="center-display">
            <div class="dual-center">
               <span class="active-chord main">${activeItem}</span>
               ${activeItemAlt && activeItemAlt !== activeItem ? html`<span class="active-chord alt">${activeItemAlt}</span>` : null}
            </div>
          </div>
        `}
      </div>
    </div>
  `;
};

const App = () => {
  const [isStarted, setIsStarted] = useState(false);
  const [activeIndexNote, setActiveIndexNote] = useState('C');
  const [activeThumbNote, setActiveThumbNote] = useState('C');
  const [chordType, setChordType] = useState('Mayor');
  const [instName, setInstName] = useState('Grand Piano Neo');
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [strumDelay, setStrumDelay] = useState(500); // Ms cooldown configurable
  const [rightMode, setRightMode] = useState('chord'); // 'chord' | 'pitch'
  const [currentPitch, setCurrentPitch] = useState(0); // For UI display
  const [isRecording, setIsRecording] = useState(false);
  const [looperState, setLooperState] = useState('idle'); // 'idle' | 'recording' | 'playing'

  const synthRef = useRef(null);
  const filterRef = useRef(null);
  const pitchShiftRef = useRef(null);
  const recorderRef = useRef(null);
  const looperRecorderRef = useRef(null);
  const looperPlayerRef = useRef(null);
  const effectsRef = useRef([]);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);

  const leftWheelRef = useRef(null);
  const rightWheelRef = useRef(null);

  const fingersRef = useRef({
    leftIndex: { isHolding: false, currentNote: null, currentType: null, time: 0, activeFreqs: [] },
    leftThumb: { isHolding: false, currentNote: null, currentType: null, time: 0, activeFreqs: [] }
  });

  // Keep ref synchronized with state for async callbacks without re-bind
  const configRef = useRef({ strumDelay, activeIndexNote, chordType, rightMode });
  useEffect(() => {
    configRef.current = { strumDelay, activeIndexNote, chordType, rightMode };
  }, [strumDelay, activeIndexNote, chordType, rightMode]);

  useEffect(() => {
    if (synthRef.current) {
      synthRef.current.dispose();
      filterRef.current.dispose();
      pitchShiftRef.current.dispose();
      recorderRef.current.dispose();
      looperRecorderRef.current.dispose();
      looperPlayerRef.current.dispose();
      effectsRef.current.forEach(fx => fx.dispose());
    }

    const synth = INSTRUMENTS[instName]();
    // Bajamos el volumen dinámicamente un poco para dar headroom a la mezcla Master
    synth.volume.value = -4;
    Tone.getDestination().volume.value = -3; // Nivel maestro seguro

    // Expresión Theremin: Lowpass Dymanico + PitchShift Dinámico
    const filter = new Tone.Filter(2000, "lowpass");
    const pitchShift = new Tone.PitchShift({ pitch: 0 }); // En semitonos (-12, 12)
    const chorus = new Tone.Chorus(2, 1.5, 0.3).start(); // Menos invasivo
    const reverb = new Tone.Reverb(1.2); // Reducido de 3s a 1.2s para más claridad melódica
    reverb.wet.value = 0.4; // Menos "mojado", más presencia de la nota real

    // Cadena de Masterización Anti-Saturación / Anti-Clipping
    const compressor = new Tone.Compressor(-20, 4); // Comprimir cuando la suma de acordes pasa -20db
    const limiter = new Tone.Limiter(-1); // Bloqueo de pared de ladrillo en -1db (Cero distorsión final)
    const recorder = new Tone.Recorder();
    const looperRecorder = new Tone.Recorder();
    const looperPlayer = new Tone.Player().toDestination();
    looperPlayer.loop = true;

    synth.connect(filter);
    filter.connect(pitchShift);
    pitchShift.connect(chorus);
    chorus.connect(reverb);
    reverb.chain(compressor, limiter, Tone.getDestination());
    limiter.connect(recorder);
    limiter.connect(looperRecorder);

    synthRef.current = synth;
    filterRef.current = filter;
    pitchShiftRef.current = pitchShift;
    recorderRef.current = recorder;
    looperRecorderRef.current = looperRecorder;
    looperPlayerRef.current = looperPlayer;
    effectsRef.current = [chorus, reverb];

    fingersRef.current.leftIndex.isHolding = false;
    fingersRef.current.leftThumb.isHolding = false;
  }, [instName]);

  const handleStart = async () => {
    await Tone.start();
    setIsStarted(true);
    initCamera();
  };

  const playFingerChordSustain = (fingerKey, rootNote, type) => {
    if (!synthRef.current) return;
    const ref = fingersRef.current[fingerKey];

    // Si ya tenía notas sueltas (glide activo), apágalas para esta voz específicamente
    if (ref.isHolding && ref.activeFreqs.length) {
      synthRef.current.triggerRelease(ref.activeFreqs);
    }

    const baseFrequency = Tone.Frequency(`${rootNote}4`);
    const intervals = CHORD_INTERVALS[type];

    let notes = intervals.map(interval => {
      let f = baseFrequency.transpose(interval);
      if (f.toMidi() > 80) f = f.transpose(-12);
      return f.toFrequency();
    });

    document.body.classList.add('flash');
    setTimeout(() => document.body.classList.remove('flash'), 100);

    synthRef.current.triggerAttack(notes);

    ref.isHolding = true;
    ref.currentNote = rootNote;
    ref.currentType = type;
    ref.activeFreqs = notes;
  };

  const playFingerChordRelease = (fingerKey) => {
    if (!synthRef.current) return;
    const ref = fingersRef.current[fingerKey];
    if (ref.isHolding && ref.activeFreqs.length) {
      synthRef.current.triggerRelease(ref.activeFreqs);
      ref.isHolding = false;
      ref.currentNote = null;
      ref.activeFreqs = [];
    }
  };

  const handleToggleRecord = async () => {
    if (!recorderRef.current) return;
    if (!isRecording) {
      recorderRef.current.start();
      setIsRecording(true);
    } else {
      const recording = await recorderRef.current.stop();
      const url = URL.createObjectURL(recording);
      const anchor = document.createElement("a");
      anchor.download = `VisualSound-Huella-${Date.now()}.wav`;
      anchor.href = url;
      anchor.click();
      setIsRecording(false);
    }
  };

  const handleToggleLooper = async () => {
    if (!looperRecorderRef.current || !looperPlayerRef.current) return;

    if (looperState === 'idle') {
      // Empezar a grabar bucle
      looperRecorderRef.current.start();
      setLooperState('recording');
    } else if (looperState === 'recording') {
      // Parar y empezar a loopear
      const recording = await looperRecorderRef.current.stop();
      const url = URL.createObjectURL(recording);
      await looperPlayerRef.current.load(url);
      looperPlayerRef.current.start();
      setLooperState('playing');
    } else {
      // Parar todo y limpiar
      looperPlayerRef.current.stop();
      setLooperState('idle');
    }
  };

  const initCamera = () => {
    if (!window.Hands || !window.Camera) return;
    setCameraEnabled(true);

    const hands = new window.Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6
    });

    hands.onResults(onResults);

    const camera = new window.Camera(videoRef.current, {
      onFrame: async () => {
        await hands.send({ image: videoRef.current });
      },
      width: 1280,
      height: 720
    });
    camera.start();
  };

  const getElementCenter = (ref) => {
    if (!ref.current) return null;
    const rect = ref.current.getBoundingClientRect();
    return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
  };

  const getIndexFromAngle = (x, y, cx, cy, total) => {
    const dx = x - cx;
    const dy = y - cy;
    let degrees = (Math.atan2(dy, dx) * 180 / Math.PI) + 90;
    if (degrees < 0) degrees += 360;
    const angleSlice = 360 / total;
    return Math.floor((degrees + angleSlice / 2) / angleSlice) % total;
  };

  const onResults = (results) => {
    const canvasObj = canvasRef.current;
    if (!canvasObj) return;
    const ctx = canvasObj.getContext('2d');
    canvasObj.width = window.innerWidth;
    canvasObj.height = window.innerHeight;

    ctx.save();
    ctx.clearRect(0, 0, canvasObj.width, canvasObj.height);
    ctx.translate(canvasObj.width, 0);
    ctx.scale(-1, 1);

    const refState = configRef.current;
    const now = Date.now();
    let hoveringIndex = false;
    let hoveringThumb = false;

    if (results.multiHandLandmarks && results.multiHandedness) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const landmarks = results.multiHandLandmarks[i];

        const isLeftHandUser = results.multiHandedness[i].label === 'Right';
        const pointerColor = isLeftHandUser ? '#3b82f6' : '#ec4899';

        window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, { color: 'rgba(255, 255, 255, 0.2)', lineWidth: 3 });
        window.drawLandmarks(ctx, landmarks, { color: pointerColor, lineWidth: 1, radius: 4 });

        const indexTip = landmarks[8];
        const thumbTip = landmarks[4];

        const indexCanvasX = indexTip.x * canvasObj.width;
        const indexCanvasY = indexTip.y * canvasObj.height;
        const thumbCanvasX = thumbTip.x * canvasObj.width;
        const thumbCanvasY = thumbTip.y * canvasObj.height;

        const indexScreenX = (1 - indexTip.x) * window.innerWidth;
        const indexScreenY = indexTip.y * window.innerHeight;
        const thumbScreenX = (1 - thumbTip.x) * window.innerWidth;
        const thumbScreenY = thumbTip.y * window.innerHeight;

        // Dibujar el Tracker del Índice y Pulgar
        ctx.beginPath();
        ctx.arc(indexCanvasX, indexCanvasY, 18, 0, 2 * Math.PI);
        ctx.fillStyle = pointerColor + 'AA';
        ctx.shadowColor = pointerColor;
        ctx.shadowBlur = 20;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(thumbCanvasX, thumbCanvasY, 15, 0, 2 * Math.PI);
        ctx.fillStyle = pointerColor + 'DD';
        ctx.fill();

        if (isLeftHandUser) {

          // Theremin Expresivo de Brillo
          const yPercent = Math.max(0, Math.min(1, indexTip.y));
          const filterFreq = 100 + ((1.0 - yPercent) * 7000);
          if (filterRef.current) filterRef.current.frequency.rampTo(filterFreq, 0.1);

          // Cálculo Angular: Índices y Pulgares 100% Autónomos (Múltiples Voces Simultáneas)
          const center = getElementCenter(leftWheelRef);
          if (center) {
            const distIndex = Math.hypot(indexScreenX - center.cx, indexScreenY - center.cy);
            const distThumb = Math.hypot(thumbScreenX - center.cx, thumbScreenY - center.cy);

            // Auto-Resume AudioContext si Chrome lo suspendió
            if (Tone.context.state !== 'running') {
              Tone.context.resume();
            }

            // 1. Interpretar Dedo Índice (Modo Piano)
            if (distIndex < 500 && indexScreenX < window.innerWidth / 2) {
              const index = getIndexFromAngle(indexScreenX, indexScreenY, center.cx, center.cy, NOTES.length);
              const triggeredNote = NOTES[index];
              hoveringIndex = true;

              const fRef = fingersRef.current['leftIndex'];
              // SOLO disparar si la nota cambió o si el dedo estaba afuera (RELEASED)
              if (!fRef.isHolding || fRef.currentNote !== triggeredNote) {
                setActiveIndexNote(triggeredNote);
                playFingerChordSustain('leftIndex', triggeredNote, refState.chordType);
                fRef.time = now;
                for (let i = 0; i < 5; i++) particlesRef.current.push(new Particle(indexCanvasX, indexCanvasY, pointerColor));
              }
            }

            // 2. Interpretar Dedo Pulgar (Modo Piano)
            if (distThumb < 500 && thumbScreenX < window.innerWidth / 2) {
              const index = getIndexFromAngle(thumbScreenX, thumbScreenY, center.cx, center.cy, NOTES.length);
              const triggeredNote = NOTES[index];
              hoveringThumb = true;

              const fRef = fingersRef.current['leftThumb'];
              // SOLO disparar si la nota cambió o si el dedo estaba afuera (RELEASED)
              if (!fRef.isHolding || fRef.currentNote !== triggeredNote) {
                setActiveThumbNote(triggeredNote);
                playFingerChordSustain('leftThumb', triggeredNote, refState.chordType);
                fRef.time = now;
                for (let i = 0; i < 5; i++) particlesRef.current.push(new Particle(thumbCanvasX, thumbCanvasY, pointerColor));
              }
            }
          }
        } else {
          // Mano Derecha: Modo Pitch o Modo Acordes (Pulgar o Índice, aquí sí gana el que esté más cerca porque maneja Configuración)
          let activeX = indexScreenX;
          let activeY = indexScreenY;

          const center = getElementCenter(rightWheelRef);
          if (center) {
            const distIndex = Math.hypot(indexScreenX - center.cx, indexScreenY - center.cy);
            const distThumb = Math.hypot(thumbScreenX - center.cx, thumbScreenY - center.cy);
            if (distThumb < distIndex) {
              activeX = thumbScreenX;
              activeY = thumbScreenY;
            }
          }

          if (activeX >= window.innerWidth / 2) {
            if (refState.rightMode === 'pitch') {
              // Pitch Shifter: Subir y bajar tonos
              const mappedPitch = Math.round(((window.innerHeight / 2 - activeY) / (window.innerHeight / 2)) * 12);
              const constrainedPitch = Math.max(-12, Math.min(12, mappedPitch));

              if (pitchShiftRef.current) {
                pitchShiftRef.current.pitch = constrainedPitch; // Saltos perfectos (escala cromática)
                setCurrentPitch(constrainedPitch);
              }
            } else {
              // Modo Acorde (Cálculo Angular)
              if (center) {
                const distActive = Math.hypot(activeX - center.cx, activeY - center.cy);
                if (distActive < 500) {
                  const index = getIndexFromAngle(activeX, activeY, center.cx, center.cy, TYPES.length);
                  const triggeredType = TYPES[index];

                  if (refState.chordType !== triggeredType) {
                    setChordType(triggeredType);
                    // Update any already-holding notes to the new type dynamically
                    const lIndex = fingersRef.current['leftIndex'];
                    const lThumb = fingersRef.current['leftThumb'];
                    if (lIndex.isHolding) playFingerChordSustain('leftIndex', lIndex.currentNote, triggeredType);
                    if (lThumb.isHolding) playFingerChordSustain('leftThumb', lThumb.currentNote, triggeredType);
                  }
                }
              }
            }
          }
        }
      }
    }

    // Apagado selectivo ("Release") por cada dedo individual que salga de la mesa
    if (!hoveringIndex) playFingerChordRelease('leftIndex');
    if (!hoveringThumb) playFingerChordRelease('leftThumb');

    // Update and Draw Particles
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);
    particlesRef.current.forEach(p => {
      p.update();
      p.draw(ctx);
    });

    ctx.restore();
  };

  return html`
    <div class="app-container">
      <video ref=${videoRef} class="camera-bg" playsInline autoPlay muted></video>
      <canvas ref=${canvasRef} class="tracking-overlay"></canvas>

      ${!isStarted ? html`
        <div class="start-overlay">
          <h1>Visual Sound</h1>
          <p class="subtitle">Conecta tu cámara para crear en el aire</p>
          <button class="play-btn" onClick=${handleStart}>Comenzar</button>
        </div>
      ` : null}
      
      <div class="ui-layer">
        <header class="top-header">
          <div class="title-area">
            <h1>Visual Sound</h1>
            <p class="subtitle">Interactúa con el aire</p>
            ${cameraEnabled && html`<span class="camera-status">✅ Sensor Geométrico de Alta Precisión</span>`}
          </div>
          
          <div class="controls-panel">
            <div class="settings-group">
               <label>Retraso de Acordes (Cooldown): <span>${strumDelay}ms</span></label>
               <input 
                 type="range" 
                 min="0" max="1000" step="50" 
                 value=${strumDelay} 
                 onChange=${e => setStrumDelay(Number(e.target.value))} 
               />
            </div>
          </div>

          <div class="instrument-selector">
            ${Object.keys(INSTRUMENTS).map(name => html`
              <button 
                key=${name}
                class="inst-btn ${instName === name ? 'active' : ''}"
                onClick=${() => setInstName(name)}
              >
                ${name}
              </button>
            `)}
          </div>

          <button class="record-btn ${isRecording ? 'recording' : ''}" onClick=${handleToggleRecord}>
            <span class="dot"></span> ${isRecording ? 'DETENER' : 'GRABAR HUELLA'}
          </button>

          <button class="looper-btn ${looperState}" onClick=${handleToggleLooper}>
             <div class="looper-icon"></div>
             ${looperState === 'idle' ? 'GRABAR BUCLE' : looperState === 'recording' ? 'FINALIZAR' : 'BORRAR BUCLE'}
          </button>

          <button class="panic-btn" title="Reset Audio" onClick=${() => {
      if (synthRef.current) synthRef.current.releaseAll();
      Tone.context.resume();
    }}>🚨</button>
        </header>

        <div class="spheres-layout">
          <${ControlSphere} 
            title="Sustain & Note"
            items=${NOTES}
            activeItem=${activeIndexNote}
            activeItemAlt=${activeThumbNote}
            containerRef=${leftWheelRef}
            dataAttr="data-note"
            glowColor="#3b82f6"
            showActiveCenter=${true}
          />

          <div class="central-info-wrapper">
             <div class="central-info">
               <h2 class="final-chord">${activeIndexNote}${fingersRef.current.leftThumb.isHolding ? ' + ' + activeThumbNote : ''} ${chordType}</h2>
             </div>
             <button 
                class="mode-toggle-btn"
                onClick=${() => {
      if (rightMode === 'pitch') {
        setRightMode('chord');
        if (pitchShiftRef.current) pitchShiftRef.current.pitch = 0; // Reset pitch
      } else {
        setRightMode('pitch');
      }
    }}
             >
                Modo Derecha: ${rightMode === 'chord' ? 'Cambio de Acordes' : 'Transposición Libre (Pitch)'}
             </button>
          </div>

          <!-- Esfera Derecha: Dinámicamente reemplazable por el Pitch Thermometer -->
          <div class="right-sphere-area">
            ${rightMode === 'chord' ? html`
              <${ControlSphere} 
                title="Modifier"
                items=${TYPES}
                activeItem=${chordType}
                containerRef=${rightWheelRef}
                dataAttr="data-type"
                glowColor="#ec4899"
                showActiveCenter=${false}
              />
            ` : html`
              <div class="pitch-thermometer">
                 <h3 class="sphere-title" style=${{ color: '#ec4899' }}>Pitch Shift (Octavas)</h3>
                 <div class="pitch-bar-container">
                    <div class="pitch-indicator" style=${{
        height: '2px',
        background: '#fff',
        position: 'absolute',
        width: '100%',
        bottom: ((currentPitch + 12) / 24 * 100) + '%',
        boxShadow: '0 0 10px #fff'
      }}></div>
                    <div class="pitch-label">${currentPitch > 0 ? '+' : ''}${currentPitch}</div>
                 </div>
              </div>
            `}
          </div>
        </div>
        
      </div>
    </div>
  `;
};

const root = createRoot(document.getElementById('root'));
root.render(html`<${App} />`);
