import { Decoration, DecorationSet } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { CommentBadge } from "./badge";
import { CommentRange, clampRange } from "./model";

type DecorationKind = "mark" | "badge";

interface DecorationEntry {
	id: string;
	kind: DecorationKind;
	from: number;
	to: number;
	decoration: Decoration;
	startSide: number;
	resolved: boolean;
}

function getStartSide(d: Decoration): number {
	// startSide is an internal runtime property present on all decorations
	// We access it via any for correct ordering across equal `from` positions.
	const anyDeco = d as unknown as { startSide?: number };
	return typeof anyDeco.startSide === "number" ? anyDeco.startSide : 0;
}

export function buildDecorations(
	docLen: number,
	items: CommentRange[],
	activeId: string | null,
): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const entries: DecorationEntry[] = [];

	for (const comment of items) {
		const [from, to] = clampRange(docLen, comment.from, comment.to);
		const toPos = Math.max(from, to);
		const classes = ["cm-comment-anchor"];
		if (comment.resolved) classes.push("cm-comment-resolved");
		if (comment.id === activeId) classes.push("cm-comment-active");

		const attributes: Record<string, string> = {
			"data-comment-id": comment.id,
			"aria-label": comment.resolved ? "Resolved comment range" : "Comment range",
		};
		if (comment.resolved) attributes["data-comment-resolved"] = "true";
		if (comment.id === activeId) attributes["data-comment-active"] = "true";

		const mark = Decoration.mark({ class: classes.join(" "), attributes });
		const badge = Decoration.widget({
			widget: new CommentBadge(comment.id, !!comment.resolved),
			side: 1,
		});

		entries.push({
			id: comment.id,
			kind: "mark",
			from,
			to: toPos,
			decoration: mark,
			startSide: getStartSide(mark),
			resolved: !!comment.resolved,
		});

		entries.push({
			id: comment.id,
			kind: "badge",
			from,
			to: from,
			decoration: badge,
			startSide: getStartSide(badge),
			resolved: !!comment.resolved,
		});
	}

	entries.sort((a, b) => {
		if (a.from !== b.from) return a.from - b.from;
		if (a.startSide !== b.startSide) return a.startSide - b.startSide;
		if (a.to !== b.to) return a.to - b.to;
		if (a.kind !== b.kind) return a.kind === "mark" ? -1 : 1;
		return a.id.localeCompare(b.id);
	});
	console.log();

	let prevFrom = -1;
	let prevSide = Number.NEGATIVE_INFINITY;
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		if (entry.from < prevFrom || (entry.from === prevFrom && entry.startSide < prevSide)) {
			console.log("order anomaly before add", {
				entry: { f: entry.from, s: entry.startSide, k: entry.kind, id: entry.id },
				prev: { f: prevFrom, s: prevSide },
			});
		}
		try {
			builder.add(entry.from, entry.to, entry.decoration);
		} catch (err) {
			console.log("RangeSetBuilder.add failed", {
				index: i,
				entry: {
					id: entry.id,
					kind: entry.kind,
					from: entry.from,
					to: entry.to,
					startSide: entry.startSide,
				},
				prev: { from: prevFrom, startSide: prevSide },
				message: (err as Error)?.message,
			});
			throw err;
		}
		prevFrom = entry.from;
		prevSide = entry.startSide;
	}

	return builder.finish();
}
