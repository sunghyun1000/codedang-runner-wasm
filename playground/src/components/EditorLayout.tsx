// Run-only adaptation of Codedang's EditorLayout / EditorResizablePanel.
import { useState } from 'react'
import { toast } from 'sonner'
import { CodeEditor } from './CodeEditor'
import { EditorHeader } from './EditorHeader'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './shadcn/resizable'
import { Tabs, TabsList, TabsTrigger } from './shadcn/tabs'
import { ScrollArea } from './shadcn/scroll-area'
import { RunnerTab } from './TestcasePanel/RunnerTab'
import { useRunner } from './TestcasePanel/useRunner'
import type { Language } from '../types/type'

const examples: Record<Language, string> = {
  C: '#include <stdio.h>\n\nint main(void) {\n  printf("Hello from C!\\n");\n  return 0;\n}\n',
  Cpp: '#include <iostream>\n\nint main() {\n  std::cout << "Hello from C++!\\n";\n  return 0;\n}\n',
  Python3: 'print("Hello from Python 3!")\n',
  Java: 'import java.util.Scanner;\n\npublic class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello from Java 17! Enter your name:");\n    Scanner input = new Scanner(System.in);\n    if (input.hasNextLine()) {\n      System.out.println("Hello, " + input.nextLine() + "!");\n    }\n  }\n}\n'
}

export function EditorLayout() {
  const [language, setLanguage] = useState<Language>('Cpp')
  const [sources, setSources] = useState(examples)
  const { startRunner, running } = useRunner()
  const run = () => {
    if (!sources[language].trim()) { toast.error('Please write code before run'); return }
    void startRunner(sources[language], language).catch(error => toast.error(String(error)))
  }

  return (
    <main className="grid-rows-editor bg-editor-background-2 grid h-dvh w-full min-w-[1000px] overflow-x-auto text-white">
      <header className="flex h-12 items-center justify-between px-6">
        <div className="flex items-center gap-4 text-lg text-[#787E80]">
          <img src="/codedang-editor.svg" alt="코드당" width={33} />
          <span>Playground</span><span>/</span><h1 className="font-medium text-white">Browser runner</h1>
        </div>
        <span className="text-sm text-slate-400">Local execution · No server</span>
      </header>
      <ResizablePanelGroup direction="horizontal" className="border border-slate-700">
        <ResizablePanel defaultSize={35} minSize={20}>
          <div className="grid-rows-editor grid h-full">
            <div className="flex items-center border-b border-slate-700 px-6">
              <Tabs value="Description"><TabsList variant="editor">
                <TabsTrigger value="Description" variant="editor">Description</TabsTrigger>
                <TabsTrigger value="Submission" variant="editor" disabled>Submissions</TabsTrigger>
              </TabsList></Tabs>
            </div>
            <ScrollArea>
              <article className="space-y-6 p-8 text-sm leading-7 text-slate-300">
                <h2 className="text-2xl font-semibold text-white">Browser runner playground</h2>
                <p>Codedang 에디터에서 코드를 작성하고 Run을 눌러 브라우저 안에서 실행하세요. 서버 제출과 채점은 연결하지 않습니다.</p>
                <section><h3 className="mb-2 text-lg text-white">Language</h3><p>C · C11 / C++ · C++14 / Python · 3.11 / Java · 17</p><p>C, C++, Python은 Runno WASI, Java는 CheerpJ 4.3을 사용합니다. 첫 실행에는 런타임 다운로드가 필요합니다.</p></section>
                <section><h3 className="mb-2 text-lg text-white">Input / Output</h3><p>Run Code 터미널에 입력하고 Enter로 전송합니다. 여러 줄 붙여넣기와 빈 줄 입력도 가능합니다.</p><ul className="list-inside list-disc"><li>Ctrl/Cmd + Enter: Run</li><li>Ctrl + C: 실행 중단</li><li>Ctrl + D: stdin EOF</li></ul></section>
                <section><h3 className="mb-2 text-lg text-white">Limits</h3><p>최대 실행 시간 180초. 프로그램은 별도 Worker에서 실행됩니다. Reset, Save, Test, Submit은 비활성 상태입니다.</p></section>
              </article>
            </ScrollArea>
          </div>
        </ResizablePanel>
        <ResizableHandle className="border-[0.5px] border-slate-700" />
        <ResizablePanel defaultSize={65} minSize={40}>
          <div className="grid-rows-editor grid h-full">
            <EditorHeader language={language} setLanguage={setLanguage} run={run} running={running} />
            <ResizablePanelGroup direction="vertical">
              <ResizablePanel defaultSize={60} minSize={20}>
                <CodeEditor value={sources[language]} language={language} onChange={code => setSources(prev => ({ ...prev, [language]: code }))} showZoom aria-label="Source code" />
              </ResizablePanel>
              <ResizableHandle className="border-[0.5px] border-slate-700" />
              <ResizablePanel defaultSize={40} minSize={20}>
                <div className="flex h-12 items-center bg-[#121728]">
                  <span className="flex h-full w-40 items-center justify-center gap-2 bg-[#222939]">Run Code<span className="rounded bg-blue-950 px-2 text-[10px] text-blue-300">Local</span></span>
                  <span className="flex-1 px-4 text-right text-xs text-slate-400" role="status">{running ? 'Running' : 'Ready'}</span>
                </div>
                <RunnerTab />
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </main>
  )
}
