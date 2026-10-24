# Inkwell SO

**Spellcheck Only, as a reusable prompt—no plugin required.**

Inkwell SO provides a portable, version-controlled instruction set for conservative spelling correction. It is intended to be shared by ChatGPT, editor integrations, and future tool adapters rather than maintaining different spellchecking behavior in each application.

## Use it

1. Copy [the Spellcheck Only prompt](prompts/spellcheck-only.md) into the instruction field of your model or agent. In a chat without a separate instruction field, paste it before the text to check.
2. Supply the text you want checked.
3. Use the returned text directly: the prompt requests **only the corrected text**, without commentary or reformulation.

No runtime, dependency installation, MCP server, or ChatGPT plugin is necessary to use the prompt.

## Contract

- Correct **clear, unintentional spelling mistakes** in ordinary prose.
- Preserve the author's vocabulary, voice, dialect, grammar, punctuation, capitalization, layout, and meaning.
- Preserve code, links, paths, identifiers, and other non-prose content.
- Leave ambiguous cases alone, and return the input unchanged when no correction is warranted.

See [the canonical prompt](prompts/spellcheck-only.md) for detailed instructions. The prompt is a starting specification, **not** a guarantee of deterministic model behavior.

## Next steps

Add regression fixtures for real-world Markdown and technical text, then a small validation harness. An optional MCP interface can be added separately if multiple applications need a common callable service; the core prompt will remain usable without it.
