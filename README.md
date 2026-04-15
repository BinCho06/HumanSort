# HumanSort
A site where you compete to be the fastest manual sorter

## Storage & Replay Format

Replays are stored in `localStorage` as a compact Base64 string (`btoa`/`atob`) instead of verbose JSON.

Binary layout:

- `Byte 0`: `N` (number of bars).
- `Bytes 1..N`: initial permutation (`Uint8`, one bar value per byte).
- Remaining bytes: event stream.
  - Time delta: variable-width with MSB flag:
    - `0xxxxxxx` → 1-byte delta (`0..127ms`)
    - `1xxxxxxx yyyyyyyy` → 2-byte delta (`0..32767ms`)
  - Action byte: `[AA|IIIIII]`
    - `AA` action type: `00=Select`, `01=Deselect`, `10=Move`, `11=Swap`
    - `IIIIII` column index (`0..63`)

This format significantly reduces replay size while still preserving full action-by-action playback.
