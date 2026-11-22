# Two Birds, One Rope

A 2-player co-op voice platformer: two players in different places use their voices to walk and jump together as far as they can along an endless Course.

## Rooms and Runs

**Room**:
The shared space two players are connected to, identified by a Room Code and shareable link. It lasts from the first player joining until both leave.
_Avoid_: Session, lobby, game, match

**Room Code**:
The short code that identifies a Room, shown alongside its link.

**Run**:
One attempt at the Course, from the countdown until the Run ends. A Room holds many Runs.
_Avoid_: Game, round, match, attempt

**Run End**:
How a Run finished: **Fallen** (both Birds dropped off the Course with nothing holding them) or **Abandoned** (a player left and didn't reconnect in time). A single Bird that drops hangs from the Rope and can be brought back up, so it doesn't end the Run.
_Avoid_: Game over, death

## Players and Birds

**Bird**:
The character a player controls; each player has one for the Room, told apart by colour.
_Avoid_: Avatar, player character, Side, P1/P2

**Rope**:
The line joining the two Birds. Each Bird moves freely within its length. On the ground a tight Rope stops the Bird in front, without dragging the one behind; a Bird off the ground hangs and swings from it.
_Avoid_: Tether, chain, leash

**Team**:
A named pair of players, recognised automatically when both players' browsers belong to it. A player can belong to many Teams.
_Avoid_: Crew, party, squad

## Voice

**Loudness**:
The raw level picked up by a player's mic.
_Avoid_: Volume

**Thrust**:
Loudness scaled by Calibration and Sensitivity to between 0 and 1; it sets how fast a Bird walks and how high it jumps. Any sound counts, including talking.
_Avoid_: Power, force, volume

**Calibration**:
Measuring a player's Noise Floor and Full Voice, done once per Room.

**Noise Floor**:
A player's Loudness while silent; it gives zero Thrust.

**Full Voice**:
A player's comfortable strong speaking voice, not a shout; it gives full Thrust.
_Avoid_: Max Yell, max volume

**Sensitivity**:
A player's own setting for how much voice it takes to reach full Thrust.
_Avoid_: Gain, mic volume

## The Course

**Course**:
The whole endless path of one Run, travelled from left to right.
_Avoid_: Level, map, track

**Opening**:
The hand-made first stretch of the Course that teaches the controls. Played only on a Team's first Run unless replayed.
_Avoid_: Tutorial, intro level

**Piece**:
One hand-made building block of the Course, placed in random order after the Opening.
_Avoid_: Chunk, segment, section, level

**Tier**:
A Piece's difficulty: Easy, Medium or Hard. Harder Tiers appear more often with Distance.
_Avoid_: Difficulty level

## Scoring

**Distance**:
How far along the Course the Bird behind got in a Run, in meters; the Run's score.
_Avoid_: Height, progress, score

**Team History**:
Every Run a Team has finished, with its Distance and Run End.

**Top 10**:
The ten longest Distances across all Teams.
_Avoid_: Leaderboard, high scores
