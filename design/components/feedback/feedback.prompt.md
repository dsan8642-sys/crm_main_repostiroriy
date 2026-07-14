**Feedback** — how SwimCRM communicates state and asks for confirmation.

```jsx
<Banner tone="warning" title="Konflikt w grafiku">Trener ma już zajęcia o 17:00.</Banner>
<Banner tone="danger">Nie masz uprawnień do tej sekcji.</Banner>

<Dialog open title="Anonimizacja rodziny" irreversible tone="danger"
  confirmLabel="Anonimizuj" onConfirm={…} onClose={…}>
  Dane osobowe zostaną nieodwracalnie usunięte zgodnie z RODO.
</Dialog>

<Toast tone="success" title="Zapisano" />
<EmptyState title="Brak zajęć w tym dniu" description="Wygeneruj zajęcia z szablonu grafiku." action={<Button>Nowy szablon</Button>} />
```

`Banner` tones: info / success / warning / danger — reserved for the brief's critical states (validation, schedule conflict, on-review, server error, RODO). `Dialog` with `irreversible` shows a red "Działanie nieodwracalne" header for anonymise / cancel-series. `Toast` is transient (caller controls dismissal). `EmptyState` covers empty lists, no results, empty day, no permission.
