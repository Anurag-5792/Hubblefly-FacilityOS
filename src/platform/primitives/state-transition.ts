import { InvalidStateTransitionError } from "./errors";

export interface StateTransition<State extends string> {
  readonly from: State;
  readonly to: State;
}
export interface TransitionPolicy<State extends string> {
  readonly transitions: readonly Readonly<StateTransition<State>>[];
}

export function createTransitionPolicy<State extends string>(
  transitions: readonly StateTransition<State>[],
): Readonly<TransitionPolicy<State>> {
  const frozen = transitions.map((transition) => Object.freeze({ ...transition }));
  return Object.freeze({ transitions: Object.freeze(frozen) });
}

export function canTransition<State extends string>(
  policy: TransitionPolicy<State>,
  current: State,
  requested: State,
): boolean {
  return policy.transitions.some((transition) => transition.from === current && transition.to === requested);
}

export function assertTransition<State extends string>(
  policy: TransitionPolicy<State>,
  current: State,
  requested: State,
): void {
  if (!canTransition(policy, current, requested)) {
    throw new InvalidStateTransitionError(current, requested);
  }
}
