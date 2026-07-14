**Button** — the primary action control; use for anything the user clicks to act (save, confirm, create, cancel).

```jsx
<Button variant="primary" onClick={save}>Zapisz</Button>
<Button variant="secondary" iconLeft={<PlusIcon/>}>Nowy klient</Button>
<Button variant="danger" size="sm">Usuń</Button>
```

Variants: `primary` (main action, one per view), `secondary` (outlined, neutral), `ghost` (toolbar / low-emphasis), `subtle` (soft blue fill), `danger` (destructive). Sizes `sm | md | lg`. Supports `iconLeft` / `iconRight`, `loading`, `fullWidth`, `disabled`. Labels are short imperative Polish verbs.
