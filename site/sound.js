// Ambient sound for the projector, made live with Web Audio (no audio files):
//   - a slow, warm pad drifting through a few soft chords, with a long reverb tail
//   - now and then a faint high bell, and a whisper of a note when a wisp reaches a lantern
//   - a chime that rises when a visitor's light arrives from the iPad
// Browsers only start audio after a click or key press, so the page calls Sound.unlock() on the first one.
(() => {
  // A major-pentatonic world (D), so any notes that overlap still sound consonant
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  const CHORDS = [
    [50, 57, 62, 66],      // D  A  D  F#
    [47, 54, 59, 62],      // B  F# B  D
    [43, 50, 55, 59],      // G  D  G  B
    [45, 52, 57, 64]       // A  E  A  E
  ];
  const BELLS = [74, 76, 78, 81, 83, 86, 88, 90];    // D5 .. F#6

  let ac = null, master, dry, wet, padBus, padFilter, cfg = {};
  let padTimer = null, bellTimer = null, chordIdx = 0, voices = [], musicOn = true, started = false;

  // Reverb from a generated impulse: decaying stereo noise
  function makeReverb(seconds = 4.5) {
    const len = Math.floor(ac.sampleRate * seconds), buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    const conv = ac.createConvolver();
    conv.buffer = buf;
    return conv;
  }

  function init(options) {
    cfg = options;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain(); master.gain.value = cfg.MASTER_VOLUME;
    master.connect(ac.destination);
    const rev = makeReverb();
    wet = ac.createGain(); wet.gain.value = cfg.REVERB;
    dry = ac.createGain(); dry.gain.value = 1;
    dry.connect(master); dry.connect(rev); rev.connect(wet); wet.connect(master);

    padFilter = ac.createBiquadFilter();
    padFilter.type = 'lowpass'; padFilter.frequency.value = 700; padFilter.Q.value = 0.4;
    padBus = ac.createGain(); padBus.gain.value = cfg.MUSIC_VOLUME;
    padFilter.connect(padBus); padBus.connect(dry);
    // the filter opens and closes very slowly, like breathing
    const lfo = ac.createOscillator(), lfoAmt = ac.createGain();
    lfo.frequency.value = 1 / 11; lfoAmt.gain.value = 260;
    lfo.connect(lfoAmt); lfoAmt.connect(padFilter.frequency); lfo.start();
    return true;
  }

  // One pad chord: each note is two slightly detuned soft oscillators, faded in and out slowly
  function playChord() {
    const now = ac.currentTime, hold = cfg.CHORD_S, fade = hold * 0.55;
    const chord = CHORDS[chordIdx++ % CHORDS.length];
    chord.forEach((n, i) => {
      for (const det of [-5, 5]) {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = i === 0 ? 'sine' : 'triangle';
        o.frequency.value = midi(n); o.detune.value = det + (Math.random() * 4 - 2);
        const peak = (i === 0 ? 0.22 : 0.12) / chord.length;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(peak, now + fade);
        g.gain.setValueAtTime(peak, now + hold);
        g.gain.linearRampToValueAtTime(0.0001, now + hold + fade);
        o.connect(g); g.connect(padFilter);
        o.start(now); o.stop(now + hold + fade + 0.1);
        voices.push(o);
        o.onended = () => { voices = voices.filter(v => v !== o); };
      }
    });
  }

  // A soft bell: a few inharmonic partials with quick attack and long, uneven decay
  function bell(freq, { when = 0, vol = 0.2, decay = 3.2, pan = 0 } = {}) {
    if (!ac) return;
    const t0 = ac.currentTime + when;
    const out = ac.createGain(); out.gain.value = vol;
    let node = out;
    if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; out.connect(p); node = p; }
    node.connect(dry);
    [[1, 1, 1], [2.0, 0.35, 0.6], [2.76, 0.22, 0.45], [5.4, 0.08, 0.25]].forEach(([ratio, amp, dk]) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = freq * ratio;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(amp, t0 + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay * dk);
      o.connect(g); g.connect(out);
      o.start(t0); o.stop(t0 + decay * dk + 0.05);
    });
  }

  function scheduleBell() {
    bellTimer = setTimeout(() => {
      if (musicOn) bell(midi(BELLS[Math.floor(Math.random() * BELLS.length)]), { vol: cfg.BELL_VOLUME, pan: Math.random() * 1.2 - 0.6 });
      scheduleBell();
    }, (cfg.BELL_MIN_S + Math.random() * (cfg.BELL_MAX_S - cfg.BELL_MIN_S)) * 1000);
  }

  function startMusic() {
    if (started) return;
    started = true;
    playChord();
    padTimer = setInterval(() => { if (musicOn) playChord(); }, cfg.CHORD_S * 1000);
    scheduleBell();
  }

  const Sound = {
    // options: see SOUND in projector.js
    setup(options) {
      if (!options.ENABLED || !init(options)) return;
      const unlock = () => Sound.unlock();
      addEventListener('pointerdown', unlock);
      addEventListener('keydown', unlock);
      Sound.unlock();     // works right away where autoplay is allowed (e.g. a kiosk browser flag)
    },
    unlock() {
      if (!ac) return;
      const go = () => { if (ac.state === 'running') startMusic(); };
      if (ac.state === 'suspended') ac.resume().then(go).catch(() => {}); else go();
    },
    get ready() { return !!ac && ac.state === 'running'; },
    get on() { return musicOn; },
    // M key: fade everything in or out
    toggle() {
      if (!ac) return false;
      musicOn = !musicOn;
      master.gain.setTargetAtTime(musicOn ? cfg.MASTER_VOLUME : 0, ac.currentTime, 0.6);
      return musicOn;
    },
    // A whisper of a note when a wisp reaches a lantern; pan follows the lantern across the wall (0..1)
    arrive(x = 0.5) {
      if (!this.ready || !musicOn || Math.random() > cfg.ARRIVE_CHANCE) return;
      bell(midi(BELLS[Math.floor(Math.random() * 5) + 2]), { vol: cfg.ARRIVE_VOLUME, decay: 2.4, pan: x * 1.6 - 0.8 });
    },
    // A visitor's light arrives: a rising chime with a shimmer, then a low bloom
    chime(x = 0.5) {
      if (!this.ready || !musicOn) return;
      const pan = x * 1.4 - 0.7, v = cfg.CHIME_VOLUME;
      [74, 78, 81, 86, 90].forEach((n, i) => bell(midi(n), { when: i * 0.11, vol: v * (0.75 + i * 0.06), decay: 4.2, pan }));
      [93, 98].forEach((n, i) => bell(midi(n), { when: 0.62 + i * 0.09, vol: v * 0.35, decay: 3, pan: -pan }));
      bell(midi(50), { when: 0.05, vol: v * 0.5, decay: 6, pan: 0 });
    }
  };
  window.Sound = Sound;
})();
