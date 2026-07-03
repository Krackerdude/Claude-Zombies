import { CHARACTERS, characterById } from './characters.js';

/**
 * The player's chosen survivor — the single source of truth for "who am I
 * playing as". The Armory writes it; the menu hero and the HUD portrait read it
 * and rebuild whenever it changes. Persistence lives in main.js (profile),
 * which seeds this via initSelectedCharacter() and saves on change.
 */
let selectedId = 'richtofen';
const listeners = new Set();

export function selectedCharacterId() { return selectedId; }
export function selectedCharacter() { return characterById(selectedId) || CHARACTERS.find((c) => !c.locked) || CHARACTERS[0]; }

/** The build function for the current survivor (falls back to the first buildable). */
export function selectedBuild() {
  const c = selectedCharacter();
  return (c && c.build) || CHARACTERS.find((x) => x.build)?.build || null;
}

/** Change the active survivor + notify listeners. Ignores locked/unknown ids. */
export function setSelectedCharacter(id) {
  const c = characterById(id);
  if (!c || c.locked || id === selectedId) return false;
  selectedId = id;
  for (const fn of [...listeners]) fn(id);
  return true;
}

/** Seed the selection (from the persisted profile) without notifying. */
export function initSelectedCharacter(id) {
  const c = characterById(id);
  if (c && !c.locked) selectedId = id;
}

export function onCharacterChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
