# Interpreting PO-33 KO backups on PC

Backups need to be recorded stereo 44KHz, meaning a very big file.
What if we could make software to parse these backups and save them
as plain files.  (much smaller)  Then play as audio when restoring
to the device.

https://www.reddit.com/r/pocketoperators/comments/d1hd9o/deconstructing_po33_backup_format/

---

Use a bash shell.  Dot source `. ./shell`

`yarn install` You'll need node and yarn.  Use npm if you really want.

Edit config.env to set the name of your recording device. (*)

`record-backup <name-of-backup>` (*)

*\* This assumes you're running on Windows & WSL.  If on another platform, modify
`./bin/sox` or `./bin/record-backup` to use either Linux sox binaries or an
alternative audio recorder.*

---

Staying organized with backup files:

```
data/<backup name>/backup.wav
data/<backup name>/left.raw
data/<backup name>/right.raw
data/<backup name>/left.txt
data/<backup name>/right.txt
```

---

Backup is some sorta PSK.

7800Hz oscillator.

Phases are either 0, 90deg, 180deg, or 270deg.
First half of each cycle stays at a given phase.
Second half is used for transition from one phase to the next.

First cycle begins at the first high peak of input.

My hacky code can parse this by:

* a) converting the audio wave to a bitstream, where each bit is 1/4 cycle, above x axis is a 1, below is 0.
* b) slicing the bitstream into 4-bit (one cycle) chunks.  The first 2 bits indicate which of the 4 phases.  Second 2 bits can be ignored because they are phase transition.

<!--Backup appears to be 32000Hz, some sort of binary or something.

Plotting the delta time between each zero-crossing of a backup file:

![](https://user-images.githubusercontent.com/376504/64572741-a0bdd180-d336-11e9-9e60-d34a9aee6bbe.png)

Shows pretty clear clustering of zero-crossings.  Y axis unit is 48000Hz samples, so 6 samples 48KHz === 4 samples 32KHz
If each byte is sent via left and right channel and has some sort of parity bit then it makes sense you'd never go more than 4 bytes before a zero-crossing.  

These are wild guesses since I'm not an expert at audio nor EE.
-->

---

TE says samples are "8-bit, µ-law companded, 23437.5 Hz samplerate"

Magnus Lidstrom created PO-32 and PO-35
Jonatan Blomster coded PO-33

Link dump:

* https://soniccharge.com/forum/topic/1060-po-35-secret-powers
* https://www.youtube.com/watch?v=OW5DqR_c5Hw
* https://www.reddit.com/r/pocketoperators/comments/7ybjk2/po33_ko_secret_synth/
* https://www.youtube.com/watch?v=NmJoW-tiBSM&t=400s
* https://soniccharge.com/forum/topic/1067-what-are-the-pos-based-off
* https://www.youtube.com/watch?v=GgIkX_EDFLA
* https://www.youtube.com/watch?v=2E5V8f7LzZU
