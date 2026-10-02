import { storageState } from '../../fixtures/auth'
import { resetAppConfig, setAppConfig } from '../../fixtures/db'
import { lastEmailTo } from '../../fixtures/email'
import { expect, test } from '../../fixtures/test'
import {
  joinAndConfirm,
  SUBJECT,
  waitlistEmail,
  waitlistRow
} from '../../fixtures/waitlist'

// Serial porque abre `launch.waitlist_gate`, global.

test.use({ storageState: storageState('admin') })
test.afterEach(resetAppConfig)

test('aviso de lançamento só sai com o portão aberto', async ({ page }) => {
  const email = waitlistEmail('launch')
  await joinAndConfirm(page.request, { role: 'fan', email })
  const send = () =>
    page.request.post('/api/trpc/waitlist.sendLaunchNotice', { data: {} })

  expect((await send()).status()).toBe(400)
  expect((await waitlistRow(email))?.launch_notice_sent_at).toBeNull()

  await setAppConfig('launch.waitlist_gate', { signup: false })
  const response = await send()
  expect(response.ok(), await response.text()).toBe(true)
  const notice = await lastEmailTo(email, { subject: SUBJECT.launch })
  expect(notice.link).toContain('/signup?source=waitlist_launch')
  expect((await waitlistRow(email))?.launch_notice_sent_at).toEqual(
    expect.any(Date)
  )
})
