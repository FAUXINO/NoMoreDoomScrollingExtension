# CLAUDE.md

## Pravidla pro práci v tomto repozitáři

### Commit po každém promptu
Po dokončení každého promptu (tj. jakmile je zadaná práce hotová a ověřená) vždy udělej na konci git commit:

- Přidej do commitu všechny soubory, které jsi v rámci promptu změnil nebo vytvořil (`git add <soubory>`; necommituj nesouvisející ani citlivé soubory, např. `.env`).
- Napiš stručnou a výstižnou commit zprávu, která popisuje, co a proč se změnilo.
- Pokud prompt nevedl k žádné změně souborů, commit nedělej.
- Necommituj rozpracovaný nebo nefunkční stav – pokud se práci nepodařilo dokončit, napiš to uživateli a commit vynech (nebo se zeptej).
- Nepushuj na remote, pokud o to uživatel výslovně nepožádá.

Pojistka: v `.claude/settings.json` je `Stop` hook, který po každé odpovědi commitne všechny zbylé necommitnuté změny se zprávou `Auto-commit: <datum>`. Přednost má ale vlastní commit s výstižnou zprávou – hook je jen záchrana pro případ, že commit vynecháš.

### Ochrana osobních údajů (repo je veřejné)
Repo `FAUXINO/NoMoreDoomScrollingExtension` je **veřejné**. Cokoli se pushne, je veřejně dostupné a prakticky nevratně dohledatelné (forky, cache). Osobní údaje uživatele se proto do repa nesmí dostat vůbec – ani do kódu, dokumentace, testů, commit zpráv, ani do metadat commitů.

**Před každým `git push`** (push jen na výslovnou žádost uživatele) zkontroluj všechny nepushnuté commity `origin/main..HEAD`:

1. Seznam souborů a celý diff: `git log --name-only origin/main..HEAD`, `git diff origin/main..HEAD`.
2. Prohledej diff i commit zprávy na: e-mailové adresy, telefonní čísla, cookies (`sessionid`, `csrftoken`, `c_user`, `xs`, `datr`, `ds_user`), tokeny a klíče (`Bearer`, `Authorization`, `ghp_`, `github_pat_`, API klíče, privátní klíče), hesla, cesty `/home/<uživatel>`, skutečná jména lidí a účtů, obsah zpráv nebo příspěvků z reálných stránek.
3. Snapshoty `fixtures/*/*.html` nesmí být v commitu (ani přes `git add -f`), pokud je uživatel výslovně neschválil a nejsou anonymizované.
4. Metadata: `git log --format='%an <%ae> | %cn <%ce>' origin/main..HEAD` – autor i committer musí mít e-mail `145807462+FAUXINO@users.noreply.github.com` (GitHub noreply; nastaveno v `git config user.email` tohoto repa). Jakýkoli jiný e-mail = chyba.

Když kontrola něco najde: **nepushuj**, řekni uživateli co a kde, a navrhni opravu. Nepushnuté commity smíš opravit (poslední commit: `git commit --amend --no-edit --reset-author`; více commitů: `git rebase origin/main --exec 'git commit --amend --no-edit --reset-author'`). Přepis už pushnuté historie (force push) jen s výslovným souhlasem uživatele. Výsledek kontroly vždy krátce oznam.

Další pravidla:
- Testovací data a příklady jen vymyšlené (`kamarad`, `nekdo`, …).
- Jediná povolená výjimka je veřejné jméno účtu `FAUXINO` v URL repa a v `@author` (nutné pro aktualizace skriptu).
- Soukromý e-mail uživatele nikdy nepiš do žádného souboru v repu.
- Celá historie byla 2026-11-20 přepsána na noreply e-mail. Případný nový commit s jiným e-mailem je chyba.
