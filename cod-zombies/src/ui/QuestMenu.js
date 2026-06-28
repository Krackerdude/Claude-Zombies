import { DIFFICULTIES, rewardColor, rewardLabel, REWARD_KINDS } from '../quests/quests.js';
import { gumById, rarityName } from '../gobblegums/gobblegums.js';
import { gumBallHtml } from './gumBall.js';

/**
 * Black Market Quests chooser — a full-screen menu in the same language as the
 * GobbleGum / map-select screens. Difficulty tabs up top, a grid of quest cards
 * colour-coded by their reward (blue divinium / yellow XP / purple GobbleGum,
 * with the exact gum named), a detail panel on the right, and a live countdown
 * to the next 2-hour rotation. Click a quest to set it as your current quest.
 */
export class QuestMenu {
  #el; #grid; #detail; #tabsEl; #timerEl;
  #quests; #onClose;
  #diff = 'easy'; #selId = null; #open = false; #timer = 0;

  constructor({ quests, onClose } = {}) {
    this.#quests = quests;
    this.#onClose = onClose;
    this.#build();
  }

  get isOpen() { return this.#open; }
  get el() { return this.#el; }

  open() {
    this.#el.classList.add('show');
    this.#open = true;
    // land on the tab holding the tracked quest
    this.#diff = this.#quests.tracked()?.difficulty ?? 'easy';
    this.#selectDiff(this.#diff);
    this.#tickTimer();
    this.#timer = setInterval(() => this.#tickTimer(), 1000);
  }

  close() {
    this.#el.classList.remove('show');
    this.#open = false;
    clearInterval(this.#timer);
    this.#onClose?.();
  }

  refresh() { if (this.#open) this.#selectDiff(this.#diff); }

  #build() {
    const el = document.createElement('div');
    el.id = 'quest-screen';
    el.innerHTML = `
      <div class="qm-bg"></div>
      <div class="qm-head">
        <div class="qm-title"><span class="qm-knob"></span>Black Market Quests</div>
        <div class="qm-tabs"></div>
        <div class="qm-refresh">New contracts in <b class="qm-timer">--:--:--</b></div>
      </div>
      <div class="qm-body">
        <div class="qm-grid"></div>
        <div class="qm-detail"></div>
      </div>
      <div class="qm-foot"><div class="qm-back">Back</div><span>[Click] Set as Current Quest · [Esc] Back</span></div>`;
    document.body.appendChild(el);
    this.#el = el;
    this.#grid = el.querySelector('.qm-grid');
    this.#detail = el.querySelector('.qm-detail');
    this.#tabsEl = el.querySelector('.qm-tabs');
    this.#timerEl = el.querySelector('.qm-timer');

    for (const d of DIFFICULTIES) {
      const b = document.createElement('button');
      b.className = 'qm-tab'; b.dataset.diff = d.id;
      b.style.setProperty('--dc', d.color);
      b.innerHTML = `<span>${d.name}</span>`;
      b.addEventListener('click', () => this.#selectDiff(d.id));
      this.#tabsEl.appendChild(b);
    }
    el.querySelector('.qm-back').addEventListener('click', () => this.close());
    this.#grid.addEventListener('click', (e) => { const c = e.target.closest('.qm-card'); if (c) { this.#quests.setTracked(c.dataset.id); this.#selectQuest(c.dataset.id); this.#selectDiff(this.#diff); } });
    this.#grid.addEventListener('mouseover', (e) => { const c = e.target.closest('.qm-card'); if (c) this.#selectQuest(c.dataset.id); });
  }

  #tickTimer() {
    let s = Math.max(0, Math.floor(this.#quests.msToRefresh() / 1000));
    const h = String(Math.floor(s / 3600)).padStart(2, '0'); s %= 3600;
    const m = String(Math.floor(s / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    this.#timerEl.textContent = `${h}:${m}:${sec}`;
  }

  #selectDiff(diff) {
    this.#diff = diff;
    this.#el.dataset.diff = diff;
    const dc = DIFFICULTIES.find((d) => d.id === diff)?.color ?? '#ffb347';
    this.#el.style.setProperty('--dc', dc);
    for (const b of this.#tabsEl.children) b.classList.toggle('active', b.dataset.diff === diff);

    const list = this.#quests.byDifficulty()[diff] ?? [];
    this.#grid.innerHTML = list.map((q) => {
      const rc = rewardColor(q.reward);
      const tracked = this.#quests.isTracked(q.id);
      return `
      <div class="qm-card${tracked ? ' tracked' : ''}${q.id === this.#selId ? ' sel' : ''}" data-id="${q.id}" style="--rc:${rc}">
        <div class="qm-card-h"><span class="qm-card-name">${q.name}</span>${tracked ? '<span class="qm-card-flag">Tracked</span>' : ''}</div>
        <div class="qm-card-obj">${q.obj}</div>
        <div class="qm-card-rw"><i></i><span>${rewardLabel(q.reward)}</span></div>
      </div>`;
    }).join('');

    if (list.length) this.#selectQuest(list.some((q) => q.id === this.#selId) ? this.#selId : list[0].id);
  }

  #selectQuest(id) {
    const q = this.#quests.flat().find((x) => x.id === id);
    if (!q) return;
    this.#selId = id;
    for (const c of this.#grid.children) c.classList.toggle('sel', c.dataset.id === id);

    const rc = rewardColor(q.reward);
    const diff = DIFFICULTIES.find((d) => d.id === q.difficulty);
    const tracked = this.#quests.isTracked(id);
    let rewardBlock;
    if (q.reward.kind === 'gum') {
      const gum = gumById(q.reward.gum);
      rewardBlock = `
        <div class="qm-d-gum">
          ${gum ? gumBallHtml(gum, 92) : ''}
          <div class="qm-d-gum-info"><div class="qm-d-gum-name">${gum?.name ?? '???'}</div><div class="qm-d-gum-rar">${gum ? rarityName(gum.rarity) : ''} GobbleGum</div></div>
        </div>`;
    } else {
      rewardBlock = `<div class="qm-d-rbig">${rewardLabel(q.reward)}</div>`;
    }
    this.#detail.style.setProperty('--rc', rc);
    this.#detail.style.setProperty('--dc', diff?.color ?? '#ffb347');
    this.#detail.innerHTML = `
      <div class="qm-d-name"><span>${q.name}</span></div>
      <div class="qm-d-diff">${diff?.name ?? ''} Contract</div>
      <div class="qm-d-sec">Objective</div>
      <div class="qm-d-obj">${q.obj}</div>
      <div class="qm-d-sec qm-d-rsec">Reward — ${REWARD_KINDS[q.reward.kind].label}</div>
      ${rewardBlock}
      <div class="qm-d-state ${tracked ? 'on' : ''}">${tracked ? '★ Current Quest' : 'Click to set as your Current Quest'}</div>`;
  }
}
