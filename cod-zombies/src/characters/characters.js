import { buildRichtofen } from './richtofen.js';

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
  { id: 'char2', name: 'Classified', role: 'Locked', era: '', tags: [], build: null, locked: true, synopsis: '' },
  { id: 'char3', name: 'Classified', role: 'Locked', era: '', tags: [], build: null, locked: true, synopsis: '' },
  { id: 'char4', name: 'Classified', role: 'Locked', era: '', tags: [], build: null, locked: true, synopsis: '' },
];

export const characterById = (id) => CHARACTERS.find((c) => c.id === id);
