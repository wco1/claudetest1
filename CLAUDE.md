# ugcgo.ai — AI UGC Marketplace

## Project Overview
ugcgo.ai is "Fiverr for AI UGC" — a marketplace connecting brands with AI-generated user content creators. Built as a web platform with landing page, API backend, and PDF generation tools.

## Tech Stack
- **Frontend:** HTML/CSS/JS (vanilla, no frameworks)
- **Backend:** Python (Flask planned), Node.js utilities
- **PDF Generation:** fpdf2 (Python)
- **Hosting:** GitHub Pages (static), future: dedicated hosting
- **CI/CD:** GitHub Actions

## Commands
- Generate PDF: `python3 generate_pdf.py`
- Install deps: `pip install fpdf2 cffi`
- Deploy static: `surge ./public --domain ugcgo.surge.sh`

## Code Style
- Язык комментариев и документации: русский
- HTML/CSS: 2-space indentation
- Python: PEP 8, snake_case
- JS: camelCase for functions, PascalCase for classes
- Файлы UTF-8, LF line endings

## Architecture
```
/ (root)
├── CLAUDE.md              # This file
├── .claude/               # Claude Code config
│   ├── settings.json      # Hooks & permissions
│   ├── hooks/             # Automation scripts
│   ├── agents/            # Custom subagents
│   ├── rules/             # Path-specific rules
│   └── skills/            # Custom skills
├── generate_pdf.py        # PDF generation
├── roadmap.html           # Launch presentation (GitHub Pages)
└── LAUNCH_ROADMAP_UGCGO.md
```

## IMPORTANT Rules
- **Всё проверять досконально перед отправкой** — никогда не отправлять пользователю непроверенные ссылки или данные
- Перед отправкой любой ссылки — проверить что она реально работает (curl/fetch)
- Не создавать файлы без необходимости
- Коммитить только по запросу пользователя
- Репозиторий публичный — НИКОГДА не коммитить секреты, токены, .env файлы
