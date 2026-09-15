import { describe, expect, it } from 'vitest';
import source from './LibraryTransferActions.tsx?raw';

describe('library transfer actions', () => {
  it('provides separate import and export controls in a modal header', () => {
    expect(source).toContain("t('library.transfer.import', '导入资料')");
    expect(source).toContain("t('library.transfer.export', '导出资料')");
    expect(source).toContain('data-library-transfer-input={kind}');
    expect(source).toContain('accept=".zip,.json,.qiansi-library.json');
    expect(source).toContain('createLibraryTransferArchive');
    expect(source).toContain('downloadLibraryTransferArchive');
  });

  it('supports explicit selected-item and all-item exports', () => {
    expect(source).toContain("handleExport('selected')");
    expect(source).toContain("handleExport('all')");
    expect(source).toContain("t('library.transfer.exportSelected'");
    expect(source).toContain("t('library.transfer.exportAll'");
  });
});
