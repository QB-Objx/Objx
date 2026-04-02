const installPresets = {
  sqlite: {
    title: 'SQLite happy path',
    code: `npm install @qbobjx/core @qbobjx/sql-engine @qbobjx/sqlite-driver @qbobjx/plugins`,
    note: 'Use createSqliteSession(...) and createSqliteDriver(...) for local apps, demos, and embedded deployments.',
  },
  postgres: {
    title: 'Postgres runtime',
    code: `npm install @qbobjx/core @qbobjx/sql-engine @qbobjx/postgres-driver @qbobjx/plugins pg`,
    note: 'Bring your own pg Pool or Client. The session API stays aligned with the other official drivers.',
  },
  mysql: {
    title: 'MySQL runtime',
    code: `npm install @qbobjx/core @qbobjx/sql-engine @qbobjx/mysql-driver @qbobjx/plugins mysql2`,
    note: 'The MySQL driver works with mysql2/promise pools and clients.',
  },
  nestjs: {
    title: 'NestJS integration',
    code: `npm install @qbobjx/nestjs @nestjs/common @nestjs/core @nestjs/platform-express rxjs reflect-metadata`,
    note: 'Add your chosen runtime packages too, for example @qbobjx/core + @qbobjx/sqlite-driver + @qbobjx/plugins.',
  },
  tooling: {
    title: 'Codegen and operational tooling',
    code: `npm install -D @qbobjx/codegen`,
    note: 'Use this for introspection, starter templates, migrations, seeds, and generated models.',
  },
};

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

function initializeDocsPage() {
  const installTitle = document.querySelector('[data-install-title]');
  const installCode = document.querySelector('[data-install-code]');
  const installNote = document.querySelector('[data-install-note]');
  const installButtons = document.querySelectorAll('[data-install-target]');

  function setInstallPreset(key) {
    const preset = installPresets[key];

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

  for (const button of installButtons) {
    button.addEventListener('click', () => {
      const key = button.dataset.installTarget;

      if (!key) {
        return;
      }

      setInstallPreset(key);
    });
  }

  setInstallPreset('sqlite');

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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDocsPage, { once: true });
} else {
  initializeDocsPage();
}
