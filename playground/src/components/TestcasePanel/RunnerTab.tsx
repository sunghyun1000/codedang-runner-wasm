'use client'

import { cn } from '@/libs/utils'
import './xterm.css'

interface RunnerTabProps {
  className?: string
}
export function RunnerTab({ className }: RunnerTabProps) {
  return (
    <div
      className={cn(
        'relative m-3 h-4/5 w-auto rounded-lg bg-[#121728] px-4 py-3',
        className
      )}
      style={{ height: 'calc(100% - 5rem)' }}
    >
      <div id="runner-container" className="h-full w-auto" />
    </div>
  )
}
