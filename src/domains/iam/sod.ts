import type { ActorContext } from "../../platform/primitives";

export function isSameHuman(
  first: Readonly<ActorContext>,
  second: Readonly<ActorContext>,
): boolean {
  return (
    first.actorType === "HUMAN" &&
    second.actorType === "HUMAN" &&
    first.actorId === second.actorId
  );
}

export function areDistinctHumans(
  first: Readonly<ActorContext>,
  second: Readonly<ActorContext>,
): boolean {
  return (
    first.actorType === "HUMAN" &&
    second.actorType === "HUMAN" &&
    first.actorId !== second.actorId
  );
}
