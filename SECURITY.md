# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x.x   | Yes       |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via [GitHub Security Advisories](https://github.com/312-dev/scrolly/security/advisories/new). This ensures that sensitive vulnerability information is handled privately and responsibly.

### What to Include

When reporting a vulnerability, please provide:

- A description of the vulnerability and its potential impact
- Detailed steps to reproduce the issue
- Any proof-of-concept code or screenshots
- The affected version(s) and configuration
- Your suggested fix or mitigation, if any

## Vulnerability Disclosure Policy

We follow a coordinated vulnerability disclosure process:

1. **Reporter submits** a vulnerability via [GitHub Security Advisories](https://github.com/312-dev/scrolly/security/advisories/new)
2. **We acknowledge** receipt within 48 hours
3. **We investigate** and validate the report within 7 days
4. **We develop and test** a fix for confirmed vulnerabilities
5. **We release** a patch and publish a security advisory
6. **Public disclosure** occurs after the fix is released

We ask that reporters refrain from publicly disclosing the vulnerability until a fix has been released.

## Response Timeline

| Action | Timeframe |
|--------|-----------|
| Acknowledgement of report | Within 48 hours |
| Initial assessment and validation | Within 7 days |
| Status update to reporter | Every 7 days until resolved |
| Patch development and release | Within 30 days for critical/high severity |
| Public disclosure | After patch release |

If a vulnerability is accepted, we will work with the reporter to coordinate disclosure timing. If a vulnerability is declined (e.g., out of scope or not reproducible), we will explain our reasoning.

## Security Practices

### Authentication & Sessions
- Session-based authentication with signed cookies
- SMS verification via Twilio for phone-based auth
- CSRF protection via SvelteKit origin checking

### Data Protection
- SQLite database stored in a Docker volume (not exposed)
- Environment secrets never committed to version control
- `.env.example` provided with placeholder values only

### Infrastructure
- Multi-stage Docker builds with minimal runtime image
- Health check endpoint at `/api/health`
- Non-root process execution in containers

### CI/CD Security
- **CodeQL SAST** — Static analysis on every PR and push
- **Semgrep** — Additional static analysis with community rules
- **Gitleaks** — Secret detection across full git history
- **npm audit** — Dependency vulnerability scanning
- **Trivy** — Container image scanning (HIGH/CRITICAL severity)
- **OWASP ZAP** — Dynamic application security testing (DAST)
- **OpenSSF Scorecard** — Supply chain security assessment
- **Dependabot** — Automated dependency updates (npm and GitHub Actions)
- **GitHub Actions pinned by SHA** — All workflow actions pinned to commit hashes

### Self-Hosting Security Checklist
- [ ] Generate a strong `SESSION_SECRET` (32+ random bytes)
- [ ] Use HTTPS in production (reverse proxy recommended)
- [ ] Set `PUBLIC_APP_URL` to your actual domain
- [ ] Restrict Twilio webhook URLs to your domain
- [ ] Keep Docker images updated
- [ ] Monitor container logs for anomalies
