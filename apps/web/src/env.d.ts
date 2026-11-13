/// <reference types="vite/client" />

declare module 'howler' {
  export interface HowlOptions {
    src: string | string[];
    volume?: number;
    preload?: boolean;
    html5?: boolean;
  }

  export class Howl {
    constructor(options: HowlOptions);
    play(spriteOrId?: string | number): number;
    stop(id?: number): this;
    unload(): void;
    state(): 'unloaded' | 'loading' | 'loaded';
  }

  export const Howler: {
    ctx: AudioContext | null;
    volume(vol?: number): number;
    mute(muted: boolean): void;
  };
}
