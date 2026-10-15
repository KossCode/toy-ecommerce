import { PageHeader, Panel } from '@/components/ui'

export function StubPage({ title }: { title: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <Panel>
        <p className="text-[var(--text-secondary)]">Розділ у роботі.</p>
      </Panel>
    </div>
  )
}
