import { EditorView } from "@codemirror/view";

export const THREAD_UPDATE_EVENT = "obsidian-comments-thread-update";

export interface ThreadUpdateDetail {
	view: EditorView;
	lineNumber: number;
}

export function emitThreadUpdate(view: EditorView, from: number) {
	try {
		const lineNumber = view.state.doc.lineAt(from).number;
		const detail: ThreadUpdateDetail = { view, lineNumber };
		window.dispatchEvent(new CustomEvent(THREAD_UPDATE_EVENT, { detail }));
	} catch (error) {
		console.error("emitThreadUpdate: failed to compute line number", error);
	}
}
