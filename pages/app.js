const installPresets = {
  sqlite: {
    title: 'SQLite happy path',
    code: `npm install @qbobjx/core @qbobjx/sql-engine @qbobjx/sqlite-driver @qbobjx/plugins`,
    note: 'Use createSqliteSession(...) and createSqliteDriver(...) for local apps, demos, and embedded deployments.',
  },
  postgres: {
    title: 'Postgres runtime',
    code: `npm install @qbobjx/core @qbobjx/sql-engine @qbobjx/postgres-driver @qbobjx/plugins pg`,
    note: 'Bring your own pg Pool or Client. The session API stays aligned with the other official drivers, including transaction-scoped execution context settings for RLS.',
  },
  mysql: {
    title: 'MySQL runtime',
    code: `npm install @qbobjx/core @qbobjx/sql-engine @qbobjx/mysql-driver @qbobjx/plugins mysql2`,
    note: 'The MySQL driver works with mysql2/promise pools and clients.',
  },
  nestjs: {
    title: 'NestJS integration',
    code: `npm install @qbobjx/nestjs @nestjs/common @nestjs/core @nestjs/platform-express rxjs reflect-metadata`,
    note: 'Add your chosen runtime packages too, for example @qbobjx/core + @qbobjx/postgres-driver + @qbobjx/plugins.',
  },
  fullstack: {
    title: 'Fullstack Fetch integration',
    code: `npm install @qbobjx/fullstack`,
    note: 'Use this package in runtimes built on Web Fetch Request/Response contracts, together with your selected OBJX driver packages.',
  },
  tooling: {
    title: 'Codegen and operational tooling',
    code: `npm install -D @qbobjx/codegen`,
    note: 'Use this for introspection, starter templates, migrations, seeds, and generated models.',
  },
};

const benchmarkViews = {
  throughput: {
    kicker: 'Checked-in repo snapshot',
    title: 'Postgres field test against Knex, Sequelize, and TypeORM',
    note: 'Current benchmark snapshot from benchmarks/out/latest.json. Higher ops/s is better.',
    summary: [
      {
        label: 'Postgres wins',
        value: '4 / 6',
        body: 'OBJX leads in find-by-id, list-page, count-active, and the full transaction read/write scenario.',
      },
      {
        label: 'Read lead',
        value: '1.30x',
        body: 'On count-active, OBJX pushes 1246 ops/s vs roughly 956 ops/s for the next best field result.',
      },
      {
        label: 'TX lead',
        value: '1.91x',
        body: 'On transaction-read-write, OBJX nearly doubles the throughput of Sequelize in the same suite.',
      },
      {
        label: 'Narrative',
        value: 'Real runtime',
        body: 'The page uses benchmark results tracked in the repo, not a hand-written comparison table.',
      },
    ],
    rows: [
      {
        scenario: 'Find by id',
        highlight: 'OBJX #1, +6.1% over Knex',
        results: [
          { orm: 'OBJX', value: 1202.17, className: 'objx' },
          { orm: 'Knex', value: 1133.33, className: 'knex' },
          { orm: 'Sequelize', value: 1011.99, className: 'sequelize' },
          { orm: 'TypeORM', value: 717.71, className: 'typeorm' },
        ],
      },
      {
        scenario: 'Find with pets',
        highlight: 'Current gap. OBJX is still behind eager fanout leaders here.',
        results: [
          { orm: 'TypeORM', value: 836.64, className: 'typeorm' },
          { orm: 'Sequelize', value: 831.54, className: 'sequelize' },
          { orm: 'Knex', value: 607.94, className: 'knex' },
          { orm: 'OBJX', value: 598.42, className: 'objx' },
        ],
      },
      {
        scenario: 'List page',
        highlight: 'OBJX #1, +11.5% over Sequelize',
        results: [
          { orm: 'OBJX', value: 982.69, className: 'objx' },
          { orm: 'Sequelize', value: 881.02, className: 'sequelize' },
          { orm: 'Knex', value: 855.64, className: 'knex' },
          { orm: 'TypeORM', value: 819.85, className: 'typeorm' },
        ],
      },
      {
        scenario: 'Count active',
        highlight: 'OBJX #1, 1246 ops/s in the current field test',
        results: [
          { orm: 'OBJX', value: 1246.41, className: 'objx' },
          { orm: 'TypeORM', value: 956.96, className: 'typeorm' },
          { orm: 'Knex', value: 956.09, className: 'knex' },
          { orm: 'Sequelize', value: 540.27, className: 'sequelize' },
        ],
      },
      {
        scenario: 'Update active',
        highlight: 'Still chasing Knex in write hot paths.',
        results: [
          { orm: 'Knex', value: 496.82, className: 'knex' },
          { orm: 'TypeORM', value: 453.53, className: 'typeorm' },
          { orm: 'OBJX', value: 427.23, className: 'objx' },
          { orm: 'Sequelize', value: 359.73, className: 'sequelize' },
        ],
      },
      {
        scenario: 'Transaction read/write',
        highlight: 'OBJX #1, ahead of the field in the end-to-end transaction scenario.',
        results: [
          { orm: 'OBJX', value: 182.56, className: 'objx' },
          { orm: 'Knex', value: 168.56, className: 'knex' },
          { orm: 'TypeORM', value: 156.57, className: 'typeorm' },
          { orm: 'Sequelize', value: 95.31, className: 'sequelize' },
        ],
      },
    ],
  },
  transactions: {
    kicker: 'Dedicated transaction benchmark',
    title: 'Bare transaction overhead under PostgreSQL',
    note: 'This isolates begin/commit and begin/rollback so transaction machinery stays measurable.',
    summary: [
      {
        label: 'Begin + commit',
        value: '333.69 ops/s',
        body: 'OBJX is ahead of Knex and Sequelize in the current begin-commit measurement.',
      },
      {
        label: 'Begin + rollback',
        value: '306.93 ops/s',
        body: 'Rollback remains competitive, with room to chase the fastest raw transaction stacks.',
      },
      {
        label: 'What it proves',
        value: 'No black box',
        body: 'Transaction cost is explicitly benchmarked instead of hidden inside a broader CRUD chart.',
      },
      {
        label: 'Why this matters',
        value: 'RLS + context',
        body: 'OBJX can carry execution context, request values, and RLS bindings without giving up transaction visibility.',
      },
    ],
    rows: [
      {
        scenario: 'Begin + commit',
        highlight: 'OBJX leads Knex and Sequelize in this benchmark slice.',
        results: [
          { orm: 'TypeORM', value: 383.32, className: 'typeorm' },
          { orm: 'OBJX', value: 333.69, className: 'objx' },
          { orm: 'Knex', value: 324.99, className: 'knex' },
          { orm: 'Sequelize', value: 291.88, className: 'sequelize' },
        ],
      },
      {
        scenario: 'Begin + rollback',
        highlight: 'Rollback is measurable too, not hidden behind aggregate numbers.',
        results: [
          { orm: 'Sequelize', value: 392.22, className: 'sequelize' },
          { orm: 'TypeORM', value: 358.31, className: 'typeorm' },
          { orm: 'OBJX', value: 306.93, className: 'objx' },
          { orm: 'Knex', value: 249.56, className: 'knex' },
        ],
      },
    ],
  },
  compiler: {
    kicker: 'OBJX internal cost profile',
    title: 'Compiler cost stays tiny next to real database work',
    note: 'This view is OBJX-only on purpose: it shows where the runtime actually spends time.',
    summary: [
      {
        label: 'Compile cache hit',
        value: '93k ops/s',
        body: 'On list-page, a cached compile hit stays around 0.01075 ms/op in the current report.',
      },
      {
        label: 'Builder path',
        value: '672.92 ops/s',
        body: 'For find-by-id, executing the builder path lands almost on top of executing a precompiled query.',
      },
      {
        label: 'Practical read',
        value: 'DB dominates',
        body: 'The network/database cost is still much larger than the compile step in the measured scenarios.',
      },
      {
        label: 'Why it matters',
        value: 'Compiler stays cheap',
        body: 'This gives OBJX room to keep a richer query surface without hiding absurd runtime tax.',
      },
    ],
    rows: [
      {
        scenario: 'Find by id',
        highlight: 'Compile is tiny; real cost is still the database round trip.',
        results: [
          { orm: 'Compile cache hit', value: 42016.81, className: 'objx' },
          { orm: 'Compile no cache', value: 49875.31, className: 'knex' },
          { orm: 'Session execute precompiled', value: 671.7, className: 'sequelize' },
          { orm: 'Session execute builder', value: 672.92, className: 'typeorm' },
        ],
      },
      {
        scenario: 'List page',
        highlight: 'Cached compile is effectively noise next to query execution.',
        results: [
          { orm: 'Compile cache hit', value: 93023.26, className: 'objx' },
          { orm: 'Compile no cache', value: 57971.01, className: 'knex' },
          { orm: 'Session execute precompiled', value: 630.91, className: 'sequelize' },
          { orm: 'Session execute builder', value: 434.48, className: 'typeorm' },
        ],
      },
      {
        scenario: 'Update active',
        highlight: 'Write-path work is where runtime optimization matters most now.',
        results: [
          { orm: 'Compile cache hit', value: 85106.38, className: 'objx' },
          { orm: 'Compile no cache', value: 83682.01, className: 'knex' },
          { orm: 'Session execute precompiled', value: 134.36, className: 'sequelize' },
          { orm: 'Session execute builder', value: 193.04, className: 'typeorm' },
        ],
      },
    ],
  },
};

function formatOps(value) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

function formatBenchmarkStamp() {
  return 'Postgres snapshot • 2026-04-06';
}

async function copyText(targetId, button) {
  const target = document.getElementById(targetId);

  if (!target) {
    return;
  }

  await navigator.clipboard.writeText(target.textContent ?? '');

  const previous = button.textContent;
  button.textContent = 'Copied';
  button.classList.add('is-copied');

  window.setTimeout(() => {
    button.textContent = previous;
    button.classList.remove('is-copied');
  }, 1400);
}

function createMetricCard({ value, body }) {
  const card = document.createElement('article');
  card.className = 'metric-card';
  card.innerHTML = `<strong>${value}</strong><span>${body}</span>`;
  return card;
}

function createMiniRow(row) {
  const container = document.createElement('div');
  container.className = 'mini-row';
  const max = Math.max(...row.results.map((item) => item.value));
  const objx = row.results.find((item) => item.orm === 'OBJX') ?? row.results[0];
  const width = `${(objx.value / max) * 100}%`;

  container.innerHTML = `
    <div class="mini-row-top">
      <strong>${row.scenario}</strong>
      <span>${formatOps(objx.value)} ops/s</span>
    </div>
    <div class="mini-track">
      <div class="mini-fill" style="width:${width}"></div>
    </div>
  `;

  return container;
}

function createSummaryCard(item) {
  const article = document.createElement('article');
  article.className = 'summary-card';
  article.innerHTML = `
    <span class="label">${item.label}</span>
    <strong>${item.value}</strong>
    <p>${item.body}</p>
  `;
  return article;
}

function createScenarioCard(row) {
  const article = document.createElement('article');
  article.className = 'scenario-card';
  const max = Math.max(...row.results.map((item) => item.value));
  const leader = row.results[0];
  const barList = row.results
    .map((item) => {
      const width = `${(item.value / max) * 100}%`;
      return `
        <div class="bar-row">
          <div class="bar-row-top">
            <div class="bar-label">
              <span class="legend-dot" style="background:var(--${item.className === 'objx' ? 'objx' : item.className})"></span>
              <span>${item.orm}</span>
            </div>
            <span class="bar-value">${formatOps(item.value)} ops/s</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill bar-${item.className}" style="width:${width}"></div>
          </div>
        </div>
      `;
    })
    .join('');

  article.innerHTML = `
    <div class="scenario-head">
      <div>
        <h4>${row.scenario}</h4>
        <p>${row.highlight}</p>
      </div>
      <span class="scenario-badge">${leader.orm} leads</span>
    </div>
    <div class="bar-list">${barList}</div>
  `;

  return article;
}

function renderBenchmarkView(viewKey) {
  const view = benchmarkViews[viewKey];

  if (!view) {
    return;
  }

  const kicker = document.querySelector('[data-benchmark-kicker]');
  const title = document.querySelector('[data-benchmark-title]');
  const note = document.querySelector('[data-benchmark-note]');
  const summary = document.querySelector('[data-benchmark-summary]');
  const chart = document.querySelector('[data-benchmark-chart]');

  if (!kicker || !title || !note || !summary || !chart) {
    return;
  }

  kicker.textContent = view.kicker;
  title.textContent = view.title;
  note.textContent = view.note;

  summary.replaceChildren(...view.summary.map((item) => createSummaryCard(item)));
  chart.replaceChildren(...view.rows.map((row) => createScenarioCard(row)));

  for (const button of document.querySelectorAll('[data-benchmark-view]')) {
    const isActive = button.dataset.benchmarkView === viewKey;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
  }
}

function setInstallPreset(key) {
  const preset = installPresets[key];
  const installTitle = document.querySelector('[data-install-title]');
  const installCode = document.querySelector('[data-install-code]');
  const installNote = document.querySelector('[data-install-note]');
  const installButtons = document.querySelectorAll('[data-install-target]');

  if (!preset || !installTitle || !installCode || !installNote) {
    return;
  }

  installTitle.textContent = preset.title;
  installCode.textContent = preset.code;
  installNote.textContent = preset.note;

  for (const button of installButtons) {
    const isActive = button.dataset.installTarget === key;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
  }
}

function initializeHero() {
  const metricsTarget = document.querySelector('[data-hero-metrics]');
  const chartTarget = document.querySelector('[data-hero-chart]');
  const stampTarget = document.querySelector('[data-benchmark-stamp]');
  const heroWinCount = document.querySelector('[data-hero-win-count]');

  if (!metricsTarget || !chartTarget || !stampTarget || !heroWinCount) {
    return;
  }

  const throughput = benchmarkViews.throughput;
  heroWinCount.textContent = throughput.summary[0].value;
  stampTarget.textContent = formatBenchmarkStamp();

  metricsTarget.replaceChildren(
    createMetricCard({
      value: '4 / 6',
      body: 'Postgres scenarios won in the current repo snapshot.',
    }),
    createMetricCard({
      value: '1246',
      body: 'ops/s on count-active in the current field test.',
    }),
    createMetricCard({
      value: '182.56',
      body: 'ops/s on transaction read/write under PostgreSQL.',
    }),
    createMetricCard({
      value: '93k',
      body: 'compile-cache-hit ops/s on list-page in the internal cost profile.',
    }),
  );

  chartTarget.replaceChildren(
    ...throughput.rows
      .filter((row) =>
        ['Find by id', 'List page', 'Count active', 'Transaction read/write'].includes(row.scenario),
      )
      .map((row) => createMiniRow(row)),
  );
}

function initializeCopyButtons() {
  for (const button of document.querySelectorAll('[data-copy-target]')) {
    button.addEventListener('click', async () => {
      const targetId = button.getAttribute('data-copy-target');

      if (!targetId) {
        return;
      }

      try {
        await copyText(targetId, button);
      } catch {
        button.textContent = 'Copy failed';
      }
    });
  }
}

function initializeInteractions() {
  for (const button of document.querySelectorAll('[data-install-target]')) {
    button.addEventListener('click', () => {
      const key = button.dataset.installTarget;

      if (!key) {
        return;
      }

      setInstallPreset(key);
    });
  }

  for (const button of document.querySelectorAll('[data-benchmark-view]')) {
    button.addEventListener('click', () => {
      const key = button.dataset.benchmarkView;

      if (!key) {
        return;
      }

      renderBenchmarkView(key);
    });
  }
}

function initializeDocsPage() {
  initializeHero();
  renderBenchmarkView('throughput');
  setInstallPreset('sqlite');
  initializeCopyButtons();
  initializeInteractions();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDocsPage, { once: true });
} else {
  initializeDocsPage();
}
