let state = {
  startDate: null,
  scores: {},        
  overrides: {}
};

let calendarData = null;   
let modalCtx = null;

const SCORE_LABELS = ['','Poor','Low','Okay','Good','Great'];

function save() {
  const s = {
    startDate: state.startDate ? state.startDate.toISOString() : null,
    scores: state.scores,
    overrides: {}
  };
  for (const [k,v] of Object.entries(state.overrides)) {
    s.overrides[k] = { start: v.start.toISOString(), end: v.end.toISOString() };
  }
  localStorage.setItem('ugTracker', JSON.stringify(s));
}

function load() {
  try {
    const raw = localStorage.getItem('ugTracker');
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.startDate) state.startDate = new Date(s.startDate);
    if (s.scores) state.scores = s.scores;
    if (s.overrides) {
      for (const [k,v] of Object.entries(s.overrides)) {
        state.overrides[k] = { start: new Date(v.start), end: new Date(v.end) };
      }
    }
  } catch(e) {}
}

function addDays(d, n) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function addWeeks(d, n) { return addDays(d, n * 7); }
function startOfWeek(d) {
  const r = new Date(d);
  r.setHours(0,0,0,0);
  const day = r.getDay();
  r.setDate(r.getDate() - day);
  return r;
}
function weeksBetween(a, b) {
  return Math.round((b - a) / (7 * 86400000));
}
function fmtDate(d) {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateShort(d) {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtMonYr(d) {
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }).toUpperCase();
}
function isSameWeek(a, b) {
  const sa = startOfWeek(a), sb = startOfWeek(b);
  return sa.getTime() === sb.getTime();
}
function isBefore(a, b) { return startOfWeek(a) < startOfWeek(b); }
function isAfter(a, b) { return startOfWeek(a) > startOfWeek(b); }

const PERIOD_DEFS = [
  { key: 'autumn', name: 'Autumn Sem', type: 'sem', weeks: 17, monthHint: 'JUL–DEC' },
  { key: 'winter', name: 'Winter Break', type: 'break', weeks: 5, monthHint: 'DEC–JAN' },
  { key: 'spring', name: 'Spring Sem', type: 'sem', weeks: 17, monthHint: 'JAN–MAY' },
  { key: 'summer', name: 'Summer Break', type: 'break', weeks: 13, monthHint: 'MAY–JUL' },
];

function buildStructure(startDate) {
  const years = [];
  let cursor = new Date(startDate);
  cursor.setHours(0,0,0,0);

  for (let y = 1; y <= 4; y++) {
    const yearStart = new Date(cursor);
    const periods = [];

    for (let pi = 0; pi < PERIOD_DEFS.length; pi++) {
      const def = PERIOD_DEFS[pi];
      const overKey = `y${y}s${pi}`;
      const ov = state.overrides[overKey];

      let pStart, pEnd;
      if (ov) {
        pStart = new Date(ov.start);
        pEnd = new Date(ov.end);
      } else {
        pStart = new Date(cursor);
        pEnd = addWeeks(pStart, def.weeks);
      }

      const weeks = [];
      let w = new Date(pStart);
      while (w < pEnd) {
        weeks.push(new Date(w));
        w = addWeeks(w, 1);
      }

      periods.push({
        key: overKey,
        defKey: def.key,
        name: def.name,
        type: def.type,
        monthHint: def.monthHint,
        start: pStart,
        end: pEnd,
        weeks
      });

      cursor = new Date(pEnd);
    }

    years.push({ year: y, start: yearStart, periods });
  }
  return years;
}

function findCurrentPeriod(years) {
  const now = new Date();
  for (const yr of years) {
    for (const p of yr.periods) {
      if (now >= p.start && now < p.end) {
        return { year: yr.year, period: p, years: yr };
      }
    }
  }

  const lastYr = years[years.length-1];
  return { year: lastYr.year, period: lastYr.periods[lastYr.periods.length-1], years: lastYr };
}

function computeStats(years) {
  const now = new Date();
  let totalWeeks = 0, elapsed = 0, remaining = 0;
  let scoredCount = 0, scoreSum = 0;

  for (const yr of years) {
    for (const p of yr.periods) {
      for (let wi = 0; wi < p.weeks.length; wi++) {
        const wDate = p.weeks[wi];
        totalWeeks++;
        const key = `${p.key}-${wi}`;
        const sc = state.scores[key];
        if (isBefore(wDate, now) && !isSameWeek(wDate, now)) {
          elapsed++;
          if (sc) { scoredCount++; scoreSum += sc; }
        } else if (isAfter(wDate, now) || isSameWeek(wDate, now)) {
          remaining++;
        }
      }
    }
  }

  return {
    totalWeeks,
    elapsed,
    remaining,
    scored: scoredCount,
    avg: scoredCount > 0 ? (scoreSum / scoredCount).toFixed(1) : '—'
  };
}

function computeOverallWeek(years) {
  const now = new Date();
  let idx = 1, total = 0;
  for (const yr of years) {
    for (const p of yr.periods) {
      total += p.weeks.length;
      for (let wi = 0; wi < p.weeks.length; wi++) {
        if (isSameWeek(p.weeks[wi], now)) return { current: idx + wi, total };
        if (isBefore(p.weeks[wi], now)) {}
        else if (wi === 0) return { current: idx, total };
      }
      idx += p.weeks.length;
    }
  }
  return { current: total, total };
}

function renderCalendar(years) {
  const area = document.getElementById('calendarArea');
  area.innerHTML = '';
  const now = new Date();

  let overallWeekIdx = 1;

  for (const yr of years) {
    const section = document.createElement('div');
    section.className = 'year-section';

    const heading = document.createElement('div');
    heading.className = 'year-heading';
    const yearStart = yr.start.getFullYear();
    heading.textContent = `— Year ${yr.year} · ${yearStart}–${yearStart+1} —`;
    section.appendChild(heading);

    for (const p of yr.periods) {
      const row = document.createElement('div');
      row.className = 'semester-row';

      const label = document.createElement('div');
      label.className = 'sem-label';
      label.innerHTML = `<div class="name">${p.name}</div><div class="dates">${fmtMonYr(p.start)}</div>`;
      row.appendChild(label);

      const grid = document.createElement('div');
      grid.className = 'weeks-grid';

      for (let wi = 0; wi < p.weeks.length; wi++) {
        const wDate = p.weeks[wi];
        const box = document.createElement('div');
        box.className = 'week-box';
        box.title = fmtDate(wDate);

        const scoreKey = `${p.key}-${wi}`;
        const sc = state.scores[scoreKey];
        const isPast = isBefore(wDate, now) && !isSameWeek(wDate, now);
        const isThis = isSameWeek(wDate, now);
        const isFuture = isAfter(wDate, now);
        const isBreak = p.type === 'break';

        if (isThis) {
          box.classList.add('this-week');
        } else if (sc) {
          box.classList.add(`score-${sc}`);
        } else if (isBreak) {
          if (isPast || isThis) box.classList.add('holiday');
          else box.classList.add('holiday');
        } else if (isFuture) {
          box.classList.add('future');
        } else {
          box.classList.add('unscored');
        }

        if ((isPast || isBreak) && !isThis) {
          box.classList.add('past');
          box.addEventListener('click', () => openModal(p, wi, wDate, scoreKey));
        }

        grid.appendChild(box);
        overallWeekIdx++;
      }

      row.appendChild(grid);
      section.appendChild(row);
    }

    area.appendChild(section);
  }
}

function renderOverridesUI(years) {
  const grid = document.getElementById('overridesGrid');
  grid.innerHTML = '';
  if (!years) return;

  for (const yr of years) {
    const block = document.createElement('div');
    block.className = 'year-block';
    block.innerHTML = `<h4>Year ${yr.year}</h4>`;

    yr.periods.forEach((p, pi) => {
      const row = document.createElement('div');
      row.className = 'semester-range';

      const s = document.createElement('input');
      s.type = 'date';
      s.id = `ov-${p.key}-start`;
      s.value = p.start.toISOString().split('T')[0];

      const dash = document.createElement('span');
      dash.textContent = '–';

      const e = document.createElement('input');
      e.type = 'date';
      e.id = `ov-${p.key}-end`;
      e.value = p.end.toISOString().split('T')[0];

      row.appendChild(s);
      row.appendChild(dash);
      row.appendChild(e);
      block.appendChild(row);
    });

    grid.appendChild(block);
  }
}

function buildCalendar() {
  const inp = document.getElementById('startDate').value;
  if (!inp) { alert('Please enter the first day of your UG.'); return; }

  state.startDate = new Date(inp);
  calendarData = buildStructure(state.startDate);
  save();
  render();
}

function render() {
  if (!calendarData) return;
  const now = new Date();

  const cur = findCurrentPeriod(calendarData);
  document.getElementById('semBanner').style.display = 'flex';
  document.getElementById('bannerSemName').textContent = cur.period.name;
  const semYear = cur.year;
  const weekInSem = cur.period.weeks.findIndex(w => isSameWeek(w, now));
  const totalSemWeeks = cur.period.weeks.length;
  document.getElementById('bannerSemSub').textContent =
    `${cur.period.name} · Year ${semYear} · Week ${weekInSem >= 0 ? weekInSem + 1 : '?'} of ${totalSemWeeks}`;
  document.getElementById('bannerToday').textContent = fmtDateShort(now);
  const ow = computeOverallWeek(calendarData);
  document.getElementById('bannerOverall').textContent = `Overall week ${ow.current} of ${ow.total}`;

  const stats = computeStats(calendarData);
  document.getElementById('statsRow').style.display = 'grid';
  document.getElementById('statElapsed').textContent = stats.elapsed;
  document.getElementById('statScored').textContent = stats.scored;
  document.getElementById('statAvg').textContent = stats.avg;
  document.getElementById('statRemaining').textContent = stats.remaining;

  document.getElementById('legendArea').style.display = 'block';

  renderCalendar(calendarData);
  renderOverridesUI(calendarData);
}

function toggleOverrides() {
  const panel = document.getElementById('overridesPanel');
  const link = document.getElementById('overridesToggle');
  if (panel.classList.contains('open')) {
    panel.classList.remove('open');
    link.textContent = '◎ Adjust Individual Semester Dates';
  } else {
    panel.classList.add('open');
    link.textContent = '✕ Close Date Overrides';
    if (calendarData) renderOverridesUI(calendarData);
  }
}

function saveOverrides() {
  if (!calendarData) return;
  for (const yr of calendarData) {
    for (const p of yr.periods) {
      const sEl = document.getElementById(`ov-${p.key}-start`);
      const eEl = document.getElementById(`ov-${p.key}-end`);
      if (sEl && eEl && sEl.value && eEl.value) {
        state.overrides[p.key] = {
          start: new Date(sEl.value),
          end: new Date(eEl.value)
        };
      }
    }
  }
  calendarData = buildStructure(state.startDate);
  save();
  render();
}

function clearOverrides() {
  state.overrides = {};
  if (state.startDate) {
    calendarData = buildStructure(state.startDate);
    save();
    render();
    renderOverridesUI(calendarData);
  }
}

function openModal(period, weekIndex, wDate, scoreKey) {
  modalCtx = { period, weekIndex, wDate, scoreKey };
  const weekNum = weekIndex + 1;
  document.getElementById('modalTitle').textContent = `${period.name} — Week ${weekNum}`;
  const yr = calendarData.find(y => y.periods.includes(period));
  document.getElementById('modalMeta').textContent =
    `Year ${yr ? yr.year : '?'} · ${fmtDateShort(wDate)}`;
  document.getElementById('scoreModal').classList.add('open');
}

function closeModal() {
  document.getElementById('scoreModal').classList.remove('open');
  modalCtx = null;
}

function submitScore(score) {
  if (!modalCtx) return;
  state.scores[modalCtx.scoreKey] = score;
  save();
  render();
  closeModal();
}

function clearScore() {
  if (!modalCtx) return;
  delete state.scores[modalCtx.scoreKey];
  save();
  render();
  closeModal();
}

document.getElementById('scoreModal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

load();
if (state.startDate) {
  document.getElementById('startDate').value = state.startDate.toISOString().split('T')[0];
  calendarData = buildStructure(state.startDate);
  render();
}
