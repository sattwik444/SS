/**
 * Voice Controller for Subway Surfers
 * Uses the Web Speech API (SpeechRecognition) — no external libs needed.
 *
 * Commands:
 *  "left"            → ArrowLeft  (move left)
 *  "right"           → ArrowRight (move right)
 *  "up" / "jump"     → ArrowUp    (jump)
 *  "down" / "roll" / "slide" / "duck" → ArrowDown (roll)
 *  "hoverboard" / "board" / "hover" → Space (activate hoverboard)
 */

(function () {
  'use strict';

  const COOLDOWN_MS = 500; // Min ms between commands (prevent double-fire)
  let lastCmdTime = 0;

  // ─── Command Map ──────────────────────────────────────────────────────────
  const COMMANDS = [
    {
      words: ['left'],
      key: 'ArrowLeft', keyCode: 37,
      label: '⬅️ Left', color: '#60a5fa',
    },
    {
      words: ['right'],
      key: 'ArrowRight', keyCode: 39,
      label: '➡️ Right', color: '#34d399',
    },
    {
      words: ['up', 'jump'],
      key: 'ArrowUp', keyCode: 38,
      label: '⬆️ Jump!', color: '#f59e0b',
    },
    {
      words: ['down', 'roll', 'slide', 'duck'],
      key: 'ArrowDown', keyCode: 40,
      label: '⬇️ Roll!', color: '#f87171',
    },
    {
      words: ['hoverboard', 'board', 'hover'],
      key: ' ', keyCode: 32,
      label: '🛹 Hoverboard!', color: '#c084fc',
    },
  ];

  // ─── Fire key event ───────────────────────────────────────────────────────
  function fireKey(key, keyCode) {
    ['keydown', 'keyup'].forEach((type) => {
      const evt = new KeyboardEvent(type, {
        bubbles: true, cancelable: true,
        key, code: key === ' ' ? 'Space' : key,
        keyCode, which: keyCode,
      });
      document.dispatchEvent(evt);
      window.dispatchEvent(evt);
      const c = document.querySelector('canvas');
      if (c) c.dispatchEvent(evt);
    });
  }

  // ─── Match transcript to command ─────────────────────────────────────────
  function matchCommand(transcript) {
    const words = transcript.toLowerCase().trim().split(/\s+/);
    for (const cmd of COMMANDS) {
      for (const w of words) {
        if (cmd.words.includes(w)) return cmd;
      }
    }
    return null;
  }

  // ─── Create UI ────────────────────────────────────────────────────────────
  function createUI() {
    const wrapper = document.createElement('div');
    wrapper.id = 'voice-wrapper';
    Object.assign(wrapper.style, {
      position:     'fixed',
      bottom:       '16px',
      left:         '16px',
      zIndex:       '99999',
      display:      'flex',
      flexDirection:'column',
      alignItems:   'flex-start',
      gap:          '8px',
      fontFamily:   'Inter, system-ui, sans-serif',
      userSelect:   'none',
    });

    // Mic button
    const micBtn = document.createElement('button');
    micBtn.id = 'voice-mic-btn';
    micBtn.title = 'Click to toggle voice control';
    micBtn.innerHTML = '🎤';
    Object.assign(micBtn.style, {
      width:         '52px',
      height:        '52px',
      borderRadius:  '50%',
      border:        '2px solid rgba(255,255,255,0.25)',
      background:    'rgba(0,0,0,0.75)',
      fontSize:      '24px',
      cursor:        'pointer',
      boxShadow:     '0 4px 20px rgba(0,0,0,0.5)',
      backdropFilter:'blur(8px)',
      transition:    'all 0.25s ease',
      display:       'flex',
      alignItems:    'center',
      justifyContent:'center',
      position:      'relative',
    });

    // Pulse ring (shown while listening)
    const pulse = document.createElement('div');
    pulse.id = 'voice-pulse';
    Object.assign(pulse.style, {
      position:  'absolute',
      top: '-6px', left: '-6px',
      width:     '64px', height: '64px',
      borderRadius: '50%',
      border:    '3px solid #4ade80',
      opacity:   '0',
      animation: 'none',
      pointerEvents: 'none',
    });
    micBtn.style.position = 'relative';
    micBtn.appendChild(pulse);

    // Inject keyframe animation
    if (!document.getElementById('voice-style')) {
      const style = document.createElement('style');
      style.id = 'voice-style';
      style.textContent = `
        @keyframes voicePulse {
          0%   { transform: scale(1);   opacity: 0.8; }
          100% { transform: scale(1.5); opacity: 0;   }
        }
        #voice-mic-btn.listening {
          border-color: #4ade80 !important;
          box-shadow: 0 0 20px rgba(74, 222, 128, 0.5) !important;
        }
        #voice-mic-btn.listening #voice-pulse {
          animation: voicePulse 1s ease-out infinite !important;
          opacity: 0.8 !important;
        }
      `;
      document.head.appendChild(style);
    }

    // Status pill
    const status = document.createElement('div');
    status.id = 'voice-status';
    Object.assign(status.style, {
      padding:       '4px 12px',
      borderRadius:  '999px',
      fontSize:      '12px',
      fontWeight:    '600',
      letterSpacing: '0.4px',
      background:    'rgba(0,0,0,0.7)',
      color:         '#aaa',
      border:        '1px solid rgba(255,255,255,0.15)',
      backdropFilter:'blur(8px)',
      maxWidth:      '180px',
      whiteSpace:    'nowrap',
      overflow:      'hidden',
      textOverflow:  'ellipsis',
      transition:    'all 0.3s ease',
    });
    status.textContent = '🎤 Voice: off';

    // Command flash label
    const cmdLabel = document.createElement('div');
    cmdLabel.id = 'voice-cmd-label';
    Object.assign(cmdLabel.style, {
      padding:      '6px 14px',
      borderRadius: '10px',
      fontSize:     '18px',
      fontWeight:   '800',
      color:        '#fff',
      background:   'rgba(0,0,0,0.65)',
      backdropFilter:'blur(8px)',
      border:       '1px solid rgba(255,255,255,0.2)',
      opacity:      '0',
      transform:    'translateY(0)',
      transition:   'opacity 0.15s, transform 0.15s',
      pointerEvents:'none',
      whiteSpace:   'nowrap',
    });

    wrapper.appendChild(cmdLabel);
    wrapper.appendChild(micBtn);
    wrapper.appendChild(status);
    document.body.appendChild(wrapper);

    return { micBtn, status, cmdLabel, pulse };
  }

  // ─── Flash command label ──────────────────────────────────────────────────
  function flashCommand(cmd, { cmdLabel, status }) {
    cmdLabel.textContent = cmd.label;
    cmdLabel.style.opacity = '1';
    cmdLabel.style.transform = 'translateY(-4px)';
    cmdLabel.style.borderColor = cmd.color;

    status.textContent = `✅ "${cmd.label}"`;
    status.style.color  = cmd.color;
    status.style.border = `1px solid ${cmd.color}`;

    setTimeout(() => {
      cmdLabel.style.opacity  = '0';
      cmdLabel.style.transform = 'translateY(0)';
      status.textContent = '🎤 Listening…';
      status.style.color  = '#4ade80';
      status.style.border = '1px solid #4ade80';
    }, 800);
  }

  // ─── Init Speech Recognition ──────────────────────────────────────────────
  function initVoice() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('[VoiceCtrl] SpeechRecognition not supported in this browser.');
      return;
    }

    const { micBtn, status, cmdLabel, pulse } = createUI();

    const recognition = new SpeechRecognition();
    recognition.continuous   = true;
    recognition.interimResults= true;
    recognition.lang          = 'en-US';
    recognition.maxAlternatives = 3;

    let isListening = false;
    let restartTimer = null;

    function startListening() {
      try {
        recognition.start();
        isListening = true;
        micBtn.classList.add('listening');
        status.textContent = '🎤 Listening…';
        status.style.color  = '#4ade80';
        status.style.border = '1px solid #4ade80';
      } catch (e) {
        console.warn('[VoiceCtrl] Start error:', e);
      }
    }

    function stopListening() {
      recognition.stop();
      isListening = false;
      micBtn.classList.remove('listening');
      status.textContent = '🎤 Voice: off';
      status.style.color  = '#aaa';
      status.style.border = '1px solid rgba(255,255,255,0.15)';
    }

    // Toggle on mic click
    micBtn.addEventListener('click', () => {
      if (isListening) stopListening();
      else startListening();
    });

    // Process results
    recognition.addEventListener('result', (e) => {
      const now = performance.now();
      if (now - lastCmdTime < COOLDOWN_MS) return;

      // Check all results (both interim and final)
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        for (let j = 0; j < result.length; j++) {
          const transcript = result[j].transcript;
          const cmd = matchCommand(transcript);
          if (cmd) {
            lastCmdTime = now;
            console.info(`[VoiceCtrl] Heard: "${transcript}" → ${cmd.key}`);
            fireKey(cmd.key, cmd.keyCode);
            flashCommand(cmd, { cmdLabel, status });
            return; // only fire one command per result
          }
        }
      }
    });

    // Auto-restart if it stops (browser ends recognition after silence)
    recognition.addEventListener('end', () => {
      if (isListening) {
        clearTimeout(restartTimer);
        restartTimer = setTimeout(() => {
          try { recognition.start(); } catch (e) {}
        }, 300);
      }
    });

    recognition.addEventListener('error', (e) => {
      if (e.error === 'not-allowed') {
        status.textContent = '❌ Mic denied';
        status.style.color  = '#f87171';
        isListening = false;
        micBtn.classList.remove('listening');
      } else if (e.error !== 'no-speech') {
        console.warn('[VoiceCtrl] Error:', e.error);
      }
    });

    console.info('[VoiceCtrl] Ready. Click 🎤 button to activate voice control.');
  }

  // ─── Boot ─────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVoice);
  } else {
    setTimeout(initVoice, 1600);
  }
})();
