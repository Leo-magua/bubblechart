import { Upload, Download, FileSpreadsheet, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useState, useCallback, useRef } from 'react';

const ACCEPT = '.csv,.xlsx,.xls';
const ACCEPT_MIME = /^(text\/csv|application\/vnd\.(ms-excel|openxmlformats-officedocument\.spreadsheetml\.sheet))$/i;

function isAllowedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls')) return true;
  return ACCEPT_MIME.test(file.type);
}

interface DataImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportFile: (file: File) => Promise<void>;
}

const EXAMPLE_CSV = `品牌,车型,级别,价格区间,均价,销量,日期
理想,理想L9,SUV,40-50万,45,15000,2025-08
问界,问界M9,SUV,45-55万,50,12000,2025-08
特斯拉,Model Y,SUV,25-35万,30,45000,2025-08
比亚迪,汉,轿车,20-30万,25,20000,2025-08
小鹏,小鹏P7,轿车,20-30万,25,8000,2025-08`;

const FIELD_HELP = [
  { name: '品牌', required: true, example: '理想、问界、特斯拉', desc: '汽车品牌名称' },
  { name: '车型 / 车名', required: true, example: '理想L9、Model Y', desc: '具体车型名称' },
  { name: '销量', required: true, example: '15000、1.5万、12,000+', desc: '月销量，支持纯数字、千分位、"万"单位、"+"后缀' },
  { name: '价格区间', required: false, example: '30-40万', desc: '车型指导价区间，用于计算均价' },
  { name: '均价', required: false, example: '35', desc: '成交均价（万），如未填则从价格区间推算' },
  { name: '级别', required: false, example: 'SUV、轿车、MPV', desc: '车型级别分类' },
  { name: '日期 / 月份', required: false, example: '2025-08', desc: '数据所属月份，如未填则从文件名或当前月推断' },
];

export function DataImportModal({ isOpen, onClose, onImportFile }: DataImportModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [showFieldHelp, setShowFieldHelp] = useState(false);

  const finishClose = useCallback(() => {
    setUploadStatus('idle');
    setErrorMessage('');
    setIsDragOver(false);
    setShowFieldHelp(false);
    onClose();
  }, [onClose]);

  const runImport = useCallback(
    async (file: File) => {
      if (!isAllowedFile(file)) {
        setUploadStatus('error');
        setErrorMessage('请上传 .csv、.xlsx 或 .xls 文件');
        return;
      }
      setUploadStatus('uploading');
      setErrorMessage('');
      try {
        await onImportFile(file);
        setUploadStatus('success');
        setTimeout(() => {
          finishClose();
        }, 700);
      } catch (e) {
        setUploadStatus('error');
        setErrorMessage(e instanceof Error ? e.message : '导入失败');
      }
    },
    [onImportFile, finishClose],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) void runImport(file);
    },
    [runImport],
  );

  const handlePickClick = useCallback(() => {
    if (uploadStatus === 'uploading') return;
    inputRef.current?.click();
  }, [uploadStatus]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file) void runImport(file);
    },
    [runImport],
  );

  const handleDownloadTemplate = useCallback(() => {
    const blob = new Blob([EXAMPLE_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '配置级销量数据模板.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        backgroundColor: 'rgba(11, 12, 15, 0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 100,
      }}
      onClick={uploadStatus === 'uploading' ? undefined : finishClose}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={handleInputChange}
      />
      <div
        className="w-[580px] rounded-xl overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          boxShadow: 'var(--shadow-elevated)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            导入配置级销量数据
          </h2>
          <button
            type="button"
            onClick={uploadStatus === 'uploading' ? undefined : finishClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-hover)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容 */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            支持 CSV、Excel 格式。系统会自动识别车型、配置、销量、价格等字段，并将数据写入对应月份的数据库表。
          </p>

          {/* 上传区域 */}
          <div
            className="rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors"
            style={{
              borderColor: isDragOver ? 'var(--accent-primary)' : 'var(--border-medium)',
              backgroundColor: isDragOver ? 'rgba(0, 208, 132, 0.05)' : 'var(--bg-surface)',
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={uploadStatus === 'idle' || uploadStatus === 'error' ? handlePickClick : undefined}
          >
            {uploadStatus === 'idle' && (
              <>
                <Upload
                  className="w-10 h-10 mx-auto mb-3"
                  style={{ color: isDragOver ? 'var(--accent-primary)' : 'var(--text-muted)' }}
                />
                <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                  点击或拖拽文件至此
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  支持 .csv, .xlsx, .xls 格式，最大 10MB
                </p>
              </>
            )}
            {uploadStatus === 'uploading' && (
              <div className="space-y-3">
                <div
                  className="w-10 h-10 rounded-full border-2 border-t-transparent mx-auto animate-spin"
                  style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }}
                />
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  正在上传并解析数据...
                </p>
              </div>
            )}
            {uploadStatus === 'success' && (
              <div className="space-y-2">
                <div
                  className="w-10 h-10 rounded-full mx-auto flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(0, 208, 132, 0.2)' }}
                >
                  <svg className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-medium" style={{ color: 'var(--accent-primary)' }}>
                  导入成功！
                </p>
              </div>
            )}
            {uploadStatus === 'error' && (
              <div className="space-y-2">
                <p className="text-sm font-medium" style={{ color: 'var(--destructive, #ef4444)' }}>
                  {errorMessage}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  点击区域重试或更换文件
                </p>
              </div>
            )}
          </div>

          {/* 字段说明折叠面板 */}
          <div
            className="rounded-lg overflow-hidden"
            style={{
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-surface)',
            }}
          >
            <button
              type="button"
              onClick={() => setShowFieldHelp(prev => !prev)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span className="flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                字段说明（{FIELD_HELP.length} 个字段）
              </span>
              {showFieldHelp ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {showFieldHelp && (
              <div className="px-4 pb-3 space-y-2">
                {FIELD_HELP.map(f => (
                  <div key={f.name} className="flex items-start gap-2 text-xs">
                    <span
                      className="shrink-0 mt-0.5 px-1 py-0 rounded text-[10px] font-medium"
                      style={{
                        backgroundColor: f.required ? 'rgba(239,68,68,0.15)' : 'rgba(148,163,184,0.15)',
                        color: f.required ? '#ef4444' : '#94a3b8',
                      }}
                    >
                      {f.required ? '必填' : '可选'}
                    </span>
                    <div className="min-w-0">
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{f.name}</span>
                      <span className="mx-1" style={{ color: 'var(--text-muted)' }}>·</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{f.desc}</span>
                      <p className="mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>示例: {f.example}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 底部链接 */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 text-xs transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = 'var(--accent-primary)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
              }}
            >
              <Download className="w-3.5 h-3.5" />
              下载示例模板
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
