# Sanitizer fixtures (M5 prompt-injection)

Adversarial corpus for `apps/jobs/src/util/sanitize.ts`. Each entry in
[`cases.json`](./cases.json) is fed verbatim through the real `sanitize()`
implementation by [`run.mjs`](./run.mjs); a case fails if any of its
expectations do not hold.

Run locally:

```bash
bash scripts/test-sanitizer.sh
```

(The script builds `@whyc/jobs` first because `sanitize` lives there, then
runs the harness against `apps/jobs/dist/`.)

CI runs the same script in the `sanitizer-fixtures` job of
`.github/workflows/ci.yml`.

## Case schema

```jsonc
{
  "name": "human-readable id",
  "source_url": "https://…",          // passed through verbatim as source_url
  "body": "raw posting body",          // the attacker-controlled input
  "expect": {
    "throws": true,                    // sanitize() must throw a StageError
    "throws_code": "sanitizer.…",      // …with this .code
    "throws_retriable": false,         // …and this .retriable
    "body_equals": "exact output",     // out.body === this
    "body_contains": ["…"],            // every string present in out.body
    "body_not_contains": ["…"],        // no string present in out.body
    "body_byte_length": 8192,          // Buffer.byteLength(out.body,'utf8')
    "strip_report": { "html_removed": true, … },  // subset-match of strip_report
    "sha256_matches_body": true,       // out.content_sha256 === sha256(out.body)
    "idempotent": true                 // sanitize(out.body).body === out.body
  }
}
```

Only the keys present are checked. A case with `throws` set skips all
output assertions (there is no output).
