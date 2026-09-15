export type ColorGradeSettings = {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  saturation: number;
  temperature: number;
  tint: number;
  fade: number;
  vignette: number;
};

export const DEFAULT_COLOR_GRADE: ColorGradeSettings = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  fade: 0,
  vignette: 0,
};

export const COLOR_GRADE_PRESETS: Array<{
  id: string;
  label: string;
  settings: ColorGradeSettings;
}> = [
  { id: 'original', label: '原片', settings: DEFAULT_COLOR_GRADE },
  {
    id: 'cinema-warm',
    label: '电影暖调',
    settings: {
      ...DEFAULT_COLOR_GRADE,
      contrast: 12,
      highlights: -10,
      shadows: 8,
      saturation: 7,
      temperature: 14,
      tint: 3,
      vignette: 12,
    },
  },
  {
    id: 'teal-orange',
    label: '青橙',
    settings: {
      ...DEFAULT_COLOR_GRADE,
      contrast: 18,
      highlights: -12,
      shadows: -5,
      saturation: 12,
      temperature: 8,
      tint: -10,
      vignette: 18,
    },
  },
  {
    id: 'cold-night',
    label: '冷月',
    settings: {
      ...DEFAULT_COLOR_GRADE,
      exposure: -4,
      contrast: 14,
      highlights: -16,
      shadows: 6,
      saturation: -8,
      temperature: -22,
      tint: -3,
      vignette: 16,
    },
  },
  {
    id: 'film-fade',
    label: '复古胶片',
    settings: {
      ...DEFAULT_COLOR_GRADE,
      contrast: -8,
      highlights: -15,
      shadows: 14,
      saturation: -12,
      temperature: 11,
      tint: 6,
      fade: 24,
      vignette: 22,
    },
  },
];

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function applyColorGradeToPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  settings: ColorGradeSettings,
) {
  const output = new Uint8ClampedArray(pixels);
  const exposure = 2 ** (settings.exposure / 50);
  const contrastValue = settings.contrast * 1.8;
  const contrast = (259 * (contrastValue + 255)) / (255 * (259 - contrastValue));
  const saturation = 1 + settings.saturation / 100;
  const fade = Math.max(0, settings.fade) / 100;
  const vignette = Math.max(0, settings.vignette) / 100;
  const safeWidth = Math.max(1, width - 1);
  const safeHeight = Math.max(1, height - 1);

  for (let index = 0; index < output.length; index += 4) {
    let red = (output[index] ?? 0) * exposure;
    let green = (output[index + 1] ?? 0) * exposure;
    let blue = (output[index + 2] ?? 0) * exposure;
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    const shadowWeight = (1 - Math.min(1, luminance / 255)) ** 2;
    const highlightWeight = Math.min(1, luminance / 255) ** 2;
    const tonalOffset =
      settings.shadows * 1.15 * shadowWeight + settings.highlights * 1.15 * highlightWeight;

    red += tonalOffset + settings.temperature * 0.72 + settings.tint * 0.18;
    green += tonalOffset - settings.tint * 0.42;
    blue += tonalOffset - settings.temperature * 0.72 + settings.tint * 0.18;

    red = contrast * (red - 128) + 128;
    green = contrast * (green - 128) + 128;
    blue = contrast * (blue - 128) + 128;

    const postLuminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    red = postLuminance + (red - postLuminance) * saturation;
    green = postLuminance + (green - postLuminance) * saturation;
    blue = postLuminance + (blue - postLuminance) * saturation;

    if (fade > 0) {
      red = red * (1 - fade * 0.2) + 28 * fade;
      green = green * (1 - fade * 0.2) + 27 * fade;
      blue = blue * (1 - fade * 0.2) + 30 * fade;
    }

    if (vignette > 0) {
      const pixel = index / 4;
      const x = ((pixel % width) / safeWidth - 0.5) * 2;
      const y = (Math.floor(pixel / width) / safeHeight - 0.5) * 2;
      const distance = Math.min(1, Math.sqrt(x * x + y * y) / Math.SQRT2);
      const edge = Math.max(0, (distance - 0.28) / 0.72);
      const factor = 1 - edge * edge * vignette * 0.72;
      red *= factor;
      green *= factor;
      blue *= factor;
    }

    output[index] = clampChannel(red);
    output[index + 1] = clampChannel(green);
    output[index + 2] = clampChannel(blue);
  }

  return output;
}

export function isDefaultColorGrade(settings: ColorGradeSettings) {
  return (Object.keys(DEFAULT_COLOR_GRADE) as Array<keyof ColorGradeSettings>).every(
    (key) => settings[key] === DEFAULT_COLOR_GRADE[key],
  );
}
