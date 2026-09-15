import { useEffect } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { resolveCanvasTheme, useCanvasThemeStore } from '../store/canvasThemeStore';
import { applyCanvasTheme } from './canvasTheme';

export function CanvasThemeRuntime() {
  const projectId = useCanvasStore((state) => state.activeProjectId);
  const customThemes = useCanvasThemeStore((state) => state.customThemes);
  const globalThemeId = useCanvasThemeStore((state) => state.globalThemeId);
  const projectThemeIds = useCanvasThemeStore((state) => state.projectThemeIds);

  useEffect(() => {
    applyCanvasTheme(
      resolveCanvasTheme({ customThemes, globalThemeId, projectThemeIds }, projectId),
    );
  }, [customThemes, globalThemeId, projectId, projectThemeIds]);

  return null;
}
