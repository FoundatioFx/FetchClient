import type { MockHistory } from "./types.ts";

/**
 * Implementation of MockHistory that tracks recorded requests.
 */
export class MockHistoryImpl implements MockHistory {
  #get: Request[] = [];
  #head: Request[] = [];
  #post: Request[] = [];
  #put: Request[] = [];
  #patch: Request[] = [];
  #delete: Request[] = [];
  #all: Request[] = [];

  get get(): Request[] {
    return [...this.#get];
  }

  get head(): Request[] {
    return [...this.#head];
  }

  get post(): Request[] {
    return [...this.#post];
  }

  get put(): Request[] {
    return [...this.#put];
  }

  get patch(): Request[] {
    return [...this.#patch];
  }

  get delete(): Request[] {
    return [...this.#delete];
  }

  get all(): Request[] {
    return [...this.#all];
  }

  /**
   * Records a request in the history.
   */
  record(request: Request): void {
    this.#all.push(request);

    switch (request.method.toUpperCase()) {
      case "GET":
        this.#get.push(request);
        break;
      case "HEAD":
        this.#head.push(request);
        break;
      case "POST":
        this.#post.push(request);
        break;
      case "PUT":
        this.#put.push(request);
        break;
      case "PATCH":
        this.#patch.push(request);
        break;
      case "DELETE":
        this.#delete.push(request);
        break;
    }
  }

  /**
   * Clears all recorded history.
   */
  clear(): void {
    this.#get = [];
    this.#head = [];
    this.#post = [];
    this.#put = [];
    this.#patch = [];
    this.#delete = [];
    this.#all = [];
  }
}
