import React, { useEffect, useState } from 'react'
import {
  FolderOpen,
  ShieldCheck,
  ShieldAlert,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Square,
  Sparkles,
  Wrench,
} from 'lucide-react'
import { useSessionStore } from './stores/session-store'
import { useTargetStore } from './stores/target-store'
import { useToolsStore } from './stores/tools-store'
import { SessionList } from './components/Sidebar/SessionList'
import { TargetSelector } from './components/Sidebar/TargetSelector'
import { WorkspaceTree } from './components/Sidebar/WorkspaceTree'
import { Timeline } from './components/Cockpit/Timeline'
import { Composer } from './components/Cockpit/Composer'
import { SourceControlPanel } from './components/SourceControl/SourceControlPanel'
import { DiffViewer } from './components/Inspector/DiffViewer'
import { CustomToolsModal } from './components/Tools/CustomToolsModal'

export const App: React.FC = () => {
  const { init, activeSession, workspacePath, setWorkspacePath, toggleAutoApprove, abortAgent } = useSessionStore()
  const { targets } = useTargetStore()
  const { openModal: openToolsModal } = useToolsStore()

  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)

  useEffect(() => {
    init()
  }, [])

  const handleSelectFolder = async () => {
    if (!window.agentApi) return
    const folder = await window.agentApi.selectWorkspaceFolder()
    if (folder) {
      setWorkspacePath(folder)
      if (activeSession) {
        await window.agentApi.updateSessionSettings(activeSession.id, { workspacePath: folder })
      }
    }
  }

  const activeTarget = targets.find((t) => t.id === activeSession?.targetId)
  const isRunning = activeSession?.status === 'running'

  return (
    <div className="flex flex-col h-screen w-screen bg-[#16181d] text-[#e6e8eb] overflow-hidden font-sans">
      {/* Top Header Bar */}
      <header className="h-11 border-b border-[#2c3038] bg-[#16181d] flex items-center justify-between px-3 shrink-0 select-none">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLeftOpen(!leftOpen)}
            className="text-slate-400 hover:text-slate-200 p-1 rounded transition cursor-pointer hover:bg-[#2a2f38]"
            title="Toggle Sidebar"
          >
            {leftOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </button>

          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-sky-600 flex items-center justify-center text-white">
              <Sparkles size={12} />
            </div>
            <span className="font-semibold text-xs tracking-tight text-slate-100">ABPPAgent</span>
            <span className="text-[10px] bg-sky-950/80 text-sky-400 border border-sky-800/60 px-1.5 py-0.2 rounded font-mono">
              OpenCode UI
            </span>
          </div>

          <div className="h-4 w-px bg-[#2c3038]" />

          {/* Workspace Path Picker */}
          <button
            onClick={handleSelectFolder}
            className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-slate-100 bg-[#1e2127] hover:bg-[#2a2f38] border border-[#2c3038] px-2 py-1 rounded max-w-sm truncate transition cursor-pointer"
            title="Click to change workspace folder"
          >
            <FolderOpen size={13} className="text-amber-400 shrink-0" />
            <span className="truncate">{workspacePath || 'Select workspace...'}</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Target Model Indicator */}
          {activeTarget && (
            <div className="flex items-center gap-1.5 text-xs bg-[#1e2127] border border-[#2c3038] px-2.5 py-1 rounded">
              <span className="text-slate-400 font-medium">Model:</span>
              <span className="text-sky-300 font-medium">{activeTarget.label}</span>
              {isRunning && (
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse ml-1" title="Generating..." />
              )}
            </div>
          )}

          {/* Custom Tools & Pacing Modal */}
          <button
            onClick={openToolsModal}
            className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-slate-100 bg-[#1e2127] hover:bg-[#2a2f38] border border-[#2c3038] px-2.5 py-1 rounded transition cursor-pointer"
            title="Configure Custom Tools, Capabilities & Execution Delays"
          >
            <Wrench size={13} className="text-sky-400" />
            <span>Tools & Delays</span>
          </button>

          {/* YOLO / Safety Mode Toggle */}
          <button
            onClick={toggleAutoApprove}
            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded font-medium transition cursor-pointer border ${
              activeSession?.autoApprove
                ? 'bg-amber-950/60 text-amber-300 border-amber-800/60 hover:bg-amber-900/60'
                : 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60 hover:bg-emerald-900/60'
            }`}
            title={
              activeSession?.autoApprove
                ? 'YOLO Mode: Shell commands & file edits auto-approved (safe commands)'
                : 'Safe Mode: Approvals requested for commands and modifications'
            }
          >
            {activeSession?.autoApprove ? <ShieldAlert size={13} /> : <ShieldCheck size={13} />}
            <span>{activeSession?.autoApprove ? 'YOLO (Auto-run)' : 'Interactive'}</span>
          </button>

          {isRunning && (
            <button
              onClick={abortAgent}
              className="flex items-center gap-1 text-xs bg-rose-600 hover:bg-rose-500 text-white px-2.5 py-1 rounded font-medium transition cursor-pointer"
            >
              <Square size={12} fill="currentColor" />
              <span>Abort</span>
            </button>
          )}

          <div className="h-4 w-px bg-[#2c3038]" />

          <button
            onClick={() => setRightOpen(!rightOpen)}
            className="text-slate-400 hover:text-slate-200 p-1 rounded transition cursor-pointer hover:bg-[#2a2f38]"
            title="Toggle Source Control & Diffs Drawer"
          >
            {rightOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
          </button>
        </div>
      </header>

      {/* Main 3-Column Cockpit Layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Column: Sidebar */}
        {leftOpen && (
          <aside className="w-64 border-r border-[#2c3038] bg-[#16181d] flex flex-col shrink-0 select-none">
            <SessionList />
            <TargetSelector />
            <WorkspaceTree />
          </aside>
        )}

        {/* Center Column: Agent Cockpit */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#16181d]">
          <Timeline />
          <Composer />
        </main>

        {/* Right Column: Source Control & Diffs */}
        {rightOpen && (
          <aside className="w-84 border-l border-[#2c3038] bg-[#16181d] flex flex-col shrink-0 select-none min-h-0">
            <div className="h-[48%] min-h-48 flex flex-col min-h-0 overflow-hidden">
              <SourceControlPanel />
            </div>
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <DiffViewer />
            </div>
          </aside>
        )}
      </div>

      {/* Custom Tools Modal */}
      <CustomToolsModal />
    </div>
  )
}
