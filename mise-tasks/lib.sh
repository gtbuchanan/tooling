# shellcheck shell=bash
# Sourced by file tasks (not run directly).

# Run a native binary, forwarding all args. bash resolves commands with the
# POSIX PATH, but under Git Bash a native Windows binary (and the children it
# spawns) needs a Windows-format PATH to find mise tools and System32. Resolve
# the binary first so the converted PATH can't break bash's own lookup; cygpath
# exists only on Windows, so other platforms run the binary unchanged.
run_native() {
  local bin
  bin="$(command -v "$1")"
  shift
  if command -v cygpath >/dev/null 2>&1; then
    PATH="$(cygpath -w -p "$PATH")" "$bin" "$@"
  else
    "$bin" "$@"
  fi
}
