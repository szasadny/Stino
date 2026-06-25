-- An optional emoji glyph on a label, shown alongside its color dot and name.
-- NULL => the label has no emoji (color-only, as before). Additive and
-- backwards-compatible: existing labels keep NULL.
ALTER TABLE label ADD COLUMN emoji TEXT;
