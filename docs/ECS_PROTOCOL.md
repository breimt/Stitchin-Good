# Palette Model ECS serial protocol research

Status: partial, based on static analysis of the locally installed Palette 3
`palfutil.exe`. No installed executable was patched or modified.

## Confirmed framing

All multi-byte packets end with an additive checksum: the last byte equals the sum of
all preceding bytes modulo 256.

Command packets are three bytes:

```text
0x43  command-ASCII  checksum
```

Three-byte responses observed from the physical ECS begin with ASCII `A` (`41`),
contain the result/status in the middle byte, and use the same checksum rule.

Observed commands:

| Purpose | Packet |
| --- | --- |
| Identify | `43 49 8c` (`CI`) |
| Version/query | `43 56 99` (`CV`) |
| Card type/status | `43 54 97` (`CT`) |
| Erase card | `43 45 88` (`CE`) |
| Device data | `43 44 87` (`CD`) |
| Begin write | `43 57 9a` (`CW`) |
| Begin read | `43 52 95` (`CR`) |

Control bytes are ACK `06`, NAK `15`, and cancel `18`.

Each data block packet is 132 bytes:

```text
01  index-high  index-low  [128 data bytes]  checksum
```

Block indices are big-endian. Palette caps a single exchange at 149 bytes, retries
packets, validates the additive checksum, and recognizes ACK/NAK/cancel responses.

## Baud negotiation

Palette opens candidate `COM1` through `COM4`, begins at 9600 baud, and knows these
five rates:

| Level | Baud | Packet |
| ---: | ---: | --- |
| 0 | 9600 | `43 30 73` (`C0`) |
| 1 | 19200 | `43 31 74` (`C1`) |
| 2 | 38400 | `43 32 75` (`C2`) |
| 3 | 57600 | `43 33 76` (`C3`) |
| 4 | 115200 | `43 34 77` (`C4`) |

The third column is the wire packet, not a textual line. Packet traces are still
needed to confirm the exact negotiation sequence used by this physical ECS.

## Live identification probes

On 2026-09-13 the replacement sent only four non-destructive query commands to the
connected ECS at 9600 baud:

| Query | Response | Interpretation |
| --- | --- | --- |
| `CI` | `06` | writer acknowledged identification |
| `CV` | `41 01 42` | response prefix, device version `01`, valid checksum |
| `CD` | 132-byte indexed packet | block 0 containing bytes `00` through `7f`, valid framing/checksum |
| `CT` | `41 21 62` | stable card status `21`, valid checksum |

This independently confirms the command checksum, response checksum, and full block
packet implementations. Status `21` remained unchanged and is not a transient serial
read error. No erase or write command was sent.

## Card status and capacity

The middle byte of the three-byte `CT` response selects capacity and whether Palette
allows writes.

| Raw status | Capacity | Palette behavior |
| ---: | ---: | --- |
| `12` | 128 KiB | read-only |
| `13` | 256 KiB | read-only |
| `14` | 512 KiB | read-only |
| `21` | learned from `CR` | write-disabled/ambiguous; see live-read note |
| `22`, `32` | 128 KiB | writable original card |
| `23`, `33` | 256 KiB | writable original card |
| `31`, `f0` | 512 KiB | writable original card |

On 2026-09-11 a non-destructive `CT` query to the physical ECS on COM3 at 9600
8-N-1 returned `41 21 62`. The checksum is valid. Earlier static analysis associated
`21` with a non-writable path, but the user's hardware history proves this physical
card is rewritable. No erase/write command was sent.

### Live read result

On the same physical card, `CR` succeeded and 1,024 consecutive blocks passed index
and checksum validation at 115200 baud. The ECS then returned terminal ACK instead of
block 1,024, for an authoritative transferred size of 131,072 bytes (128 KiB). A
repeated read produced the same boundary; NAK requests after terminal ACK received
NAK. The reader returned the ECS to 9600 baud after each attempt.

This disproves treating `0x21` as a 1 MiB capacity report. The card has a physical
ON/OFF write switch, making a write-disabled switch state the strongest current
hypothesis. Until a user-attended A/B status probe confirms it, the replacement must
use the terminal ACK to determine read capacity and never use `0x21` to authorize a
write.

The captured image:

- starts with ASCII `brother_embP7H`;
- is 131,072 bytes;
- has SHA-256 `e97ac9361e09061b10a10646475c6a1b4a01d98f662729d4f27932505f509c99`;
- contains exact, byte-for-byte reconstructed payloads from these user-confirmed
  repository designs:
  `H195KittyOnJackO'Lantern.pes`, `WL313Octopus.pes`, and
  `H197TrickOrTreatSkeleton.pes`;
- does not match the previously proposed `NV855.pes` control.

The raw capture is under the git-ignored `captures/` directory because card images
may contain user-owned or commercial design data. `scripts/read-ecs-card.ps1`
performs this read-only capture, and `scripts/match-card-to-pes.mjs` compares a card
image with local PES files.

The corresponding transfer lengths are 1024, 2048, 4096, or 8192 blocks of 128
bytes. Palette's write path accepts only the 128/256/512 KiB writable cases.

Codes `00`, `0f`, and `11` are recognized by Palette but their user-facing meanings
still need a live trace or complete control-flow mapping. Unknown codes must fail
closed in the replacement.

## High-level transfers

Read appears to be:

1. identify/probe and negotiate speed;
2. query card type and derive block count;
3. send `CR` and receive ACK;
4. for each block, send ACK and receive one indexed 132-byte data packet;
5. validate index/checksum, using cancel/retry control bytes when needed;
6. send a final ACK and return to the base speed.

Static analysis indicates write is:

1. identify/probe and negotiate speed;
2. query and require a writable original card;
3. send `CE` and wait for completion/status;
4. send `CW` and receive ACK;
5. send every indexed 132-byte data packet and receive ACK for each;
6. return to the base speed;
7. read back and verify (this last step will be mandatory in the replacement even if
   Palette does not do it automatically).

## Remaining critical unknown

The ECS receives a complete capacity-sized card memory image, not a PES file copied
verbatim. Palette builds that image before the serial transfer. The per-design PES v1
transformation is now proven and implemented; see `CARD_IMAGE_FORMAT.md`. The exact
directory, pointer, color/menu table, and trailer layout remains the critical path for
a standalone Mac writer.

Related open-source research:

- <https://github.com/bezmi/brother_embroidery_card_experiments>
- <https://github.com/AeroX2/brother-cart-emulator>
- <https://github.com/mlueft/emcr>

Those projects provide useful card-image research and a third-party writer emulator,
but the published Ultimate Box wire protocol is not the ECS protocol and must not be
substituted for the packets documented above.
