---
name: create-coordinator
description: Apre Windows Terminal con un coordinatore Claude Code e un agente per ogni progetto (fino a 15, 4 pannelli per scheda), ognuno avviato nella propria cartella. I progetti si indicano per nome o per percorso. Coordinatore e agenti si scambiano messaggi con SendMessage e tengono compiti e stato in una bacheca su file.
disable-model-invocation: true
argument-hint: <coordinatore> <progetto1> [progetto2 ...]  (nomi o percorsi)
---

# /create-coordinator

Argomenti ricevuti: $ARGUMENTS

Il primo argomento è la cartella del coordinatore, gli altri sono i progetti (da 1 a 15).
Ognuno può essere un percorso (assoluto o relativo) oppure solo un nome, per esempio
`cirfood-menuchiaro-api` o `Rehlko/backoffices`. Questa sessione serve solo ad avviare il
setup e a presentare gli agenti al coordinatore: non diventa il coordinatore.

## Passi

1. Interpreta gli argomenti. Se manca il coordinatore o non c'è almeno un progetto, chiedili
   all'utente. Se i progetti sono più di 15, chiedi quali usare.
2. Risolvi nomi e percorsi con lo script `resolve-projects.ps1` che si trova nella "Base
   directory" di questa skill (indicata in cima al messaggio), passando tutti gli argomenti,
   coordinatore compreso, ognuno tra apici singoli:

   powershell.exe -NoProfile -ExecutionPolicy Bypass -File '<base-directory>\resolve-projects.ps1' '<arg1>' '<arg2>' ...

   Lo script stampa un JSON con un elemento per argomento: `status` vale `ok`, `ambiguous`
   oppure `notfound`, con `path` e `candidates`. Cerca tra le cartelle già note a Claude Code,
   le loro cartelle vicine e le radici elencate in `roots.txt`.
   - `ok`: usa `path`.
   - `ambiguous`: chiedi all'utente quale candidato usare con AskUserQuestion, una domanda
     per argomento (al massimo 4 opzioni; se i candidati sono di più, mostra i più probabili
     e lascia l'opzione "Other" per il percorso).
   - `notfound`: chiedi all'utente il percorso. Se dice dove cercare di solito i suoi
     progetti, proponi di aggiungere quella radice a `roots.txt` (una per riga) e, se
     accetta, aggiungila e rilancia la risoluzione.
   - Coordinatore `notfound`: chiedi all'utente se creare la cartella e dove. Creala solo se
     conferma.
   Prima di lanciare, mostra all'utente in una tabella l'abbinamento nome → percorso.
   Se qualche percorso è stato scelto o corretto a mano, chiedi conferma prima di proseguire.
3. Controlla che la cartella del coordinatore non coincida con un progetto e che i nomi
   finali delle cartelle progetto siano tutti diversi, perché diventano i nomi degli agenti.
   Se qualcosa non va, fermati e spiega.
4. Lancia `launch.ps1` (stessa "Base directory") con i percorsi risolti, ognuno tra apici singoli:

   powershell.exe -NoProfile -ExecutionPolicy Bypass -File '<base-directory>\launch.ps1' '<coordinatore>' '<progetto1>' '<progetto2>' ...

   Le sessioni partono con `--permission-mode auto`, così i messaggi tra sessioni arrivano
   senza approvazione manuale. Per usare un altro modo aggiungi `-PermissionMode <modo>`
   prima dei percorsi: in quel caso chi ha un modo diverso dal mittente deve approvare i
   messaggi a mano.
   Layout: la scheda 1 contiene il coordinatore in alto a sinistra e i primi 3 agenti; ogni
   scheda successiva contiene fino a 4 agenti. L'output dello script indica il pannello di
   ogni agente.
5. Dall'ultima riga dell'output prendi i nomi di sessione (coordinatore e agenti). Carica
   `ListAgents` e `SendMessage` con ToolSearch, poi chiama ListAgents per verificare che
   tutti i nomi compaiano. Le sessioni impiegano qualche secondo a registrarsi: se ne
   manca qualcuno, aspetta con Monitor (non con sleep) e riprova, al massimo per circa un
   minuto più 10 secondi per ogni agente. Se il nome del coordinatore compare due volte
   (un setup precedente ancora aperto), fermati e chiedi all'utente di chiudere la finestra
   vecchia.
6. Manda al coordinatore un messaggio di presentazione con: il proprio nome di sessione,
   l'elenco degli agenti (nome, nome di sessione, progetto, pannello), quali risultano
   registrati in ListAgents, e le bacheche (quella del coordinatore e la cartella `.coord`
   dentro ogni progetto). Concludi dicendo che d'ora in poi parla
   direttamente con gli agenti e che questa sessione di setup non interviene più, salvo per
   inoltrare richieste dell'utente.
7. Riporta all'utente l'output dello script e l'esito della verifica, e riassumi il protocollo:
   - ogni agente scrive il proprio `scope.md` e avvisa il coordinatore con un messaggio;
   - quando tutti sono pronti, il coordinatore riassume i progetti e chiede l'obiettivo
     all'utente nel suo pannello (scheda 1, in alto a sinistra);
   - il coordinatore assegna i compiti scrivendo `task.md` e mandando un messaggio
     all'agente; l'agente, quando ha finito o è bloccato, aggiorna `status.md` e risponde
     al coordinatore. L'utente non deve inoltrare nulla a mano;
   - se a un agente serve un dato su un altro progetto, segna il compito BLOCCATO e lo chiede
     al coordinatore. Il coordinatore gira la domanda all'agente proprietario, copia la
     risposta nel `task.md` del richiedente (sezione `T<n> (sblocco)`) e lo sblocca;
   - il coordinatore registra messaggi e decisioni in `.coord/log.md`;
   - l'utente può sempre scrivere direttamente in un pannello: l'agente esegue e informa
     il coordinatore.

Non modificare gli script e non creare file a mano, a parte `roots.txt` e la cartella del
coordinatore quando l'utente lo conferma. Se uno script fallisce, mostra l'errore all'utente
e proponi la correzione.

## Note per chi modifica la skill
- Ogni agente parte nella cartella del proprio progetto e non deve accedere a nient'altro:
  la sua bacheca (`boot.md`, `scope.md`, `task.md`, `status.md`, `tmp`) sta in
  `<progetto>\.coord`, esclusa da Git tramite `.git/info/exclude`. Solo il coordinatore
  riceve `--add-dir` sui progetti. La cartella `.coord` del coordinatore contiene solo
  `coordinator-boot.md`, `log.md` e il suo file di avvio.
- Le istruzioni del coordinatore (`coordinator-boot.md`) e degli agenti (`boot.md`) sono
  modelli dentro `launch.ps1`, che li rigenera a ogni avvio. Per cambiarle si modifica lo script.
- `launch.ps1` accetta solo percorsi esistenti. Per trasformare i nomi in percorsi si usa
  `resolve-projects.ps1`.
- `launch.ps1` e `resolve-projects.ps1` vanno salvati in UTF-8 con BOM. Senza BOM
  powershell.exe 5.1 li legge come ANSI e i caratteri accentati diventano illeggibili.
- Ad ogni avvio `task.md` e `log.md` restano, mentre `status.md` e i `boot.md` vengono
  riscritti. Per questo il coordinatore, all'avvio, segnala all'utente i compiti rimasti
  da un setup precedente invece di riassegnarli.
- Il limite di 15 agenti dipende dalla lunghezza massima della riga di comando di wt.exe
  (circa 32.000 caratteri): `launch.ps1` verifica la lunghezza e si ferma se la supera.
  Con molti agenti, il contesto del coordinatore si riempie più in fretta.
