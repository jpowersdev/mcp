import { Effect, Stream } from "effect"
import type * as Rx from "rxjs"

export const fromObservable = <A, E>(
  observable: Rx.Observable<A>,
  onError: (error: unknown) => E
): Stream.Stream<A, E> =>
  Stream.asyncPush((emit) =>
    Effect.acquireRelease(
      Effect.sync(() =>
        observable.subscribe({
          next: emit.single,
          error: (error) => emit.fail(onError(error)),
          complete: emit.end
        })
      ),
      (sub) => Effect.sync(() => sub.unsubscribe())
    )
  )
