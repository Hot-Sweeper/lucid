// Copies the methods and accessors of `parts` onto `target`'s prototype. Lets one large class
// (the World) keep its behaviour in several focused files while staying a single class.
export function mixin(target: { prototype: object }, ...parts: { prototype: object }[]) {
  for (const part of parts)
    for (const key of Object.getOwnPropertyNames(part.prototype))
      if (key !== "constructor") Object.defineProperty(target.prototype, key, Object.getOwnPropertyDescriptor(part.prototype, key)!);
}
