import { expect, test } from 'bun:test'
import { parseRobots, robotsAllows } from './robots'

test('robots: curinga, regra mais longa, grupo de outro robô e Content-Signal', () => {
  const espn = parseRobots(
    'User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: */calendar/\nDisallow: /*?page=\nAllow: /a/calendar/ok\n'
  )
  expect(robotsAllows(espn, '/futebol/artigo/_/id/1/jogo')).toBe(true)
  expect(robotsAllows(espn, '/x/calendar/2026')).toBe(false)
  expect(robotsAllows(espn, '/lista?page=2')).toBe(false)
  expect(robotsAllows(espn, '/a/calendar/ok')).toBe(true)
  const shared = parseRobots(
    'User-agent: Bot\nUser-agent: *\nDisallow: /priv\n'
  )
  expect(robotsAllows(shared, '/priv/x')).toBe(false)
  expect(
    robotsAllows(
      parseRobots('User-agent: *\nContent-Signal: ai-input=no\n'),
      '/'
    )
  ).toBe(false)
  expect(robotsAllows(parseRobots(''), '/qualquer')).toBe(true)
})
