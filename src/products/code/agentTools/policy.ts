/**
 * SPEC-123 Agent Policy: when a Cat should open a preview. It is sent as turn
 * instructions only while Runtime reports the `cats` server as delivered, and
 * it is the `cats` server's MCP `instructions`. Claude Code defers MCP tools
 * behind ToolSearch, so the full tool ids are named.
 */
export const CODE_AGENT_PREVIEW_POLICY = [
  'Cats Code shows previews in a canvas beside this conversation, through the `cats` MCP server',
  '(in Claude Code: mcp__cats__show_in_canvas, mcp__cats__start_dev_preview, mcp__cats__get_preview_status,',
  'mcp__cats__stop_preview, mcp__cats__clear_canvas, mcp__cats__declare_artifact).',
  'When your work produces something a person looks at (a web page or web app, an HTML file,',
  'a Markdown or PDF document, an image or SVG), finish it, check that it works, then open it.',
  'Use show_in_canvas with the file path for anything that needs no build step, for example',
  '`calculator/index.html` or a directory with an index.html. Build pages that run directly from files',
  '(plain HTML, CSS and JavaScript) unless the user asks for a framework or bundler.',
  'For a project with a dev server (a package.json dev script such as vite, next dev or astro dev), install',
  'dependencies first, then open it with start_dev_preview and the project directory.',
  'If a call returns an error, read it and any logTail, fix the cause and try again. If start_dev_preview',
  'reports that preview servers are off, tell the user, then build static files and use show_in_canvas.',
  'Do not open previews for command-line tools, libraries, backend-only services, tests or refactors',
  'without visible output. Static previews and dev servers pick up later edits by themselves, so call',
  'show_in_canvas or start_dev_preview again only to show a different item. Briefly say in your reply what',
  'you opened only when the tool reports status shown. A ready preview URL or a navigation request',
  'does not confirm the canvas opened. Report a canvas error truthfully; use the returned artifactId',
  'to retry show_in_canvas without recreating the files or restarting a ready preview server.',
  'Viewer loading does not verify app interactions; claim those checks only if you actually performed them.',
].join(' ');
