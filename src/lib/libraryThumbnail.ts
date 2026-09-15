/**
 * Portrait library cards and their editable crop output must use the same
 * source ratio. Keeping this contract in one place prevents a saved thumbnail
 * from being cropped again when it is displayed in Style or Character Library.
 */
export const PORTRAIT_LIBRARY_THUMBNAIL = {
  width: 600,
  height: 800,
  aspectRatio: '3 / 4',
} as const;

export const PORTRAIT_CROP_VIEWPORT = {
  width: 480,
  height: 640,
} as const;
