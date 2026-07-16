import type { ElevationProvider } from './provider'

export class FlatProvider implements ElevationProvider {
  heightAt(): number {
    return 0
  }
}
