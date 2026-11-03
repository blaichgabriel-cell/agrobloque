const RAD = Math.PI / 180
const DAY_MS = 86400000
const J1970 = 2440588
const J2000 = 2451545
const EARTH_OBLIQUITY = RAD * 23.4397
const SUN_DISTANCE_KM = 149598000

const toDays = date => date.valueOf() / DAY_MS - 0.5 + J1970 - J2000
const rightAscension = (longitude, latitude) => Math.atan2(Math.sin(longitude) * Math.cos(EARTH_OBLIQUITY) - Math.tan(latitude) * Math.sin(EARTH_OBLIQUITY), Math.cos(longitude))
const declination = (longitude, latitude) => Math.asin(Math.sin(latitude) * Math.cos(EARTH_OBLIQUITY) + Math.cos(latitude) * Math.sin(EARTH_OBLIQUITY) * Math.sin(longitude))
const solarMeanAnomaly = days => RAD * (357.5291 + 0.98560028 * days)
const eclipticLongitude = anomaly => anomaly + RAD * (1.9148 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly) + 0.0003 * Math.sin(3 * anomaly) + 102.9372 + 180)

const sunCoordinates = days => {
  const longitude = eclipticLongitude(solarMeanAnomaly(days))
  return { ra:rightAscension(longitude, 0), dec:declination(longitude, 0) }
}

const moonCoordinates = days => {
  const meanLongitude = RAD * (218.316 + 13.176396 * days)
  const meanAnomaly = RAD * (134.963 + 13.064993 * days)
  const meanDistance = RAD * (93.272 + 13.229350 * days)
  const longitude = meanLongitude + RAD * 6.289 * Math.sin(meanAnomaly)
  const latitude = RAD * 5.128 * Math.sin(meanDistance)
  return {
    ra:rightAscension(longitude, latitude),
    dec:declination(longitude, latitude),
    distance:385001 - 20905 * Math.cos(meanAnomaly),
  }
}

export const MOON_PHASES = [
  { icon:'🌑', label:'Luna nueva' }, { icon:'🌒', label:'Creciente' }, { icon:'🌓', label:'Cuarto creciente' }, { icon:'🌔', label:'Gibosa creciente' },
  { icon:'🌕', label:'Luna llena' }, { icon:'🌖', label:'Gibosa menguante' }, { icon:'🌗', label:'Cuarto menguante' }, { icon:'🌘', label:'Menguante' },
]

export const moonPhase = date => {
  const days = toDays(date)
  const sun = sunCoordinates(days)
  const moon = moonCoordinates(days)
  const elongation = Math.acos(Math.sin(sun.dec) * Math.sin(moon.dec) + Math.cos(sun.dec) * Math.cos(moon.dec) * Math.cos(sun.ra - moon.ra))
  const incidence = Math.atan2(SUN_DISTANCE_KM * Math.sin(elongation), moon.distance - SUN_DISTANCE_KM * Math.cos(elongation))
  const angle = Math.atan2(Math.cos(sun.dec) * Math.sin(sun.ra - moon.ra), Math.sin(sun.dec) * Math.cos(moon.dec) - Math.cos(sun.dec) * Math.sin(moon.dec) * Math.cos(sun.ra - moon.ra))
  const fraction = (1 + Math.cos(incidence)) / 2
  const progress = 0.5 + 0.5 * incidence * (angle < 0 ? -1 : 1) / Math.PI
  const phase = MOON_PHASES[Math.round(progress * 8) % 8]
  return { ...phase, fraction, progress }
}
