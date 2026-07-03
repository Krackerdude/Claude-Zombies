import { buildRichtofen } from './richtofen.js';
import { buildDempsey } from './dempsey.js';
import { buildTakeo } from './takeo.js';

/**
 * The playable crew. `build` returns a fresh rig (for portraits + later
 * gameplay); locked entries have none yet. We add these one at a time —
 * Richtofen is the first fully-realized survivor; the rest are placeholders
 * until their concepts land.
 */
export const CHARACTERS = [
  {
    id: 'richtofen',
    name: 'Edward Richtofen',
    role: 'The Scientist',
    era: 'Axis-Victory Timeline',
    tags: ['Cold', 'Calculating', 'Burdened'],
    build: buildRichtofen,
    locked: false,
    synopsis:
      "This Richtofen comes from a universe where Nazi Germany won World War II, largely due to his scientific brilliance. " +
      "Rather than the eccentric, comedic mad scientist of Ultimis or the conflicted Primis version, this incarnation is cold, " +
      "calculating, and burdened by the consequences of helping create a totalitarian superpower. His world is defined by advanced " +
      "technology, authoritarian rule, and catastrophic events — including an alternate history where New York was devastated by a " +
      "German atomic weapon.",
  },
  {
    id: 'dempsey',
    name: '"Tank" Dempsey',
    role: 'The Veteran',
    era: 'Vietnam War',
    tags: ['Loud', 'Fearless', 'Instinctive'],
    build: buildDempsey,
    locked: false,
    synopsis:
      "This version of Dempsey served in the Vietnam War and is shaped by brutal jungle warfare rather than futuristic conflicts. " +
      "He's still the squad's loud, fearless heavy hitter, but his personality is more grounded — a hardened soldier who trusts " +
      "firepower and instinct above all else. His combat experience in Vietnam makes him an expert in guerrilla warfare, survival, " +
      "and improvisation, giving him a very different perspective from previous versions of Dempsey.",
  },
  {
    id: 'takeo',
    name: 'Takeo Masaki',
    role: 'The Yokai Hunter',
    era: 'Mystical Feudal Japan',
    tags: ['Honorable', 'Disciplined', 'Spiritual'],
    build: buildTakeo,
    locked: false,
    synopsis:
      "This Takeo originates from a mystical version of feudal Japan, where supernatural creatures and legends are real. " +
      "A wandering ronin and hunter of yokai, he combines disciplined swordsmanship with spiritual knowledge, making him " +
      "uniquely prepared to confront the horrors of the Dark Aether. His worldview is deeply rooted in honor, folklore, and " +
      "the balance between the human and spirit worlds, giving him the most fantastical background of the four.",
  },
  { id: 'char4', name: 'Classified', role: 'Locked', era: '', tags: [], build: null, locked: true, synopsis: '' },
];

export const characterById = (id) => CHARACTERS.find((c) => c.id === id);
