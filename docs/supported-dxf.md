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

## Not yet

- Binary DXF (save as ASCII DXF instead)
- Paper-space layouts and viewports (model space is printed; paper space is used only when model space is empty)
- SHX and TrueType text styles: text uses Helvetica
- Non-Latin text such as Bangla prints as `?`
- Complex line types with embedded text or shapes (only their dashes are drawn)
- Gradient hatches print as a solid fill
- Plot scales such as 1:100 (the drawing is fitted to the page)
