import { it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import {
  codexProfiles,
  readCodexProfile,
  codexInstructions,
} from "../adapters/codex";
import { prepareLaunch } from "../adapters/launch";
it("discovers file profiles without exposing instructions and rejects legacy or invalid profiles", async () => {
  const dir = await mkdtemp(join(tmpdir(), "profiles-"));
  try {
    await writeFile(
      join(dir, "review.config.toml"),
      'developer_instructions="PRIVATE ROLE"\nmodel_instructions_file="role.md"',
    );
    await writeFile(join(dir, "broken.config.toml"), "bad = [");
    await writeFile(
      join(dir, "legacy.config.toml"),
      '[profiles.old]\nmodel="x"',
    );
    const result = await codexProfiles(dir);
    expect(result.agents.map((a) => a.id)).toEqual(["review"]);
    expect(JSON.stringify(result)).not.toContain("PRIVATE ROLE");
    expect(result.warnings).toHaveLength(2);
    expect(
      (await readCodexProfile("review", dir)).model_instructions_file,
    ).toBe(join(dir, "role.md"));
    await expect(readCodexProfile("../escape", dir)).rejects.toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it("rejects missing and oversized instructions instead of silently truncating", async () => {
  const dir = await mkdtemp(join(tmpdir(), "profile-limits-"));
  try {
    await writeFile(join(dir, "empty.config.toml"), 'model="x"');
    await writeFile(
      join(dir, "large.config.toml"),
      'developer_instructions="' + "a".repeat(4097) + '"',
    );
    await expect(codexInstructions("empty", dir)).rejects.toThrow(
      "no developer_instructions",
    );
    await expect(codexInstructions("large", dir)).rejects.toThrow("4096");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
