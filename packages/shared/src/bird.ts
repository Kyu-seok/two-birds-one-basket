/** The two Birds, told apart by colour. */
export type Bird = "pink" | "blue";
export const BIRDS: readonly Bird[] = ["pink", "blue"];

export type PerBird<T> = Record<Bird, T>;

export function partnerOf(bird: Bird): Bird {
  return bird === "pink" ? "blue" : "pink";
}
