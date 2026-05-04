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

    this.synth.volume.value = Tone.gainToDb(sfxVol);
    this.noise.volume.value = Tone.gainToDb(sfxVol);
    if (this.music) {
      this.music.volume.value = Tone.gainToDb(musicVol);
    }
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
    if (!enabled && this.musicLoop) {
      this.musicLoop.stop();
    } else if (enabled && this.musicLoop && this.musicLoop.state === 'stopped') {
      this.musicLoop.start(0);
    }
  }

  setSfxEnabled(enabled: boolean) {
    this.sfxEnabled = enabled;
    this.updateVolumes();
  }

  async init() {
    if (this.initialized) return;
    await Tone.start();
    
    // Retro-futuristic Arpeggio
    this.music = new Tone.Synth({
      oscillator: { type: 'pulse', width: 0.2 },
      envelope: { attack: 0.05, decay: 0.2, sustain: 0.3, release: 1.2 }
    }).toDestination();

    // A more atmospheric, evolving pattern
    const pattern = ['C2', 'G2', 'C3', 'G2', 'A2', 'E2', 'A3', 'E2', 'F2', 'C2', 'F3', 'C2', 'G2', 'D2', 'G3', 'D2'];
    let index = 0;
    
    this.musicLoop = new Tone.Loop(time => {
      if (this.musicVolume > 0) {
        const note = pattern[index % pattern.length];
        this.music?.triggerAttackRelease(note, '16n', time);
        // Add a slight octave jump occasionally for flavor
        if (index % 8 === 0) {
          this.music?.triggerAttackRelease(note.replace('2', '3'), '32n', time + 0.1);
        }
        index++;
      }
    }, '16n');

    this.updateVolumes();
    this.musicLoop.start(0);
    Tone.Transport.start();

    this.initialized = true;
    console.log('Audio Context & Music Started');
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
