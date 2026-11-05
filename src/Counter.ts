import { type IObjectEvent, ObjectEvent } from "./ObjectEvent.ts";

/**
 * Represents a counter that can be incremented and decremented.
 */
export class Counter {
  #count = 0;
  #onChange = new ObjectEvent<{ previous: number; value: number }>();

  /**
   * Gets the current count.
   */
  public get count(): number {
    return this.#count;
  }

  /**
   * Gets an event that is triggered when the count changes.
   */
  public get changed(): IObjectEvent<{ previous: number; value: number }> {
    return this.#onChange.expose();
  }

  /**
   * Increments the count by 1.
   */
  increment() {
    const previous = this.#count;
    this.#count++;
    this.#onChange.trigger({ previous, value: this.#count });
  }

  /**
   * Decrements the count by 1.
   */
  decrement() {
    const previous = this.#count;
    this.#count--;
    this.#onChange.trigger({ previous, value: this.#count });
  }
}

/**
 * Triggers `loading` with `true` when the counter rises from zero and with
 * `false` when it drops back to zero.
 */
export function trackLoading(counter: Counter, loading: ObjectEvent<boolean>): void {
  counter.changed.on((e) => {
    if (!e) {
      throw new Error("Event data is required.");
    }

    if (e.value > 0 && e.previous === 0) {
      loading.trigger(true);
    } else if (e.value === 0 && e.previous > 0) {
      loading.trigger(false);
    }
  });
}
