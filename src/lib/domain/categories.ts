export interface SeedCategory {
  slug: string;
  name: string;
  emoji: string;
  color: string;
}

export const SEED_CATEGORIES: SeedCategory[] = [
  { slug: "f1", name: "Formula 1", emoji: "🏎️", color: "#ff5d6c" },
  { slug: "imsa", name: "IMSA", emoji: "🏁", color: "#ff8f3e" },
  { slug: "wec", name: "FIA WEC", emoji: "🌍", color: "#3ec7d6" },
  { slug: "nhl", name: "NHL", emoji: "🏒", color: "#5b8cff" },
  { slug: "league", name: "Friend's League", emoji: "🥅", color: "#8a5bff" },
  { slug: "tennis", name: "Tennis", emoji: "🎾", color: "#35d0a0" },
  { slug: "racing", name: "Racing", emoji: "🏆", color: "#ffbf3c" },
  { slug: "drops", name: "Drops", emoji: "👟", color: "#e069d6" },
  { slug: "screen", name: "Movies & TV", emoji: "🎬", color: "#c084fc" },
  { slug: "games", name: "Games", emoji: "🎮", color: "#22d3ee" },
  { slug: "personal", name: "Personal", emoji: "📌", color: "#c0cad6" },
];

export const PALETTE = [
  "#ff5d6c", "#ff8f3e", "#ffbf3c", "#35d0a0", "#3ec7d6",
  "#5b8cff", "#8a5bff", "#e069d6", "#c0cad6", "#7bd44a",
];

export const EMOJI_CHOICES = [
  "🏎️", "🏁", "🏒", "🎾", "🏀", "⚽", "🏈", "⚾", "🥅", "🏆",
  "🎮", "👟", "🎬", "🎵", "📺", "📦", "🛒", "✈️", "🎂", "📌",
  "💊", "💼", "📚", "🩺", "🎟️", "🚀", "🌍", "🥊", "🏉", "🎯",
];
