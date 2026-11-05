export interface IObjectEvent<T> {
  on(handler: (data?: T) => void): void;
  off(handler: (data?: T) => void): void;
}

export class ObjectEvent<T> implements IObjectEvent<T> {
  private handlers: ((data?: T) => void)[] = [];

  public on(handler: (data?: T) => void): void {
    this.handlers.push(handler);
  }

  public off(handler: (data?: T) => void): void {
    this.handlers = this.handlers.filter((h) => h !== handler);
  }

  public trigger(data?: T) {
    for (const handler of this.handlers.slice()) {
      handler(data);
    }
  }

  public expose(): IObjectEvent<T> {
    return this;
  }
}
