# Security Policy

Vooya is currently in public beta. Only the latest published prerelease is
eligible for security fixes. Install supported packages from the npm `beta`
channel; the `latest` tag remains reserved for a future stable release.

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials, private
paths, or a working proof of concept.

Prefer GitHub's private vulnerability reporting flow from the repository's
**Security** tab. If that option is unavailable, open a short public issue that
asks for a private maintainer contact and contains no sensitive technical
details.

Please include, privately:

- the affected package and version;
- the environment and minimal reproduction conditions;
- the security impact;
- whether the issue is already public; and
- a suggested mitigation, if known.

We will acknowledge a usable report as soon as practical, validate the affected
surface, and coordinate disclosure after a fix or mitigation is available.

## Scope

Useful reports include vulnerabilities in published Vooya packages, generated
Rust/WASM build behavior, package or artifact integrity, development-server
exposure, and unsafe handling of user-controlled `.voo` input.

Ordinary build failures, unsupported Rust crates, and unverified performance
claims should use the normal bug report template instead.
