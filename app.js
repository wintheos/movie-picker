'use strict';

/* ===== Состояние ===== */
const app = document.getElementById('app');
const restartLink = document.getElementById('restart-link');
let DATA = null; // { filters, movies }

/* ===== Утилиты ===== */
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function movieById(id) {
  return DATA.movies.find(m => m.id === Number(id));
}

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// decorative — для постеров-украшений внутри ссылки с текстом (alt пустой)
function posterImg(movie, cls = '', { lazy = false, decorative = false } = {}) {
  const alt = decorative ? '' : `Постер: ${esc(movie.title)}`;
  return `<img class="${cls}" src="${esc(movie.poster)}" alt="${alt}"
    width="400" height="600"${lazy ? ' loading="lazy"' : ''} decoding="async">`;
}

/* ===== Иконки (inline SVG) ===== */
const svg = (d, size = 20, extra = '') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"
    fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${extra}>${d}</svg>`;

const ICONS = {
  arrowRight: (s = 18) => svg('<path d="M5 12h14M13 6l6 6-6 6"/>', s),
  arrowLeft: (s = 18) => svg('<path d="M19 12H5M11 6l-6 6 6 6"/>', s),
  external: (s = 16) => svg('<path d="M7 17 17 7M8 7h9v9"/>', s),
  shuffle: (s = 20) => svg('<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>', s),
  play: (s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z" fill="currentColor"/></svg>`,
  check: (s = 20) => svg('<path d="M4.5 12.5 9.5 17.5 19.5 7"/>', s, ' stroke-width="2.5"'),
  chevron: (s = 16) => svg('<path d="m6 9 6 6 6-6"/>', s),
  star: (s = 14) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m12 2.5 2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" fill="currentColor"/></svg>`
};

/* Тексты и постеры карточек настроений (подписи — из filters.mood) */
const MOOD_CARDS = {
  relax: { text: 'Что-то тёплое и лёгкое, чтобы выдохнуть после дня', posters: [3, 6, 9] },
  think: { text: 'Умное кино, о котором захочется поговорить после', posters: [4, 10, 8] },
  feel:  { text: 'Драма, которая задевает и остаётся с вами', posters: [5, 2, 7] }
};

/* ===== Роутинг ===== */
// #/  |  #/results?mood=&time=&who=  |  #/movie/3?mood=&time=&who=
function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  const qs = new URLSearchParams(query);
  const params = {};
  ['mood', 'time', 'who'].forEach(k => {
    const v = qs.get(k);
    if (v) params[k] = v;
  });

  if (path === '/' || path === '') return { name: 'home', params };
  if (path === '/results') return { name: 'results', params };
  const m = path.match(/^\/movie\/(\d+)\/?$/);
  if (m) return { name: 'movie', id: Number(m[1]), params };
  return null;
}

// Оставляет только валидные значения фильтров (по данным из filters)
function cleanParams(params) {
  const f = DATA.filters;
  const out = {};
  if (params.mood && f.mood.some(o => o.id === params.mood)) out.mood = params.mood;
  if (params.time && params.time !== 'any' && f.time.some(o => o.id === params.time)) out.time = params.time;
  if (params.who && f.withWhom.some(o => o.id === params.who)) out.who = params.who;
  return out;
}

function queryString(params) {
  const qs = new URLSearchParams();
  ['mood', 'time', 'who'].forEach(k => { if (params[k]) qs.set(k, params[k]); });
  const s = qs.toString();
  return s ? '?' + s : '';
}

function resultsHref(params) { return '#/results' + queryString(params); }
function movieHref(id, params) { return '#/movie/' + id + queryString(params); }

function go(hash) { location.hash = hash; }

let currentScreen = null; // 'home' | 'results' | 'movie/3' — чтобы не прокручивать вверх при смене фильтров

function router() {
  if (!DATA) return;
  const route = parseHash();
  if (!route) { location.replace('#/'); return; }

  const params = cleanParams(route.params);
  restartLink.hidden = route.name !== 'results';
  openDropdown = null;

  if (route.name === 'home') renderHome();
  else if (route.name === 'results') renderResults(params);
  else if (route.name === 'movie') {
    const movie = movieById(route.id);
    if (!movie) { location.replace('#/'); return; }
    renderMovie(movie, params);
  }

  const screen = route.name === 'movie' ? 'movie/' + route.id : route.name;
  if (screen !== currentScreen) window.scrollTo(0, 0);
  currentScreen = screen;
}

/* ===== Экраны ===== */
// Задержка для анимации появления (мс) — элементы проявляются по очереди сверху вниз
const delay = ms => `style="--d:${ms}ms"`;

// Заголовок, который проявляется по словам. Возвращает HTML и момент, когда появится последнее слово.
function revealWords(text, start, step) {
  const words = text.split(' ');
  return {
    html: words.map((w, i) => `<span class="reveal reveal--word" ${delay(start + i * step)}>${esc(w)}</span>`).join(' '),
    end: start + (words.length - 1) * step
  };
}

function renderHome() {
  document.title = 'Вечером — что посмотреть сегодня';

  const title = revealWords('Какое настроение сегодня?', 80, 70).html;

  const cards = DATA.filters.mood.map((o, i) => {
    const cfg = MOOD_CARDS[o.id] || { text: '', posters: [] };
    const [left, center, right] = cfg.posters.map(movieById);
    const fan = [
      left && posterImg(left, 'fan__left', { decorative: true }),
      right && posterImg(right, 'fan__right', { decorative: true }),
      center && posterImg(center, 'fan__center', { decorative: true })
    ].filter(Boolean).join('');
    return `<li class="reveal" ${delay(460 + i * 90)}>
      <a class="mood-card" href="${resultsHref({ mood: o.id })}">
        <div class="fan" aria-hidden="true">${fan}</div>
        <h2 class="mood-card__title">${esc(o.label)}</h2>
        ${cfg.text ? `<p class="mood-card__text">${esc(cfg.text)}</p>` : ''}
        <span class="mood-card__cta">Показать подборку ${ICONS.arrowRight()}</span>
      </a>
    </li>`;
  }).join('');

  app.innerHTML = `<section class="home">
    <div class="home__intro">
      <p class="eyebrow reveal" ${delay(0)}>Добрый вечер</p>
      <h1 class="home__title">${title}</h1>
      <p class="home__lead reveal" ${delay(360)}>Выберите одно — подборка появится сразу. Время и компанию можно уточнить потом.</p>
    </div>
    <ul class="moods">${cards}</ul>
    <div class="home__random reveal" ${delay(780)}>
      <p>Не хочется выбирать?</p>
      <button type="button" class="btn btn--secondary" data-random="all">${ICONS.shuffle()} Выбрать за меня</button>
    </div>
  </section>`;
}

/* ===== Подбор ===== */
const isPhone = window.matchMedia('(max-width: 720px)');

function timeGroup(duration) {
  const g = DATA.filters.time.find(o => o.id !== 'any' && duration >= o.min && duration <= o.max);
  return g ? g.id : null;
}

// Мягкое ранжирование: k — сколько выбранных фильтров совпало, N — сколько выбрано
function rankMovies(params) {
  const N = ['mood', 'time', 'who'].filter(k => params[k]).length;
  const scored = DATA.movies.map((movie, index) => {
    let k = 0;
    if (params.mood && movie.moods.includes(params.mood)) k++;
    if (params.time && timeGroup(movie.duration) === params.time) k++;
    if (params.who && movie.withWhom.includes(params.who)) k++;
    return { movie, k, index };
  });
  scored.sort((a, b) => b.k - a.k || b.movie.rating - a.movie.rating || a.index - b.index);

  const max = isPhone.matches ? 6 : 5;
  const full = N > 0 ? scored.filter(s => s.k === N).length : max;
  const count = Math.min(Math.max(full, 4), max);
  return { N, items: scored.slice(0, count) };
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

function hintText(N, items) {
  if (N === 0) return 'Выберите уточнения — подборка подстроится.';
  if (items.every(s => s.k === N)) return 'Все фильмы совпали с вашим выбором.';
  if (N === 1) return 'Лучшие совпадения — первыми. Остальные подобраны по рейтингу.';
  return `Лучшие совпадения — первыми. Пометка «${N - 1} из ${N}» значит, что совпали не все пункты.`;
}

function formatRating(r) { return Number(r).toFixed(1); }

function metaLine(movie) {
  return `${movie.year} · ${movie.duration} мин · <span class="star">${ICONS.star(13)}</span>${formatRating(movie.rating)}`;
}

/* ===== Дропдауны фильтров ===== */
// Подписи групп; пункты — из DATA.filters
const FILTER_GROUPS = [
  { key: 'mood', title: 'Настроение', source: 'mood', anyLabel: 'Любое' },
  { key: 'time', title: 'Время', source: 'time', anyLabel: null },
  { key: 'who', title: 'С кем', source: 'withWhom', anyLabel: 'Не важно' }
];

function groupOptions(group) {
  const list = DATA.filters[group.source];
  const any = list.find(o => o.id === 'any');
  const options = list.filter(o => o.id !== 'any').map(o => ({ id: o.id, label: o.label }));
  options.push({ id: '', label: any ? any.label : group.anyLabel });
  return options;
}

let openDropdown = null; // key открытого списка
let focusAfterRender = null; // key кнопки, которой вернуть фокус после перерисовки

function dropdownHtml(group, params) {
  const options = groupOptions(group);
  const value = params[group.key] || '';
  const current = options.find(o => o.id === value) || options[options.length - 1];
  const listId = `dd-list-${group.key}`;
  return `<div class="dd" data-key="${group.key}">
    <button type="button" class="dd__btn${value ? ' is-set' : ''}" id="dd-btn-${group.key}"
      aria-haspopup="listbox" aria-expanded="false" aria-controls="${listId}">
      <span class="dd__label">${esc(group.title)}<span class="dd__chev">${ICONS.chevron(14)}</span></span>
      <span class="dd__value">${esc(current.label)}</span>
    </button>
    <div class="dd__list" id="${listId}" role="listbox" aria-labelledby="dd-btn-${group.key}" hidden>
      ${options.map(o => {
        const sel = o.id === value;
        return `<button type="button" class="dd__opt${sel ? ' is-selected' : ''}" role="option"
          aria-selected="${sel}" data-value="${o.id}">
          <span>${esc(o.label)}</span>${sel ? ICONS.check(18) : ''}
        </button>`;
      }).join('')}
    </div>
  </div>`;
}

function setDropdown(key, { focusOption = false } = {}) {
  app.querySelectorAll('.dd').forEach(dd => {
    const open = dd.dataset.key === key;
    dd.classList.toggle('is-open', open);
    dd.querySelector('.dd__btn').setAttribute('aria-expanded', String(open));
    dd.querySelector('.dd__list').hidden = !open;
    if (open && focusOption) {
      (dd.querySelector('.dd__opt.is-selected') || dd.querySelector('.dd__opt')).focus();
    }
  });
  openDropdown = key;
}

function closeDropdown(returnFocus = false) {
  const key = openDropdown;
  if (!key) return;
  setDropdown(null);
  if (returnFocus) document.getElementById('dd-btn-' + key)?.focus();
}

function currentParams() {
  const route = parseHash();
  return route ? cleanParams(route.params) : {};
}

function setFilter(key, value) {
  const params = { ...currentParams() };
  if (value) params[key] = value; else delete params[key];
  focusAfterRender = key;
  go(resultsHref(params));
}

/* ===== Экран подборки ===== */
function renderResults(params) {
  document.title = 'Подборка на вечер — Вечером';
  const { N, items } = rankMovies(params);

  const cards = items.map(({ movie, k }, i) => {
    let badge = '';
    if (N > 0 && k > 0) {
      badge = `<span class="badge ${k === N ? 'badge--full' : 'badge--part'}">${k} из ${N}</span>`;
    }
    return `<li>
      <a class="card" href="${movieHref(movie.id, params)}">
        <div class="card__poster">${posterImg(movie, '', { lazy: i >= 2 })}${badge}</div>
        <h3 class="card__title">${esc(movie.title)}</h3>
        <p class="card__meta">${metaLine(movie)}</p>
        <p class="card__hook">${esc(movie.hook)}</p>
      </a>
    </li>`;
  }).join('');

  const reset = cls => N > 0
    ? `<button type="button" class="reset ${cls}" data-reset>Сбросить</button>` : '';

  app.innerHTML = `<section class="results">
    <h1 class="results__title">Вот что подойдёт сегодня</h1>

    <div class="refine" role="group" aria-labelledby="refine-label">
      <div class="refine__head">
        <span class="refine__label" id="refine-label">Уточнить</span>
        ${reset('reset--phone')}
      </div>
      <div class="refine__row">
        ${FILTER_GROUPS.map(g => dropdownHtml(g, params)).join('')}
        ${reset('reset--desktop')}
      </div>
    </div>

    <div class="results__bar">
      <div class="results__summary">
        <h2 class="results__count">${items.length} ${plural(items.length, 'фильм', 'фильма', 'фильмов')}</h2>
        <p class="results__hint" aria-live="polite">${hintText(N, items)}</p>
      </div>
      <button type="button" class="btn btn--primary results__random"
        data-random="${items.map(s => s.movie.id).join(',')}">${ICONS.shuffle()} Выбрать за меня</button>
    </div>

    <ul class="grid">${cards}</ul>
  </section>`;

  if (focusAfterRender) {
    document.getElementById('dd-btn-' + focusAfterRender)?.focus();
    focusAfterRender = null;
  }
}

function renderMovie(movie, params) {
  document.title = `${movie.title} (${movie.year}) — Вечером`;
  const back = resultsHref(params);

  const sub = [];
  if (movie.titleOriginal && movie.titleOriginal !== movie.title) sub.push(esc(movie.titleOriginal));
  if (movie.director?.length) sub.push('реж. ' + movie.director.map(esc).join(', '));

  const similar = (movie.similar || []).map(movieById).filter(Boolean).map(m => `<li>
      <a class="card card--similar" href="${movieHref(m.id, params)}">
        <div class="card__poster">${posterImg(m, '', { lazy: true })}</div>
        <h3 class="card__title">${esc(m.title)}</h3>
        <p class="card__meta">${metaLine(m)}</p>
        <p class="card__hook">${esc(m.hook)}</p>
      </a>
    </li>`).join('');

  // Появление: постер и название по словам, затем блоки информации сверху вниз
  const title = revealWords(movie.title, 120, 60);
  const t = title.end + 100;

  const link = (l, cls = '') => l?.url
    ? `<a class="movie__link ${cls}" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)} ${ICONS.external()}<span class="visually-hidden"> (откроется в новой вкладке)</span></a>`
    : '';

  app.innerHTML = `<article class="movie">
    <a class="back reveal" ${delay(0)} href="${back}">${ICONS.arrowLeft()} К подборке</a>

    <div class="movie__layout">
      <div class="movie__poster reveal reveal--poster" ${delay(60)}>${posterImg(movie)}</div>

      <div class="movie__info">
        <h1 class="movie__title">${title.html}</h1>
        ${sub.length ? `<p class="movie__sub reveal" ${delay(t)}>${sub.join(' · ')}</p>` : ''}

        <ul class="pills reveal" ${delay(t + 70)}>
          <li class="pill">${movie.year}</li>
          <li class="pill">${movie.duration} ${plural(movie.duration, 'минута', 'минуты', 'минут')}</li>
          <li class="pill pill--accent">${ICONS.star(15)} ${formatRating(movie.rating)} ${esc(movie.ratingSource || '')}</li>
          ${movie.age ? `<li class="pill"><span class="visually-hidden">Возраст: </span>${esc(movie.age)}</li>` : ''}
        </ul>

        ${movie.genres?.length ? `<p class="movie__genres reveal" ${delay(t + 140)}>${movie.genres.map(esc).join(' · ')}</p>` : ''}
        <p class="movie__desc reveal" ${delay(t + 210)}>${esc(movie.description)}</p>

        ${movie.whyToday ? `<div class="why reveal" ${delay(t + 280)}>
          <p class="why__label">Почему подойдёт сегодня</p>
          <p class="why__text">${esc(movie.whyToday)}</p>
        </div>` : ''}

        <div class="movie__actions reveal" ${delay(t + 350)}>
          <button type="button" class="btn btn--primary" data-watch>${ICONS.play()} Смотрю сегодня</button>
          <a class="btn btn--secondary" href="${back}">Показать другой вариант</a>
        </div>
        <p class="visually-hidden" aria-live="polite" id="watch-status"></p>

        <div class="movie__links reveal" ${delay(t + 420)}>
          ${link(movie.trailer)}
          ${link(movie.whereToWatch, 'movie__link--where')}
        </div>
      </div>
    </div>

    ${similar ? `<section class="similar reveal" ${delay(t + 520)} aria-labelledby="similar-title">
      <h2 class="similar__title" id="similar-title">Похожие фильмы</h2>
      <ul class="similar__list">${similar}</ul>
    </section>` : ''}
  </article>`;
}

function renderError() {
  document.title = 'Ошибка загрузки — Вечером';
  app.innerHTML = `<div class="error" role="alert">
    <h1>Не удалось загрузить фильмы</h1>
    <p>Проверьте подключение к интернету и обновите страницу.</p>
    <button type="button" class="btn btn--secondary" onclick="location.reload()">Обновить страницу</button>
  </div>`;
}

/* ===== События ===== */
// «Выбрать за меня»: на приветствии — из всех фильмов, на подборке — из текущего набора
app.addEventListener('click', e => {
  const btn = e.target.closest('[data-random]');
  if (!btn) return;
  const route = parseHash() || { params: {} };
  const params = cleanParams(route.params);
  const pool = btn.dataset.random === 'all'
    ? DATA.movies
    : btn.dataset.random.split(',').map(movieById).filter(Boolean);
  const movie = randomItem(pool.length ? pool : DATA.movies);
  go(movieHref(movie.id, params));
});

// Дропдауны: открыть/закрыть, выбрать пункт, сбросить
app.addEventListener('click', e => {
  const btn = e.target.closest('.dd__btn');
  if (btn) {
    const key = btn.closest('.dd').dataset.key;
    if (openDropdown === key) closeDropdown();
    // detail === 0 — нажатие с клавиатуры: переводим фокус в список
    else setDropdown(key, { focusOption: e.detail === 0 });
    return;
  }
  const opt = e.target.closest('.dd__opt');
  if (opt) {
    const key = opt.closest('.dd').dataset.key;
    closeDropdown();
    setFilter(key, opt.dataset.value);
    return;
  }
  if (e.target.closest('[data-reset]')) {
    focusAfterRender = null;
    go('#/results');
  }
});

// Клик вне открытого списка закрывает его
document.addEventListener('click', e => {
  if (openDropdown && !e.target.closest('.dd')) closeDropdown();
});

// Клавиатура: Esc закрывает, стрелки ходят по пунктам
document.addEventListener('keydown', e => {
  if (!openDropdown) return;
  if (e.key === 'Escape') { e.preventDefault(); closeDropdown(true); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const opts = [...app.querySelectorAll(`.dd[data-key="${openDropdown}"] .dd__opt`)];
    const i = opts.indexOf(document.activeElement);
    const next = e.key === 'ArrowDown'
      ? opts[(i + 1) % opts.length]
      : opts[(i - 1 + opts.length) % opts.length];
    e.preventDefault();
    next.focus();
  }
});

// Фокус ушёл из открытого списка (Tab) — закрываем
app.addEventListener('focusout', e => {
  if (!openDropdown) return;
  const dd = app.querySelector(`.dd[data-key="${openDropdown}"]`);
  if (dd && e.relatedTarget && !dd.contains(e.relatedTarget)) closeDropdown();
});

// Количество карточек зависит от ширины (5 / 6) — пересчитываем при смене брейкпоинта
isPhone.addEventListener('change', () => {
  if (parseHash()?.name === 'results') router();
});

// «Смотрю сегодня»: подтверждение + подсветка «Где смотреть». Ничего не сохраняем.
app.addEventListener('click', e => {
  const btn = e.target.closest('[data-watch]');
  if (!btn || btn.classList.contains('is-done')) return;
  btn.classList.add('is-done');
  btn.setAttribute('aria-disabled', 'true');
  btn.innerHTML = `${ICONS.check()} Отличный выбор. Приятного просмотра`;
  app.querySelector('.movie__link--where')?.classList.add('is-highlight');
  const status = document.getElementById('watch-status');
  if (status) status.textContent = 'Отличный выбор. Приятного просмотра. Ссылка «Где смотреть» — ниже.';
});

/* ===== Старт ===== */
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.addEventListener('hashchange', router);

fetch('movies.json')
  .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then(data => {
    if (!data || !Array.isArray(data.movies) || !data.filters) throw new Error('Bad data');
    DATA = data;
    router();
  })
  .catch(renderError);
