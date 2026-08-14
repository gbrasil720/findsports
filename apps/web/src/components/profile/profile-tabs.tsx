import { PROFILE_TABS, type ProfileTab } from './profile-model'

type Props = {
  activeTab: ProfileTab
  onChange: (tab: ProfileTab) => void
}

export function ProfileTabs({ activeTab, onChange }: Props) {
  return (
    <div
      className="mb-6 flex w-fit max-w-full gap-0 overflow-x-auto border border-[var(--onside-ink)] bg-[var(--onside-paper)]"
      role="tablist"
      aria-label="Seções do perfil"
    >
      {PROFILE_TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          role="tab"
          aria-selected={activeTab === tab}
          className={`min-h-11 whitespace-nowrap px-4 py-2 font-bold text-xs transition-colors ${
            activeTab === tab
              ? 'bg-[var(--onside-acid)] text-[var(--onside-ink)]'
              : 'text-[var(--onside-muted)] hover:text-[var(--onside-ink)]'
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}
