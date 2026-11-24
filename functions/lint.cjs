// Use this package's ESLint 8 configuration and working directory.
const {spawnSync} = require("node:child_process");
const path = require("node:path");
const cli = path.join(path.dirname(require.resolve("eslint/package.json")),
  "bin/eslint.js");
const args = process.argv.slice(2);
const files = args.length ? args : ["."];
const result = spawnSync(process.execPath, [cli, ...files], {
  cwd: __dirname,
  env: {...process.env, ESLINT_USE_FLAT_CONFIG: "false"},
  stdio: "inherit",
});
process.exit(result.status ?? 1);
