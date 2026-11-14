/** Running tally of what's been wrecked. Becomes the damage score later. */
export class Damage {
  chunksBroken = 0;
  propsDisturbed = 0;
  citizensSquished = 0;
  private buildings = new Set<number>();

  chunk(building: number): void {
    this.chunksBroken++;
    this.buildings.add(building);
  }

  get buildingsDamaged(): number {
    return this.buildings.size;
  }
}
