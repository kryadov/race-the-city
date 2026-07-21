import { describe, it, expect } from 'vitest'
import { cargoFor, cargoAnchor, type CargoKind } from '../../src/app/cargo'
import { VEHICLE_TYPES } from '../../src/vehicle/vehicles'

describe('cargoFor', () => {
  it('rides a person in an ordinary car and a smart one in a status car', () => {
    expect(cargoFor('car')).toBe('person')
    expect(cargoFor('ev')).toBe('person')
    expect(cargoFor('sports')).toBe('vip')
    expect(cargoFor('racecar')).toBe('vip')
    expect(cargoFor('cabrio')).toBe('vip')
  })

  it('loads haulers with bulk goods matched to the hull', () => {
    expect(cargoFor('tanker')).toBe('fuel') // a tanker carries fuel
    expect(cargoFor('truck')).toBe('gravel')
    expect(cargoFor('lorry')).toBe('gravel')
    expect(cargoFor('pickup')).toBe('sand') // the open tray takes sand
    expect(cargoFor('tractor')).toBe('milk') // farm run
    expect(cargoFor('combine')).toBe('milk')
  })

  it('carries people on a bus, not cargo', () => {
    expect(cargoFor('bus')).toBe('person')
  })

  it('gives every vehicle a valid cargo kind', () => {
    const kinds: CargoKind[] = ['person', 'vip', 'sand', 'gravel', 'fuel', 'milk']
    for (const t of VEHICLE_TYPES) expect(kinds).toContain(cargoFor(t))
  })
})

describe('cargoAnchor', () => {
  it('sits bulk goods higher and further back than a seated passenger', () => {
    const person = cargoAnchor('person')
    const gravel = cargoAnchor('gravel')
    expect(gravel.y).toBeGreaterThan(person.y) // a hauler bed rides above a car seat
    expect(gravel.back).toBeGreaterThan(person.back) // and sits over the rear bed
  })

  it('seats a person and a VIP at the same spot', () => {
    expect(cargoAnchor('vip')).toEqual(cargoAnchor('person'))
  })
})
