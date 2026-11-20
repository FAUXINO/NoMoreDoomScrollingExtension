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
