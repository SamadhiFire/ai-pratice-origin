const { spawn } = require("child_process");

const child = spawn(process.execPath, ["scripts/provider-live-test.js", "qwen"], {
  cwd: __dirname + "/..",
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
