# Supported DXF features

## Drawn

| Feature | Notes |
|---|---|
| LINE, LWPOLYLINE, POLYLINE (2D, 3D, polyface, mesh) | Bulges become true arcs |
| CIRCLE, ARC, ELLIPSE | Curves refined to about 2 millionths of the drawing size |
| SPLINE | NURBS from control points and knots; fit-point splines interpolated |
| TEXT, ATTRIB, MTEXT | Alignment, rotation, width factor, MTEXT wrapping and formatting codes |
| INSERT | Nested blocks, scale, rotation, arrays, ByBlock colour/weight/type |
| DIMENSION, LEADER | Drawn from the dimension's own block |
| HATCH | Solid fills; pattern hatches as real pattern lines clipped to the boundary |
| SOLID, TRACE, 3DFACE | |
| Colours | ACI, true colour, ByLayer, ByBlock |
| Line weights | Entity, layer and block values in mm |
| Line types | Dash patterns with LTSCALE and per-object scale |
| Layers | Off, frozen and Defpoints hidden by default; toggle in the app |
| Non-Latin text | Bangla, Greek, Cyrillic and symbols shaped with HarfBuzz and drawn as vector outlines |
| Units and scale | `$INSUNITS` read for exact scales (mm, cm, m, in, ft, and others); unitless drawings are treated as mm |
| Garment patterns | AAMA/ASTM exports (Lectra, Gerber, Optitex): units from the `UNITS:` label, size selection for graded nests, drill holes (layer 13) as drill marks, AAMA layer names, files without a layer table |
| Paper | ISO A4–A0, US Letter, Legal, Tabloid, and plotter rolls of any width (5 m per page) |
| Tiling | At an exact scale, drawings larger than the paper split into overlapping, labelled sheets (up to 400) |

## Not yet

- Binary DXF (save as ASCII DXF instead)
- Paper-space layouts and viewports (model space is printed; paper space is used only when model space is empty)
- SHX and TrueType text styles: Latin text uses Helvetica, other scripts use Noto Sans or Noto Sans Bengali
- Scripts other than Latin, Greek, Cyrillic and Bangla (for example Chinese or Arabic) show as empty boxes
- Complex line types with embedded text or shapes (only their dashes are drawn)
- Gradient hatches print as a solid fill
