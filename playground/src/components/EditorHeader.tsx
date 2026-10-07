// Adapted from Codedang's EditorHeader: server actions intentionally disabled.
import { useEffect } from 'react'
import { Save, Send, FlaskConical, CirclePlay as IoPlayCircleOutline, Trash2 as BsTrash3 } from 'lucide-react'
import { Button } from './shadcn/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from './shadcn/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './shadcn/tooltip'
import type { Language } from '../types/type'

export function EditorHeader({ language, setLanguage, run, running, preparing = false }: {
  language: Language; setLanguage(language: Language): void; run(): void; running: boolean; preparing?: boolean
}) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        if (!running && !preparing) run()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [run, running, preparing])

  return (
    <div className="bg-editor-background-2 flex shrink-0 items-center justify-between border-b border-slate-700 px-6">
      <Select onValueChange={value => setLanguage(value as Language)} value={language} disabled={running}>
        <SelectTrigger aria-label="Language" className="h-8 min-w-[86px] max-w-fit shrink-0 rounded-[4px] border-none bg-slate-600 px-2 font-mono hover:bg-slate-700 focus:ring-0 focus:ring-offset-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="mt-3 min-w-[100px] max-w-fit border-none bg-[#4C5565] p-0 font-mono">
          <SelectGroup className="text-white">
            {(['C', 'Cpp', 'Java', 'Python3'] as const).map(value => (
              <SelectItem key={value} value={value} className="cursor-pointer hover:bg-[#222939]">{value}</SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <div className="flex items-center gap-3">
        <Button size="editor" variant="editor" className="bg-slate-600 text-red-500" disabled title="Not available in the playground"><BsTrash3 size={17} />Reset</Button>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button id="run" size="editor" variant="editor" className="border-none bg-[#D7E5FE] text-[#484C4D] hover:bg-[#c6d3ea]" onClick={run} disabled={running || preparing}>
                <IoPlayCircleOutline size={22} />{running ? 'Running…' : preparing ? 'Preparing…' : 'Run'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ctrl/Cmd + Enter | Run your code in interactive terminal.</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button size="editor" variant="editor" className="bg-[#fafafa] text-[#484C4D]" disabled title="Not available in the playground"><Save size={22} />Save</Button>
        <Button size="editor" variant="editor" className="bg-[#fafafa] text-[#484C4D]" disabled title="Server judging is not connected"><FlaskConical size={22} />Test</Button>
        <Button size="editor" variant="editor" className="bg-primary" disabled title="Server submission is not connected"><Send size={22} />Submit</Button>
      </div>
    </div>
  )
}
