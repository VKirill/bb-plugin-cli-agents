import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, rename, rm } from "node:fs/promises";
import { join, delimiter } from "node:path";
import type { Provider } from "../contract";
async function atomicWrite(path: string, content: string, mode: number) {
  const temp = path + "." + randomUUID();
  try {
    await writeFile(temp, content, { mode });
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
}
export function shellQuote(s: string) {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}
export async function prepareLaunch(
  provider: Provider,
  agentId: string,
  command: string,
  dataDir: string,
) {
  const digest = createHash("sha256")
    .update(JSON.stringify({ provider, agentId, command, version: 1 }))
    .digest("hex")
    .slice(0, 24);
  const dir = join(dataDir, "launchers", digest);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if (provider === "claude-code") {
    const file = join(dir, "claude");
    await atomicWrite(
      file,
      `#!/bin/sh\nunset BB_CLAUDE_CODE_EXECUTABLE\nexec ${shellQuote(command)} "$@" --agent ${shellQuote(agentId)}\n`,
      0o700,
    );
    return [
      {
        name: "BB_CLAUDE_CODE_EXECUTABLE",
        value: file,
        reason: `CLI Agents: ${agentId}`,
      },
    ];
  }
  // Preserve the process's existing inline configuration, adding only default_agent.
  const launcher = join(dir, "launcher.cjs");
  const source = `const {spawn}=require('node:child_process');\nconst env={...process.env};\nlet config;try{config=JSON.parse(env.OPENCODE_CONFIG_CONTENT||'{}');if(!config||Array.isArray(config)||typeof config!=='object')throw Error()}catch{console.error('CLI Agents: invalid OPENCODE_CONFIG_CONTENT');process.exit(1)}\nconfig.default_agent=${JSON.stringify(agentId)};env.OPENCODE_CONFIG_CONTENT=JSON.stringify(config);\nenv.PATH=(env.PATH||'').split(${JSON.stringify(delimiter)}).filter(p=>p!==${JSON.stringify(dir)}).join(${JSON.stringify(delimiter)});\nconst child=spawn(${JSON.stringify(command)},process.argv.slice(2),{env,stdio:'inherit'});\nfor(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.on(signal,()=>child.kill(signal));\nchild.on('error',e=>{console.error(e.message);process.exit(1)});child.on('exit',(code,signal)=>{if(signal){process.removeAllListeners(signal);process.kill(process.pid,signal)}else process.exit(code??1)});\n`;
  await atomicWrite(launcher, source, 0o600);
  const file = join(dir, "opencode");
  await atomicWrite(
    file,
    `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(launcher)} "$@"\n`,
    0o700,
  );
  return [
    {
      name: "PATH",
      value: dir + delimiter + (process.env.PATH ?? ""),
      reason: `CLI Agents: ${agentId}`,
    },
  ];
}
