/**
 * Hand Gesture Controller for Subway Surfers
 * Uses MediaPipe Hands to detect swipe gestures via webcam
 * and maps them to game keyboard events.
 *
 * Gestures:
 *  - Swipe Left  → ArrowLeft  (move left)
 *  - Swipe Right → ArrowRight (move right)
 *  - Swipe Up    → ArrowUp    (jump)
 *  - Swipe Down  → ArrowDown  (roll)
 */

(function () {
  'use strict';

  // ─── Config ───────────────────────────────────────────────────────────────
  const SWIPE_THRESHOLD = 0.12;   // Minimum wrist movement (normalised 0-1) to trigger
  const COOLDOWN_MS     = 600;    // Milliseconds between gesture triggers
  const HISTORY_FRAMES  = 8;      // Frames of wrist history to analyse
  // ──────────────────────────────────────────────────────────────────────────

  let lastGestureTime = 0;
  const wristHistory  = [];   // [{ x, y, t }]

  // ─── UI Creation ──────────────────────────────────────────────────────────
  function createUI() {
    // Wrapper
    const wrapper = document.createElement('div');
    wrapper.id = 'gesture-wrapper';
    Object.assign(wrapper.style, {
      position:     'fixed',
      bottom:       '16px',
      right:        '16px',
      zIndex:       '99999',
      display:      'flex',
      flexDirection:'column',
      alignItems:   'flex-end',
      gap:          '8px',
      fontFamily:   'Inter, system-ui, sans-serif',
      userSelect:   'none',
    });

    // Video canvas preview
    const videoEl = document.createElement('video');
    videoEl.id       = 'gesture-video';
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.muted    = true;
    Object.assign(videoEl.style, {
      width:        '160px',
      height:       '120px',
      borderRadius: '12px',
      border:       '2px solid rgba(255,255,255,0.2)',
      objectFit:    'cover',
      background:   '#111',
      transform:    'scaleX(-1)',   // mirror
      boxShadow:    '0 4px 24px rgba(0,0,0,0.6)',
    });

    // Canvas overlay (drawn landmarks)
    const canvas = document.createElement('canvas');
    canvas.id = 'gesture-canvas';
    Object.assign(canvas.style, {
      position:     'absolute',
      bottom:       '32px',
      right:        '0',
      width:        '160px',
      height:       '120px',
      borderRadius: '12px',
      pointerEvents:'none',
      transform:    'scaleX(-1)',
    });
    canvas.width  = 160;
    canvas.height = 120;

    // Status pill
    const status = document.createElement('div');
    status.id = 'gesture-status';
    Object.assign(status.style, {
      padding:       '4px 12px',
      borderRadius:  '999px',
      fontSize:      '12px',
      fontWeight:    '600',
      letterSpacing: '0.5px',
      background:    'rgba(0,0,0,0.7)',
      color:         '#aaa',
      border:        '1px solid rgba(255,255,255,0.15)',
      backdropFilter:'blur(8px)',
      transition:    'all 0.3s ease',
    });
    status.textContent = '🤚 Starting camera…';

    // Toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'gesture-toggle';
    toggleBtn.textContent = '👁 Hide Cam';
    Object.assign(toggleBtn.style, {
      padding:       '4px 10px',
      borderRadius:  '8px',
      fontSize:      '11px',
      fontWeight:    '600',
      background:    'rgba(0,0,0,0.65)',
      color:         '#ccc',
      border:        '1px solid rgba(255,255,255,0.15)',
      cursor:        'pointer',
      backdropFilter:'blur(8px)',
    });
    let camVisible = true;
    toggleBtn.addEventListener('click', () => {
      camVisible = !camVisible;
      videoEl.style.display  = camVisible ? 'block' : 'none';
      canvas.style.display   = camVisible ? 'block' : 'none';
      toggleBtn.textContent  = camVisible ? '👁 Hide Cam' : '👁 Show Cam';
    });

    // Gesture flash label
    const gestureLabel = document.createElement('div');
    gestureLabel.id = 'gesture-label';
    Object.assign(gestureLabel.style, {
      position:     'absolute',
      top:          '50%',
      left:         '50%',
      transform:    'translate(-50%, -50%) scaleX(-1)',
      fontSize:     '28px',
      fontWeight:   '800',
      color:        '#fff',
      textShadow:   '0 2px 12px rgba(0,0,0,0.9)',
      opacity:      '0',
      transition:   'opacity 0.15s, transform 0.15s',
      pointerEvents:'none',
    });

    // Video container
    const videoCont = document.createElement('div');
    Object.assign(videoCont.style, {
      position: 'relative',
      width:    '160px',
      height:   '120px',
    });
    videoCont.appendChild(videoEl);
    videoCont.appendChild(canvas);
    videoCont.appendChild(gestureLabel);

    wrapper.appendChild(videoCont);
    wrapper.appendChild(status);
    wrapper.appendChild(toggleBtn);
    document.body.appendChild(wrapper);

    return { videoEl, canvas, status, gestureLabel };
  }

  // ─── Key Event Dispatch ───────────────────────────────────────────────────
  function fireKey(key) {
    ['keydown', 'keyup'].forEach(type => {
      const evt = new KeyboardEvent(type, {
        bubbles: true,
        cancelable: true,
        key: key,
        code: key === 'ArrowLeft'  ? 'ArrowLeft'  :
              key === 'ArrowRight' ? 'ArrowRight' :
              key === 'ArrowUp'    ? 'ArrowUp'    :
                                     'ArrowDown',
        keyCode: key === 'ArrowLeft'  ? 37 :
                 key === 'ArrowRight' ? 39 :
                 key === 'ArrowUp'    ? 38 : 40,
        which:   key === 'ArrowLeft'  ? 37 :
                 key === 'ArrowRight' ? 39 :
                 key === 'ArrowUp'    ? 38 : 40,
      });
      document.dispatchEvent(evt);
      window.dispatchEvent(evt);
      const canvas = document.querySelector('canvas');
      if (canvas) canvas.dispatchEvent(evt);
    });
  }

  // ─── Swipe Detection ──────────────────────────────────────────────────────
  function detectSwipe() {
    if (wristHistory.length < HISTORY_FRAMES) return null;

    const oldest = wristHistory[0];
    const newest = wristHistory[wristHistory.length - 1];

    const dx = newest.x - oldest.x;
    const dy = newest.y - oldest.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    if (adx < SWIPE_THRESHOLD && ady < SWIPE_THRESHOLD) return null;

    if (adx > ady) {
      // Horizontal swipe (mirrored video: left in frame = right for user)
      return dx < 0 ? 'RIGHT' : 'LEFT';
    } else {
      return dy < 0 ? 'UP' : 'DOWN';
    }
  }

  // ─── Show Gesture Flash ───────────────────────────────────────────────────
  function flashGesture(label, emoji, color) {
    const el = document.getElementById('gesture-label');
    const status = document.getElementById('gesture-status');
    if (!el || !status) return;

    el.textContent  = emoji;
    el.style.opacity = '1';
    el.style.transform = 'translate(-50%, -55%) scaleX(-1) scale(1.2)';

    status.textContent  = `${emoji} ${label}`;
    status.style.color  = color;
    status.style.border = `1px solid ${color}`;

    setTimeout(() => {
      el.style.opacity  = '0';
      el.style.transform = 'translate(-50%, -50%) scaleX(-1)';
      status.style.color  = '#aaa';
      status.style.border = '1px solid rgba(255,255,255,0.15)';
    }, 500);
  }

  const GESTURE_MAP = {
    LEFT:  { key: 'ArrowLeft',  label: 'Move Left',  emoji: '⬅️', color: '#60a5fa' },
    RIGHT: { key: 'ArrowRight', label: 'Move Right', emoji: '➡️', color: '#34d399' },
    UP:    { key: 'ArrowUp',    label: 'Jump!',      emoji: '⬆️', color: '#f59e0b' },
    DOWN:  { key: 'ArrowDown',  label: 'Roll!',      emoji: '⬇️', color: '#f87171' },
  };

  // ─── Draw Landmarks ───────────────────────────────────────────────────────
  function drawLandmarks(ctx, landmarks, canvasW, canvasH) {
    ctx.clearRect(0, 0, canvasW, canvasH);

    // Connections (simplified - fingertip connections)
    const connections = [
      [0,1],[1,2],[2,3],[3,4],      // thumb
      [0,5],[5,6],[6,7],[7,8],      // index
      [0,9],[9,10],[10,11],[11,12], // middle
      [0,13],[13,14],[14,15],[15,16],// ring
      [0,17],[17,18],[18,19],[19,20],// pinky
      [5,9],[9,13],[13,17],          // palm
    ];

    ctx.strokeStyle = 'rgba(100, 220, 255, 0.7)';
    ctx.lineWidth   = 1.5;

    for (const [a, b] of connections) {
      const pa = landmarks[a];
      const pb = landmarks[b];
      ctx.beginPath();
      ctx.moveTo(pa.x * canvasW, pa.y * canvasH);
      ctx.lineTo(pb.x * canvasW, pb.y * canvasH);
      ctx.stroke();
    }

    // Dots
    for (const lm of landmarks) {
      ctx.beginPath();
      ctx.arc(lm.x * canvasW, lm.y * canvasH, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 120, 0.9)';
      ctx.fill();
    }
  }

  // ─── Main Init ────────────────────────────────────────────────────────────
  async function init() {
    const { videoEl, canvas, status, gestureLabel } = createUI();
    const ctx = canvas.getContext('2d');

    // Request camera
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      videoEl.srcObject = stream;
      status.textContent = '🔴 Loading model…';
    } catch (err) {
      status.textContent = '❌ Camera denied';
      status.style.color = '#f87171';
      console.error('[GestureCtrl] Camera error:', err);
      return;
    }

    // Load MediaPipe Hands
    const handsScript = document.createElement('script');
    handsScript.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js';
    handsScript.crossOrigin = 'anonymous';

    handsScript.onload = async () => {
      const drawingScript = document.createElement('script');
      drawingScript.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js';
      drawingScript.crossOrigin = 'anonymous';

      drawingScript.onload = async () => {
        const cameraScript = document.createElement('script');
        cameraScript.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js';
        cameraScript.crossOrigin = 'anonymous';

        cameraScript.onload = () => startDetection(videoEl, canvas, ctx, status);
        document.head.appendChild(cameraScript);
      };
      document.head.appendChild(drawingScript);
    };

    document.head.appendChild(handsScript);
  }

  function startDetection(videoEl, canvas, ctx, status) {
    if (typeof Hands === 'undefined') {
      status.textContent = '❌ Model load failed';
      status.style.color = '#f87171';
      return;
    }

    const hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands:          1,
      modelComplexity:      0,   // 0 = fast, 1 = accurate
      minDetectionConfidence: 0.7,
      minTrackingConfidence:  0.6,
    });

    hands.onResults((results) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        const wrist     = landmarks[0];   // landmark 0 = wrist
        const now       = performance.now();

        drawLandmarks(ctx, landmarks, canvas.width, canvas.height);

        // Record wrist position
        wristHistory.push({ x: wrist.x, y: wrist.y, t: now });
        if (wristHistory.length > HISTORY_FRAMES) wristHistory.shift();

        status.textContent = '✋ Hand detected';
        status.style.color  = '#4ade80';
        status.style.border = '1px solid #4ade80';

        // Gate by cooldown
        if (now - lastGestureTime < COOLDOWN_MS) return;

        const swipe = detectSwipe();
        if (swipe) {
          lastGestureTime = now;
          wristHistory.length = 0;   // reset after gesture

          const { key, label, emoji, color } = GESTURE_MAP[swipe];
          flashGesture(label, emoji, color);
          fireKey(key);
          console.info(`[GestureCtrl] Gesture: ${swipe} → ${key}`);
        }
      } else {
        // No hand
        wristHistory.length = 0;
        status.textContent = '🤚 Show your hand…';
        status.style.color  = '#aaa';
        status.style.border = '1px solid rgba(255,255,255,0.15)';
      }
    });

    // Use MediaPipe Camera util
    const camera = new Camera(videoEl, {
      onFrame: async () => {
        await hands.send({ image: videoEl });
      },
      width:  320,
      height: 240,
    });

    camera.start();
    status.textContent = '🟢 Ready! Show your hand';
    status.style.color  = '#4ade80';
    status.style.border = '1px solid #4ade80';
  }

  // ─── Boot ─────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Delay slightly to let the game canvas initialise first
    setTimeout(init, 1500);
  }

})();
