import { readFile, stat, readdir, access } from "node:fs/promises";
import { constants } from "node:fs";
import {
  join,
  resolve,
  relative,
  isAbsolute,
  basename,
  delimiter,
} from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parse } from "yaml";
import type { Agent, Catalog, Provider } from "../contract";
const exec = promisify(execFile);
export async function run(
  command: string,
  args: string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<string> {
  return (
    await exec(command, args, {
      cwd,
      signal,
      timeout: 20000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    })
  ).stdout;
}
export async function executable(name: string): Promise<string> {
  const candidates = [
    ...(process.env.PATH ?? "")
      .split(delimiter)
      .filter(Boolean)
      .map((p) => join(p, name)),
    join(homedir(), ".local/bin", name),
    join(homedir(), ".opencode/bin", name),
  ];
  for (const p of candidates)
    try {
      await access(p, constants.X_OK);
      if ((await stat(p)).isFile()) return p;
    } catch {}
  throw new Error(
    `${name} CLI is not installed on this machine or is missing from PATH.`,
  );
}
export async function readJson(path: string): Promise<Record<string, any>> {
  try {
    if ((await stat(path)).size > 2 * 1024 * 1024) throw new Error("too large");
    const v = JSON.parse(await readFile(path, "utf8"));
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(`Cannot read configuration: ${path}`);
  }
}
export function within(root: string, p: string) {
  const r = relative(resolve(root), resolve(p));
  return (
    r === "" || (!r.startsWith(".." + "/") && r !== ".." && !isAbsolute(r))
  );
}
async function markdownFiles(
  root: string,
  budget: { n: number },
  depth = 0,
): Promise<string[]> {
  if (depth > 8 || budget.n > 2000) return [];
  let s;
  try {
    s = await stat(root);
  } catch {
    return [];
  }
  if (s.isFile()) return root.endsWith(".md") ? [root] : [];
  if (!s.isDirectory()) return [];
  const out: string[] = [];
  for (const entry of (await readdir(root, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    if (++budget.n > 2000) break;
    if (entry.name.startsWith(".")) continue;
    const p = join(root, entry.name);
    if (entry.isDirectory())
      out.push(...(await markdownFiles(p, budget, depth + 1)));
    else if (entry.isFile() || entry.isSymbolicLink()) {
      if (entry.name.endsWith(".md")) out.push(p);
    }
  }
  return out;
}
export async function readAgentFiles(
  root: string,
  prefix: string,
  source: string,
  warnings: string[],
): Promise<Agent[]> {
  const out: Agent[] = [];
  for (const p of await markdownFiles(root, { n: 0 }))
    try {
      if ((await stat(p)).size > 256 * 1024) {
        warnings.push(`Agent file too large: ${p}`);
        continue;
      }
      const text = await readFile(p, "utf8");
      const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
      if (!m) continue;
      const meta = parse(m[1], { maxAliasCount: 20 });
      if (!meta || typeof meta !== "object") continue;
      const name =
        typeof meta.name === "string" ? meta.name : basename(p, ".md");
      if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(prefix + name)) continue;
      out.push({
        id: prefix + name,
        description: String(meta.description ?? "").slice(0, 1200),
        source,
        mode: "primary",
      });
    } catch {
      warnings.push(`Unable to parse agent: ${p}`);
    }
  return out;
}
export async function claudeCatalog(
  cwd: string,
  signal?: AbortSignal,
): Promise<Catalog> {
  const cli = await executable("claude");
  const version = (await run(cli, ["--version"], cwd, signal)).trim();
  const help = await run(cli, ["--help"], cwd, signal);
  if (!help.includes("--agent "))
    return {
      agents: [],
      version,
      warnings: ["This Claude Code version does not support --agent."],
      supported: false,
    };
  const home = homedir();
  const configured = process.env.CLAUDE_CONFIG_DIR;
  const dir = configured
    ? resolve(home, configured.replace(/^~\//, home + "/"))
    : join(home, ".claude");
  const warnings: string[] = [];
  const agents = new Map<string, Agent>();
  const enabled: Record<string, boolean> = {};
  for (const path of [
    join(dir, "settings.json"),
    join(cwd, ".claude/settings.json"),
    join(cwd, ".claude/settings.local.json"),
  ]) {
    const data = await readJson(path);
    for (const [k, v] of Object.entries(data.enabledPlugins ?? {}))
      if (typeof v === "boolean") enabled[k] = v;
  }
  const registry = await readJson(join(dir, "plugins/installed_plugins.json"));
  for (const [key, installations] of Object.entries(registry.plugins ?? {})) {
    if (enabled[key] === false || !Array.isArray(installations)) continue;
    const rows = installations.filter(
      (row: any) =>
        row &&
        typeof row.installPath === "string" &&
        (["user", "managed"].includes(row.scope) ||
          (typeof row.projectPath === "string" &&
            within(row.projectPath, cwd))),
    );
    const row = rows.sort(
      (a: any, b: any) =>
        (a.scope === "local" ? -2 : a.scope === "project" ? -1 : 0) -
        (b.scope === "local" ? -2 : b.scope === "project" ? -1 : 0),
    )[0];
    if (!row) continue;
    const manifest = await readJson(
      join(row.installPath, ".claude-plugin/plugin.json"),
    );
    if (enabled[key] !== true && manifest.defaultEnabled !== true) continue;
    const name =
      typeof manifest.name === "string" ? manifest.name : key.split("@")[0];
    const roots = [
      "agents",
      ...(typeof manifest.agents === "string"
        ? [manifest.agents]
        : Array.isArray(manifest.agents)
          ? manifest.agents
          : []),
    ];
    for (const root of new Set(roots))
      if (
        typeof root === "string" &&
        within(row.installPath, resolve(row.installPath, root))
      ) {
        for (const a of await readAgentFiles(
          resolve(row.installPath, root),
          name + ":",
          "plugin: " + name,
          warnings,
        ))
          agents.set(a.id, a);
      }
  }
  // User and project definitions are native identities; project wins collisions.
  for (const [root, source] of [
    [join(dir, "agents"), "user"],
    [join(cwd, ".claude/agents"), "project"],
  ])
    for (const a of await readAgentFiles(root!, "", source!, warnings))
      agents.set(a.id, a);
  return {
    agents: [...agents.values()].sort((a, b) => a.id.localeCompare(b.id)),
    version,
    warnings,
    supported: true,
  };
}
export function parseOpenCodeAgents(text: string): Agent[] {
  const rows: Agent[] = [];
  for (const line of text.replace(/\x1b\[[0-9;]*m/g, "").split("\n")) {
    const m =
      /^([A-Za-z0-9][A-Za-z0-9._:/-]{0,199})\s+\((primary|all|subagent)\)\s*$/.exec(
        line,
      );
    if (
      m &&
      m[2] !== "subagent" &&
      !["compaction", "summary", "title"].includes(m[1]!)
    )
      rows.push({
        id: m[1]!,
        mode: m[2]!,
        description: "",
        source: "OpenCode CLI",
      });
  }
  return [...new Map(rows.map((x) => [x.id, x])).values()];
}
export async function discover(
  provider: Provider,
  cwd: string,
  signal?: AbortSignal,
): Promise<Catalog> {
  if (!isAbsolute(cwd) || !(await stat(cwd)).isDirectory())
    throw new Error("An existing absolute workspace directory is required.");
  if (process.platform === "win32")
    return {
      agents: [],
      version: "",
      warnings: ["Windows is not supported in this release."],
      supported: false,
    };
  if (provider === "claude-code") return claudeCatalog(cwd, signal);
  const cli = await executable("opencode");
  const version = (await run(cli, ["--version"], cwd, signal)).trim();
  const agents = parseOpenCodeAgents(
    await run(cli, ["agent", "list"], cwd, signal),
  );
  return {
    agents,
    version,
    warnings: agents.length
      ? []
      : ["No primary agents were reported by opencode agent list."],
    supported: agents.length > 0,
  };
}
