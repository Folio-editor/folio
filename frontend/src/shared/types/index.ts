export interface StoryZipAPI {
  platform: 'electron' | 'web';
}

declare global {
  interface Window {
    storyzip: StoryZipAPI;
  }
}
