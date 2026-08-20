import { describe, it, expect } from 'vitest'
import { encodeRoom, decodeRoom, type Room } from '../../src/net/roomCode'

const ROOM: Room = {
  v: 1,
  city: 'Paris',
  seed: 0x51c2beef,
  weather: 'rain',
  timeMode: 'cycle',
  time: 0.42,
  sdp: 'v=0\r\no=- 42 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\n',
}

describe('roomCode', () => {
  it('round-trips a room', async () => {
    const back = await decodeRoom(await encodeRoom(ROOM))
    expect(back).toEqual(ROOM)
  })

  it('produces a code that is URL-safe and free of padding', async () => {
    const code = await encodeRoom(ROOM)
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('compresses — an SDP repeats itself, so the code beats raw JSON', async () => {
    const big: Room = { ...ROOM, sdp: ROOM.sdp.repeat(30) }
    const code = await encodeRoom(big)
    expect(code.length).toBeLessThan(JSON.stringify(big).length)
  })

  it('rejects garbage rather than throwing', async () => {
    expect(await decodeRoom('')).toBeNull()
    expect(await decodeRoom('not base64 !!!')).toBeNull()
    expect(await decodeRoom('aGVsbG8')).toBeNull() // valid base64, not deflate
  })

  it('rejects a payload of the wrong version or shape', async () => {
    const wrongVersion = await encodeRoom({ ...ROOM, v: 2 as unknown as 1 })
    expect(await decodeRoom(wrongVersion)).toBeNull()
    const badWeather = await encodeRoom({ ...ROOM, weather: 'hail' as unknown as Room['weather'] })
    expect(await decodeRoom(badWeather)).toBeNull()
    const badSeed = await encodeRoom({ ...ROOM, seed: Number.NaN })
    expect(await decodeRoom(badSeed)).toBeNull()
  })
})
