# Character masters

Each folder:

```text
characters/<id>/
  master.png      # optional visual reference (drop your locked face/body here)
  profile.json    # required — id, aliases, promptLock
```

`npm run produce` / image prompts load matching profiles when the scene `visualPrompt` mentions an alias.

Add `master.png` when you have a locked look; prompts still get `promptLock` without the image.
