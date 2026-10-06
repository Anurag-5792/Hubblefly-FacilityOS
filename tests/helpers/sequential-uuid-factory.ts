import {
  parseInternalId,
  type InternalId,
  type InternalIdFactory,
} from "../../src/platform/primitives";

export class SequentialUuidFactory implements InternalIdFactory {
  private value = 1;

  next(): InternalId {
    const suffix = this.value.toString(16).padStart(12, "0");
    this.value += 1;
    return parseInternalId(`00000000-0000-4000-8000-${suffix}`);
  }
}
