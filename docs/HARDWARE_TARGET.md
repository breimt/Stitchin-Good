# Palette ECS hardware target

## Confirmed hardware

The target is the Tacony/Baby Lock **Palette ECS**, made in Japan. It is a powered
legacy RS-232 peripheral with a DE-9 connector, POWER and BUSY LEDs, and a 40-pin
Brother/Baby Lock embroidery-card slot. The unit is rated 7.5 V DC, 4 W maximum.
The barrel-jack polarity is not documented here and must never be inferred.

The ECS is not a USB/HID card writer. A modern computer reaches it through an OS
serial port, normally created by a USB-to-RS-232 adapter. The application therefore
uses Electron's Web Serial implementation and talks the recovered ECS byte protocol;
it does not use HID, libusb, Palette automation, or a filesystem mounted from the
card.

The inserted Brother card is an older 40-pin rewritable card marked `95204`. It has
a physical ON/OFF write-control switch and is known to have been erased and rewritten
successfully with this same ECS and Palette software. The Baby Lock Esante ESe has
also read a PES design written through this hardware chain.

## Status `0x21`

The known-good rewritable card currently returns `CT -> 41 21 62`. It nevertheless
allows a complete `CR` transfer of exactly 1,024 valid blocks (128 KiB). Therefore
`0x21` is not reliable evidence of a 1 MiB card and must not be presented as the
card's capacity.

The strongest current hypothesis is that `0x21` means the rewritable card is being
presented in a write-disabled state, possibly because its physical switch is OFF.
This fits all observations: reads work, Palette rejects the card for writing, and the
actual capacity is 128 KiB. It remains a hypothesis until a user-attended A/B query
records `CT` with the same card in both switch positions. The application continues
to fail closed and will not send erase/write commands for `0x21`.

## User-attended characterization later

1. Save and hash a fresh full backup.
2. Record several `CT` responses without moving the card.
3. Power down/remove the card according to the printed instructions.
4. Change only the card switch, reinsert it, then record `CT` again.
5. If the status becomes a known 128 KiB writable code, repeat the full read and
   require the same image hash before considering the exact-backup restore test.

No unattended software step should move, power-cycle, erase, or write the card.
`scripts/probe-ecs.ps1 -StatusSamples 5 -JsonOutputPath switch-off.json` records the
non-destructive side of this comparison. Its command allowlist is enforced by an
automated test and contains only `CI`, `CV`, `CD`, and `CT`.
