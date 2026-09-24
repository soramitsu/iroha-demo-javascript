import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { buildIrohaNative } from "./build-iroha-native.mjs";
import { resolveCompatibleIrohaSdkRoot } from "./iroha-sdk-compat.mjs";
import {
  resolveNativeBuildRequirement,
  resolveNativeProvenanceRequirement,
} from "./postinstallNativeCheck.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(ROOT);
const irohaPackagePath = resolveCompatibleIrohaSdkRoot({ projectRoot });
const nativeProvenanceRequirement = resolveNativeProvenanceRequirement(
  process.env,
);
const inspectNativeBinding = () =>
  resolveNativeBuildRequirement(
    irohaPackagePath,
    undefined,
    undefined,
    nativeProvenanceRequirement,
  );

const requirement = inspectNativeBinding();

if (!requirement.shouldBuild) {
  process.exit(0);
}

if (nativeProvenanceRequirement !== null) {
  console.error(
    `[postinstall] Refusing to rebuild a release native binding from the installed package (${requirement.reason}). Build the reviewed sibling source and stage its verified native pair first.`,
  );
  process.exit(1);
}

console.log(
  `[postinstall] Building @iroha/iroha-js native bindings (${requirement.reason})...`,
);
buildIrohaNative({ projectRoot, sdkRoot: irohaPackagePath });

const refreshedRequirement = inspectNativeBinding();
if (refreshedRequirement.shouldBuild) {
  console.error(
    `[postinstall] Built iroha_js_host failed native verification: ${refreshedRequirement.reason}.`,
  );
  process.exit(1);
}
