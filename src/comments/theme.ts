import { EditorView } from "@codemirror/view";

export const commentTheme = EditorView.baseTheme({
	".cm-comment-anchor": {
		background: "rgba(255, 200, 0, 0.18)",
		padding: "0.5px 0",
		borderRadius: "2px",
		transition: "background 120ms ease",
	},
	'.cm-comment-anchor[data-comment-active="true"]': {
		outline: "1px solid rgba(255, 160, 0, 0.6)",
		outlineOffset: "1px",
		background: "rgba(255, 210, 0, 0.25)",
	},
	'.cm-comment-anchor[data-comment-resolved="true"]': {
		opacity: "0.75",
	},
	".cm-comment-badge": {
		fontSize: "0.9em",
		lineHeight: "1",
		padding: "0 2px",
		marginLeft: "-1px",
		userSelect: "none",
	},
	".cm-comment-badge-resolved": {
		opacity: "0.7",
	},
	".cm-tooltip.cm-comment-tooltip": {
		maxWidth: "360px",
		whiteSpace: "pre-wrap",
	},
	".cm-comment-meta": {
		fontSize: "0.78em",
		opacity: "0.85",
		marginBottom: "4px",
	},
	".cm-comment-text": {
		fontSize: "0.9em",
	},
	".cm-comment-list": {
		fontSize: "0.88em",
	},
});
