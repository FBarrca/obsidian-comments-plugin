import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { COMMENT_CLICK_EVENT, setActiveComment } from "./model";
import { commentField } from "./state";
import { getCommentsAtPos } from "./selectors";
import { scrollToComment } from "./api";

export const commentInteraction = ViewPlugin.fromClass(
	class {
		constructor(readonly view: EditorView) {
			this.syncActive(view.state.selection.main.head);
		}

		update(update: ViewUpdate) {
			if (update.docChanged || update.selectionSet) {
				this.syncActive(update.state.selection.main.head);
			}
		}

		private syncActive(pos: number) {
			const hits = getCommentsAtPos(this.view, pos);
			const id = hits[0]?.id ?? null;
			const state = this.view.state.field(commentField, false);
			const prev = state?.activeId ?? null;

			if (id !== prev) {
				this.view.dispatch({ effects: setActiveComment.of({ id }) });
			}
		}
	},
	{
		eventHandlers: {
			click(event, view) {
				const target = event.target as HTMLElement | null;
				if (!target) {
					return;
				}

				const badge = target.closest<HTMLElement>(".cm-comment-badge");
				const anchor = target.closest<HTMLElement>(".cm-comment-anchor");
				const id = badge?.dataset.commentId || anchor?.getAttribute("data-comment-id");

				if (id) {
					view.dispatch({ effects: setActiveComment.of({ id }) });
					const eventDetail = new CustomEvent(COMMENT_CLICK_EVENT, {
						detail: { id, view },
					});
					view.dom.dispatchEvent(eventDetail);
				}
			},
			keydown(event, view) {
				if (event.key !== "Enter" && event.key !== " ") {
					return;
				}

				const target = event.target as HTMLElement | null;
				if (!target) {
					return;
				}

				const badge = target.closest<HTMLElement>(".cm-comment-badge");
				if (!badge) {
					return;
				}

				const id = badge.dataset.commentId;
				if (!id) {
					return;
				}

				event.preventDefault();
				if (!scrollToComment(view, id)) {
					view.dispatch({ effects: setActiveComment.of({ id }) });
				}
			},
		},
	},
);
