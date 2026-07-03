/**
 * A flat catalogue of every buildable model in the game, grouped into
 * categories, for the F5 Model Showcase. Each item exposes a `build()` that
 * returns a fresh THREE.Object3D — the showcase centres it, lists its parts, and
 * lets the user nudge them and read back exact values.
 *
 * Builders are wrapped lazily (only invoked when a model is selected) so opening
 * the showcase is cheap and one broken builder can't take the rest down.
 */
import { WEAPON_KEYS, weaponName, weaponCategory, makeWeapon } from '../weapons/catalog.js';
import { buildWeaponModel } from '../weapons/weaponModels.js';
import { buildZombieRig } from '../scenes/zombieRig.js';
import { randomZombieLook } from '../scenes/zombieAssets.js';
import { survivorLook } from '../scenes/MenuScene.js';
import { CHARACTERS } from '../characters/characters.js';
import { PERKS, buildPerkMachine } from '../perks/perks.js';
import { buildPaP } from '../scenes/packAPunch.js';
import { buildMysteryBox } from '../scenes/mysteryBox.js';
import { buildHoundRig } from '../scenes/houndRig.js';
import { buildGumballMachine } from '../gobblegums/gumballMachine.js';
import { buildMonkeyModel, buildArnieJar, buildHomunculus } from '../gadgets/tacticalModels.js';
import { buildPowerupModel } from '../powerups/powerups.js';
import { buildFactory } from '../factory/factoryModel.js';

const CLASS_LABEL = {
  pistol: 'Pistol', smg: 'SMG', assaultRifle: 'Assault Rifle', hmg: 'LMG',
  shotgun: 'Shotgun', sniper: 'Sniper', launcher: 'Launcher', special: 'Special', wonder: 'Wonder',
};

const POWERUPS = ['doublePoints', 'instaKill', 'nuke', 'maxAmmo', 'carpenter', 'zombieBlood', 'bloodMoney'];

export function buildModelCategories() {
  const guns = WEAPON_KEYS.map((k) => ({
    id: k,
    name: `${weaponName(k)}  ·  ${CLASS_LABEL[weaponCategory(k)] || ''}`.trim(),
    // weapon builders return { group, muzzle, ... } — the showcase wants the group
    build: () => { const m = buildWeaponModel(makeWeapon(k)); return m?.group || m; },
  }));

  const characters = [
    { id: 'survivor', name: 'Survivor (default)', build: () => buildZombieRig(survivorLook()) },
    ...CHARACTERS.filter((c) => !c.locked && c.build).map((c) => ({ id: c.id, name: c.name, build: c.build })),
  ];

  const perks = Object.keys(PERKS).map((id) => ({
    id, name: PERKS[id].name, build: () => buildPerkMachine(PERKS[id]),
  }));

  return [
    { id: 'guns', label: 'Weapons', items: guns },
    { id: 'characters', label: 'Player / Characters', items: characters },
    { id: 'zombies', label: 'Enemies', items: [
      { id: 'zombie', name: 'Zombie', build: () => buildZombieRig(randomZombieLook()) },
      { id: 'hound', name: 'Hellhound', build: () => buildHoundRig() },
    ] },
    { id: 'perks', label: 'Perk Machines', items: perks },
    { id: 'machines', label: 'Machines', items: [
      { id: 'pap', name: 'Pack-a-Punch', build: () => buildPaP() },
      { id: 'box', name: 'Mystery Box', build: () => buildMysteryBox() },
      { id: 'gumball', name: 'GobbleGum Machine', build: () => buildGumballMachine() },
      { id: 'factory', name: 'Divinium Factory', build: () => buildFactory() },
    ] },
    { id: 'tacticals', label: 'Tacticals', items: [
      { id: 'monkey', name: 'Monkey Bomb', build: () => buildMonkeyModel() },
      { id: 'arnie', name: "Lil' Arnie", build: () => buildArnieJar() },
      { id: 'homunculus', name: 'Homunculus', build: () => buildHomunculus() },
    ] },
    { id: 'powerups', label: 'Power-ups', items: POWERUPS.map((t) => ({ id: t, name: t, build: () => buildPowerupModel(t) })) },
  ];
}
