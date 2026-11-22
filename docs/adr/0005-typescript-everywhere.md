# TypeScript everywhere instead of Elixir

Elixir/Phoenix was seriously considered for the server, but at this scale (a handful of Rooms on a home mini PC) its strengths in concurrency, distribution and fault tolerance don't matter. TypeScript on both client and server lets the Piece data, message types and physics constants live in one shared package, which the server needs for collisions and the client needs for drawing.
