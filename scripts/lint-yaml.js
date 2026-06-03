import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const roots = [
  ".github/workflows",
  ".github/actions",
  ".github/ISSUE_TEMPLATE",
];

function collectYamlFiles(dirPath, out = []) {
  if (!fs.existsSync(dirPath)) {
    return out;
  }

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectYamlFiles(fullPath, out);
      continue;
    }

    if (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml")) {
      out.push(fullPath);
    }
  }

  return out;
}

const files = roots.flatMap((root) => collectYamlFiles(root));
let hasError = false;

for (const file of files) {
  try {
    const content = fs.readFileSync(file, "utf8");
    yaml.load(content);
  } catch (error) {
    hasError = true;
    console.error(`YAML parse failed: ${file}`);
    console.error(error instanceof Error ? error.message : String(error));
  }
}

if (hasError) {
  process.exit(1);
}

console.log(`YAML lint passed for ${files.length} file(s).`);
