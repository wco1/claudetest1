---
paths:
  - "**/*.py"
  - "**/*.js"
  - "**/*.ts"
---

# Security Rules
- NEVER hardcode secrets, API keys, tokens, or passwords
- Use environment variables for all sensitive data
- Sanitize all user inputs before processing
- Use parameterized queries for any database operations
- Validate file paths to prevent directory traversal
- Set CORS headers explicitly, never use wildcard in production
