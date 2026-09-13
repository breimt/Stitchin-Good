# On-machine alphabet card research

## Product distinction

An alphabet made from separate PES letter designs is achievable with the ordinary
design-card layout, but it is not the requested result. The target is a card the
Esante ESe recognizes as a font so the user can type, space, and combine characters
on the machine.

That behavior requires machine-menu metadata beyond glyph stitches. Open 40-pin card
research shows official card images include pointer graphs, overview thumbnails,
localized UI assets, and machine-menu resources as well as PEC-like stitch data.
The official Card No. 52 dump in the research corpus contains 31 designs and uses a
different header variant from generated PES design cards. This supports a separate
`font-card` image family rather than pretending a PES collection becomes typeable.

Running the new analyzer against the public research project's Card No. 52 dump also
found the `DRAGON3 Project`, `LCD font created by`, and `brother_sewing` header text,
plus a complete printable ASCII sequence near offset `0x41A3`. Those bytes demonstrate
that cards can carry machine-display resources, but they do **not** yet prove a
typeable embroidery-glyph schema; Card No. 52 is an ordinary design card. This is why
an actual alphabet-card comparison remains necessary.

## What Ink/Stitch contributes

Ink/Stitch's embroidery-font repository supplies openly licensed, already digitized
glyph geometry and stitch-routing knowledge. Its font folders use `font.json` plus
one or more glyph-layer SVG files. These are useful source glyphs, but their metadata
is for Ink/Stitch's lettering tool—not the Esante card menu—and cannot be copied into
a Brother card unchanged.
The replacement now has a dependency-free parser and deterministic spacing engine for
these `font.json` manifests. It understands glyph coverage, advances, kerning,
fallback glyphs, and physical scaling. Converting the SVG embroidery instructions to
stitches is intentionally not conflated with this metadata step.

Sources:

- <https://github.com/inkstitch/embroidery-fonts>
- <https://inkstitch.org/tutorials/font-creation/>
- <https://github.com/bezmi/brother_embroidery_card_experiments>
- <https://github.com/AeroX2/brother-cart-emulator>
- <https://github.com/mlueft/emcr>

## Research path

1. Preserve the current 128 KiB rewritable-card/P7H format as the normal design-card
   family.
2. Acquire legal, user-owned raw dumps of at least two genuine alphabet cards and one
   ordinary official design card. Do not commit commercial dumps.
3. Run structural/differential analysis across headers, pointer targets, menu assets,
   glyph tables, thumbnails, character codes, spacing/advance values, and stitch
   streams.
   `node scripts/analyze-card-images.mjs first.img second.img` provides the initial
   dependency-free region, pointer-candidate, and embedded-string report.
4. Determine whether the ESe firmware has a documented card-type discriminator for
   alphabet input or merely exposes each glyph as a design. Validate this on the
   machine before building a generator.
5. Convert a suitably licensed Ink/Stitch font into normalized glyph stitch streams,
   then generate the discovered alphabet-card metadata around those streams.
6. Validate every pointer and bound offline, write only to the rewritable card, read
   back byte-for-byte, and finally test typing on the ESe.

## Current blocker

No font-card generator should be claimed until genuine alphabet-card dumps prove the
machine-facing schema. The ECS transport and generic card backup work can proceed
independently in the meantime.

Current manuals separate **Alphabet patterns** (built into the machine) from
**Embroidery card** patterns, and Brother describes Card No. 1/SA298 as six alphabet
fonts plus emblems without stating that it extends the machine's typing keyboard.
The best current inference is therefore that commercial alphabet cards contain
individually selectable letter designs, not installable typing fonts. This does not
prove the requested behavior is impossible, but it raises the evidence bar: obtain a
raw alphabet-card dump and confirm its actual ESe screen before designing a special
schema. If no card can extend the keyboard, the closest technically honest fallback
is app-side text composition that writes one combined design—not falsely presenting
separate letters as an on-machine font.

References:

- <https://www.manualowl.com/m/Brother%20International/PE-300S/Manual/255754?page=19>
- <https://www.manualslib.com/manual/453723/Baby-Lock-Esante-Bln.html?page=115>
