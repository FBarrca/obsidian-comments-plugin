import { MarkdownStep, MultiStepMarkdownDialog } from "./MultiStepMarkdownDialog";
import { Plugin, requestUrl, Notice } from "obsidian";

const RELEASES_URL =
	"https://api.github.com/repos/FBarrca/obsidian-advanced-template-plugin/releases";

interface GithubRelease {
	id: number;
	tag_name: string;
	name: string;
	body: string;
	html_url: string;
	published_at: string;
	draft: boolean;
	prerelease: boolean;
}

// Normalize a Git tag to bare semver (strip leading 'v' if present)
const normalizeTag = (t: string) => t.replace(/^v/i, "");

async function fetchGithubReleases(plugin: Plugin): Promise<GithubRelease[] | undefined> {
	// Test with a simple request first
	try {
		const testRes = await requestUrl({
			url: RELEASES_URL,
			throw: false,
		});

		if (testRes.status >= 200 && testRes.status < 300) {
			const releases = (testRes.json as GithubRelease[]).filter((r) => !r.draft);
			return releases;
		}
	} catch (_error) {
		// Swallow error, return undefined
	}
	return undefined;
}

function selectReleasesBetween(
	all: GithubRelease[],
	prevVersion: string | undefined,
	currentVersion: string,
): GithubRelease[] {
	const currentNorm = normalizeTag(currentVersion);
	const prevNorm = prevVersion ? normalizeTag(prevVersion) : undefined;

	// GitHub returns releases in descending publish date by default
	const list = all.filter((r) => !r.prerelease);

	// If we can find indices, slice accordingly; otherwise, fallback to just current
	const findIndexByVersion = (v: string) => list.findIndex((r) => normalizeTag(r.tag_name) === v);

	const curIdx = findIndexByVersion(currentNorm);

	if (curIdx === -1) {
		// Fallback: try name
		const altIdx = list.findIndex((r) => normalizeTag(r.name || r.tag_name) === currentNorm);
		if (altIdx !== -1) {
			return [list[altIdx]];
		}
		return list.length ? [list[0]] : [];
	}

	if (!prevNorm) {
		// Show just current if no previous known
		return [list[curIdx]];
	}

	const prevIdx = findIndexByVersion(prevNorm);
	// We want releases from curIdx down to just after prevIdx (exclusive)
	const endExclusive = prevIdx === -1 ? list.length : prevIdx;
	const slice = list.slice(curIdx, endExclusive);
	return slice.length ? slice : [list[curIdx]];
}

const ReleaseNotes = async (plugin: Plugin) => {
	const prev = (plugin as Plugin & { settings?: { previousVersion?: string } })?.settings
		?.previousVersion;
	const curr = plugin.manifest.version;

	const releases = await fetchGithubReleases(plugin);

	if (releases && releases.length) {
		// Get releases between previous and current version
		const releasesToShow = selectReleasesBetween(releases, prev, curr);

		if (releasesToShow.length === 0) {
			new Notice("No new releases found.");
			return;
		}

		// Create steps for each release (newest first)
		const steps: MarkdownStep[] = releasesToShow.map((release) => ({
			title: release.name || release.tag_name,
			content:
				release.body && release.body.trim().length
					? release.body
					: `No changelog provided. See [release on GitHub](${release.html_url}).`,
		}));

		new MultiStepMarkdownDialog(plugin.app, plugin, steps, {
			title: `${plugin.manifest.name} - Release notes`,
			prevLabel: "Back",
			nextLabel: "Next",
			closeLabel: "Close",
		}).open();
		return;
	}
	new Notice("Could not find any release notes.");
};

export default ReleaseNotes;
