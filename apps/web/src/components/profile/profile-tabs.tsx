import { RovingTabs } from '@/components/app/roving-tabs'
import {
  PROFILE_TABS,
  type ProfileTab,
  profileTabId,
  profileTabPanelId
} from './profile-model'

type Props = {
  activeTab: ProfileTab
  onChange: (tab: ProfileTab) => void
}

const TABS = PROFILE_TABS.map((tab) => ({ id: tab, label: tab }))

export function ProfileTabs({ activeTab, onChange }: Props) {
  return (
    <RovingTabs
      tabs={TABS}
      activeId={activeTab}
      onChange={onChange}
      label="Seções do perfil"
      tabId={profileTabId}
      panelId={profileTabPanelId}
      className="onside-tablist mb-6"
    />
  )
}
