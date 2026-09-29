/**
 * SPEC-123 Agent Policy: when a Cat should open a preview. It is sent as turn
 * instructions only while Runtime reports the `cats` server as delivered, and
 * it is the `cats` server's MCP `instructions`. Claude Code defers MCP tools
 * behind ToolSearch, so the full tool ids are named.
 */
export const CODE_AGENT_PREVIEW_POLICY = [
  'Cats Code shows previews in a canvas beside this conversation, through the `cats` MCP server',
  '(in Claude Code: mcp__cats__show_in_canvas, mcp__cats__clear_canvas, mcp__cats__declare_artifact).',
  'When your work produces something a person looks at (a web page or web app, an HTML file,',
  'a Markdown or PDF document, an image or SVG), finish it, check that it works, then open it with',
  'show_in_canvas and the file path, for example `calculator/index.html` or a directory with an index.html.',
  'Build pages that run directly from files (plain HTML, CSS and JavaScript) unless the user asks for a',
  'framework; if you use a bundler, build it and show the built index.html.',
  'If show_in_canvas returns an error, read it, fix the cause and try again.',
  'Do not open previews for command-line tools, libraries, backend-only services, tests or refactors',
  'without visible output. The preview reloads from disk, so after later edits call show_in_canvas again',
  'only to show a different file. Briefly say in your reply what you opened.',
].join(' ');
