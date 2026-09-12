import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { parse } from "smol-toml";
import type { Agent } from "../contract";
export const codexHome = () =>
  resolve(process.env.CODEX_HOME || join(homedir(), ".codex"));
export async function readCodexProfile(name: string, home = codexHome()) {
  if (!/^[A-Za-z0-9_-]+$/.test(name))
    throw new Error("Invalid Codex profile name.");
  const file = join(home, name + ".config.toml");
  if ((await stat(file)).size > 256 * 1024)
    throw new Error("Codex profile exceeds 256 KiB.");
  let config: Record<string, any>;
  try {
    config = parse(await readFile(file, "utf8"));
  } catch {
    throw new Error(`Invalid TOML in Codex profile ${name}.`);
  }
  if (config.profile !== undefined || config.profiles !== undefined)
    throw new Error(
      "Legacy nested profiles are not supported. Use top-level keys in NAME.config.toml.",
    );
  for (const key of [
    "model_instructions_file",
    "model_catalog_json",
    "experimental_compact_prompt_file",
  ])
    if (typeof config[key] === "string")
      config[key] = resolve(home, config[key]);
  return config;
}
export async function codexProfiles(home = codexHome()) {
  const agents: Agent[] = [],
    warnings: string[] = [];
  let files;
  try {
    files = await readdir(home);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      return {
        agents,
        warnings: [
          "No Codex profiles. Create NAME.config.toml in CODEX_HOME (normally ~/.codex).",
        ],
      };
    throw e;
  }
  for (const file of files.sort().slice(0, 2000)) {
    const match = /^([A-Za-z0-9_-]+)\.config\.toml$/.exec(file);
    if (!match) continue;
    try {
      const c = await readCodexProfile(match[1], home);
      agents.push({
        id: match[1],
        source: "Codex profile",
        mode: "profile",
        description: [
          typeof c.developer_instructions === "string" &&
          c.developer_instructions.trim()
            ? c.developer_instructions.length <= 4096
              ? "Profile instructions"
              : "Unavailable: instructions exceed 4096 characters"
            : "Unavailable: no developer_instructions",
        ]
          .filter(Boolean)
          .join(" · "),
      });
    } catch {
      warnings.push(
        `Cannot load profile ${match[1]}; check TOML format and file size.`,
      );
    }
  }
  if (!agents.length)
    warnings.push(
      "Create NAME.config.toml in CODEX_HOME (normally ~/.codex) to add a profile.",
    );
  return { agents, warnings };
}
export async function codexInstructions(name: string, home = codexHome()) {
  const config = await readCodexProfile(name, home);
  const instructions = config.developer_instructions;
  if (typeof instructions !== "string" || !instructions.trim())
    throw new Error(
      "This profile has no developer_instructions. Configuration-only profiles are not supported by BB 0.43.",
    );
  if (instructions.length > 4096)
    throw new Error(
      "Profile instructions exceed BB's 4096-character limit. Shorten developer_instructions before selecting this profile.",
    );
  return instructions;
}
