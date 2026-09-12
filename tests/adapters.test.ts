import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import {
  readAgentFiles,
  parseOpenCodeAgents,
  within,
} from "../adapters/discovery";
import { prepareLaunch } from "../adapters/launch";
import { readTarget } from "../lib/composer-target";
const exec = promisify(execFile);
const dirs: string[] = [];
async function temp() {
  const p = await mkdtemp(join(tmpdir(), "cli-agents-test-"));
  dirs.push(p);
  return p;
}
afterEach(async () => {
  for (const p of dirs.splice(0)) await rm(p, { recursive: true, force: true });
});
describe("native discovery", () => {
  it("reads YAML descriptions and namespaces plugin agents without copying prompts", async () => {
    const root = await temp();
    await writeFile(
      join(root, "review.md"),
      "---\nname: reviewer\ndescription: >\n  Checks changes\n  for regressions.\n---\nPRIVATE PROMPT BODY",
    );
    const warnings: string[] = [];
    const agents = await readAgentFiles(
      root,
      "test:",
      "plugin: test",
      warnings,
    );
    expect(agents[0]?.id).toBe("test:reviewer");
    expect(agents[0]?.description).toContain("Checks changes");
    expect(JSON.stringify(agents)).not.toContain("PRIVATE");
    expect(warnings).toEqual([]);
  });
  it("lists primary/all OpenCode agents but excludes subagents and permission output", () => {
    expect(
      parseOpenCodeAgents(
        'build (primary)\n  { secret: "x" }\nexplore (subagent)\nwriter (all)\n',
      ).map((a) => a.id),
    ).toEqual(["build", "writer"]);
  });
  it("rejects sibling and absolute traversal outside a declared plugin root", () => {
    expect(within("/plugins/a", "/plugins/a/agents")).toBe(true);
    expect(within("/plugins/a", "/plugins/ab")).toBe(false);
    expect(within("/plugins/a", "/plugins/a/../../etc")).toBe(false);
  });
});
describe("launch adapters", () => {
  it("passes the selected Claude identity as one literal argument while preserving permissions", async () => {
    const root = await temp();
    const fake = join(root, "real 'claude");
    await writeFile(fake, '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o700 });
    const [entry] = await prepareLaunch("claude-code", "reviewer", fake, root);
    const result = await exec(entry!.value, [
      "--print",
      "--permission-mode",
      "acceptEdits",
      "hello world",
    ]);
    expect(result.stdout.split("\n").filter(Boolean)).toEqual([
      "--print",
      "--permission-mode",
      "acceptEdits",
      "hello world",
      "--agent",
      "reviewer",
    ]);
  });
  it("merges OpenCode inline config and removes only its own PATH entry", async () => {
    const root = await temp();
    const fake = join(root, "real-opencode");
    await writeFile(
      fake,
      `#!/bin/sh\nexec '${process.execPath}' -e 'console.log(JSON.stringify({config:JSON.parse(process.env.OPENCODE_CONFIG_CONTENT),path:process.env.PATH}))'\n`,
      { mode: 0o700 },
    );
    const [entry] = await prepareLaunch("acp-opencode", "reviewer", fake, root);
    const wrapper = join(entry!.value.split(":")[0]!, "opencode");
    const result = await exec(wrapper, ["acp"], {
      env: {
        ...process.env,
        PATH: entry!.value,
        OPENCODE_CONFIG_CONTENT: JSON.stringify({
          instructions: ["policy.md"],
          default_agent: "build",
        }),
      },
    });
    const actual = JSON.parse(result.stdout);
    expect(actual.config).toEqual({
      instructions: ["policy.md"],
      default_agent: "reviewer",
    });
    expect(actual.path).toBe(process.env.PATH);
  });
});
describe("composer routing", () => {
  const storage = (values: Record<string, string>) => ({
    getItem: (k: string) => values[k] ?? null,
  });
  it("uses tab-local machine/CLI ahead of other browser tabs", () => {
    const target = readTarget(
      "p",
      storage({
        "bb.promptbox.provider": "claude-code",
        "bb.promptbox.machine-p-1": "host_a",
      }),
      storage({
        "bb.promptbox.provider": "acp-opencode",
        "bb.promptbox.machine-p-1": "host_b",
      }),
    );
    expect(target?.hostId).toBe("host_a");
    expect(target?.providerId).toBe("claude-code");
  });
  it("uses project defaults when the native composer has no explicit selection", () => {
    expect(
      readTarget("p", storage({}), storage({}), {
        providerId: "claude-code",
        hostId: "host_a",
      })?.hostId,
    ).toBe("host_a");
  });
  it("rejects missing machines and unresolved new worktrees", () => {
    expect(
      readTarget(
        "p",
        storage({ "bb.promptbox.provider": "codex" }),
        storage({}),
      ),
    ).toBeNull();
    expect(
      readTarget(
        "p",
        storage({
          "bb.promptbox.provider": "claude-code",
          "bb.promptbox.machine-p-1": "host_a",
          "bb.promptbox.environment-p-1": "provider:worktree",
        }),
        storage({}),
      ),
    ).toBeNull();
  });
});

import { removeSelection } from "../lib/draft-selection";
it("clears only agent mention spans and refuses stale draft offsets", () => {
  const draft = {
    text: "hello Agent: reviewer world",
    mentions: [
      {
        from: 6,
        to: 21,
        provider: "selection",
        id: "id",
        label: "Agent: reviewer",
      },
    ],
  };
  expect(removeSelection(draft.text, draft)).toBe("hello  world");
  expect(() => removeSelection("edited text", draft)).toThrow("still updating");
});
