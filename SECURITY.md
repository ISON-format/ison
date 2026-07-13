# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Package | Version | Supported |
| ------- | ------- | --------- |
| ison-parser (JS) | 1.x | Yes |
| ison-ts | 1.x | Yes |
| ison-py | 1.x | Yes |
| ison-rs | 1.x | Yes |
| ison-go | 1.x | Yes |
| ison-cpp | 1.x | Yes |
| ison-cli | 1.x | Yes |

## Reporting a Vulnerability

If you discover a security vulnerability within ISON, please report it by:

1. **DO NOT** open a public GitHub issue for security vulnerabilities
2. Open a private security advisory at: https://github.com/ISON-format/ison/security/advisories/new
3. Or email the maintainers directly with details

Please include the following in your report:

- Type of vulnerability
- Full paths of source file(s) related to the vulnerability
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

## Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Resolution**: Dependent on complexity, typically within 30 days

## Security Best Practices

When using ISON in your applications:

1. **Validate Input**: Always validate ISON data from untrusted sources
2. **Limit Size**: Set reasonable limits on input size to prevent DoS
3. **Sanitize Output**: Sanitize data before rendering in web contexts
4. **Use Latest Versions**: Keep your ISON packages updated

## Disclosure Policy

When we receive a security bug report, we will:

1. Confirm the problem and determine affected versions
2. Audit code to find any similar problems
3. Prepare fixes for all supported versions
4. Release patches as soon as possible

Thank you for helping keep ISON and its users safe!
