#!/usr/bin/env bats
#
# Tests for actions/version-check/version-check.sh, the Version Check job of
# dependency-review.yml.
#
# Each test serves the script canned API responses through stub `gh`, `curl`
# and `date` on PATH, so it runs offline against a fixed clock. A response is
# keyed by the endpoint or URL the script asks for, and an endpoint with no
# response fails the way an unreachable API does.

# The clock the date stub answers from: 2023-11-14T22:13:20Z.
readonly NOW=1700000000
# Published well before the quarantine cutoff.
readonly OLD=2023-01-01T00:00:00Z
# Published a day and a bit before NOW: inside a 3-day quarantine.
readonly FRESH=2023-11-13T12:00:00Z

# Spawning a process is slow under Git Bash, so the helpers below build JSON
# with parameter expansion rather than jq, and the stubs are written once per
# file. They read RESPONSES when called, so each test still has its own.
setup_file() {
  local stubs="$BATS_FILE_TMPDIR/stubs"
  mkdir -p "$stubs"

  # gh api [--paginate] <endpoint> --jq <filter>: applies the filter to the
  # response the way gh does, printing strings raw.
  cat >"$stubs/gh" <<'STUB'
#!/usr/bin/env bash
shift # api
while [ $# -gt 0 ]; do
  case $1 in
  --paginate) ;;
  --jq) filter=$2; shift ;;
  *) endpoint=$1 ;;
  esac
  shift
done
response="$RESPONSES/${endpoint//[^A-Za-z0-9]/_}"
[ -f "$response" ] || { echo "gh: no response for $endpoint" >&2; exit 1; }
jq -r "$filter" "$response"
STUB

  # curl -sf <url>
  cat >"$stubs/curl" <<'STUB'
#!/usr/bin/env bash
for url; do :; done
response="$RESPONSES/${url//[^A-Za-z0-9]/_}"
[ -f "$response" ] || exit 22
cat "$response"
STUB

  # date -u -d '<n> days ago' +%s, counted back from NOW.
  cat >"$stubs/date" <<'STUB'
#!/usr/bin/env bash
for arg; do
  case $arg in *' days ago') days=${arg%% *} ;; esac
done
echo $((NOW - days * 86400))
STUB

  # A native jq.exe under Git Bash writes CRLF unless told otherwise, which
  # leaves a carriage return on every field the script reads back.
  case $(uname -s) in
  MINGW* | MSYS*)
    printf '#!/usr/bin/env bash\nexec %q --binary "$@"\n' "$(command -v jq)" >"$stubs/jq"
    ;;
  esac

  chmod +x "$stubs"/*
  export NOW PATH="$stubs:$PATH"
}

setup() {
  SCRIPT="$BATS_TEST_DIRNAME/../../../actions/version-check/version-check.sh"
  export RESPONSES="$BATS_TEST_TMPDIR/responses"
  mkdir "$RESPONSES"
  export BASE_SHA=base HEAD_SHA=head GITHUB_REPOSITORY=owner/repo
  export MIN_RELEASE_AGE_DAYS=3
  ADDED=()
  FILES=()
}

# --- responses --------------------------------------------------------------

respond() {
  printf '%s' "$2" >"$RESPONSES/${1//[^A-Za-z0-9]/_}"
}

# These set a variable through printf -v rather than printing, since a command
# substitution forks a subshell.

# Sets the variable named $1 to a JSON string holding $2, which carries no
# control characters.
str() {
  local s=${2//\\/\\\\}
  printf -v "$1" '"%s"' "${s//\"/\\\"}"
}

# Sets the variable named $1 to a JSON array of the remaining arguments.
array() {
  local IFS=,
  printf -v "$1" '[%s]' "${*:2}"
}

# Reports a dependency the dependency graph lists as added by the PR.
added() {
  local e n v
  str e "$1"
  str n "$2"
  str v "$3"
  ADDED+=("{\"change_type\": \"added\", \"ecosystem\": $e, \"name\": $n, \"version\": $v}")
}

# Reports a file the PR changed, with one added line.
changed() {
  local f p
  str f "$1"
  str p "+$2"
  FILES+=("{\"filename\": $f, \"patch\": $p}")
}

# Lists an npm package's versions on deps.dev, each as <version>@<published>.
npm_versions() {
  local name=$1 entry t v json versions=()
  shift
  for entry; do
    str t "${entry#*@}"
    str v "${entry%@*}"
    versions+=("{\"isDeprecated\": false, \"publishedAt\": $t, \"versionKey\": {\"version\": $v}}")
  done
  array json "${versions[@]}"
  respond "https://api.deps.dev/v3/systems/npm/packages/$name" "{\"versions\": $json}"
}

# Lists a GitHub repository's releases, each as <tag>@<published>.
releases() {
  local repo=$1 entry p t json list=()
  shift
  for entry; do
    str p "${entry#*@}"
    str t "${entry%@*}"
    list+=("{\"draft\": false, \"prerelease\": false, \"published_at\": $p, \"tag_name\": $t}")
  done
  array json "${list[@]}"
  respond "repos/$repo/releases?per_page=100" "$json"
}

run_check() {
  local json
  array json "${ADDED[@]}"
  respond "/repos/owner/repo/dependency-graph/compare/base...head" "$json"
  array json "${FILES[@]}"
  respond "/repos/owner/repo/compare/base...head" "{\"files\": $json}"
  run bash "$SCRIPT"
}

# Fails with the script's output when no line of it equals the expected one.
expect_line() {
  local line
  for line in "${lines[@]}"; do
    [ "$line" = "$1" ] && return 0
  done
  printf 'expected the line: %s\nscript said:\n%s\n' "$1" "$output" >&2
  return 1
}

# --- context ----------------------------------------------------------------

@test "skips with a warning outside a pull request" {
  unset BASE_SHA
  run_check
  [ "$status" -eq 0 ]
  expect_line '::warning::No PR context; skipping version check.'
}

@test "passes when the pull request adds no dependencies" {
  run_check
  [ "$status" -eq 0 ]
  expect_line 'No new dependencies added.'
}

# --- exact pins -------------------------------------------------------------

@test "fails a pin behind the eligible latest" {
  added npm left-pad 1.0.0
  changed package.json '"left-pad": "1.0.0"'
  npm_versions left-pad "1.0.0@$OLD" "1.2.0@$OLD"
  run_check
  [ "$status" -eq 1 ]
  expect_line '::error title=Stale dependency::npm:left-pad pinned to 1.0.0, eligible latest is 1.2.0'
  expect_line '::error::1 newly-added dependencies are not at their latest version.'
}

@test "passes a pin at the eligible latest" {
  added npm left-pad 1.2.0
  changed package.json '"left-pad": "1.2.0"'
  npm_versions left-pad "1.0.0@$OLD" "1.2.0@$OLD"
  run_check
  [ "$status" -eq 0 ]
  expect_line 'OK  npm:left-pad@1.2.0 (eligible latest 1.2.0)'
}

@test "passes a pin ahead of the eligible latest" {
  added npm left-pad 2.0.0
  changed package.json '"left-pad": "2.0.0"'
  npm_versions left-pad "1.2.0@$OLD"
  run_check
  [ "$status" -eq 0 ]
  expect_line 'OK  npm:left-pad@2.0.0 (eligible latest 1.2.0)'
}

@test "does not count a release inside the quarantine as latest" {
  added npm left-pad 1.0.0
  changed package.json '"left-pad": "1.0.0"'
  npm_versions left-pad "1.0.0@$OLD" "1.1.0@$FRESH"
  run_check
  [ "$status" -eq 0 ]
  expect_line 'OK  npm:left-pad@1.0.0 (eligible latest 1.0.0)'
}

@test "counts every release as eligible with no quarantine" {
  export MIN_RELEASE_AGE_DAYS=0
  added npm left-pad 1.0.0
  changed package.json '"left-pad": "1.0.0"'
  npm_versions left-pad "1.0.0@$OLD" "1.1.0@$FRESH"
  run_check
  [ "$status" -eq 1 ]
  expect_line '::error title=Stale dependency::npm:left-pad pinned to 1.0.0, eligible latest is 1.1.0'
}

# --- wildcards --------------------------------------------------------------

@test "passes a major wildcard the eligible latest falls under" {
  added actions actions/checkout '6.*.*'
  changed .github/workflows/ci.yml 'uses: actions/checkout@v6'
  releases actions/checkout "v5.9.0@$OLD" "v6.2.0@$OLD"
  run_check
  [ "$status" -eq 0 ]
  expect_line 'OK  actions:actions/checkout@6.*.* (eligible latest 6.2.0)'
}

@test "passes a minor wildcard the eligible latest falls under" {
  added actions actions/checkout '6.0.*'
  changed .github/workflows/ci.yml 'uses: actions/checkout@v6.0'
  releases actions/checkout "v6.0.3@$OLD"
  run_check
  [ "$status" -eq 0 ]
  expect_line 'OK  actions:actions/checkout@6.0.* (eligible latest 6.0.3)'
}

@test "fails a wildcard the eligible latest has moved past" {
  added actions actions/checkout '6.0.*'
  changed .github/workflows/ci.yml 'uses: actions/checkout@v6.0'
  releases actions/checkout "v6.0.3@$OLD" "v6.1.0@$OLD"
  run_check
  [ "$status" -eq 1 ]
  expect_line '::error title=Stale dependency::actions:actions/checkout pinned to 6.0.*, eligible latest is 6.1.0'
}

@test "checks a sub-action against its repository's releases" {
  added actions actions/cache/save 4.0.0
  changed .github/workflows/ci.yml 'uses: actions/cache/save@v4.0.0'
  releases actions/cache "v4.1.0@$OLD"
  run_check
  [ "$status" -eq 1 ]
  expect_line '::error title=Stale dependency::actions:actions/cache/save pinned to 4.0.0, eligible latest is 4.1.0'
}

# --- what is not checked ----------------------------------------------------

@test "skips a dependency no manifest line declares" {
  added npm left-pad 1.0.0
  changed package.json '"right-pad": "1.0.0"'
  npm_versions left-pad "1.2.0@$OLD"
  run_check
  [ "$status" -eq 0 ]
  expect_line 'OK  npm:left-pad@1.0.0 (transitive, skipped)'
}

@test "skips a dependency only a lockfile declares" {
  added npm left-pad 1.0.0
  changed pnpm-lock.yaml 'left-pad@1.0.0:'
  npm_versions left-pad "1.2.0@$OLD"
  run_check
  [ "$status" -eq 0 ]
  expect_line 'OK  npm:left-pad@1.0.0 (transitive, skipped)'
}

@test "skips manifest specifiers" {
  added npm left-pad catalog:
  added npm right-pad workspace:^
  added npm center-pad npm:pad@1.0.0
  changed package.json '"left-pad": "catalog:", "right-pad": "workspace:^", "center-pad": "npm:pad@1.0.0"'
  run_check
  [ "$status" -eq 0 ]
  expect_line 'OK  npm:left-pad@catalog: (manifest specifier, skipped)'
  expect_line 'OK  npm:right-pad@workspace:^ (manifest specifier, skipped)'
  expect_line 'OK  npm:center-pad@npm:pad@1.0.0 (manifest specifier, skipped)'
}

@test "skips an action pinned to a commit" {
  local sha=0123456789abcdef0123456789abcdef01234567
  added actions actions/checkout "$sha"
  changed .github/workflows/ci.yml "uses: actions/checkout@$sha"
  run_check
  [ "$status" -eq 0 ]
  expect_line "OK  actions:actions/checkout@$sha (SHA pin)"
}

# --- what cannot be checked -------------------------------------------------

@test "warns when the latest version cannot be resolved" {
  added npm left-pad 1.0.0
  changed package.json '"left-pad": "1.0.0"'
  run_check
  [ "$status" -eq 0 ]
  expect_line '::warning::Could not resolve latest version for npm:left-pad'
}

@test "warns about an unsupported ecosystem" {
  added composer monolog/monolog 3.0.0
  changed composer.json '"monolog/monolog": "3.0.0"'
  run_check
  [ "$status" -eq 0 ]
  expect_line '::warning::Skipping composer:monolog/monolog (unsupported ecosystem)'
}
