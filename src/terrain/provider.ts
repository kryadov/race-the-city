export interface ElevationProvider {
  /** Elevation in meters at local ground coordinates (x east, z south). */
  heightAt(x: number, z: number): number
}
