/* =========================================================
 *  quests.js — 成就 / 任务链
 * =======================================================*/
(function () {
  'use strict';

  const B = MC.B, I = MC.I;

  // reward: { items: [[id, count]], rep: n }
  const QUESTS = [
    {
      id: 'first_wood', title: '第一块木头', desc: '砍掉 1 个原木，开始你的生存之旅',
      check: (g) => (g.stats.mined[B.LOG] || 0) >= 1,
      reward: { items: [[I.STICK, 4]], rep: 2 }
    },
    {
      id: 'first_craft', title: '动手做东西', desc: '在工作台合成任意一件物品',
      check: (g) => g.stats.crafted >= 1,
      reward: { items: [[B.PLANKS, 4]], rep: 2 }
    },
    {
      id: 'farmer', title: '半亩良田', desc: '背包里同时拥有 3 个小麦',
      check: (g) => g.player.countOf(I.WHEAT) >= 3,
      reward: { items: [[I.SEEDS, 6]], rep: 3 }
    },
    {
      id: 'smelter', title: '炉火熊熊', desc: '用熔炉烧出 1 个铁锭',
      check: (g) => g.player.countOf(I.IRON_INGOT) >= 1,
      reward: { items: [[I.COAL, 3]], rep: 3 }
    },
    {
      id: 'trader', title: '以物易物', desc: '和村民成功交易 1 次',
      check: (g) => g.stats.trades >= 1,
      reward: { items: [[I.EMERALD, 2]], rep: 4 }
    },
    {
      id: 'survivor', title: '熬过黑夜', desc: '在床上睡一觉，迎接新的早晨',
      check: (g) => g.stats.sleeps >= 1,
      reward: { items: [[I.BREAD, 2]], rep: 3 }
    },
    {
      id: 'hunter', title: '夜行者', desc: '击倒 1 只僵尸',
      check: (g) => g.stats.zombieKills >= 1,
      reward: { items: [[I.COOKED_MEAT, 2]], rep: 5 }
    },
    {
      id: 'friend', title: '村庄之友', desc: '村民好感达到 70',
      check: (g) => g.reputation >= 70,
      reward: { items: [[I.EMERALD, 5]], rep: 0 }
    }
  ];

  class QuestManager {
    constructor(game) {
      this.game = game;
      this.completed = new Set();
      this.timer = 0;
    }

    reset() {
      this.completed = new Set();
      this.timer = 0;
    }

    deserialize(list) {
      this.completed = new Set(Array.isArray(list) ? list : []);
    }

    serialize() { return Array.from(this.completed); }

    update(dt) {
      if (!this.game.started) return;
      this.timer -= dt;
      if (this.timer > 0) return;
      this.timer = 0.8;
      for (const q of QUESTS) {
        if (this.completed.has(q.id)) continue;
        let ok = false;
        try { ok = q.check(this.game); } catch (e) { ok = false; }
        if (ok) this.complete(q);
      }
    }

    complete(q) {
      this.completed.add(q.id);
      const game = this.game;
      if (q.reward) {
        if (q.reward.items) {
          for (const [id, count] of q.reward.items) game.player.addItem(id, count);
        }
        if (q.reward.rep) game.reputation = Math.min(100, game.reputation + q.reward.rep);
      }
      game.audio.play('levelup', { volume: 0.5 });
      game.effects.poof(game.player.pos, 0xffe27a);
      game.ui.toast('任务完成：' + q.title, 'good');
      game.saveGame();
    }

    get list() {
      return QUESTS.map(q => ({
        id: q.id, title: q.title, desc: q.desc,
        done: this.completed.has(q.id),
        rewardText: (q.reward.items || []).map(([id, c]) => MC.labelOf(id) + '×' + c).join('、') || '—'
      }));
    }
  }

  MC.QUESTS = QUESTS;
  MC.QuestManager = QuestManager;
})();