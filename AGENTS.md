# Obsidian community plugin

## Project overview

- Target: Obsidian Community Plugin (TypeScript → bundled JavaScript).
- Entry point: `main.ts` compiled to `main.js` and loaded by Obsidian.
- Required release artifacts: `main.js`, `manifest.json`, and optional `styles.css`.

## Environment & tooling

- Node.js: use current LTS (Node 18+ recommended).
- **Package manager: npm** (required for this sample - `package.json` defines npm scripts and dependencies).
- **Bundler: Vite** (configured in `vite.config.mjs` with Svelte support and esbuild for fast builds).
- **UI Framework: Svelte 5** (with runes support) for reactive components.
- **Code formatting: Prettier** (configured in `.prettierrc.json` with Svelte plugin support).
- **Linting: ESLint** (configured in `eslint.config.js` with TypeScript and Svelte support).
- Types: `obsidian` type definitions.

**Note**: This project uses Vite instead of esbuild for better Svelte integration and development experience. All external dependencies are bundled into `main.js` for Obsidian compatibility.

### Install

```bash
npm install
```

### Dev (watch)

```bash
npm run dev
```

### Production build

```bash
npm run build
```

**Build process:**

1. TypeScript compilation check (`tsc -noEmit -skipLibCheck`)
2. Vite bundling with Svelte preprocessing
3. Automatic file copying (`main.cjs` → `main.js`, `styles.css` → `styles.css`)
4. Cleanup of temporary `dist/` directory

**Output files:**

- `main.js` - Bundled plugin entry point
- `styles.css` - Compiled styles (includes Svelte component styles)
- `manifest.json` - Plugin metadata (unchanged)

## Code Quality & Formatting

### Prettier (Code Formatting)

This project uses Prettier for consistent code formatting across TypeScript, JavaScript, Svelte, CSS, JSON, and Markdown files.

**Available commands:**

```bash
# Format all files
npm run format

# Check formatting without making changes
npm run format:check
```

**Configuration:** `.prettierrc.json`

- Uses tabs for indentation (4 spaces)
- Double quotes for strings
- Trailing commas enabled
- Print width: 100 characters
- Svelte plugin for `.svelte` file formatting

### ESLint (Linting)

ESLint is configured to analyze TypeScript, JavaScript, and Svelte files for code quality issues.

**Available commands:**

```bash
# Lint all files
npm run lint

# Lint and auto-fix issues
npm run lint:fix
```

**Configuration:** `eslint.config.js`

- TypeScript support with `@typescript-eslint`
- Svelte support with `eslint-plugin-svelte`
- Custom rules for Obsidian plugin development
- Ignores `node_modules/`, `main.js`, and Svelte files (handled by Prettier)

### Pre-commit Hooks

The project uses `husky` and `lint-staged` for pre-commit code quality checks:

- Automatically runs ESLint and Prettier on staged files
- Ensures consistent code quality before commits
- Configured in `package.json` under `lint-staged`

### Available Scripts

**Development:**

```bash
npm run dev          # Start development server with hot reload
npm run build        # Build for production
```

**Code Quality:**

```bash
npm run format       # Format all files with Prettier
npm run format:check # Check formatting without changes
npm run lint         # Lint all files with ESLint
npm run lint:fix     # Lint and auto-fix issues
```

**Version Management:**

```bash
npm run postversion  # Push changes and tags after version bump
```

**Git Hooks:**

```bash
npm run prepare      # Install husky git hooks
npm run lint-staged  # Run linting on staged files
```

## Svelte Support

This project includes full Svelte 5 support with runes for building reactive UI components.

### Svelte Configuration

- **Config file:** `svelte.config.js`
- **Preprocessing:** Vite preprocessor with SCSS support
- **Runes:** Enabled for modern Svelte 5 syntax
- **TypeScript:** Full TypeScript support in `.svelte` files

### Using Svelte Components

**Integration example** (`src/svelte-integration.ts`):

```ts
import { mount, unmount } from "svelte";
import MyComponent from "./components/MyComponent.svelte";

// Mount component
const component = mount(MyComponent, {
	target: container,
	props: { title: "Hello Svelte!" },
});

// Clean up when done
unmount(component);
```

**Component structure** (`src/components/`):

- Use Svelte 5 runes syntax (`$state`, `$props`, `$derived`)
- TypeScript interfaces for props
- Scoped CSS with Obsidian CSS variables
- Event handling with `onclick` and other native events

### Svelte Development

- **Hot reload:** Vite provides instant updates during development
- **Type checking:** `svelte-check` for TypeScript validation
- **Formatting:** Prettier with `prettier-plugin-svelte`
- **Linting:** ESLint with `eslint-plugin-svelte`

## File & folder conventions

- **Organize code into multiple files**: Split functionality across separate modules rather than putting everything in `main.ts`.
- Source lives in `src/`. Keep `main.ts` small and focused on plugin lifecycle (loading, unloading, registering commands).
- **Example file structure**:
    ```
    src/
      main.ts                    # Plugin entry point, lifecycle management
      settings.ts                # Settings interface and defaults
      svelte-integration.ts      # Svelte component integration utilities
      components/                # Svelte components
        MyComponent.svelte
        AnotherComponent.svelte
      commands/                  # Command implementations
        command1.ts
        command2.ts
      ui/                       # UI components, modals, views
        modal.ts
        view.ts
      utils/                    # Utility functions, helpers
        helpers.ts
        constants.ts
      types.ts                  # TypeScript interfaces and types
    ```
- **Do not commit build artifacts**: Never commit `node_modules/`, `main.js`, or other generated files to version control.
- Keep the plugin small. Avoid large dependencies. Prefer browser-compatible packages.
- Generated output should be placed at the plugin root or `dist/` depending on your build setup. Release artifacts must end up at the top level of the plugin folder in the vault (`main.js`, `manifest.json`, `styles.css`).

## Manifest rules (`manifest.json`)

- Must include (non-exhaustive):
    - `id` (plugin ID; for local dev it should match the folder name)
    - `name`
    - `version` (Semantic Versioning `x.y.z`)
    - `minAppVersion`
    - `description`
    - `isDesktopOnly` (boolean)
    - Optional: `author`, `authorUrl`, `fundingUrl` (string or map)
- Never change `id` after release. Treat it as stable API.
- Keep `minAppVersion` accurate when using newer APIs.
- Canonical requirements are coded here: https://github.com/obsidianmd/obsidian-releases/blob/master/.github/workflows/validate-plugin-entry.yml

## Testing

- Manual install for testing: copy `main.js`, `manifest.json`, `styles.css` (if any) to:
    ```
    <Vault>/.obsidian/plugins/<plugin-id>/
    ```
- Reload Obsidian and enable the plugin in **Settings → Community plugins**.

## Commands & settings

- Any user-facing commands should be added via `this.addCommand(...)`.
- If the plugin has configuration, provide a settings tab and sensible defaults.
- Persist settings using `this.loadData()` / `this.saveData()`.
- Use stable command IDs; avoid renaming once released.

## Versioning & releases

- Bump `version` in `manifest.json` (SemVer) and update `versions.json` to map plugin version → minimum app version.
- Create a GitHub release whose tag exactly matches `manifest.json`'s `version`. Do not use a leading `v`.
- Attach `manifest.json`, `main.js`, and `styles.css` (if present) to the release as individual assets.
- After the initial release, follow the process to add/update your plugin in the community catalog as required.

## Security, privacy, and compliance

Follow Obsidian's **Developer Policies** and **Plugin Guidelines**. In particular:

- Default to local/offline operation. Only make network requests when essential to the feature.
- No hidden telemetry. If you collect optional analytics or call third-party services, require explicit opt-in and document clearly in `README.md` and in settings.
- Never execute remote code, fetch and eval scripts, or auto-update plugin code outside of normal releases.
- Minimize scope: read/write only what's necessary inside the vault. Do not access files outside the vault.
- Clearly disclose any external services used, data sent, and risks.
- Respect user privacy. Do not collect vault contents, filenames, or personal information unless absolutely necessary and explicitly consented.
- Avoid deceptive patterns, ads, or spammy notifications.
- Register and clean up all DOM, app, and interval listeners using the provided `register*` helpers so the plugin unloads safely.

## UX & copy guidelines (for UI text, commands, settings)

- Prefer sentence case for headings, buttons, and titles.
- Use clear, action-oriented imperatives in step-by-step copy.
- Use **bold** to indicate literal UI labels. Prefer "select" for interactions.
- Use arrow notation for navigation: **Settings → Community plugins**.
- Keep in-app strings short, consistent, and free of jargon.

## Performance

- Keep startup light. Defer heavy work until needed.
- Avoid long-running tasks during `onload`; use lazy initialization.
- Batch disk access and avoid excessive vault scans.
- Debounce/throttle expensive operations in response to file system events.

## Coding conventions

- TypeScript with `"strict": true` preferred.
- **Keep `main.ts` minimal**: Focus only on plugin lifecycle (onload, onunload, addCommand calls). Delegate all feature logic to separate modules.
- **Split large files**: If any file exceeds ~200-300 lines, consider breaking it into smaller, focused modules.
- **Use clear module boundaries**: Each file should have a single, well-defined responsibility.
- Bundle everything into `main.js` (no unbundled runtime deps).
- Avoid Node/Electron APIs if you want mobile compatibility; set `isDesktopOnly` accordingly.
- Prefer `async/await` over promise chains; handle errors gracefully.

### Svelte-specific conventions

- **Use Svelte 5 runes**: Prefer `$state`, `$props`, `$derived` over legacy syntax
- **TypeScript in components**: Always define interfaces for component props
- **CSS scoping**: Use scoped styles with Obsidian CSS variables (`var(--text-normal)`, etc.)
- **Component lifecycle**: Always unmount Svelte components in Obsidian modals/views `onClose()`
- **Event handling**: Use native DOM events (`onclick`, `oninput`) rather than Svelte's event system
- **Props destructuring**: Use `$props()` with default values for clean prop handling

## Mobile

- Where feasible, test on iOS and Android.
- Don't assume desktop-only behavior unless `isDesktopOnly` is `true`.
- Avoid large in-memory structures; be mindful of memory and storage constraints.

## Agent do/don't

**Do**

- Add commands with stable IDs (don't rename once released).
- Provide defaults and validation in settings.
- Write idempotent code paths so reload/unload doesn't leak listeners or intervals.
- Use `this.register*` helpers for everything that needs cleanup.

**Don't**

- Introduce network calls without an obvious user-facing reason and documentation.
- Ship features that require cloud services without clear disclosure and explicit opt-in.
- Store or transmit vault contents unless essential and consented.

## Common tasks

### Organize code across multiple files

**main.ts** (minimal, lifecycle only):

```ts
import { Plugin } from "obsidian";
import { MySettings, DEFAULT_SETTINGS } from "./settings";
import { registerCommands } from "./commands";

export default class MyPlugin extends Plugin {
	settings: MySettings;

	async onload() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		registerCommands(this);
	}
}
```

**settings.ts**:

```ts
export interface MySettings {
	enabled: boolean;
	apiKey: string;
}

export const DEFAULT_SETTINGS: MySettings = {
	enabled: true,
	apiKey: "",
};
```

**commands/index.ts**:

```ts
import { Plugin } from "obsidian";
import { doSomething } from "./my-command";

export function registerCommands(plugin: Plugin) {
	plugin.addCommand({
		id: "do-something",
		name: "Do something",
		callback: () => doSomething(plugin),
	});
}
```

### Add a command

```ts
this.addCommand({
	id: "your-command-id",
	name: "Do the thing",
	callback: () => this.doTheThing(),
});
```

### Persist settings

```ts
interface MySettings { enabled: boolean }
const DEFAULT_SETTINGS: MySettings = { enabled: true };

async onload() {
  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  await this.saveData(this.settings);
}
```

### Register listeners safely

```ts
this.registerEvent(
	this.app.workspace.on("file-open", (f) => {
		/* ... */
	}),
);
this.registerDomEvent(window, "resize", () => {
	/* ... */
});
this.registerInterval(
	window.setInterval(() => {
		/* ... */
	}, 1000),
);
```

## Troubleshooting

### General Issues

- Plugin doesn't load after build: ensure `main.js` and `manifest.json` are at the top level of the plugin folder under `<Vault>/.obsidian/plugins/<plugin-id>/`.
- Build issues: if `main.js` is missing, run `npm run build` or `npm run dev` to compile your TypeScript source code.
- Commands not appearing: verify `addCommand` runs after `onload` and IDs are unique.
- Settings not persisting: ensure `loadData`/`saveData` are awaited and you re-render the UI after changes.
- Mobile-only issues: confirm you're not using desktop-only APIs; check `isDesktopOnly` and adjust.

### Svelte Issues

- Svelte components not rendering: ensure components are properly mounted and unmounted in Obsidian modals/views
- TypeScript errors in `.svelte` files: run `npx svelte-check` to validate component types
- Styling issues: verify you're using Obsidian CSS variables (`var(--text-normal)`) for theme compatibility
- Hot reload not working: restart the dev server with `npm run dev`

### Code Quality Issues

- Prettier not formatting Svelte files: ensure `prettier-plugin-svelte` is installed and configured
- ESLint errors in Svelte files: check that `eslint-plugin-svelte` is properly configured
- Pre-commit hooks failing: run `npm run lint:fix && npm run format` to fix issues before committing
- Formatting conflicts: ensure Prettier and ESLint configurations are compatible

## References

- Obsidian sample plugin: https://github.com/obsidianmd/obsidian-sample-plugin
- API documentation: https://docs.obsidian.md
- Developer policies: https://docs.obsidian.md/Developer+policies
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- Style guide: https://help.obsidian.md/style-guide
