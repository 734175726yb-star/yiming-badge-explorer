const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3456;
const DATA_DIR = path.join(__dirname, 'data');
const DEFAULT_ADMIN_PASSWORD = 'yiming2024';

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Helpers ──
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const load = (name, fallback) => {
  const p = path.join(DATA_DIR, name);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { fs.writeFileSync(p, JSON.stringify(fallback, null, 2)); return fallback; }
};
const save = (name, data) => fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(data, null, 2));
const today = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
};
const thisMonth = () => today().substring(0, 7);

// ── Default rewards ──
const defaultRewards = {
  privileges: [
    { id:'p1', name:'多讲一本故事', cost:5, icon:'📖' },
    { id:'p2', name:'选今晚动画片', cost:10, icon:'📺' },
    { id:'p3', name:'晚饭点一个菜', cost:15, icon:'🍽️' },
    { id:'p4', name:'周末决定去处', cost:20, icon:'🌳' },
    { id:'p5', name:'和爸爸单独约会', cost:20, icon:'👨‍👦' },
  ],
  experiences: [
    { id:'e1', name:'冰淇淋一次', cost:15, icon:'🍦' },
    { id:'e2', name:'去游乐场', cost:20, icon:'🎠' },
    { id:'e3', name:'去科技馆', cost:30, icon:'🔬' },
    { id:'e4', name:'去动物园', cost:50, icon:'🦁' },
  ],
  items: [
    { id:'i1', name:'泡泡机', cost:10, icon:'🫧' },
    { id:'i2', name:'贴纸书', cost:15, icon:'📚' },
    { id:'i3', name:'小汽车', cost:20, icon:'🚗' },
    { id:'i4', name:'奥特曼模型', cost:30, icon:'🦸' },
  ],
  dream: { name:'梦想大奖—乐高/乐园', cost:100, icon:'🏆' },
};

const defaultSettings = {
  badgeName: '探险家徽章',
  childName: '奕铭',
  childAge: '3岁半',
  adminPassword: DEFAULT_ADMIN_PASSWORD,
  interestRate: { threshold: 30, bonus: 3 },
  dailyVoteDeadline: '23:59',
};

const members = [
  { id: 'dad', name: '爸爸', emoji: '👨', color: '#4A90D9' },
  { id: 'mom', name: '妈妈', emoji: '👩', color: '#E8697C' },
  { id: 'grandpa', name: '爷爷', emoji: '👴', color: '#5B8C5A' },
  { id: 'grandma', name: '奶奶', emoji: '👵', color: '#D4953A' },
];

const badgeLines = [
  { id: 'emotion', name: '情绪徽章', icon: '🦁', color: '#F5A623', label: '勇敢小狮子', desc: '情绪稳定·能听引导·冲突能恢复', maxPerDay: 1 },
  { id: 'behavior', name: '行为徽章', icon: '🐘', color: '#7ED321', label: '合作小象', desc: '整体配合·流程顺利·无明显对抗', maxPerDay: 1 },
  { id: 'explore', name: '探索徽章', icon: '🦅', color: '#4A90D9', label: '探索小鹰', desc: '主动提问·认真读书·动手尝试', maxPerDay: 1 },
];

// ── Initialise data ──
let votesDB = load('votes.json', {});
let rewardsDB = load('rewards.json', defaultRewards);
let settingsDB = load('settings.json', defaultSettings);
let badgesDB = load('badges.json', {}); // { "2026-06-13": { "emotion":1, "behavior":1, "explore":0 } }

// ── Auth middleware ──
function adminAuth(req, res, next) {
  const pwd = req.headers['x-admin-password'] || req.query.pwd || '';
  if (pwd === settingsDB.adminPassword) return next();
  res.status(403).json({ error: '需要管理员密码' });
}

// ── API Routes ──

// Get system info (members, badge lines, settings for display)
app.get('/api/info', (req, res) => {
  res.json({
    members,
    badgeLines,
    badgeName: settingsDB.badgeName,
    childName: settingsDB.childName,
    childAge: settingsDB.childAge,
    interestRate: settingsDB.interestRate,
  });
});

// Get today's full status
app.get('/api/today', (req, res) => {
  const td = today();
  const dayVotes = votesDB[td] || {};
  const dayBadges = badgesDB[td] || { emotion: 0, behavior: 0, explore: 0 };

  // Calculate vote counts per line
  const voteCounts = { emotion: { yes: 0, total: 0 }, behavior: { yes: 0, total: 0 }, explore: { yes: 0, total: 0 } };
  const whoVoted = [];
  const allNotes = [];

  members.forEach(m => {
    const mv = dayVotes[m.id];
    if (mv) {
      whoVoted.push(m.id);
      if (mv.note) allNotes.push({ member: m.id, memberName: m.name, memberEmoji: m.emoji, note: mv.note, time: mv.time });
      ['emotion','behavior','explore'].forEach(line => {
        voteCounts[line].total++;
        if (mv[line]) voteCounts[line].yes++;
      });
    }
  });

  // Calculate today's earned badges
  let todayTotal = 0;
  ['emotion','behavior','explore'].forEach(line => {
    if (voteCounts[line].yes >= 3) todayTotal += (dayBadges[line] || 0);
  });

  // Calculate all-time total
  let allTimeTotal = 0;
  Object.values(badgesDB).forEach(day => {
    allTimeTotal += (day.emotion || 0) + (day.behavior || 0) + (day.explore || 0);
  });

  // Add interest bonus
  const interestBonus = Math.floor(allTimeTotal / settingsDB.interestRate.threshold) * settingsDB.interestRate.bonus;

  res.json({
    date: td,
    votes: dayVotes,
    voteCounts,
    whoVoted,
    badgeResults: dayBadges,
    todayEarned: (dayBadges.emotion||0) + (dayBadges.behavior||0) + (dayBadges.explore||0),
    allTimeTotal: allTimeTotal + interestBonus,
    interestBonus,
    allNotes,
    membersVoted: whoVoted.length,
    membersTotal: members.length,
    allVoted: whoVoted.length >= members.length,
  });
});

// Submit a vote
app.post('/api/vote', (req, res) => {
  const { memberId, votes, note } = req.body;
  if (!memberId || !members.find(m => m.id === memberId)) {
    return res.status(400).json({ error: '请选择投票人身份' });
  }
  if (!votes || typeof votes.emotion !== 'boolean' || typeof votes.behavior !== 'boolean' || typeof votes.explore !== 'boolean') {
    return res.status(400).json({ error: '请完成全部三条评价线的投票' });
  }

  const td = today();
  if (!votesDB[td]) votesDB[td] = {};
  if (votesDB[td][memberId]) {
    return res.status(400).json({ error: '你今天已经投过票了，明天再来吧！' });
  }

  votesDB[td][memberId] = {
    emotion: votes.emotion,
    behavior: votes.behavior,
    explore: votes.explore,
    note: (note || '').trim().substring(0, 500),
    time: new Date().toISOString(),
  };
  save('votes.json', votesDB);

  // Recalculate badges for today
  if (!badgesDB[td]) badgesDB[td] = { emotion: 0, behavior: 0, explore: 0 };
  const dayVotes = votesDB[td];
  ['emotion','behavior','explore'].forEach(line => {
    let yesCount = 0;
    members.forEach(m => {
      if (dayVotes[m.id] && dayVotes[m.id][line]) yesCount++;
    });
    badgesDB[td][line] = yesCount >= 3 ? 1 : 0;
  });
  save('badges.json', badgesDB);

  res.json({ success: true, badges: badgesDB[td], allVoted: Object.keys(dayVotes).length >= members.length });
});

// Get badge history
app.get('/api/history', (req, res) => {
  const month = req.query.month || thisMonth();
  const history = [];

  Object.keys(badgesDB)
    .filter(d => d.startsWith(month))
    .sort()
    .forEach(date => {
      const b = badgesDB[date];
      const v = votesDB[date] || {};
      const notes = [];
      members.forEach(m => {
        if (v[m.id] && v[m.id].note) notes.push({ member: m.name, emoji: m.emoji, note: v[m.id].note });
      });
      history.push({
        date,
        badges: b,
        total: (b.emotion||0) + (b.behavior||0) + (b.explore||0),
        voters: Object.keys(v).length,
        notes,
      });
    });

  res.json({ month, history });
});

// Get notes for a date
app.get('/api/notes/:date', (req, res) => {
  const dayVotes = votesDB[req.params.date] || {};
  const notes = [];
  members.forEach(m => {
    if (dayVotes[m.id] && dayVotes[m.id].note) {
      notes.push({ member: m.name, emoji: m.emoji, note: dayVotes[m.id].note, time: dayVotes[m.id].time });
    }
  });
  res.json({ date: req.params.date, notes });
});

// ── Rewards API ──
app.get('/api/rewards', (req, res) => {
  res.json(rewardsDB);
});

app.post('/api/rewards', adminAuth, (req, res) => {
  const { category, reward } = req.body;
  if (!['privileges','experiences','items','dream'].includes(category)) {
    return res.status(400).json({ error: '无效的分类' });
  }
  if (category === 'dream') {
    rewardsDB.dream = reward;
  } else {
    if (!reward.name || !reward.cost) return res.status(400).json({ error: '名称和徽章数必填' });
    reward.id = reward.id || (category[0] + Date.now());
    if (!reward.icon) reward.icon = '⭐';
    const idx = rewardsDB[category].findIndex(r => r.id === reward.id);
    if (idx >= 0) {
      rewardsDB[category][idx] = reward;
    } else {
      rewardsDB[category].push(reward);
    }
  }
  save('rewards.json', rewardsDB);
  res.json({ success: true, rewards: rewardsDB });
});

app.delete('/api/rewards/:category/:id', adminAuth, (req, res) => {
  const { category, id } = req.params;
  if (category === 'dream') return res.status(400).json({ error: '梦想大奖不可删除' });
  if (!rewardsDB[category]) return res.status(404).json({ error: '分类不存在' });
  rewardsDB[category] = rewardsDB[category].filter(r => r.id !== id);
  save('rewards.json', rewardsDB);
  res.json({ success: true, rewards: rewardsDB });
});

// ── Settings API ──
app.get('/api/settings', adminAuth, (req, res) => {
  res.json(settingsDB);
});

app.put('/api/settings', adminAuth, (req, res) => {
  const allowed = ['badgeName','childName','childAge','adminPassword','interestRate','dailyVoteDeadline'];
  allowed.forEach(k => {
    if (req.body[k] !== undefined) settingsDB[k] = req.body[k];
  });
  save('settings.json', settingsDB);
  res.json({ success: true, settings: settingsDB });
});

// Auth check
app.post('/api/auth', (req, res) => {
  const { password } = req.body;
  if (password === settingsDB.adminPassword) {
    res.json({ success: true, token: settingsDB.adminPassword });
  } else {
    res.status(403).json({ error: '密码错误' });
  }
});

// Get all-time stats
app.get('/api/stats', (req, res) => {
  let totalDays = 0;
  let totalBadges = 0;
  const lineTotals = { emotion: 0, behavior: 0, explore: 0 };
  const months = {};

  Object.entries(badgesDB).forEach(([date, b]) => {
    totalDays++;
    totalBadges += (b.emotion||0) + (b.behavior||0) + (b.explore||0);
    lineTotals.emotion += (b.emotion||0);
    lineTotals.behavior += (b.behavior||0);
    lineTotals.explore += (b.explore||0);

    const m = date.substring(0, 7);
    if (!months[m]) months[m] = { days: 0, badges: 0 };
    months[m].days++;
    months[m].badges += (b.emotion||0) + (b.behavior||0) + (b.explore||0);
  });

  const interestBonus = Math.floor(totalBadges / settingsDB.interestRate.threshold) * settingsDB.interestRate.bonus;

  res.json({
    totalDays,
    totalBadges,
    totalWithBonus: totalBadges + interestBonus,
    interestBonus,
    lineTotals,
    months,
  });
});

// Check admin password (non-destructive)
app.post('/api/auth/check', (req, res) => {
  const { password } = req.body;
  res.json({ valid: password === settingsDB.adminPassword });
});

// Catch-all: serve index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🏴‍☠️ 奕铭探险家徽章系统 V2 已启航！端口: ${PORT}`);
  console.log(`   http://localhost:${PORT}`);
});
