'use client';

import type { Material } from '@/hooks/use-materials';
import { toIST } from '@/lib/utils';
import { DropdownMenu } from '@/components/ui/DropdownMenu';

interface Props {
  material: Material;
  onEdit: () => void;
  onDelete: () => void;
  onToggleHidden: () => void;
  toggling: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MaterialCard({ material, onEdit, onDelete, onToggleHidden, toggling }: Props) {
  const menuItems = [
    {
      label: 'Edit',
      onClick: onEdit,
    },
    {
      label: toggling ? '…' : material.isHidden ? 'Show' : 'Hide',
      onClick: onToggleHidden,
    },
    {
      label: 'Delete',
      onClick: onDelete,
      variant: 'danger' as const,
    },
  ];

  return (
    <div className={`bg-white rounded-xl border p-5 flex flex-col gap-3 transition-opacity ${
      material.isHidden ? 'border-slate-200 opacity-60' : 'border-slate-200'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-slate-800 text-sm truncate">{material.title}</h3>
            {material.isHidden && (
              <span className="flex-shrink-0 text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">Hidden</span>
            )}
          </div>
          <p className="text-xs text-blue-600 font-medium mt-0.5">{material.subject}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* PDF icon */}
          <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center text-red-500 text-xs font-bold">
            PDF
          </div>
          <DropdownMenu items={menuItems} />
        </div>
      </div>

      {/* Meta */}
      <div className="text-xs text-slate-500 space-y-0.5">
        {material.author && <p>by {material.author}</p>}
        {material.description && (
          <p className="text-slate-400 line-clamp-2">{material.description}</p>
        )}
        <p>{formatBytes(material.fileSize)} · {toIST(material.createdAt, 'dd MMM yyyy')}</p>
      </div>
    </div>
  );
}
