# Interpreting PO-33 KO backups on PC

Backups need to be recorded stereo 44KHz, meaning a very big file.
What if we could make software to parse these backups and save them
as plain files.  (much smaller)  Then play as audio when restoring
to the device.

https://www.reddit.com/r/pocketoperators/comments/d1hd9o/deconstructing_po33_backup_format/

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

Backup appears to be 32000Hz, some sort of binary or something.

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
