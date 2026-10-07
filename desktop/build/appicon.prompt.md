# App icon generation

Generated with the built-in imagegen tool. Final source: `appicon.png`.

Character: an original light-blue anime chibi note archivist with a bookmark hair clip,
photo-notebook and download-arrow pin. No letter or monogram logo.

The Icon Composer bundle references the same PNG. `Assets.car` compilation requires
macOS and its native tools.

Generation command (working directory: `desktop/build`):

```powershell
wails3 generate icons -input appicon.png -windowsfilename windows/icon.ico -macfilename darwin/icons.icns
```

## Generation prompt

Use case: illustration-story.
Asset type: final PNG desktop application icon for XHS Desktop, a friendly personal workspace for parsing, previewing, collecting and downloading notes, photos, videos and LivePhotos.

Create ONE finished square app icon, approximately 1024 x 1024. Replace the previous abstract letter logo concept with a genuinely charming ORIGINAL anime chibi GIRL mascot. Absolutely NO letters, NO monogram, NO X-shaped logo, NO typography.

Character concept: a little digital-note archivist and collection assistant. Cute, clever and approachable rather than generic. She has a large round expressive face, bright medium-blue eyes, rosy cheeks, and a soft pale SKY BLUE bob haircut with rounded side tufts. Add a small white bookmark-shaped hair clip with a clean pointed end, and a tiny blue-and-white DOWNLOAD ARROW pin on her modest white-and-light-blue hoodie. She hugs ONE compact blue notebook / photo album at the bottom of the portrait; its cover has a simple white photo-frame pictogram. These are integrated character details that communicate notes, saved media and downloading. Fully clothed, wholesome, no revealing clothes.

Composition: polished close-up bust portrait for an actual app icon. Head occupies most of the frame, shoulders and the hugged notebook visible below; face remains the dominant focal point. Symmetrical balanced silhouette, slightly playful pose, warm confident small smile. The small function-related accents must remain secondary, not turn into a collage. A softly rounded-square very pale blue background tile, centered with a small safe outer margin; the mascot stays fully within the icon and no hair or accessories are cut off. All space outside the rounded-square tile must be genuinely transparent.

Art direction: high-quality modern 2D anime chibi illustration, crisp clean medium-weight blue outlines, simplified shapes, restrained soft cel shading, expressive eyes without excessive sparkle. Light blue, icy blue and warm white are dominant; medium azure selectively provides contrast for the eyes, outlines and notebook. Elegant, cute and distinctive, suitable for a modern uncluttered productivity app. Clearly readable as a character silhouette at 32 and 48 pixels. Clean antialiased RGBA edges.

Avoid: any letter-like emblem, words, watermarks, existing anime characters, elaborate background scenes, extra mascots, multiple variants, full-body tiny character, clutter, giant props, dark cobalt or purple-dominant palette, neon effects, photorealism, 3D rendering, excessive sparkle, glossy glass style, spiders or webs. Deliver only the finished icon asset, not a mockup.

## Final edge-cleanup prompt

Use case: precise-object-edit. This image is the EDIT TARGET, the final application icon.
Keep the girl, face, eyes, hair, pose, palette, hoodie, white bookmark hair clip, blue photo-notebook and download-arrow pin unchanged. Preserve the current artwork and composition very closely.

Change ONLY the alpha boundary and its immediate edge: remove all stray white flecks, ragged white residue, floating pixels and halos outside the pale-blue rounded-square background tile and outside the small hair tuft. The outer contour must be smooth, clean and antialiased, with genuinely transparent empty space around it. Retain the hair tuft that extends a little above the tile, but clean its boundary too. Do not add shadows outside the outline, no white border, no black background, no checkerboard baked into the image, no letters or words. Preserve RGBA transparency. Output a polished square PNG application icon.
