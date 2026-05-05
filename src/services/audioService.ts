import * as Tone from 'tone';

class AudioService {
  private synth: Tone.PolySynth;
  private noise: Tone.NoiseSynth;
  private music: Tone.Synth | null = null;
  private musicLoop: Tone.Loop | null = null;
  private initialized: boolean = false;
  private sfxVolume: number = 0.5;
  private musicVolume: number = 0.3;
  private musicEnabled: boolean = true;
  private sfxEnabled: boolean = true;
  
  // Synthwave Layers
  private bassSynth: Tone.MonoSynth | null = null;
  private padSynth: Tone.PolySynth | null = null;
  private drumKick: Tone.MembraneSynth | null = null;
  private drumSnare: Tone.NoiseSynth | null = null;
  private hihat: Tone.MetalSynth | null = null;
  private musicParts: (Tone.Loop | Tone.Sequence)[] = [];

  constructor() {
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'square' },
      envelope: {
        attack: 0.05,
        decay: 0.1,
        sustain: 0.3,
        release: 1
      }
    }).toDestination();

    this.noise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: {
        attack: 0.005,
        decay: 0.1,
        sustain: 0
      }
    }).toDestination();

    this.updateVolumes();
  }

  private updateVolumes() {
    const sfxVol = this.sfxEnabled ? this.sfxVolume : 0;
    const musicVol = this.musicEnabled ? this.musicVolume : 0;

    const sfxDb = Tone.gainToDb(sfxVol);
    const musicDb = Tone.gainToDb(musicVol);
    const padDb = Tone.gainToDb(musicVol * 0.4); // Pads should be quieter

    this.synth.volume.value = sfxDb;
    this.noise.volume.value = sfxDb;
    
    if (this.music) this.music.volume.value = musicDb;
    if (this.bassSynth) this.bassSynth.volume.value = musicDb;
    if (this.padSynth) this.padSynth.volume.value = padDb;
    if (this.drumKick) this.drumKick.volume.value = musicDb;
    if (this.drumSnare) this.drumSnare.volume.value = musicDb - 6; // Snare slightly quieter
    if (this.hihat) this.hihat.volume.value = musicDb - 12; // Hihat background
  }

  setSfxVolume(vol: number) {
    this.sfxVolume = vol;
    this.updateVolumes();
  }

  setMusicVolume(vol: number) {
    this.musicVolume = vol;
    this.updateVolumes();
  }

  setMusicEnabled(enabled: boolean) {
    this.musicEnabled = enabled;
    this.updateVolumes();
    if (!enabled) {
      this.musicParts.forEach(part => part.stop());
      if (this.musicLoop) this.musicLoop.stop();
    } else {
      this.musicParts.forEach(part => part.start(0));
      if (this.musicLoop && this.musicLoop.state === 'stopped') {
        this.musicLoop.start(0);
      }
    }
  }

  setSfxEnabled(enabled: boolean) {
    this.sfxEnabled = enabled;
    this.updateVolumes();
  }

  async init() {
    if (this.initialized) return;
    await Tone.start();
    
    const musicVol = this.musicEnabled ? this.musicVolume : 0;
    const musicDb = Tone.gainToDb(musicVol);

    // 1. LEAD ARPEGGIO
    this.music = new Tone.Synth({
      oscillator: { type: 'pulse', width: 0.2 },
      envelope: { attack: 0.05, decay: 0.2, sustain: 0.3, release: 1.2 }
    }).toDestination();

    // 2. PULSING BASS
    this.bassSynth = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      filter: { Q: 2, type: 'lowpass', rolloff: -24 },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.4, release: 0.1 },
      filterEnvelope: { attack: 0.05, decay: 0.2, sustain: 0.1, baseFrequency: 100, octaves: 2.5 }
    }).toDestination();

    // 3. ATMOSPHERIC PADS
    this.padSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 2, decay: 1, sustain: 0.5, release: 2 }
    }).toDestination();
    // Add some effects to pad
    const chorus = new Tone.Chorus(4, 2.5, 0.5).start().toDestination();
    this.padSynth.connect(chorus);

    // 4. DRUMS
    this.drumKick = new Tone.MembraneSynth().toDestination();
    this.drumSnare = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.2, sustain: 0 }
    }).toDestination();
    this.hihat = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.1, sustain: 0 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5
    }).toDestination();

    // -- SEQUENCES & LOOPS --
    
    // Beat Loop (4/4)
    const drumLoop = new Tone.Loop(time => {
      // Bar logic (16 steps)
      const step = Math.floor(Tone.Transport.getTicksAtTime(time) / Tone.Transport.PPQ * 4) % 16;
      
      // Kick on 1 and 9
      if (step === 0 || step === 8) {
        this.drumKick?.triggerAttackRelease('C1', '8n', time);
      }
      
      // Snare on 5 and 13
      if (step === 4 || step === 12) {
        this.drumSnare?.triggerAttackRelease('16n', time);
      }
      
      // Hihat on 8th notes and some 16ths
      if (step % 2 === 0 || step === 15) {
        this.hihat?.triggerAttackRelease('32n', time, step % 4 === 0 ? 0.3 : 0.1);
      }
    }, '16n');

    // Bass Loop (8th notes)
    const bassPattern = ['C1', 'C1', 'C1', 'C1', 'G0', 'G0', 'G0', 'G0', 'Ab0', 'Ab0', 'Ab0', 'Ab0', 'Bb0', 'Bb0', 'Bb0', 'Bb0'];
    let bassIndex = 0;
    const bassLoop = new Tone.Loop(time => {
      const note = bassPattern[bassIndex % bassPattern.length];
      this.bassSynth?.triggerAttackRelease(note, '8n', time);
      bassIndex++;
    }, '8n');

    // Arpeggio (Lead)
    const leadPattern = ['C3', 'G3', 'C4', 'G3', 'Eb3', 'Bb3', 'Eb4', 'Bb3', 'Ab3', 'Eb4', 'Ab4', 'Eb4', 'Bb3', 'F4', 'Bb4', 'F4'];
    let leadIndex = 0;
    this.musicLoop = new Tone.Loop(time => {
      const note = leadPattern[leadIndex % leadPattern.length];
      this.music?.triggerAttackRelease(note, '16n', time);
      leadIndex++;
    }, '16n');

    // Pad Chords (Every 2 bars)
    const chords = [
      ['C3', 'Eb3', 'G3', 'Bb3'],
      ['G2', 'Bb2', 'D3', 'F3'],
      ['Ab2', 'C3', 'Eb3', 'G3'],
      ['Bb2', 'D3', 'F3', 'A3']
    ];
    let chordIndex = 0;
    const padLoop = new Tone.Loop(time => {
      const chord = chords[chordIndex % chords.length];
      this.padSynth?.triggerAttackRelease(chord, '1n', time);
      chordIndex++;
    }, '1m'); // Change every measure

    this.musicParts = [drumLoop, bassLoop, padLoop];
    
    this.updateVolumes();
    
    if (this.musicEnabled) {
      this.musicParts.forEach(part => part.start(0));
      this.musicLoop.start(0);
    }
    
    Tone.Transport.bpm.value = 110;
    Tone.Transport.start();

    this.initialized = true;
    console.log('Neon Synthwave Active');
  }

  playEat() {
    if (!this.initialized) return;
    this.synth.triggerAttackRelease('C5', '16n');
  }

  playGameOver() {
    if (!this.initialized) return;
    const now = Tone.now();
    this.synth.triggerAttackRelease('G2', '4n', now);
    this.synth.triggerAttackRelease('E2', '4n', now + 0.1);
    this.synth.triggerAttackRelease('C2', '2n', now + 0.2);
    this.noise.triggerAttackRelease('8n', now);
  }

  playWin() {
    if (!this.initialized) return;
    const now = Tone.now();
    const notes = ['C4', 'E4', 'G4', 'C5', 'E5', 'G5', 'C6'];
    notes.forEach((note, i) => {
      this.synth.triggerAttackRelease(note, '16n', now + i * 0.1);
    });
  }

  playDisco() {
    if (!this.initialized) return;
    const now = Tone.now();
    const notes = ['C5', 'E5', 'G5', 'B5', 'C6'];
    notes.forEach((note, i) => {
      this.synth.triggerAttackRelease(note, '32n', now + i * 0.05);
    });
  }

  playPowerUp() {
    if (!this.initialized) return;
    const now = Tone.now();
    this.synth.triggerAttackRelease('F4', '16n', now);
    this.synth.triggerAttackRelease('A4', '16n', now + 0.1);
    this.synth.triggerAttackRelease('C5', '8n', now + 0.2);
  }

  playInvincibility() {
    if (!this.initialized) return;
    const now = Tone.now();
    // Rising glitchy sequence
    this.synth.triggerAttackRelease('C4', '32n', now);
    this.synth.triggerAttackRelease('C#4', '32n', now + 0.05);
    this.synth.triggerAttackRelease('D4', '32n', now + 0.1);
    this.synth.triggerAttackRelease('D#4', '32n', now + 0.15);
    this.synth.triggerAttackRelease('E4', '8n', now + 0.2);
  }

  playDoublePoints() {
    if (!this.initialized) return;
    const now = Tone.now();
    // High-pitched double chime
    this.synth.triggerAttackRelease('G5', '16n', now);
    this.synth.triggerAttackRelease('G5', '16n', now + 0.15);
    this.synth.triggerAttackRelease('C6', '8n', now + 0.3);
  }

  playHighScore() {
    if (!this.initialized) return;
    const now = Tone.now();
    // Celebratory melody
    this.synth.triggerAttackRelease('C5', '16n', now);
    this.synth.triggerAttackRelease('E5', '16n', now + 0.1);
    this.synth.triggerAttackRelease('G5', '16n', now + 0.2);
    this.synth.triggerAttackRelease('C6', '4n', now + 0.3);
  }
}

export const audioService = new AudioService();
