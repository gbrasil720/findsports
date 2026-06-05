import { sql } from '@findsports_oficial/db'

export function haversineSQL(userLat: number, userLng: number, tableAlias = 'bar') {
  const lat = sql.raw(`${tableAlias}.latitude`)
  const lng = sql.raw(`${tableAlias}.longitude`)
  return sql<number>`
    (6371 * acos(LEAST(1, GREATEST(-1,
      cos(radians(${userLat})) * cos(radians(${lat}::float)) *
      cos(radians(${lng}::float) - radians(${userLng})) +
      sin(radians(${userLat})) * sin(radians(${lat}::float))
    ))))
  `
}
