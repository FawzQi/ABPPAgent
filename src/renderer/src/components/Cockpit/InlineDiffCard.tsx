import React from 'react'
import { FileEdit, Check, X } from 'lucide-react'
import type { DiffInfo, ToolApprovalStatus } from '@shared/types'

interface InlineDiffCardProps {
  toolName: string
  filePath: string
  diff?: DiffInfo
  status: ToolApprovalStatus
  onApprove?: () => void
  onReject?: () => void
}

export const InlineDiffCard: React.FC<InlineDiffCardProps> = ({
  toolName,
  filePath,
  diff,
  status,
  onApprove,
  onReject,
}) => {
  return (
    <div className="rounded border border-[#2c3038] bg-[#1e2127] my-2 overflow-hidden text-xs">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#16181d] border-b border-[#2c3038]">
        <div className="flex items-center gap-2 truncate">
          <FileEdit size={13} className="text-amber-400 shrink-0" />
          <span className="font-mono text-slate-200 truncate">{filePath}</span>
          <span className="text-slate-400 font-mono">({toolName})</span>
        </div>

        {diff && (
          <div className="flex items-center gap-1.5 font-mono text-[11px] shrink-0">
            <span className="text-emerald-400 font-semibold">+{diff.additions}</span>
            <span className="text-rose-400 font-semibold">-{diff.deletions}</span>
          </div>
        )}
      </div>

      {diff && (
        <div className="p-2 font-mono text-[11px] max-h-48 overflow-y-auto bg-[#16181d] select-text border-b border-[#2c3038]">
          {diff.newContent ? (
            <div className="space-y-0.5">
              {diff.newContent.split('\n').slice(0, 30).map((line, idx) => (
                <div key={idx} className="text-emerald-300/90 bg-emerald-950/20 px-1 rounded flex">
                  <span className="text-slate-500 w-6 shrink-0 select-none">{idx + 1}</span>
                  <span className="truncate">{line}</span>
                </div>
              ))}
              {diff.newContent.split('\n').length > 30 && (
                <div className="text-slate-500 italic px-1 pt-1">
                  ... +{diff.newContent.split('\n').length - 30} more lines
                </div>
              )}
            </div>
          ) : (
            <div className="text-slate-500 italic">File content replacement preview</div>
          )}
        </div>
      )}

      {status === 'pending' && (
        <div className="flex items-center justify-between px-3 py-2 bg-amber-950/20 border-t border-amber-900/30">
          <span className="text-amber-300 font-medium flex items-center gap-1">
            ⚠️ Approval Required to modify file
          </span>
          <div className="flex items-center gap-2">
            {onApprove && (
              <button
                onClick={onApprove}
                className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded font-medium transition cursor-pointer"
              >
                <Check size={12} />
                <span>Approve</span>
              </button>
            )}
            {onReject && (
              <button
                onClick={onReject}
                className="flex items-center gap-1 bg-rose-600/80 hover:bg-rose-500 text-white px-2.5 py-1 rounded font-medium transition cursor-pointer"
              >
                <X size={12} />
                <span>Reject</span>
              </button>
            )}
          </div>
        </div>
      )}

      {status === 'approved' && (
        <div className="px-3 py-1 bg-emerald-950/30 text-emerald-400 text-[11px] font-medium flex items-center gap-1">
          <Check size={12} /> Approved & Applied
        </div>
      )}

      {status === 'rejected' && (
        <div className="px-3 py-1 bg-rose-950/30 text-rose-400 text-[11px] font-medium flex items-center gap-1">
          <X size={12} /> Rejected by User
        </div>
      )}
    </div>
  )
}
