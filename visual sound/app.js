import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import htm from 'htm';
import * as Tone from 'tone';

const html = htm.bind(React.createElement);

const NOTES = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F'];

const CHORD_INTERVALS = {
  'Mayor': [0, 4, 7],
  'Menor': [0, 3, 7],
  '7ma': [0, 4, 7, 10],
  'm7': [0, 3, 7, 10]
};
const TYPES = Object.keys(CHORD_INTERVALS);

const INSTRUMENTS = {
  'Ethereal Pad': () => new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.1, decay: 0.3, sustain: 0.8, release: 2 }
  }),
  'Electric Piano': () => new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 3, modulationIndex: 3,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.01, decay: 2, sustain: 0.2, release: 1.5 },
    modulation: { type: 'square' },
    modulationEnvelope: { attack: 0.002, decay: 0.2, sustain: 0, release: 0.2 }
  }),
  'Synth Pluck': () => new Tone.PolySynth(Tone.AMSynth, {
    harmonicity: 1.5,
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.01, decay: 0.3, sustain: 0, release: 0.5 }
  })
};

const WheelWedge = ({ index, total, label, isSelected }) => {
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

  return html`
    <g class="wedge-group ${isSelected ? 'selected' : ''}">
      <path d=${pathData} class="wedge-path ${isSelected ? 'selected' : ''}" />
      <text x=${textX} y=${textY} class="note-label">${label}</text>
    </g>
  `;
};

const ControlSphere = ({ items, activeItem, containerRef, title, glowColor, showActiveCenter = true }) => {
  return html`
    <div class="sphere-wrapper">
      <h3 class="sphere-title" style=${{ color: glowColor }}>${title}</h3>
      <div 
        class="wheel-container" 
        ref=${containerRef}
        style=${{ boxShadow: `0 0 40px rgba(0,0,0,0.5), 0 0 20px ${glowColor}20`}}
      >
        <svg width="320" height="320" viewBox="0 0 320 320">
          ${items.map((item, idx) => html`
            <${WheelWedge} 
              key=${idx}
              index=${idx} 
              total=${items.length} 
              label=${item} 
              isSelected=${activeItem === item}
            />
          `)}
        </svg>

        ${showActiveCenter && html`
          <div class="center-display">
            <h2 class="active-chord">${activeItem}</h2>
          </div>
        `}
      </div>
    </div>
  `;
};

const App = () => {
  const [isStarted, setIsStarted] = useState(false);
  const [activeNote, setActiveNote] = useState('C');
  const [chordType, setChordType] = useState('Mayor');
  const [instName, setInstName] = useState('Ethereal Pad');
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [strumDelay, setStrumDelay] = useState(500); // Ms cooldown configurable
  const [rightMode, setRightMode] = useState('chord'); // 'chord' | 'pitch'
  const [currentPitch, setCurrentPitch] = useState(0); // For UI display
  
  const synthRef = useRef(null);
  const filterRef = useRef(null);
  const pitchShiftRef = useRef(null);
  const effectsRef = useRef([]);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  
  const leftWheelRef = useRef(null);
  const rightWheelRef = useRef(null);

  const playingStateRef = useRef({
    isHolding: false,
    currentNote: null,
    currentType: null,
    time: 0
  });

  // Keep ref synchronized with state for async callbacks without re-bind
  const configRef = useRef({ strumDelay, activeNote, chordType, rightMode });
  useEffect(() => {
    configRef.current = { strumDelay, activeNote, chordType, rightMode };
  }, [strumDelay, activeNote, chordType, rightMode]);
  
  useEffect(() => {
    if (synthRef.current) {
      synthRef.current.dispose();
      filterRef.current.dispose();
      pitchShiftRef.current.dispose();
      effectsRef.current.forEach(fx => fx.dispose());
    }

    const synth = INSTRUMENTS[instName]();
    // Expresión Theremin: Lowpass Dymanico + PitchShift Dinámico
    const filter = new Tone.Filter(2000, "lowpass");
    const pitchShift = new Tone.PitchShift({ pitch: 0 }); // En semitonos (-12, 12)
    const chorus = new Tone.Chorus(4, 2.5, 0.5).start();
    const reverb = new Tone.Reverb(3);
    
    synth.connect(filter);
    filter.connect(pitchShift);
    pitchShift.connect(chorus);
    chorus.connect(reverb);
    reverb.toDestination();
    
    synthRef.current = synth;
    filterRef.current = filter;
    pitchShiftRef.current = pitchShift;
    effectsRef.current = [chorus, reverb];

    playingStateRef.current.isHolding = false;
  }, [instName]);

  const handleStart = async () => {
    await Tone.start();
    setIsStarted(true);
    initCamera();
  };

  const playChordSustain = (rootNote, type) => {
    if (!synthRef.current) return;
    synthRef.current.releaseAll();
    
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
    
    playingStateRef.current.isHolding = true;
    playingStateRef.current.currentNote = rootNote;
    playingStateRef.current.currentType = type;
  };

  const playChordRelease = () => {
    if (synthRef.current && playingStateRef.current.isHolding) {
      synthRef.current.releaseAll();
      playingStateRef.current.isHolding = false;
      playingStateRef.current.currentNote = null;
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
        await hands.send({image: videoRef.current});
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
    let hoveringNote = false;

    if (results.multiHandLandmarks && results.multiHandedness) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const landmarks = results.multiHandLandmarks[i];
        
        const isLeftHandUser = results.multiHandedness[i].label === 'Right';
        const pointerColor = isLeftHandUser ? '#3b82f6' : '#ec4899';
        
        window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, {color: 'rgba(255, 255, 255, 0.2)', lineWidth: 3});
        window.drawLandmarks(ctx, landmarks, {color: pointerColor, lineWidth: 1, radius: 4});

        const indexTip = landmarks[8];
        const screenX = (1 - indexTip.x) * window.innerWidth;
        const screenY = indexTip.y * window.innerHeight;

        ctx.beginPath();
        ctx.arc(indexTip.x * canvasObj.width, indexTip.y * canvasObj.height, 18, 0, 2 * Math.PI);
        ctx.fillStyle = pointerColor + 'AA';
        ctx.shadowColor = pointerColor;
        ctx.shadowBlur = 20;
        ctx.fill();

        if (isLeftHandUser) {
           // Theremin Expresivo de Brillo
           const yPercent = Math.max(0, Math.min(1, indexTip.y)); 
           const filterFreq = 100 + ((1.0 - yPercent) * 7000); 
           if (filterRef.current) filterRef.current.frequency.rampTo(filterFreq, 0.1);

           // Cálculo Angular para Precisión Absoluta de la Mano Izquierda (Notas)
           if (screenX < window.innerWidth / 2) {
             const center = getElementCenter(leftWheelRef);
             if (center) {
               // Rango visual enorme para que no tengas que atinarle exacto al círculo (hasta 500px)
               const distance = Math.hypot(screenX - center.cx, screenY - center.cy);
               if (distance < 500) {
                 const index = getIndexFromAngle(screenX, screenY, center.cx, center.cy, NOTES.length);
                 const triggeredNote = NOTES[index];
                 
                 hoveringNote = true;
                 
                 if (playingStateRef.current.currentNote !== triggeredNote || now - playingStateRef.current.time > refState.strumDelay) {
                   setActiveNote(triggeredNote);
                   playChordSustain(triggeredNote, refState.chordType);
                   playingStateRef.current.time = now;
                 }
               }
             }
           }
        } else {
           // Mano Derecha: Modo Pitch o Modo Acordes
           if (screenX >= window.innerWidth / 2) {
             if (refState.rightMode === 'pitch') {
                // Pitch Shifter: Subir y bajar tonos orgánicamente
                const mappedPitch = Math.round(((window.innerHeight / 2 - screenY) / (window.innerHeight / 2)) * 12);
                const constrainedPitch = Math.max(-12, Math.min(12, mappedPitch));
                
                if (pitchShiftRef.current) {
                  pitchShiftRef.current.pitch = constrainedPitch; // Saltos perfectos (escala cromática)
                  setCurrentPitch(constrainedPitch);
                }
             } else {
                // Modo Acorde (Cálculo Angular)
                const center = getElementCenter(rightWheelRef);
                if (center) {
                  const distance = Math.hypot(screenX - center.cx, screenY - center.cy);
                  if (distance < 500) {
                    const index = getIndexFromAngle(screenX, screenY, center.cx, center.cy, TYPES.length);
                    const triggeredType = TYPES[index];
                    
                    if (refState.chordType !== triggeredType) {
                      setChordType(triggeredType);
                      if (playingStateRef.current.isHolding) {
                         playChordSustain(playingStateRef.current.currentNote, triggeredType);
                      }
                    }
                  }
                }
             }
           }
        }
      }
    }
    
    if (!hoveringNote && playingStateRef.current.isHolding) {
      playChordRelease();
    }

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
        </header>

        <div class="spheres-layout">
          <${ControlSphere} 
            title="Sustain & Note"
            items=${NOTES}
            activeItem=${activeNote}
            containerRef=${leftWheelRef}
            dataAttr="data-note"
            glowColor="#3b82f6"
            showActiveCenter=${true}
          />

          <div class="central-info-wrapper">
             <div class="central-info">
               <h2 class="final-chord">${activeNote} ${chordType}</h2>
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
                       bottom: \`\${(currentPitch + 12) / 24 * 100}%\`,
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
