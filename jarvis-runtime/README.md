# Jarvis Runtime

This directory is the only filesystem root Jarvis is allowed to touch while the cross-platform safety system is enabled.

- `DRY_RUN` is enabled.
- secrets are disabled.
- execution, write, and network capabilities are disabled by default.

No fake operational data should be stored here.
