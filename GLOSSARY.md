# Two Birds, One Basket

A 2-player co-op voice game: two players in different places each yell to control one Bird, and together the Birds carry a Basket upward while a Hawk chases them.

## Rooms and Runs

**Room**:
The shared space two players are connected to, identified by a Room Code and shareable link. It lasts from the first player joining until both leave.
_Avoid_: Session, lobby, game, match

**Room Code**:
The short code that identifies a Room, shown alongside its link.

**Run**:
One climb, from the countdown until the Run ends. A Room holds many Runs.
_Avoid_: Game, round, match, attempt

**Run End**:
How a Run finished: **Snatched** (the Hawk caught the Basket), **Broken** (the Egg took its third Crack), or **Abandoned** (a player left and didn't reconnect in time).
_Avoid_: Game over, death

## Players and the Basket

**Side**:
Left or Right. Each player takes one Side for the Room.
_Avoid_: Seat, slot, P1/P2

**Bird**:
The character a player controls; one per Side.
_Avoid_: Avatar, player character

**Basket**:
The object the two Birds carry together, one Bird on each side of it.

**Egg**:
The cargo in the Basket. It can take three Cracks before it breaks.
_Avoid_: Payload, item

**Crack**:
One point of damage to the Egg, taken when the Basket hits something.
_Avoid_: Hit, life, heart

**Team**:
A named pair of players, recognised automatically when both players' browsers belong to it. A player can belong to many Teams.
_Avoid_: Crew, party, squad

## Voice

**Loudness**:
The raw level picked up by a player's mic.
_Avoid_: Volume

**Thrust**:
Loudness scaled by Calibration to between 0 and 1; what actually lifts a Bird. Any sound counts, including talking.
_Avoid_: Power, force, volume

**Calibration**:
Measuring a player's Noise Floor and Max Yell, done once per Room.

**Noise Floor**:
A player's Loudness while silent; it gives zero Thrust.

**Max Yell**:
A player's loudest yell; it gives full Thrust.

## The Course

**Course**:
The whole vertical climb of one Run.
_Avoid_: Level, map, track

**Opening**:
The hand-made first stretch of the Course that teaches the controls. Played only on a Team's first Run unless replayed.
_Avoid_: Tutorial, intro level

**Piece**:
One hand-made building block of the Course, placed in random order above the Opening.
_Avoid_: Chunk, segment, section, level

**Tier**:
A Piece's difficulty: Easy, Medium or Hard. Harder Tiers appear more often with Height.
_Avoid_: Difficulty level

**Hawk**:
The bird chasing the Basket up from below; catching it ends the Run as Snatched.
_Avoid_: Enemy, predator, chaser

## Scoring

**Height**:
The highest point the Basket reached in a Run, in meters; the Run's score.
_Avoid_: Altitude, distance, score

**Team History**:
Every Run a Team has finished, with its Height and Run End.

**Top 10**:
The ten highest Heights across all Teams.
_Avoid_: Leaderboard, high scores
