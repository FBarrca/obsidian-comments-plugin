import { Decoration, DecorationSet } from "@codemirror/view";
import { Facet, RangeSetBuilder } from "@codemirror/state";
import { CommentRange, clampRange } from "./model";

interface DecorationEntry {
	id: string;
	from: number;
	to: number;
	decoration: Decoration;
	startSide: number;
	resolved: boolean;
}

export const defaultCommentHighlightColor = "#ffc800";

export const commentHighlightColorFacet = Facet.define<string, string>({
	combine(values) {
		for (let i = values.length - 1; i >= 0; i--) {
			const value = values[i];
			if (typeof value === "string" && value.trim()) {
				return normalizeHighlightColor(value);
			}
		}
		return defaultCommentHighlightColor;
	},
});

function normalizeHighlightColor(color: string): string {
	const trimmed = color.trim();
	if (!trimmed) return defaultCommentHighlightColor;
	const prefixed = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
	return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(prefixed)
		? prefixed.toLowerCase()
		: defaultCommentHighlightColor;
}

function expandHex(hex: string): string {
	if (hex.length === 4) {
		const r = hex[1];
		const g = hex[2];
		const b = hex[3];
		return `#${r}${r}${g}${g}${b}${b}`;
	}
	return hex;
}

function toRgba(hex: string, alpha: number): string {
	const value = expandHex(hex);
	const r = parseInt(value.slice(1, 3), 16);
	const g = parseInt(value.slice(3, 5), 16);
	const b = parseInt(value.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildHighlightStyle(color: string): string {
	const normalized = normalizeHighlightColor(color);
	return [
		`--comment-highlight-base: ${normalized}`,
		`--comment-highlight-bg: ${toRgba(normalized, 0.18)}`,
		`--comment-highlight-bg-active: ${toRgba(normalized, 0.25)}`,
		`--comment-highlight-outline: ${toRgba(normalized, 0.6)}`,
	].join("; ");
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
	highlightColor: string,
): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const entries: DecorationEntry[] = [];
	const style = buildHighlightStyle(highlightColor);

	for (const comment of items) {
		const [from, to] = clampRange(docLen, comment.from, comment.to);
		const toPos = Math.max(from, to);
		const classes = ["cm-comment-anchor"];
		if (comment.resolved) classes.push("cm-comment-resolved");
		if (comment.id === activeId) classes.push("cm-comment-active");

		const attributes: Record<string, string> = {
			"data-comment-id": comment.id,
			"aria-label": comment.resolved ? "Resolved comment range" : "Comment range",
			style,
		};
		if (comment.resolved) attributes["data-comment-resolved"] = "true";
		if (comment.id === activeId) attributes["data-comment-active"] = "true";

		const mark = Decoration.mark({ class: classes.join(" "), attributes });

		entries.push({
			id: comment.id,
			from,
			to: toPos,
			decoration: mark,
			startSide: getStartSide(mark),
			resolved: !!comment.resolved,
		});
	}

	entries.sort((a, b) => {
		if (a.from !== b.from) return a.from - b.from;
		if (a.startSide !== b.startSide) return a.startSide - b.startSide;
		if (a.to !== b.to) return a.to - b.to;
		return a.id.localeCompare(b.id);
	});

	let prevFrom = -1;
	let prevSide = Number.NEGATIVE_INFINITY;
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		if (entry.from < prevFrom || (entry.from === prevFrom && entry.startSide < prevSide)) {
			console.log("order anomaly before add", {
				entry: { f: entry.from, s: entry.startSide, id: entry.id },
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
