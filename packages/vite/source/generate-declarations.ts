import { resolve } from "node:path";

import { writeVooDeclarations } from "@vooya/build-core";
import { readVooComponents } from "./voo-project.js";

const [rootArgument, frameworkArgument = "vue"] = process.argv.slice(2);
if (!rootArgument) {
  throw new Error("Usage: generate-declarations.js <application-root> [framework]");
}
if (frameworkArgument !== "vue" && frameworkArgument !== "react" && frameworkArgument !== "solid" && frameworkArgument !== "svelte") {
  throw new Error(`Unsupported declaration framework: ${frameworkArgument}`);
}

const root = resolve(process.cwd(), rootArgument);
const written = writeVooDeclarations({
  applicationRoot: root,
  components: readVooComponents(root),
  framework: frameworkArgument,
});
console.log(`Generated ${written.files.length} declaration(s) under ${written.typesRoot}.`);
