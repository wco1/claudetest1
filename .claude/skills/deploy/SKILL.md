---
name: deploy
description: Deploy static files to GitHub Pages
---

# Deploy to GitHub Pages

Deploy files to the `main` branch for GitHub Pages hosting.

## Steps
1. Check which files need to be deployed
2. Verify files work locally (syntax check HTML/CSS/JS)
3. Push to main branch using `mcp__github__push_files` or `gh` CLI
4. Verify deployment status: `gh api repos/wco1/claudetest1/pages`
5. Wait for build to complete
6. Verify the live URL returns 200: `curl -s -o /dev/null -w "%{http_code}" https://wco1.github.io/claudetest1/<filename>`
7. Only after verification — share the link with the user

## IMPORTANT
- ВСЕГДА проверять ссылку перед отправкой пользователю
- Если проверка не проходит — не отправлять, а разобраться в причине
