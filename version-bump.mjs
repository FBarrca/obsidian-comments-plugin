import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const targetVersion = process.env.npm_package_version;

// read minAppVersion from manifest.json and bump version to target version
let manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));

// update versions.json with target version and minAppVersion from manifest.json
let versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));

// Create git tag (pushing will be handled by postversion script)
try {
	console.log(`Creating git tag v${targetVersion}...`);
	execSync(`git tag v${targetVersion}`, { stdio: "inherit" });
	console.log(`Successfully created tag v${targetVersion}`);
} catch (error) {
	console.error(`Error creating tag: ${error.message}`);
	process.exit(1);
}
