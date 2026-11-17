import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const marketplacePath = join(repoRoot, ".claude-plugin", "marketplace.json");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));

const isInside = (root, target) => {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel) && !rel.split(sep).includes(".."));
};

const sourceProblem = (source) => {
  if (typeof source !== "string" || source.length === 0) {
    return "source is not a non-empty string";
  }
  if (isAbsolute(source) || /^[A-Za-z]:/.test(source) || source.startsWith("/") || source.startsWith("\\")) {
    return "source is absolute";
  }
  const resolved = resolve(repoRoot, source);
  if (!isInside(repoRoot, resolved)) {
    return "source escapes the repository root";
  }
  if (existsSync(resolved) && !isInside(realpathSync(repoRoot), realpathSync(resolved))) {
    return "source resolves outside the repository root through a link";
  }
  return null;
};

const loadMarketplace = () => readJson(marketplacePath);

const pluginDirs = () => loadMarketplace().plugins.map((plugin) => ({
  name: plugin.name,
  source: plugin.source,
  dir: resolve(repoRoot, plugin.source)
}));

const toolkitDir = () => {
  const plugin = pluginDirs().find((entry) => entry.name === "toolkit");
  assert.ok(plugin, "toolkit plugin is listed");
  return plugin.dir;
};

const parseFrontmatter = (text) => {
  const match = text.replace(/^\uFEFF/, "").match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
  if (!match) {
    return null;
  }
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (field) {
      fields[field[1]] = field[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return fields;
};

const listDirs = (path) => existsSync(path) ? readdirSync(path).filter((entry) => statSync(join(path, entry)).isDirectory()) : [];
const listEntries = (path) => existsSync(path) ? readdirSync(path) : [];

test("marketplace.json exists at the repository root and parses", () => {
  assert.ok(existsSync(marketplacePath), "marketplace.json is present");
  const marketplace = loadMarketplace();
  assert.equal(typeof marketplace, "object");
});

test("marketplace is named claude-toolkit with an owner and plugins", () => {
  const marketplace = loadMarketplace();
  assert.equal(marketplace.name, "claude-toolkit");
  assert.ok(marketplace.owner && typeof marketplace.owner === "object", "owner is an object");
  assert.ok(Array.isArray(marketplace.plugins) && marketplace.plugins.length > 0, "plugins is a non-empty array");
  for (const plugin of marketplace.plugins) {
    assert.equal(typeof plugin.name, "string");
    assert.ok(plugin.name.length > 0);
    assert.ok("source" in plugin, `plugin ${plugin.name} has a source`);
  }
});

test("marketplace lists exactly one plugin named toolkit", () => {
  const names = loadMarketplace().plugins.map((plugin) => plugin.name);
  assert.equal(names.filter((name) => name === "toolkit").length, 1);
});

test("every plugin source is a relative path inside the repository root", () => {
  for (const plugin of loadMarketplace().plugins) {
    assert.equal(sourceProblem(plugin.source), null, `plugin ${plugin.name} source ${JSON.stringify(plugin.source)}`);
  }
});

test("source containment check rejects escaping and absolute sources", () => {
  assert.equal(sourceProblem("../outside"), "source escapes the repository root");
  assert.equal(sourceProblem("./plugins/../../outside"), "source escapes the repository root");
  assert.equal(sourceProblem("C:\\outside"), "source is absolute");
  assert.equal(sourceProblem("/outside"), "source is absolute");
  assert.equal(sourceProblem(""), "source is not a non-empty string");
  assert.equal(sourceProblem({ source: "github" }), "source is not a non-empty string");
  assert.equal(sourceProblem("./plugins/toolkit"), null);
});

test("toolkit source is a directory with plugin.json named toolkit", () => {
  const dir = toolkitDir();
  assert.ok(existsSync(dir) && statSync(dir).isDirectory(), "toolkit source is a directory");
  const manifestPath = join(dir, ".claude-plugin", "plugin.json");
  assert.ok(existsSync(manifestPath), "plugin.json is present");
  assert.equal(readJson(manifestPath).name, "toolkit");
});

test("every listed plugin source has a plugin.json whose name matches its listing", () => {
  for (const plugin of pluginDirs()) {
    const manifestPath = join(plugin.dir, ".claude-plugin", "plugin.json");
    assert.ok(existsSync(manifestPath), `plugin.json for ${plugin.name}`);
    assert.equal(readJson(manifestPath).name, plugin.name);
  }
});

test("toolkit plugin.json declares no version", () => {
  const manifest = readJson(join(toolkitDir(), ".claude-plugin", "plugin.json"));
  assert.equal(Object.hasOwn(manifest, "version"), false);
});

test("toolkit marketplace entry declares no version", () => {
  const entry = loadMarketplace().plugins.find((plugin) => plugin.name === "toolkit");
  assert.equal(Object.hasOwn(entry, "version"), false);
});

test("the listed plugins ship no skills yet", () => {
  const names = pluginDirs().flatMap((plugin) => listDirs(join(plugin.dir, "skills"))).sort();
  assert.deepEqual(names, []);
});

test("every SKILL.md frontmatter name matches its directory and none is sdd", () => {
  const frontmatterNames = [];
  for (const plugin of pluginDirs()) {
    for (const skill of listDirs(join(plugin.dir, "skills"))) {
      const skillPath = join(plugin.dir, "skills", skill, "SKILL.md");
      assert.ok(existsSync(skillPath), `${skill} has SKILL.md`);
      const frontmatter = parseFrontmatter(readFileSync(skillPath, "utf8"));
      assert.ok(frontmatter, `${skill} has frontmatter`);
      assert.notEqual(frontmatter.name, "sdd");
      if (frontmatter.name !== undefined) {
        assert.equal(frontmatter.name, skill);
      }
      frontmatterNames.push(frontmatter.name ?? skill);
    }
  }
  assert.deepEqual(frontmatterNames.sort(), []);
});

test("no listed plugin ships an sdd skill directory or agent file", () => {
  for (const plugin of pluginDirs()) {
    const skillNames = listDirs(join(plugin.dir, "skills")).map((name) => name.toLowerCase());
    assert.equal(skillNames.includes("sdd"), false, `${plugin.name} skills`);
    const agentNames = listEntries(join(plugin.dir, "agents")).map((name) => name.toLowerCase().replace(/\.md$/, ""));
    assert.equal(agentNames.includes("sdd"), false, `${plugin.name} agents`);
  }
});
