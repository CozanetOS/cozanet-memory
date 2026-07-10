import { Episode } from '../types.js';

export class EpisodicMemory {
  static readonly id = 'memory:episodic';
  private episodes = new Map<string, Episode>();

  startEpisode(label: string): string {
    const episodeId = `episode:${Math.random().toString(36).substring(2, 11)}`;
    const episode: Episode = {
      id: episodeId,
      label,
      events: [],
      startTime: Date.now()
    };
    this.episodes.set(episodeId, episode);
    return episodeId;
  }

  addToEpisode(episodeId: string, event: any): void {
    const episode = this.episodes.get(episodeId);
    if (episode) {
      episode.events.push({
        ...event,
        timestamp: Date.now()
      });
    }
  }

  endEpisode(episodeId: string): Episode {
    const episode = this.episodes.get(episodeId);
    if (!episode) {
      throw new Error(`Episode with ID ${episodeId} not found.`);
    }
    episode.endTime = Date.now();
    return episode;
  }

  getEpisode(episodeId: string): Episode {
    const episode = this.episodes.get(episodeId);
    if (!episode) {
      throw new Error(`Episode with ID ${episodeId} not found.`);
    }
    return episode;
  }
}
