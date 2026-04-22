# HumanSort
A site where you compete to be the fastest manual sorter

## Game

- Choose a difficulty: Easy (20), Normal (30), or Hard (50) columns.
- Press **Play** to reveal the shuffled board and start the timer.
- Sort the bars in ascending order as fast as possible using:
  - **Insert mode** (move selected bars into a target position), or
  - **Swap mode** (swap selected bars with a target bar).
- When sorted, your finish time is shown and saved to local high scores.

## Leaderboards

- **Local High Scores**: top 3 times per difficulty, stored in your browser.
- **Global Top 10**: online leaderboard per difficulty with replay buttons.
- Your scores are tracked separately even when other players use the same displayed name.

## Storage & Replay Format

Replays are stored in `localStorage` as a compact Base64 string (`btoa`/`atob`) instead of verbose JSON.

Binary layout:

- `Byte 0`: `N` (number of bars).
- `Bytes 1..N`: initial permutation (`Uint8`, one bar value per byte).
- Remaining bytes: event stream.
  - Time delta: variable-width (`1..5` bytes) with per-byte MSB continuation flag:
    - `1xxxxxxx` → another delta byte follows
    - `0xxxxxxx` → this is the last delta byte
    - payload is the lower 7 bits per byte (base-128 varint)
  - Action byte: `[AA|IIIIII]`
    - `AA` action type: `00=Select`, `01=Deselect`, `10=Move`, `11=Swap`
    - `IIIIII` column index (`0..63`)
    - Special token: `01|111111` (`AA111111`) means **deselect all**

This format significantly reduces replay size while still preserving full action-by-action playback.
