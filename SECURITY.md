# Security Policy

## Supported versions

The current stable `1.0.x` release line receives security fixes. Older development and prerelease builds should be upgraded before reporting a problem.

## Reporting a vulnerability

Please do not publish credentials, private projects, exploit details or other sensitive material in a public issue. Send a private report to `46168745@qq.com` with:

- the affected Qiansi-Canvas version and operating system;
- a minimal reproduction and the expected security boundary;
- whether the issue is reachable from loopback, a trusted LAN client, a plugin or an external provider;
- any temporary mitigation you have confirmed.

The maintainer will acknowledge the report when possible, assess the affected versions and coordinate disclosure after a fix or mitigation is available. This project does not promise a fixed response time.

## Deployment boundary

Qiansi-Canvas is a local desktop workbench. Do not expose TCP port 2895 directly to the public Internet. LAN collaboration is intended only for trusted private networks; API keys, CLI operations, updates and host maintenance remain host-only capabilities. Keep `data/`, environment files and credentials out of bug reports and source commits.
