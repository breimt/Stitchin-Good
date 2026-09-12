# Codex-to-PES embroidery design guide

This document defines how we will create, review, test, and improve original
embroidery designs for the Baby Lock Esante ESe. The goal is not merely to
produce a `.pes` file that opens. The goal is an attractive design that runs
reliably on the actual fabric and can be revised without starting over.

## The quality rule

A preview is evidence about the stitch plan; a sew-out is evidence about the
embroidery. No design is considered finished until it has been stitched on the
same or closely equivalent fabric, stabilizer, thread, and needle intended for
the final project.

Machine embroidery distorts material as it sews. Density, stitch direction,
underlay, hooping, fabric, stabilizer, thread, needle, and speed all interact.
For that reason, the normal process is:

> brief -> artwork -> stitch plan -> software validation -> test sew-out ->
> measured corrections -> final sew-out

## Equipment profile

Keep this table current. Unknown values must be resolved before generating a
design that depends on them.

| Item | Current value | Status |
| --- | --- | --- |
| Machine | Baby Lock Esante ESe | Known |
| Editing/card software | Baby Lock Palette 3 | Working |
| Card writer | Serial Baby Lock Palette Model ECS on COM3 | Protocol connection verified |
| Machine file | `.pes` | Known-compatible examples open in Palette 3 |
| Physical hoop(s) and usable fields | Record each exact hoop before production | **Required** |
| Needle | Record type and size per project | **Required** |
| Top thread | Record brand, material, and weight per project | **Required** |
| Bobbin thread | Record type and weight per project | **Required** |
| Automatic trim behavior | Confirm on a simple test design | **Required** |

The installed Palette 5 software expects its newer USB reader/writer and is not
the production path for the serial ECS. Use Palette 3 unless the matching
Palette 5 USB hardware becomes available.

## What to provide at the start of a design

Copy this brief into the project notes and fill in every line that affects the
result:

```text
Design name:
Purpose / garment location:
Finished width x height (mm):
Exact hoop and usable field (mm):
Fabric and stretch/pile:
Stabilizer and number of layers:
Top thread brand/material/weight:
Bobbin thread:
Needle type/size:
Maximum thread colors:
Available thread color numbers:
Desired visual style:
Elements that must remain recognizable:
Text and minimum readable height:
Reference artwork and permission/source:
Target machine speed, if known:
Special requirements (applique, freestanding lace, metallic, etc.):
```

If some physical choices are undecided, we can create concept artwork, but the
final stitch plan should wait. A file tuned for quilting cotton may sew poorly
on knit, fleece, denim, or a towel.

## Source artwork requirements

- Use artwork we own or have permission to reproduce.
- Prefer clean vector shapes over automatic tracing of a detailed photograph.
- Work at final physical size in millimeters from the beginning.
- Separate each intended embroidery region into an editable object.
- Preserve a source layer containing the reference image; do not embed the
  reference into the exported stitch file.
- Remove invisible objects, accidental duplicates, tiny islands, open gaps, and
  self-intersecting paths before digitizing.
- Simplify details that will become smaller than a practical stitch or thread
  width. Embroidery should suggest tiny details rather than literally copy every
  pixel.
- Design for thread: use stitch direction, sheen, negative space, texture, and
  controlled layering as artistic tools.

Never treat an automatic image-to-stitch conversion as a finished design. It is
only a possible starting draft.

## Choosing stitch types

| Artwork feature | Preferred stitch treatment |
| --- | --- |
| Fine line, vein, whisker, or contour | Running stitch or bean stitch |
| Border, small lettering, narrow shape | Satin column |
| Broad solid region | Tatami/fill stitch |
| Organic curved shading | Guided/contour fill or deliberate layered running stitches |
| Texture with visible fabric | Sparse patterned fill, seed stitches, or line work |
| Very large simple color area | Applique when appropriate |
| Tiny isolated speck | Enlarge, merge, imply with a stitch, or remove |

Satin is best for borders, letters, and narrow shapes. As a conservative
starting point, prefer columns at least 1.5 mm wide. Columns near or below 1 mm
are likely to become hard, irregular, or thread-breaking. Split very wide satin
columns or convert them to fill so the stitches do not become excessively long.

For lettering, start with a purpose-digitized embroidery font. Respect the
font's supported size range. Block capitals around 5 mm or taller are a safer
starting point; lowercase text below about 4 mm often loses clarity. Script and
very thin serifs require more size and more sew-out testing.

## Starting parameters, not universal rules

These values are useful first-pass settings for ordinary 40-weight embroidery
thread on stable woven fabric. They are not promises and must be adjusted for
the project.

| Parameter | Conservative starting range | Review cue |
| --- | --- | --- |
| Running stitch length | 2.0-3.0 mm | Shorten on tight curves; avoid clusters of microscopic stitches |
| Fill stitch length | 3.0-4.0 mm | Shorten only where shape/detail requires it |
| Fill row spacing | About 0.40-0.45 mm | Increase if stiff or puckered; decrease only if coverage is visibly poor |
| Satin spacing | About 0.40 mm | Judge coverage and hand after the sew-out |
| Pull compensation | About 0.2-0.4 mm per affected edge | Tune from measured gaps or overhang |
| Planned overlap between touching color regions | About 0.3-0.8 mm | More for unstable/stretchy material, less for crisp stable fabric |
| Safe border inside hoop field | At least 3-5 mm | Increase near bulky seams or uncertain hoop limits |

Do not “fix” poor coverage by automatically increasing density. First check
underlay, stabilizer, hooping, thread weight, needle, and stitch direction.
Excess density causes stiffness, puckering, needle deflection, thread breaks,
and registration errors.

## Underlay and compensation

Underlay is structural. It anchors the fabric, supports the top stitches, and
defines edges.

- Thin satin columns may need a center-walk underlay.
- Medium satin columns often benefit from contour/edge-walk underlay.
- Wider satin columns commonly need contour plus zigzag underlay.
- Fill areas generally need an underlay angled differently from the top fill.
- High-pile fabric may require a knockdown layer or water-soluble topping in
  addition to suitable stabilizer.
- Keep underlay inset so it supports the edge without peeking outside.

Pull happens mainly along the stitch direction; push occurs mainly at the sides
and ends. Extend shapes where pull would expose a gap, shorten or reshape ends
where push would make them protrude, and overlap adjoining colors intentionally.
Compensation must be evaluated on the intended material.

## Artistic detail without excessive density

- Create depth with changes in stitch angle; adjacent regions should not all
  reflect light in the same direction.
- Sew broad background masses before foreground details and outlines.
- Use later outlines to sharpen forms, but do not rely on an outline to hide a
  fundamentally misregistered fill.
- For gradients, layer sparse stitches rather than stacking several full-density
  fills. Inspect the combined density wherever layers overlap.
- Use curved guided fills to follow anatomy, petals, hair, feathers, wood grain,
  and other directional forms.
- Reserve the smallest highlights and accents for the end of the sequence.
- Use negative space deliberately. Fabric showing through can create detail with
  less stiffness and fewer registration problems.
- Prefer a few strong, readable details over many tiny objects that turn into
  knots of thread.

## Stitch order and travel

A good sequence reduces distortion, jumps, trims, and color changes while
preserving the intended overlaps.

1. Stabilizing or knockdown elements.
2. Background and large foundation areas.
3. Middle-ground forms.
4. Foreground forms and satin borders.
5. Fine details, highlights, and final outlines.

Within a color, generally work from the center outward and from larger anchoring
areas toward smaller details. Route connected objects with hidden travel under
later stitches when safe. Do not reorder solely to reduce color changes if that
breaks the required front-to-back layering.

Treat every long move between visible objects as a deliberate choice:

- hide a travel stitch beneath a later object;
- add a jump and a supported trim command;
- stop for a manual cut; or
- change the route or object order.

Because this is an older machine path, do not assume modern trim commands will
behave as expected. Confirm the ESe's behavior and include manual-cut notes when
needed.

## Legacy `.pes` compatibility policy

The target is not just “valid PES”; it is PES that this Palette 3/card/machine
chain accepts.

- Keep the editable SVG or native digitizing source as the master. PES is a
  machine export, not the source of truth.
- When the exporter offers a PES version, begin with its legacy/PES v1 option.
- Use simple ASCII filenames during compatibility testing, ideally eight or
  fewer characters, for example `ROSE01.PES`.
- Keep the design centered at the origin and inside the confirmed usable hoop
  boundary, including compensation and all travel stitches.
- Avoid unnecessary color changes and exotic command types.
- Open every generated PES in Palette 3 before attempting a card write.
- If Palette 3 can open but not reliably write an external PES, save a new copy
  from Palette 3 and validate that copy. Never overwrite the master export.
- Maintain a tiny known-good compatibility design separately from artistic test
  designs.

The known-good repository example
`Designs/OeSDVolume4/11038 small designs/NV855.pes` already opens in Palette 3
and can serve as a control when diagnosing the transfer chain.

## Required deliverables for every design

Use a project directory with this shape:

```text
Projects/<design-name>/
  README.md                 design brief, materials, and revision log
  source/<design-name>.svg  editable artwork and stitch parameters
  reference/                authorized reference material
  previews/                 stitch-plan and realistic-render previews
  exports/                  versioned PES exports; never silently overwrite
  sewouts/                  front/back photos and measurements
```

Each export should have a unique revision, such as `ROSE01_R01.PES`. The project
README should record:

- design dimensions and hoop;
- stitch and color-change counts;
- thread order and exact thread numbers;
- fabric, stabilizer, needle, bobbin, and speed;
- warnings and any manual trim/stop instructions;
- source and export software versions;
- changes made since the previous revision.

## Software quality gates

An export is ready for a test sew-out only when all applicable checks pass:

- [ ] Dimensions and orientation match the brief.
- [ ] Every stitch, jump, and compensation edge is inside the usable field.
- [ ] No unplanned stitch crosses a hole or negative-space region.
- [ ] No unexplained zero-length or extremely short stitch clusters exist.
- [ ] Long satin stitches have been split or replaced appropriately.
- [ ] Fill angles, underlay, overlaps, and object order were reviewed.
- [ ] Combined density was reviewed where objects overlap.
- [ ] Jumps, trims, stops, and color changes are intentional.
- [ ] The design has a clean front preview and a travel/underpath preview.
- [ ] The exported PES can be read back by the exporter or an independent
      embroidery parser.
- [ ] Read-back dimensions, stitch count, and color count match expectations.
- [ ] Palette 3 opens and previews the file without error.
- [ ] The intended card-write contents and capacity are reviewed before writing.

## Test sew-out procedure

1. Use a fresh needle and the exact planned materials whenever possible.
2. Hoop the stabilizer and fabric evenly without stretching the fabric.
3. Run the machine's placement/trace check before lowering the needle.
4. Begin at a conservative speed, especially for dense fills, metallic thread,
   small lettering, or rapid direction changes.
5. Observe, but keep hands away from the moving hoop and needle.
6. Record every thread break, needle break, bird's nest, missed trim, snag,
   registration shift, pucker, and machine warning at the approximate stitch or
   color step.
7. Photograph the front and back flat, with a ruler and good light, before
   pressing or washing.
8. Measure errors rather than describing them only as “off.”

Use this review form:

```text
Export revision:
Fabric / stabilizer / needle / thread / speed:
Front photo:
Back photo:
Actual stitched width x height:
Expected width x height:
Registration gaps or overlap (location and mm):
Coverage problems:
Puckering or distortion:
Hard/thick regions:
Thread or needle breaks (where):
Unwanted jumps or failed trims:
Lettering readability:
Artistic changes wanted:
Machine warnings or unusual sound:
```

## How to revise from a sew-out

Change the smallest number of variables that explains the defect, then make a
new revision.

| Sew-out defect | Check first | Likely controlled changes |
| --- | --- | --- |
| Gap between adjacent colors | Stitch direction and measured pull | Increase overlap/compensation; revise order or underlay |
| Fill extends beyond border | Push, fill direction, border order | Shorten fill edge; revise compensation; sew border last |
| Puckering | Hooping, stabilizer, total density | Reduce density/layers; improve underlay or stabilization; change direction/order |
| Fabric visible through fill | Thread/stabilizer/underlay before density | Improve underlay; adjust angle; then slightly reduce row spacing if needed |
| Satin sinks into pile | Fabric topping and underlay | Add knockdown/topping; strengthen suitable underlay |
| Thread breaks | Burr/needle/thread path and stitch length | Replace needle; remove tiny stitches; split long satin; reduce speed/density |
| Small text closes up | Character size and density | Enlarge/simplify; use a digitized font; reduce density or remove tiny counters |
| Outline misses on one side | Directional pull | Move/reshape the affected edge rather than shifting the whole outline blindly |
| Excess manual cutting | Routing and machine trim support | Reorder objects; hide travel; combine connected paths; document stops |

Do not compensate for a hardware or hooping problem by distorting the source
design. Resolve mechanical causes first.

## Definition of done

A design is complete when:

- the approved sew-out matches the artistic intent;
- it runs without unsafe behavior or unexplained machine errors;
- registration, coverage, hand, and lettering are acceptable on the target
  material;
- the final PES passes read-back and Palette 3 validation;
- the card/machine recognizes the design;
- the editable source, final export, thread chart, material settings, previews,
  and sew-out record are saved together.

## References

- [Ink/Stitch workflow](https://inkstitch.org/docs/workflow/)
- [Ink/Stitch satin columns](https://inkstitch.org/docs/stitches/satin-column/)
- [Ink/Stitch underlay guidance](https://inkstitch.org/tutorials/underlay/)
- [Ink/Stitch push/pull compensation](https://inkstitch.org/tutorials/push-pull-compensation/)
- [Ink/Stitch lettering guidance](https://inkstitch.org/docs/lettering/)
- [Ink/Stitch embroidery font guidance](https://inkstitch.org/docs/fonts/)
- [Pystitch PES reader/writer](https://github.com/inkstitch/pystitch)

The numerical parameters in this guide are conservative starting points, not
manufacturer specifications. Physical sew-outs remain authoritative.
