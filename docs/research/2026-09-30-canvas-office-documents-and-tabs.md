# Canvas: Office Documents, Tabs and Reopening Artifacts

> PLAN-116 F2 research. Date: 2026-09-30. Scope: how the Code canvas could
> show `.docx` / `.pptx` files a Cat produces, and whether the canvas needs
> tabs, a stack or a per-artifact reopen. No code is changed by this note.

## Question

SPEC-123 shows HTML, images, PDF, text and (with F1) Markdown in the canvas.
Cats also produce Word and PowerPoint files. `show_in_canvas` returns
`presentation_unsupported` for them today and tells the Cat to use
`declare_artifact`. Can the canvas present them safely, and what should a
conversation that shows several artifacts look like?

## Findings

### Word (`.docx`)

- **Pure JS conversion works and is safe by construction.** A probe on
  2026-09-30 generated a `.docx` with the `docx` package (a heading, bold text,
  a table and literal `<script>` text) and converted it with
  [mammoth](https://github.com/mwilliamson/mammoth.js) 1.x:
  - the conversion took about 150 ms, produced `<h1>`, `<strong>` and `<table>`,
    and raised no warnings;
  - the script text came out escaped (`&lt;script&gt;`), because mammoth
    emits a fixed vocabulary of semantic HTML from the document model and never
    passes raw HTML through.
- **Limits:** mammoth deliberately drops layout: page size, columns, fonts,
  colors, headers and footers. It keeps structure: headings, lists, tables,
  links, bold/italic, images as data URIs. That suits "read what the Cat wrote",
  not print fidelity.
- **Fidelity path:** LibreOffice headless (`soffice --headless --convert-to pdf`)
  renders the real layout, and the result uses the existing `pdf` viewer. It is
  a large system dependency (about 300 MB) that Cats does not ship. It was not
  installed on the probe machine, and neither was pandoc.

### PowerPoint (`.pptx`)

- There is no maintained pure-JS renderer with usable fidelity. Slides are
  positioned OOXML shapes, charts and media.
- Text extraction is easy and dependency-light: `.pptx` is a ZIP, and
  `ppt/slides/slideN.xml` holds `<a:t>` runs. The probe read the first slide's
  text back with JSZip.
- Faithful rendering needs LibreOffice (to PDF, then the `pdf` viewer) or a
  per-slide image export from the same tool.

### Security posture of each option

- **mammoth HTML:** show it as a static document. Either use the F1 sanitized
  viewer's pipeline (sanitize again; defense in depth) or use a no-script
  iframe (the `static` sandbox profile). No agent-written script can run. Embedded
  images become data URIs, so the viewer makes no network requests.
- **LibreOffice:** converting untrusted documents runs a large parser on the
  host. Run it as a supervised child process:
  - headless, with a per-conversion temp profile (`-env:UserInstallation`);
  - with macros disabled, which is the default for headless convert;
  - with a timeout and an output size cap;
  - with its output in a runtime-owned temp directory and never in the
    workspace.
  The existing live-preview process adapter's tree-kill and timeout handling
  fits this.
- **Text outline for `.pptx`:** render as plain text. There is no active
  content.

### Several artifacts in one conversation

- Today one canvas route shows one artifact
  (`/code/chats/:id/canvas/:artifactId`). The top-bar Preview control (B2b)
  reopens the most recent one, from `artifact_canvas_show_intent` Activity.
- Every earlier show is already durable Activity with its artifact id, so a
  per-artifact reopen needs no new storage. The canvas can list the
  conversation's shown artifacts, newest first and de-duplicated, from the same
  Activity the Preview control reads.
- Tabs that keep several iframes alive would multiply live leases, each with its
  own TTL renewal, and the memory of several dev servers' pages. A stack or
  switcher that keeps one iframe mounted matches how leases and the controls row
  (D2) work.

## Recommendation

1. **`.docx`: ship the mammoth path first,** as a server-side conversion in a
   `document` presentation that reuses F1's sanitized rendering. Add
   `.docx` to `show_in_canvas` resolution. Keep `declare_artifact` for files over
   a size cap (for example 20 MB).
2. **`.pptx`: an outline fallback now, and LibreOffice when present.**
   - Without LibreOffice, show the slide text outline with a note that it is not
     a rendering.
   - With LibreOffice discovered (like `findNpmCli` discovers npm), convert to
     PDF in a supervised process and use the `pdf` viewer.
   - Do not bundle LibreOffice.
3. **One switcher, not tabs:** add a "Recent" menu to the canvas top bar that
   lists the conversation's shown artifacts from Activity and navigates to the
   canvas URL of the chosen one. One iframe stays mounted, and leases behave as
   today. Reopening an artifact whose lease is gone uses the D2 restart path.
4. **Spec work:** each of these extends SPEC-123's resolution order and presentation
   enum. Record them in SPEC-123 before implementation, and add the Office
   scenarios to the M3 matrix (a Cat writes a report, and the canvas shows it).

## Sources

- Probe script and output: a local scratch run on 2026-09-30 with Node 24.21:
  `docx` for generation, `mammoth` 1.x for conversion, `pptxgenjs` for
  generation and `jszip` for slide text.
- mammoth.js README, which describes converting document structure rather than
  styling: https://github.com/mwilliamson/mammoth.js (checked 2026-09-30).
- LibreOffice headless conversion:
  https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html
  (checked 2026-09-30).
